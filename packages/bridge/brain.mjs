import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const stable = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val);
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const slash = value => value.split(path.sep).join('/');
const categories = {
  inbox: 'Inbox', profile: 'Me/Observations', linkedin: 'Areas/LinkedIn/Notes',
  marketing: 'Areas/Marketing/Notes', professional: 'Areas/Professional/Notes',
  business: 'Areas/Business/Notes', research: 'Knowledge/Research',
  decision: 'Knowledge/Decisions', lesson: 'Knowledge/Lessons',
  project: 'Projects/Notes', session: 'Work/Sessions'
};

function requireText(value, name, limit = 40000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new Error(`${name} must be nonempty text of at most ${limit} characters`);
  }
  return value.trim();
}
function strings(value, name, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 8000)) {
    throw new Error(`${name} must be an array of at most 100 nonempty strings`);
  }
  if (required && !value.length) throw new Error(`${name} must not be empty`);
  return value;
}
function readable(value) {
  let title = value.normalize('NFC').replace(/[<>:"/\\\\|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
  title = Array.from(title).slice(0, 70).join('').replace(/[. ]+$/g, '') || 'Note';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(title)) title += ' note';
  return Array.from(title).slice(0, 70).join('');
}
const folded = value => value.normalize('NFKC').toUpperCase().toLowerCase();
function checkedInt(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Expected integer between 1 and ${max}`);
  return value;
}

export class Brain {
  constructor(vault, options = {}) {
    this.root = fs.realpathSync(vault);
    this.readOnly = Boolean(options.readOnly);
    this.internal = path.join(this.root, '.mastermind');
    if (fs.existsSync(path.join(this.internal, 'reorganization.lock'))) {
      throw new Error('Master mind maintenance is in progress; retry after the vault reorganization completes');
    }
    if (!this.readOnly) fs.mkdirSync(this.internal, { recursive: true });
    this.db = new DatabaseSync(path.join(this.internal, 'workflow.sqlite'), { readOnly: this.readOnly });
    if (this.db.prepare('PRAGMA user_version').get().user_version > 1) {
      this.db.close(); throw new Error('Workflow database belongs to a newer bridge; upgrade before opening it');
    }
    if (this.readOnly) return;
    this.db.exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, revision INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projections(path TEXT PRIMARY KEY, hash TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  within(relative, mustExist = false) {
    requireText(relative, 'path', 1500);
    if (path.isAbsolute(relative) || /(^|[\\/])\.\.([\\/]|$)/.test(relative) || relative.includes(':')) throw new Error('Use a vault-relative path without traversal');
    const parts = relative.split(/[\\/]/);
    if (parts.some(p => !p || p.startsWith('.') || /[<>"|?*\x00-\x1f]/.test(p))) throw new Error('Hidden and special paths are excluded');
    const target = path.resolve(this.root, ...parts);
    let probe = target;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const real = fs.realpathSync(probe);
    const rel = path.relative(this.root, real);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path escapes vault through a link or junction');
    if (mustExist && !fs.existsSync(target)) throw new Error(`Note does not exist: ${relative}`);
    return target;
  }
  atomic(target, text, exclusive = false) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temp, 'wx');
      try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if (exclusive) { fs.linkSync(temp, target); fs.unlinkSync(temp); }
      else fs.renameSync(temp, target);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  files() {
    const out = [];
    const walk = (folder, depth) => {
      if (depth > 15) return;
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.md') && fs.statSync(full).size <= 1024 * 1024) {
          const rel = slash(path.relative(this.root, full));
          try { this.within(rel, true); out.push(rel); } catch { /* Never traverse escaped links. */ }
        }
      }
    };
    walk(this.root, 0);
    return out;
  }
  layout() {
    const file = path.join(this.internal, 'layout.json');
    if (!fs.existsSync(file)) return { version: 1, timezone: 'Asia/Calcutta', redirects: {}, projects: {}, categoryHubs: {} };
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    if (!object(value) || value.version !== 1 || !object(value.redirects) || !object(value.projects) || !object(value.categoryHubs)) throw new Error('Invalid layout manifest');
    try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(); }
    catch { throw new Error('Invalid layout timezone'); }
    for (const [from, to] of Object.entries(value.redirects)) {
      this.within(from); this.within(to);
      if (!from.endsWith('.md') || !to.endsWith('.md')) throw new Error('Layout redirects require Markdown paths');
    }
    for (const project of Object.values(value.projects)) {
      if (!object(project)) throw new Error('Invalid layout project');
      this.within(project.folder); this.within(project.hub);
      if (!project.hub.endsWith('.md')) throw new Error('Layout hubs require Markdown paths');
    }
    for (const hub of Object.values(value.categoryHubs)) {
      this.within(hub);
      if (!hub.endsWith('.md')) throw new Error('Layout hubs require Markdown paths');
    }
    for (const from of Object.keys(value.redirects)) this.resolve(from, value);
    return value;
  }
  resolve(relative, layout = this.layout()) {
    const seen = new Set();
    while (true) {
      this.within(relative);
      if (seen.has(relative)) throw new Error('Layout redirect cycle');
      seen.add(relative);
      if (!Object.hasOwn(layout.redirects ?? {}, relative)) return relative;
      relative = layout.redirects[relative];
    }
  }
  read({ path: relative, offset = 0, limit }) {
    relative = this.resolve(relative);
    if (!relative?.endsWith('.md')) throw new Error('Only visible Markdown notes can be read');
    if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a nonnegative integer');
    const length = checkedInt(limit, 16000, 40000);
    const target = this.within(relative, true);
    if (fs.statSync(target).size > 2 * 1024 * 1024) throw new Error('Note too large; split or inspect it directly');
    const content = fs.readFileSync(target, 'utf8');
    return { path: relative, sha256: hash(content), content: content.slice(offset, offset + length), offset,
      next_offset: offset + length < content.length ? offset + length : null, truncated: offset + length < content.length };
  }
  search({ query, limit, scope }) {
    const q = requireText(query, 'query', 500).toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const count = checkedInt(limit, 8, 30);
    if (scope) this.within(scope);
    const results = [];
    for (const relative of this.files()) {
      if (scope && relative !== scope && !relative.startsWith(`${slash(scope).replace(/\/$/, '')}/`)) continue;
      const text = fs.readFileSync(this.within(relative, true), 'utf8');
      const lower = text.toLowerCase();
      const title = relative.toLowerCase();
      const score = terms.reduce((n, term) => n + (title.includes(term) ? 5 : 0) + (lower.includes(term) ? 1 : 0), 0);
      if (!score) continue;
      const at = Math.max(0, lower.indexOf(terms.find(term => lower.includes(term)) ?? q));
      results.push({ path: relative, score, sha256: hash(text), snippet: text.slice(Math.max(0, at - 100), at + 650) });
    }
    results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return { query, total: results.length, results: results.slice(0, count), truncated: results.length > count };
  }
  allocate(folder, title, layout) {
    const directory = this.within(folder);
    const occupied = new Set(fs.existsSync(directory) ? fs.readdirSync(directory).map(folded) : []);
    for (const relative of [...Object.keys(layout.redirects), ...Object.values(layout.redirects)]) {
      if (folded(path.posix.dirname(relative)) === folded(folder)) occupied.add(folded(path.posix.basename(relative)));
    }
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? '' : ` - ${String(n).padStart(2, '0')}`;
      const stem = Array.from(readable(title)).slice(0, 70 - suffix.length).join('').trimEnd() + suffix;
      if (!occupied.has(folded(`${stem}.md`))) return `${folder}/${stem}.md`;
    }
  }
  hubLink(layout, project_id, category) {
    const project = Object.hasOwn(layout.projects, project_id) ? layout.projects[project_id] : null;
    for (const hub of [project?.hub, layout.categoryHubs[category]]) {
      if (!hub) continue;
      const canonical = this.resolve(hub, layout);
      const target = this.within(canonical);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) return `[[${canonical.slice(0, -3)}|${path.posix.basename(canonical, '.md')}]]`;
    }
    return '';
  }
  capture(input) {
    const layout = this.layout();
    const { category, title, content, agent, session_id, request_id, project_id, task_id } = input;
    if (!Object.hasOwn(categories, category)) throw new Error(`category must be one of ${Object.keys(categories).join(', ')}`);
    requireText(title, 'title', 180); requireText(content, 'content'); requireText(agent, 'agent', 100);
    requireText(session_id, 'session_id', 200); requireText(request_id, 'request_id', 200);
    if (project_id !== undefined) requireText(project_id, 'project_id', 200);
    if (task_id !== undefined) this.taskGet(task_id);
    const sources = strings(input.sources, 'sources');
    const fingerprint = hash(stable(input));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const saved = this.request(request_id, fingerprint);
      if (saved) {
        const current = this.read({ path: saved.path });
        this.db.exec('COMMIT'); return { ...saved, path: current.path, sha256: current.sha256 };
      }
      const recoveredPath = this.files().find(p => fs.readFileSync(this.within(p, true), 'utf8').includes(`request_fingerprint: ${JSON.stringify(fingerprint)}\n`));
      const project = Object.hasOwn(layout.projects, project_id) ? layout.projects[project_id] : null;
      const folder = category === 'project' && project ? project.folder : categories[category];
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: layout.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const display = category === 'session' ? `${date} ${title}` : title;
      const relative = recoveredPath ?? this.allocate(folder, display, layout);
      const target = this.within(relative);
      const timestamp = now();
      const metadata = { schema_version: 1, id: `note-${hash(request_id).slice(0, 20)}`, type: category, title,
        created_at: timestamp, author: agent, session_id, project_id: project_id ?? null, task_id: task_id ?? null,
        epistemic_status: 'reported', request_fingerprint: fingerprint, sources };
      let recovered = false;
      if (fs.existsSync(target)) {
        const old = fs.readFileSync(target, 'utf8');
        if (!old.includes(`request_fingerprint: ${JSON.stringify(fingerprint)}\n`)) throw new Error('Existing note conflicts with request; preserving it');
        recovered = true;
      } else {
        const frontmatter = Object.entries(metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
        const hub = this.hubLink(layout, project_id, category);
        this.atomic(target, `---\n${frontmatter}\n---\n\n# ${path.posix.basename(relative, '.md')}\n\n${hub ? `${hub}\n\n` : ''}${content.trim()}\n`, true);
      }
      const result = { path: relative, saved: true, recovered, sha256: hash(fs.readFileSync(target, 'utf8')) };
      this.saveRequest(request_id, fingerprint, result);
      this.db.exec('COMMIT'); return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  request(id, fingerprint) {
    const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw new Error('request_id was already used for a different payload');
    return JSON.parse(row.result);
  }
  saveRequest(id, fingerprint, result) {
    this.db.prepare('INSERT INTO requests VALUES(?,?,?)').run(id, fingerprint, JSON.stringify(result));
  }
  taskGet(id) {
    requireText(id, 'task_id', 200);
    const row = this.db.prepare('SELECT data FROM tasks WHERE id=?').get(id);
    if (!row) throw new Error(`Unknown task: ${id}`);
    return JSON.parse(row.data);
  }
  tasks({ project_id, status, limit } = {}) {
    const count = checkedInt(limit, 30, 100);
    const all = this.db.prepare('SELECT data FROM tasks ORDER BY rowid DESC').all().map(row => JSON.parse(row.data));
    const filtered = all.filter(t => (!project_id || t.project_id === project_id) && (!status || t.status === status));
    return { total: filtered.length, tasks: filtered.slice(0, count), truncated: filtered.length > count };
  }
  task(input) {
    if (input.action === 'get') return this.taskGet(input.task_id);
    const action = requireText(input.action, 'action', 30);
    if (!['create', 'claim', 'checkpoint', 'handoff', 'complete', 'reopen'].includes(action)) throw new Error('Unknown task action');
    const agent = requireText(input.agent, 'agent', 100);
    const session = requireText(input.session_id, 'session_id', 200);
    const req = requireText(input.request_id, 'request_id', 200);
    const fingerprint = hash(stable(input));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const saved = this.request(req, fingerprint);
      if (saved) { this.db.exec('COMMIT'); return saved; }
      let task;
      if (action === 'create') {
        task = { id: uid('task'), title: requireText(input.title, 'title', 200),
          project_id: requireText(input.project_id, 'project_id', 200),
          objective: requireText(input.objective, 'objective', 8000),
          acceptance: strings(input.acceptance, 'acceptance', true),
          dependencies: strings(input.dependencies, 'dependencies'), status: 'ready', revision: 0,
          created_at: now(), owner: null, summary: '', next_steps: [], artifacts: [], validation: '', handoffs: [] };
        for (const id of task.dependencies) this.taskGet(id);
      } else {
        task = this.taskGet(input.task_id);
        if (!Number.isInteger(input.expected_revision) || task.revision !== input.expected_revision) {
          throw new Error(`Revision conflict: current revision is ${task.revision}; reread before updating`);
        }
      }
      if (action === 'claim') {
        if (task.status !== 'ready' || task.owner) throw new Error('Task must be ready and unclaimed; use an explicit handoff');
        const blocked = task.dependencies.filter(id => this.taskGet(id).status !== 'done');
        if (blocked.length) throw new Error(`Unfinished dependencies: ${blocked.join(', ')}`);
        task.owner = { agent, session_id: session }; task.status = 'in_progress';
      } else if (['checkpoint', 'handoff', 'complete'].includes(action)) {
        if (task.owner?.session_id !== session || task.owner?.agent !== agent) throw new Error('Claim the task in this agent/session before updating it');
        task.summary = requireText(input.summary, 'summary', 12000);
        task.next_steps = input.next_steps === undefined && action !== 'handoff' ? task.next_steps : strings(input.next_steps, 'next_steps', action === 'handoff');
        task.artifacts = input.artifacts === undefined ? task.artifacts : strings(input.artifacts, 'artifacts');
        task.validation = input.validation === undefined ? '' : requireText(input.validation, 'validation', 12000);
        if (action === 'checkpoint') {
          if (input.status && !['in_progress', 'blocked', 'review'].includes(input.status)) throw new Error('Invalid checkpoint status');
          task.status = input.status ?? 'in_progress';
        }
        if (action === 'complete') {
          if (!task.validation) throw new Error('Completion requires validation evidence or an explicit reason validation is not applicable');
          if (!task.artifacts.length) throw new Error('Completion requires at least one deliverable/artifact reference');
          const blocked = task.dependencies.filter(id => this.taskGet(id).status !== 'done');
          if (blocked.length) throw new Error('Dependencies must be done before completion');
          task.status = 'done'; task.owner = null;
        }
        if (action === 'handoff') {
          task.handoffs.push({ offered_at: now(), from: { agent, session_id: session }, to_agent: input.to_agent ?? null,
            summary: task.summary, next_steps: task.next_steps, artifacts: task.artifacts, validation: task.validation });
          task.status = 'ready'; task.owner = null;
        }
      } else if (action === 'reopen') {
        if (task.status !== 'done') throw new Error('Only completed tasks can be reopened');
        task.summary = requireText(input.summary, 'summary', 12000);
        task.status = 'ready'; task.validation = ''; task.owner = null;
      }
      task.revision++; task.updated_at = now();
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data')
        .run(task.id, task.revision, JSON.stringify(task));
      this.db.prepare('INSERT INTO events(task_id,revision,actor,at,action,data) VALUES(?,?,?,?,?,?)')
        .run(task.id, task.revision, `${agent}/${session}`, task.updated_at, action, JSON.stringify(task));
      this.saveRequest(req, fingerprint, task);
      this.db.exec('COMMIT');
      return { ...task, projection_warnings: this.refresh() };
    } catch (e) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw e;
    }
  }
  projection(relative, content, canonical = relative) {
    const target = this.within(canonical);
    const previous = this.db.prepare('SELECT hash FROM projections WHERE path=?').get(relative);
    if (fs.existsSync(target)) {
      const currentHash = hash(fs.readFileSync(target, 'utf8'));
      if (previous && currentHash !== previous.hash && currentHash !== hash(content)) return `Human-edited view preserved: ${canonical}`;
      if (!previous && !fs.readFileSync(target, 'utf8').includes('<!-- Mastermind generated view.')) return `Existing note preserved: ${canonical}`;
    }
    this.atomic(target, content);
    this.db.prepare('INSERT INTO projections VALUES(?,?) ON CONFLICT(path) DO UPDATE SET hash=excluded.hash').run(relative, hash(content));
    return null;
  }
  refresh() {
    const warnings = [];
    const layoutFile = path.join(this.internal, 'layout.json');
    const previousLayoutText = fs.existsSync(layoutFile) ? fs.readFileSync(layoutFile, 'utf8') : null;
    const layout = this.layout();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const tasks = this.db.prepare('SELECT data FROM tasks ORDER BY rowid DESC').all().map(row => JSON.parse(row.data));
      for (const task of tasks) {
        const list = items => items.length ? items.map(x => `- ${x}`).join('\n') : '- None recorded';
        const legacy = `Work/Tasks/${task.id}.md`;
        let relative = Object.hasOwn(layout.redirects, legacy) ? this.resolve(legacy, layout) : null;
        if (!relative) {
          relative = this.allocate('Work/Tasks', task.title, layout);
          const oldTarget = this.within(legacy);
          const newTarget = this.within(relative);
          if (fs.existsSync(oldTarget) && !fs.existsSync(newTarget)) {
            fs.mkdirSync(path.dirname(newTarget), { recursive: true });
            fs.renameSync(oldTarget, newTarget);
          }
          layout.redirects[legacy] = relative;
        }
        const canonical = this.within(relative);
        const heading = task.title.replace(/[\r\n]+/g, ' ').trim();
        const taskLink = `[[${relative.slice(0, -3)}|${path.posix.basename(relative, '.md')}]]`;
        const hub = this.hubLink(layout, task.project_id, 'project');
        const content = `---\ntype: task-view\ntask_id: ${JSON.stringify(task.id)}\nstatus: ${task.status}\nproject_id: ${JSON.stringify(task.project_id)}\nrevision: ${task.revision}\ntitle: ${JSON.stringify(task.title)}\n---\n<!-- Mastermind generated view. Use brain_task to change workflow state. -->\n\n# ${heading}\n\n${hub ? `${hub} · ` : ''}${taskLink}\n\nStatus: **${task.status}** · Revision: ${task.revision}\n\nOwner: ${task.owner ? `${task.owner.agent} / ${task.owner.session_id}` : 'Available for a new claim'}\n\n## Objective\n${task.objective}\n\n## Acceptance criteria\n${list(task.acceptance)}\n\n## Latest checkpoint\n${task.summary || 'No work recorded yet.'}\n\n## Next steps\n${list(task.next_steps)}\n\n## Artifacts and repository state\n${list(task.artifacts)}\n\n## Validation\n${task.validation || 'Not run / not recorded.'}\n\n## Handoffs\n${task.handoffs.map(h => `- ${h.offered_at}: ${h.from.agent} → ${h.to_agent || 'next available agent'}: ${h.summary}`).join('\n') || '- None'}\n\nUpdated: ${task.updated_at}\n\nCanonical workflow state: local SQLite database, retrieved with brain_task(action=get).\n`;
        const warning = this.projection(legacy, content, relative); if (warning) warnings.push(warning);
      }
      this.atomic(layoutFile, `${JSON.stringify(layout, null, 2)}\n`);
      const active = tasks.filter(t => t.status !== 'done');
      const taskPath = task => this.resolve(`Work/Tasks/${task.id}.md`, layout);
      const board = `<!-- Mastermind generated view. Use brain_task to change workflow state. -->\n# Task Board\n\n[[Home|Master mind home]] · [[System/How to use Master mind]]\n\n${active.length ? active.map(t => `- **${t.status}** [[${taskPath(t).slice(0, -3)}|${t.title}]] — ${t.project_id}${t.owner ? ` (${t.owner.agent})` : ''}`).join('\n') : 'No unfinished tasks.'}\n\n## Completed\n${tasks.filter(t => t.status === 'done').slice(0, 30).map(t => `- [[${taskPath(t).slice(0, -3)}|${t.title}]]`).join('\n') || 'No completed tasks yet.'}\n`;
      const warning = this.projection('Work/Task Board.md', board); if (warning) warnings.push(warning);
      this.db.exec('COMMIT'); return warnings;
    } catch (e) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      if (previousLayoutText === null) fs.rmSync(layoutFile, { force: true });
      else this.atomic(layoutFile, previousLayoutText);
      throw e;
    }
  }
  context({ query, project_id, task_id } = {}) {
    const mandatory = ['System/Agent Contract.md', 'Me/Profile.md', 'Me/Preferences.md', 'Home.md'];
    const notes = mandatory.filter(p => fs.existsSync(this.within(p))).map(p => this.read({ path: p, limit: 12000 }));
    const observations = this.files().filter(p => p.startsWith('Me/Observations/')).map(p => ({ path: p, mtime: fs.statSync(this.within(p)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
    const active = this.db.prepare('SELECT data FROM tasks ORDER BY rowid DESC').all().map(row => JSON.parse(row.data))
      .filter(t => t.status !== 'done' && (!project_id || t.project_id === project_id));
    return { vault: this.root, generated_at: now(), instructions_and_profile: notes,
      recent_profile_observations: observations.slice(0, 5).map(p => this.read({ path: p.path, limit: 2500 })),
      profile_observations_total: observations.length, profile_observations_truncated: observations.length > 5,
      task: task_id ? this.taskGet(task_id) : null,
      workflow: { total: active.length, truncated: active.length > 12, tasks: active.slice(0, 12).map(t => ({
        id: t.id, title: t.title, project_id: t.project_id, revision: t.revision, status: t.status, owner: t.owner,
        summary: t.summary.slice(0, 600), next_steps: t.next_steps.slice(0, 5), detail_required: true
      })) },
      relevant_notes: query ? this.search({ query, limit: 8 }) : null,
      note: 'Search results are excerpts. Read relevant sources before relying on them. Unsupplied profile fields remain unknown. Refresh a task before mutation.' };
  }
  health() {
    return { version: '0.1.0', vault: this.root, storage: 'Markdown knowledge + transactional local SQLite workflow',
      database: this.db.prepare('PRAGMA quick_check').all(), notes: this.files().length,
      tasks: this.db.prepare('SELECT count(*) AS count FROM tasks').get().count,
      network: 'none; stdio only', warnings: ['Live app sessions must reload their MCP configuration. Agent checkpoint behavior is instruction-driven, not a guarantee of capture after a crash.'] };
  }
}

export const toolDefinitions = [
  { name: 'brain_context', description: 'START HERE at the beginning of substantive work. Retrieve Master mind shared user context, active tasks and relevant notes.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, project_id: { type: 'string' }, task_id: { type: 'string' } }, additionalProperties: false } },
  { name: 'brain_search', description: 'Search shared knowledge across profile, LinkedIn, marketing, projects and handoffs. Read matching notes before relying on excerpts.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, scope: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 } }, required: ['query'], additionalProperties: false } },
  { name: 'brain_read', description: 'Read a vault-relative Markdown note, returning its hash and explicit pagination.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 40000 } }, required: ['path'], additionalProperties: false } },
  { name: 'brain_capture', description: 'SAVE discoveries, user corrections, professional context, drafts, lessons or session outcomes as a new attributed Markdown note. Never publishes anything externally.', inputSchema: { type: 'object', properties: { category: { type: 'string', enum: Object.keys(categories) }, title: { type: 'string' }, content: { type: 'string' }, agent: { type: 'string' }, session_id: { type: 'string' }, request_id: { type: 'string' }, project_id: { type: 'string' }, task_id: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['category', 'title', 'content', 'agent', 'session_id', 'request_id'], additionalProperties: false } },
  { name: 'brain_tasks', description: 'List authoritative tasks; filter by project or status. Useful before creating duplicate work.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, status: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'brain_task', description: 'Create, get, claim, checkpoint, handoff, complete or reopen a task. Mutations require unique request_id, agent and session_id; existing-task mutations require expected_revision. Claim before work. Handoff releases ownership and saves next steps. Completion needs artifacts and validation. No other app is launched or messaged.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'get', 'claim', 'checkpoint', 'handoff', 'complete', 'reopen'] }, task_id: { type: 'string' }, expected_revision: { type: 'integer', minimum: 1 }, agent: { type: 'string' }, session_id: { type: 'string' }, request_id: { type: 'string' }, title: { type: 'string' }, project_id: { type: 'string' }, objective: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } }, dependencies: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, next_steps: { type: 'array', items: { type: 'string' } }, artifacts: { type: 'array', items: { type: 'string' } }, validation: { type: 'string' }, status: { type: 'string', enum: ['in_progress', 'blocked', 'review'] }, to_agent: { type: 'string' } }, required: ['action'], additionalProperties: false } },
  { name: 'brain_health', description: 'Check local vault availability, workflow integrity and integration limitations.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];

export function dispatch(brain, name, args = {}) {
  const methods = { brain_context: 'context', brain_search: 'search', brain_read: 'read', brain_capture: 'capture', brain_tasks: 'tasks', brain_task: 'task', brain_health: 'health' };
  if (!Object.hasOwn(methods, name)) throw new Error(`Unknown tool: ${name}`);
  return brain[methods[name]](args);
}
