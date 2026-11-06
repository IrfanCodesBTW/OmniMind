import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Brain } from '../brain.mjs';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimind-layout-'));
  const brain = new Brain(root);
  t.after(() => { brain.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const put = (p, text) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); };
  const layout = extra => put('.omnimind/layout.json', JSON.stringify({ version: 1, timezone: 'Asia/Calcutta', redirects: {}, projects: {}, categoryHubs: {}, ...extra }));
  return { root, brain, put, layout };
}
test('readable Unicode captures have stable collision qualifiers and fingerprint crash recovery', t => {
  const { brain, root, put } = fixture(t);
  const first = brain.capture(capture());
  assert.equal(first.path, 'Areas/Marketing/Notes/Café launch.md');
  assert.deepEqual(brain.capture(capture()), first);
  const second = brain.capture(capture({ request_id: 'r2', title: 'CAFE\u0301 LAUNCH' }));
  assert.equal(second.path, 'Areas/Marketing/Notes/CAFÉ LAUNCH - 02.md');
  brain.db.prepare('DELETE FROM requests WHERE id=?').run('r2');
  const recovered = brain.capture(capture({ request_id: 'r2', title: 'CAFE\u0301 LAUNCH' }));
  assert.equal(recovered.path, second.path); assert.equal(recovered.recovered, true);
  assert.equal(brain.files().length, 2);
  const reserved = brain.capture(capture({ request_id: 'r3', title: 'CON:<>"/\\\\|?* . ' }));
  assert.equal(reserved.path, 'Areas/Marketing/Notes/CON note.md');
  const long = brain.capture(capture({ request_id: 'r4', title: '界'.repeat(150) }));
  assert.ok(Array.from(path.basename(long.path, '.md')).length <= 70);
  put('Areas/Marketing/Notes/Occupied.md', 'human');
  assert.equal(brain.capture(capture({ request_id: 'r5', title: 'Occupied' })).path, 'Areas/Marketing/Notes/Occupied - 02.md');
  assert.equal(fs.readFileSync(path.join(root, 'Areas/Marketing/Notes/Occupied.md'), 'utf8'), 'human');
});
test('capture routing uses mapped real hubs, readable H1 and local date sessions', t => {
  const { brain, put, layout } = fixture(t);
  put('Projects/Launch/Launch.md', '# Launch'); put('Areas/Marketing/Marketing.md', '# Marketing');
  layout({ projects: { launch: { folder: 'Projects/Launch', hub: 'Projects/Launch/Launch.md' } }, categoryHubs: { marketing: 'Areas/Marketing/Marketing.md', research: 'Knowledge/Missing.md' } });
  const full = 'Readable '.repeat(20);
  const saved = brain.capture(capture({ category: 'project', project_id: 'launch', title: full }));
  assert.equal(path.posix.dirname(saved.path), 'Projects/Launch');
  const text = brain.read({ path: saved.path }).content;
  assert.ok(text.includes(`title: ${JSON.stringify(full)}`));
  assert.ok(text.includes(`# ${path.basename(saved.path, '.md')}\n`));
  assert.ok(text.includes('[[Projects/Launch/Launch|'));
  const marketing = brain.capture(capture({ request_id: 'marketing' }));
  assert.ok(brain.read({ path: marketing.path }).content.includes('[[Areas/Marketing/Marketing|'));
  const missing = brain.capture(capture({ category: 'research', request_id: 'missing' }));
  assert.ok(!brain.read({ path: missing.path }).content.includes('[[Knowledge/Missing'));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const session = brain.capture(capture({ category: 'session', project_id: 'launch', request_id: 'session', title: 'Session summary' }));
  assert.equal(session.path, `Work/Sessions/${date} Session summary.md`);
  const unmapped = brain.capture(capture({ category: 'project', project_id: 'unknown', request_id: 'unknown' }));
  assert.equal(path.posix.dirname(unmapped.path), 'Projects/Notes');
});
const capture = extra => ({ category: 'marketing', title: 'Café launch', content: 'Evidence.', agent: 'test', session_id: 's', request_id: 'r', ...extra });
test('redirects are dynamic and canonicalize reads and cached capture results without changing requests', t => {
  const { brain, root, put, layout } = fixture(t);
  const input = capture(); const old = brain.capture(input);
  const saved = brain.db.prepare('SELECT * FROM requests').get();
  put('Areas/Marketing/Café launch.md', 'current human content');
  fs.unlinkSync(path.join(root, old.path));
  layout({ redirects: { [old.path]: 'Areas/Marketing/intermediate.md', 'Areas/Marketing/intermediate.md': 'Areas/Marketing/Café launch.md' } });
  const read = brain.read({ path: old.path });
  assert.equal(read.path, 'Areas/Marketing/Café launch.md');
  assert.equal(read.sha256, sha('current human content'));
  assert.equal(brain.capture(input).path, read.path);
  assert.equal(brain.capture(input).sha256, read.sha256);
  assert.deepEqual(brain.db.prepare('SELECT * FROM requests').get(), saved);
});

test('manifest rejects malicious paths, symlink escapes and redirect cycles before writes', t => {
  const { brain, root, put, layout } = fixture(t);
  put('safe.md', 'safe');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimind-layout-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'escape'));
  for (const bad of ['../outside.md', '.omnimind/workflow.sqlite', '/absolute.md', 'escape/private.md']) {
    for (const extra of [{ redirects: { 'old.md': bad } }, { projects: { p: { folder: bad, hub: 'safe.md' } } }, { categoryHubs: { marketing: bad } }]) {
      layout(extra);
      assert.throws(() => brain.capture(capture()), /traversal|Hidden|escapes|layout|Layout/);
      assert.equal(brain.db.prepare('SELECT count(*) AS n FROM requests').get().n, 0);
    }
  }
  layout({ redirects: { 'a.md': 'b.md', 'b.md': 'a.md' } });
  assert.throws(() => brain.read({ path: 'safe.md' }), /cycle/);
  layout({ redirects: [], projects: {}, categoryHubs: {} });
  assert.throws(() => brain.read({ path: 'safe.md' }), /layout|Layout/);
});
