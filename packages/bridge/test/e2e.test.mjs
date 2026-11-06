import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('OmniMind full functional verification suite', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
  const TEMPLATE_VAULT = path.join(ROOT_DIR, 'packages', 'templates', 'starter-vault');
  const TEST_VAULT = path.join(os.tmpdir(), `omnimind-verify-${Date.now()}`);

  // Seed vault
  fs.mkdirSync(TEST_VAULT, { recursive: true });
  fs.cpSync(TEMPLATE_VAULT, TEST_VAULT, { recursive: true });

  const { Brain, dispatch } = await import(path.join(ROOT_DIR, 'packages', 'bridge', 'brain.mjs'));
  const brain = new Brain(TEST_VAULT);

  try {
    // 1. brain_health
    const health = dispatch(brain, 'brain_health', {});
    assert.strictEqual(health.storage, 'Markdown knowledge + transactional local SQLite workflow');
    assert.strictEqual(health.database[0].quick_check, 'ok');
    assert(health.notes >= 10, 'Expected seeded starter notes');
    assert.strictEqual(health.tasks, 0, 'Initial tasks should be 0');

    // 2. brain_context
    const context = dispatch(brain, 'brain_context', { query: 'contract' });
    assert(context.instructions_and_profile.some(doc => doc.path.includes('Agent Contract.md')), 'Must load Agent Contract');
    assert(Array.isArray(context.workflow.tasks), 'Must return active tasks list');

    // 3. brain_task lifecycle & concurrency
    const createRes = dispatch(brain, 'brain_task', {
      request_id: 'req-task-001',
      action: 'create',
      agent: 'claude',
      session_id: 'session-claude-01',
      title: 'Verify OmniMind MCP Bridge',
      project_id: 'omnimind-core',
      objective: 'Run end to end functional verification',
      acceptance: ['All 7 tools tested', 'Optimistic locking validated']
    });
    const taskId = createRes.id;
    assert.strictEqual(createRes.revision, 1);
    assert.strictEqual(createRes.status, 'ready');

    const taskFiles = fs.readdirSync(path.join(TEST_VAULT, 'Work', 'Tasks'));
    assert(taskFiles.some(f => f.includes('Verify OmniMind MCP Bridge')), 'Task view markdown must exist on disk');

    const claimRes = dispatch(brain, 'brain_task', {
      request_id: 'req-task-002',
      action: 'claim',
      task_id: taskId,
      expected_revision: 1,
      agent: 'claude',
      session_id: 'session-claude-01'
    });
    assert.strictEqual(claimRes.revision, 2);
    assert.strictEqual(claimRes.status, 'in_progress');
    assert.strictEqual(claimRes.owner.agent, 'claude');

    let conflictCaught = false;
    try {
      dispatch(brain, 'brain_task', {
        request_id: 'req-task-003',
        action: 'checkpoint',
        task_id: taskId,
        expected_revision: 1,
        agent: 'hermes',
        session_id: 'session-hermes-01',
        summary: 'Stale attempt'
      });
    } catch (err) {
      conflictCaught = true;
      assert(err.message.includes('revision') || err.message.includes('owner'));
    }
    assert(conflictCaught, 'Must reject stale revision 1');

    const handoffRes = dispatch(brain, 'brain_task', {
      request_id: 'req-task-004',
      action: 'handoff',
      task_id: taskId,
      expected_revision: 2,
      agent: 'claude',
      session_id: 'session-claude-01',
      summary: 'Initial verification checks written and tested',
      to_agent: 'hermes',
      next_steps: ['Complete testing']
    });
    assert.strictEqual(handoffRes.owner, null, 'Handoff must release owner claim');

    const hermesClaimRes = dispatch(brain, 'brain_task', {
      request_id: 'req-task-005',
      action: 'claim',
      task_id: taskId,
      expected_revision: 3,
      agent: 'hermes',
      session_id: 'session-hermes-01'
    });
    assert.strictEqual(hermesClaimRes.owner.agent, 'hermes');

    const completeRes = dispatch(brain, 'brain_task', {
      request_id: 'req-task-006',
      action: 'complete',
      task_id: taskId,
      expected_revision: 4,
      agent: 'hermes',
      session_id: 'session-hermes-01',
      summary: 'Finished all verification checks',
      artifacts: ['packages/bridge/test/brain.test.mjs'],
      validation: '14/14 tests pass'
    });
    assert.strictEqual(completeRes.status, 'done');

    // 4. brain_capture
    const captureRes1 = dispatch(brain, 'brain_capture', {
      request_id: 'req-capture-001',
      agent: 'claude',
      session_id: 'session-claude-01',
      category: 'decision',
      title: 'Adopt SQLite for Transactional Task Ownership',
      content: 'We use SQLite WAL mode for task revision control and ACID invariants.',
      sources: ['OmniMind Architecture Specification']
    });
    assert(captureRes1.path.startsWith('Knowledge/Decisions/'), 'Must place in Knowledge/Decisions');
    assert(fs.existsSync(path.join(TEST_VAULT, captureRes1.path)), 'File must exist on disk');

    const captureRes2 = dispatch(brain, 'brain_capture', {
      request_id: 'req-capture-001',
      agent: 'claude',
      session_id: 'session-claude-01',
      category: 'decision',
      title: 'Adopt SQLite for Transactional Task Ownership',
      content: 'We use SQLite WAL mode for task revision control and ACID invariants.',
      sources: ['OmniMind Architecture Specification']
    });
    assert.strictEqual(captureRes1.path, captureRes2.path);
    assert.strictEqual(captureRes1.sha256, captureRes2.sha256);

    // 5. brain_search
    const searchRes = dispatch(brain, 'brain_search', { query: 'ACID invariants' });
    assert(searchRes.results.length > 0, 'Must find captured note');
    assert.strictEqual(searchRes.results[0].path, captureRes1.path);

    // 6. brain_read
    const readRes = dispatch(brain, 'brain_read', { path: captureRes1.path });
    assert.strictEqual(readRes.sha256, captureRes1.sha256);
    assert(readRes.content.includes('SQLite WAL mode'));

    // 7. brain_tasks
    const tasksRes = dispatch(brain, 'brain_tasks', { status: 'done' });
    assert.strictEqual(tasksRes.total, 1);
    assert.strictEqual(tasksRes.tasks[0].id, taskId);

    // 8. Security traversal
    let traversalCaught = false;
    try {
      dispatch(brain, 'brain_read', { path: '../../etc/passwd' });
    } catch {
      traversalCaught = true;
    }
    assert(traversalCaught, 'Path traversal must be rejected');
  } finally {
    brain.close();
    fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  }
});
