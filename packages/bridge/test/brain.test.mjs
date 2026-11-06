import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Brain } from '../brain.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimind-test-'));
  const brain = new Brain(root);
  t.after(() => { brain.close(); cleanup(root); });
  return { root, brain };
}
function cleanup(target) {
  const absolute = path.resolve(target);
  const base = path.resolve(os.tmpdir());
  assert.equal(path.dirname(absolute), base);
  assert.ok(/^omnimind-(test|outside)-/.test(path.basename(absolute)));
  fs.rmSync(absolute, { recursive: true, force: true });
}
function create(brain, extra = {}) {
  return brain.task({ action: 'create', agent: 'codex', session_id: 'a', request_id: crypto.randomUUID(),
    title: 'Publishable campaign draft', project_id: 'marketing', objective: 'Prepare a sourced campaign draft',
    acceptance: ['Draft is saved and checked'], ...extra });
}
function claim(brain, task, agent = 'codex', session_id = 'a') {
  return brain.task({ action: 'claim', task_id: task.id, expected_revision: task.revision, agent, session_id, request_id: crypto.randomUUID() });
}
test('captured professional context is searchable and an identical request is idempotent', t => {
  const { brain } = setup(t);
  const input = { category: 'linkedin', title: 'Profile positioning', content: 'User supplied: focus on practical automation.', agent: 'hermes', session_id: 'h', request_id: 'capture-1', sources: ['Current user message'] };
  const first = brain.capture(input);
  assert.deepEqual(brain.capture(input), first);
  assert.equal(brain.search({ query: 'practical automation' }).total, 1);
  assert.match(brain.read({ path: first.path }).content, /User supplied/);
  assert.throws(() => brain.capture({ ...input, content: 'Different' }), /different payload/);
});
test('handoff survives reopening database and can be claimed by a different app', t => {
  const { brain, root } = setup(t);
  const started = claim(brain, create(brain));
  const offered = brain.task({ action: 'handoff', task_id: started.id, expected_revision: started.revision, agent: 'codex', session_id: 'a', request_id: 'handoff',
    summary: 'Research is ready; draft remains.', next_steps: ['Write the draft using the research note'], artifacts: ['Areas/Marketing/Overview.md'], validation: 'Source links checked', to_agent: 'opencode' });
  const other = new Brain(root);
  try {
    const accepted = claim(other, other.taskGet(offered.id), 'opencode', 'b');
    assert.equal(accepted.handoffs[0].summary, offered.summary);
    assert.equal(accepted.owner.agent, 'opencode');
    assert.throws(() => brain.task({ action: 'checkpoint', task_id: started.id, expected_revision: accepted.revision, agent: 'codex', session_id: 'a', request_id: 'stale-owner', summary: 'late edit' }), /Claim/);
  } finally { other.close(); }
});
test('stale revisions, blocked dependencies and completion without evidence are refused', t => {
  const { brain } = setup(t);
  const parent = create(brain);
  const child = create(brain, { dependencies: [parent.id] });
  assert.throws(() => claim(brain, child), /Unfinished dependencies/);
  const active = claim(brain, parent);
  assert.throws(() => claim(brain, parent), /Revision conflict/);
  const base = { action: 'complete', task_id: active.id, expected_revision: active.revision, agent: 'codex', session_id: 'a', request_id: 'complete', summary: 'Draft saved' };
  assert.throws(() => brain.task(base), /validation/);
  assert.throws(() => brain.task({ ...base, validation: 'Manually reviewed' }), /artifact/);
  assert.equal(brain.taskGet(active.id).revision, active.revision);
  const done = brain.task({ ...base, validation: 'Manually reviewed against criteria', artifacts: ['draft.md'] });
  assert.equal(done.status, 'done');
  assert.ok(!brain.context().workflow.tasks.some(t => t.id === done.id));
  assert.equal(claim(brain, child).status, 'in_progress');
});
test('human edits of generated views are preserved, hidden paths and traversal are excluded', t => {
  const { brain, root } = setup(t);
  create(brain);
  const board = path.join(root, 'Work', 'Task Board.md');
  fs.appendFileSync(board, '\nA human comment.\n');
  assert.ok(brain.refresh().some(x => x.includes('Human-edited')));
  assert.match(fs.readFileSync(board, 'utf8'), /A human comment/);
  assert.throws(() => brain.read({ path: '../private.md' }), /traversal/);
  assert.throws(() => brain.read({ path: '.omnimind/secret.md' }), /Hidden/);
  fs.mkdirSync(path.join(root, '.obsidian'));
  fs.writeFileSync(path.join(root, '.obsidian', 'hidden.md'), 'secretcanary');
  assert.equal(brain.search({ query: 'secretcanary' }).total, 0);
});
test('a junction cannot be used to read outside the vault', t => {
  const { brain, root } = setup(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimind-outside-'));
  fs.writeFileSync(path.join(outside, 'private.md'), 'private canary');
  const link = path.join(root, 'escape');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    assert.throws(() => brain.read({ path: 'escape/private.md' }), /escapes/);
    assert.equal(brain.search({ query: 'private canary' }).total, 0);
  } finally { fs.unlinkSync(link); cleanup(outside); }
});
test('two independent server processes cannot claim the same revision', async t => {
  const { brain, root } = setup(t);
  const task = create(brain);
  const cli = path.resolve(import.meta.dirname, '../cli.mjs');
  const run = agent => new Promise((resolve, reject) => {
    const args = { action: 'claim', task_id: task.id, expected_revision: task.revision, agent, session_id: agent, request_id: agent };
    const file = path.join(root, `${agent}.json`); fs.writeFileSync(file, JSON.stringify(args));
    const child = spawn(process.execPath, [cli, 'brain_task', file], { env: { ...process.env, OMNIMIND_VAULT: root }, windowsHide: true });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, stderr }));
  });
  const results = await Promise.all([run('hermes'), run('antigravity')]);
  assert.equal(results.filter(x => x.code === 0).length, 1, JSON.stringify(results));
  assert.match(results.find(x => x.code !== 0).stderr, /Revision conflict/);
});
test('actual MCP stdio clients discover tools and share notes across connections', async t => {
  const { root } = setup(t);
  const server = path.resolve(import.meta.dirname, '../server.mjs');
  const connect = async name => {
    const client = new Client({ name, version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env, OMNIMIND_VAULT: root }, stderr: 'pipe' });
    await client.connect(transport); return client;
  };
  const first = await connect('hermes-test');
  try {
    assert.equal((await first.listTools()).tools.length, 7);
    const saved = await first.callTool({ name: 'brain_capture', arguments: { category: 'marketing', title: 'MCP handoff canary', content: 'Campaign decision: blue umbrella.', agent: 'hermes', session_id: 'test', request_id: 'mcp-canary' } });
    assert.ok(!saved.isError);
  } finally { await first.close(); }
  const second = await connect('opencode-test');
  try {
    const found = await second.callTool({ name: 'brain_search', arguments: { query: 'blue umbrella' } });
    assert.ok(!found.isError); assert.match(found.content[0].text, /blue umbrella/);
    const rejected = await second.callTool({ name: 'brain_read', arguments: { path: '../private.md' } });
    assert.equal(rejected.isError, true);
  } finally { await second.close(); }
});

