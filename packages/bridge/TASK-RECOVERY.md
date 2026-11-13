# Task recovery

## Heartbeats and interrupted-task recovery

New task claims get a 15-minute lease. Send `brain_task(action=heartbeat)` at safe boundaries (about every 5 minutes for the default lease); checkpoints also renew it. Heartbeats require the current owner, session and expected revision, and increment revision. Reread after conflicts. There is no background timer that sends heartbeats for an agent. Choose a longer `lease_seconds` (60–86400) before a long non-interruptible operation. Expiry means the task is eligible for review, not proof that its owner died. The original owner may still resume/renew until a recovery wins the transaction.

Recover only after explicit user/operator authorization: reread the task, verify its expiry against current time, inspect saved checkpoints/notes and actual files, then use `brain_task(action=recover, task_id, expected_revision, agent, session_id, confirm_recovery=true, reason)`. Supply your actual new identity; never impersonate the prior session. Recovery atomically changes the owner, increments revision, preserves summary/next_steps/artifacts/validation and appends an audit record in `recoveries`. Reusing the same request_id with the same payload is idempotent. Competing recoveries cannot both succeed. Old owner updates fail even if they reread the latest revision.

Older claims with no lease are never silently expired or migrated. Recovery additionally requires `confirm_unleased=true` after explicit operator confirmation that takeover is appropriate. A new owner then receives a lease. Unclaimed or completed tasks cannot be recovered. Normal handoff/completion clears the lease.

These controls protect bridge task updates only. They do not cancel agent processes, authenticate clients, lock source files or undo external side effects. Confirm the previous writer is stopped before overlapping file work. Existing MCP processes must restart/reload to load updated code and schemas. No existing claims are automatically reassigned.

### Example calls (replace IDs/revisions with actual task values)

```json
{"action":"heartbeat","task_id":"TASK_ID","expected_revision":3,"agent":"Codex","session_id":"CURRENT_SESSION","request_id":"unique-heartbeat-request"}
```

After expiry and explicit operator approval, a different session can call:

```json
{"action":"recover","task_id":"TASK_ID","expected_revision":4,"agent":"OpenCode","session_id":"NEW_SESSION","request_id":"unique-recovery-request","confirm_recovery":true,"reason":"Operator confirmed the previous writer stopped"}
```

Use the returned revision for subsequent updates. Keep the request_id/payload identical only when retrying the same operation. Do not use confirm_unleased for a task that has a live lease. Legacy takeover requires operator confirmation even if a timestamp looks old.
