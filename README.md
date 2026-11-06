# 🧠 OmniMind

> **Local-first shared memory and transactional task coordinator for multi-agent AI harnesses.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-1.32.1-green.svg)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-14%2F14%20Passing-success.svg)](packages/bridge/test)

---

## 💡 The Problem: Multi-Agent Silos & Amnesia

Modern AI developers don't use just one tool:
- You brainstorm and architect in **Claude Desktop**.
- You write code in **Cursor** or **Codex**.
- You run autonomous workflows in **Hermes Agent** or **OpenCode**.

**The issue?** Every client starts with zero context. They don't know what decisions were made in other sessions, they overwrite each other's work, and they have no reliable, conflict-free way to coordinate tasks.

---

## ⚡ The Solution: OmniMind

**OmniMind** provides a single, local-first source of truth that every AI agent connects to via the standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

```
   ┌─────────────────────────────────────────────────────────────┐
   │                   AI Coding & Research Clients              │
   │   Claude Desktop  ·  Cursor  ·  Codex  ·  Hermes  ·  OpenCode │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ (stdio MCP Protocol)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                      OmniMind Bridge                        │
   │            (7 MCP Tools · Optimistic Locking)               │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │                               │
                  ▼                               ▼
   ┌─────────────────────────────┐ ┌─────────────────────────────┐
   │   Human-Readable Storage    │ │   Transactional Task Store  │
   │   Obsidian Markdown Vault   │ │      Local SQLite (WAL)     │
   │  (Notes, Hubs, Knowledge)   │ │ (Tasks, Claims, Revisions)  │
   └─────────────────────────────┘ └─────────────────────────────┘
```

- **Human-Readable Knowledge**: All knowledge, decisions, and sessions are written to a plain Markdown vault you can browse and edit in [Obsidian](https://obsidian.md).
- **ACID Transactional Tasks**: Task state, revisions, claims, and event logs are stored in a local SQLite database with optimistic concurrency control. Two agents cannot collide or overwrite the same task.
- **Universal Stdio MCP Bridge**: Zero cloud dependencies, zero external vector databases, zero telemetry. 100% private and runs locally on your machine.

---

## 🚀 Quickstart in 30 Seconds

### Option A: Using the Interactive Installer
```bash
git clone https://github.com/IrfanCodesBTW/omnimind.git
cd omnimind
npm run init
```
The wizard will:
1. Seed a fresh Obsidian starter vault with information architecture rules.
2. Initialize the local SQLite workflow store.
3. Automatically detect and configure installed AI clients (Claude Desktop, Cursor, Hermes, etc.).

### Option B: Manual Registration
Add the bridge to your MCP client config (e.g. `claude_desktop_config.json` or Cursor MCP settings):

```json
{
  "mcpServers": {
    "omnimind": {
      "command": "node",
      "args": ["/path/to/omnimind/packages/bridge/server.mjs"],
      "env": {
        "MASTERMIND_VAULT": "/path/to/your/Obsidian/Vault"
      }
    }
  }
}
```

---

## 🛠️ The 7 Core MCP Tools

OmniMind exposes a curated set of 7 high-leverage tools:

| Tool | Purpose | Key Guarantees |
|---|---|---|
| `brain_context` | Gateway for agents starting substantive work. | Loads Agent Contract, profile facts, and active task summaries. |
| `brain_search` | Substring keyword search across vault Markdown. | Scoped directory searches, title boost, traversal exclusion. |
| `brain_read` | Reads allowed vault Markdown notes. | Returns SHA-256 hash, pagination, directory escape rejection. |
| `brain_capture` | Saves attributed session notes and ADRs. | Request idempotency, auto-linking to parent hubs, clean filenames. |
| `brain_tasks` | Queries tasks with filters and pagination. | Real-time aggregate task state from authoritative SQLite store. |
| `brain_task` | Create, claim, checkpoint, handoff, complete. | Optimistic concurrency (`expected_revision`), append-only event ledger. |
| `brain_health` | Diagnostic self-check. | Validates SQLite integrity, schema version, note counts, zero mutations. |

---

## 📂 Vault Information Architecture

OmniMind enforces a strict, human-friendly folder taxonomy:

```text
OmniMind/
├── Home.md                       # Top-level entrypoint
├── AGENTS.md                     # Universal agent contract
├── Me/                           # Confirmed profile facts and user preferences
├── Areas/                        # Ongoing long-term domains (e.g., Engineering, Marketing)
├── Projects/                     # Bounded deliverables with dedicated hubs
├── Knowledge/
│   ├── Concepts/                 # Evergreen mental models
│   ├── Research/                 # Sourced research claims
│   ├── Decisions/                # Architecture Decision Records (ADRs)
│   └── Lessons/                  # Post-mortems and lessons learned
├── Work/
│   ├── Task Board.md             # Markdown task board projection
│   ├── Tasks/                    # Generated readable task views
│   └── Sessions/                 # Dated session outcomes (YYYY-MM-DD)
└── System/                       # Governance, graph rules, and backup policies
```

---

## 🛡️ Built-in Concurrency & Integrity Safeguards

1. **Optimistic Locking**: Every task has a monotonic `revision` number. If Agent B tries to modify a task that Agent A has already updated, Agent B's call is rejected with a stale revision error until it re-reads.
2. **Explicit Handoffs**: An agent cannot "steal" an active task claim from another session without an explicit handoff release.
3. **Idempotent Mutations**: Every mutating request accepts an idempotency key. Network retries return identical results without duplicating entries.
4. **Readable File Naming**: Rejects hash suffixes, raw UUIDs, and Windows reserved names. Produces clean, readable note titles (3 to 8 words, <= 70 characters).

---

## 🧪 Testing

OmniMind includes an exhaustive test suite exercising concurrent process claims, junction/symlink security escapes, crash recovery, and tool discovery:

```bash
cd packages/bridge
npm test
```
```text
✔ captured professional context is searchable and idempotent
✔ handoff survives reopening database and can be claimed by another app
✔ stale revisions, blocked dependencies and completion without evidence are refused
✔ two independent server processes cannot claim the same revision
✔ actual MCP stdio clients discover tools and share notes across connections
...
ℹ tests 14 · pass 14 · fail 0
```

---

## 🤝 Contributing

Contributions are very welcome! Please feel free to submit issues, feature suggestions, or pull requests.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Ensure all tests pass (`npm test`).
5. Push to the branch and open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