test('task projections use readable canonical filenames, valid YAML, immutable identifiers and redirect compatibility', t => {
  const { brain, root } = setup(t); const task=create(brain,{title:'Build readable task',project_id:'project-a'}); const file=path.join(root,'Work/Tasks/Build readable task.md');
  assert.ok(fs.existsSync(file)); const text=fs.readFileSync(file,'utf8');
  assert.ok(text.startsWith('---\ntype: task-view\n')); assert.match(text,/task_id: "task-[^"]+"/); assert.match(text,/project_id: "project-a"/);
  assert.ok(text.includes('[[Work/Tasks/Build readable task|Build readable task]]'));
  const duplicate=create(brain,{title:'Build readable task',project_id:'project-a'});
  assert.ok(fs.existsSync(path.join(root,'Work/Tasks/Build readable task - 02.md')));
  assert.ok(brain.read({path:'Work/Tasks/'+duplicate.id+'.md'}).path.endsWith('Build readable task - 02.md'));
  const legacy='Work/Tasks/'+task.id+'.md';
  assert.equal(brain.db.prepare('SELECT path FROM projections WHERE path=?').get(legacy).path,legacy);
  fs.writeFileSync(file,text+'\nHuman annotation that must survive.\n');
  fs.writeFileSync(path.join(root,'.omnimind/layout.json'),JSON.stringify({version:1,timezone:'UTC',redirects:{[legacy]:'Work/Tasks/Build readable task.md'},projects:{},categoryHubs:{}}));
  assert.equal(brain.read({path:legacy}).path,'Work/Tasks/Build readable task.md');
  assert.ok(brain.refresh().some(x=>x.includes('Human-edited')));
  assert.match(fs.readFileSync(file,'utf8'),/Human annotation that must survive/);
});
test('maintenance lock refuses Brain construction before opening workflow SQLite', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'omnimind-test-'));const internal=path.join(root,'.omnimind');fs.mkdirSync(internal);fs.writeFileSync(path.join(internal,'reorganization.lock'),'maintenance');
  try { assert.throws(()=>new Brain(root),/maintenance/i);assert.ok(!fs.existsSync(path.join(internal,'workflow.sqlite'))); }
  finally { cleanup(root); }
});
test('maintenance lock makes both the CLI and MCP server exit before opening the database', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'omnimind-test-'));const internal=path.join(root,'.omnimind');fs.mkdirSync(internal);fs.writeFileSync(path.join(internal,'reorganization.lock'),'maintenance');
  t.after(()=>cleanup(root));
  const run=script=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,script,{env:{...process.env,OMNIMIND_VAULT:root},windowsHide:true});let stderr='';
    child.stderr.on('data',data=>{stderr+=data;});child.on('error',reject);child.on('close',code=>resolve({code,stderr}));
  });
  const cli=await run([path.resolve(import.meta.dirname,'../cli.mjs'),'brain_health']);
  assert.notEqual(cli.code,0);assert.match(cli.stderr,/maintenance/i);
  const server=await run([path.resolve(import.meta.dirname,'../server.mjs')]);
  assert.notEqual(server.code,0);assert.match(server.stderr,/maintenance/i);
  assert.ok(!fs.existsSync(path.join(internal,'workflow.sqlite')));
});

test('older vault data blocks initialization without creating a new database', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimind-test-'));
  t.after(() => cleanup(root));
  const previous = path.join(root, '.' + ['master', 'mind'].join(''));
  fs.mkdirSync(previous);
  fs.writeFileSync(path.join(previous, 'workflow.sqlite'), 'existing data');
  assert.throws(() => new Brain(root), /older vault database/);
  assert.equal(fs.existsSync(path.join(root, '.omnimind')), false);
  assert.equal(fs.readFileSync(path.join(previous, 'workflow.sqlite'), 'utf8'), 'existing data');
});
