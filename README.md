<div align="center">

# 🧠 OmniMind

**One persistent memory. Every AI harness.**

*Local-first shared memory and transactional task engine for multi-agent AI workflows — powered by the Model Context Protocol.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.32.1-purple)](https://github.com/modelcontextprotocol/typescript-sdk)
[![Node.js ≥ 24](https://img.shields.io/badge/Node.js-%3E%3D24-green)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-15%2F15%20passing-brightgreen)](#testing)
[![CI](https://github.com/IrfanCodesBTW/omnimind/actions/workflows/ci.yml/badge.svg)](https://github.com/IrfanCodesBTW/omnimind/actions)

</div>

---

## The Problem

You're using Claude, Cursor, Codex, and three other AI agents — and **none of them remember what the others did**. Every session starts cold. Context is repeated, tasks are duplicated, decisions are forgotten.

OmniMind is the fix: a single stdio MCP server that gives every agent the same persistent memory, task board, and coordination layer — backed by your local Markdown vault and a WAL-mode SQLite database.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR AI CLIENTS                          │
│  Claude Desktop  │  Cursor  │  Codex  │  OpenCode  │  Windsurf  │
└──────────┬───────┴────┬─────┴────┬────┴─────┬──────┴────┬───────┘
           │  stdio MCP │         │          │           │
           ▼            ▼         ▼          ▼           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OmniMind Bridge (server.mjs)                  │
│           7 MCP Tools · Optimistic Locking · ACID SQLite         │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────▼──────────────────┐
           │         Your Obsidian Vault          │
           │  .obsidian/  │  Notes/  │ .omnimind/ │
           │              │          │  brain.db  │
           └─────────────────────────────────────┘
```

Every agent reads from and writes to the **same vault and database** — so context, tasks, and decisions persist across all tools, all sessions.

---

## Key Features

- **🔒 Local-first & private** — your vault stays on your machine; zero cloud dependency
- **⚡ Stdio MCP transport** — zero-port, zero-auth, plug into any MCP-compatible client in seconds
- **🧰 7 purpose-built tools** — context, search, read, capture, tasks, health (`brain_context`, `brain_search`, `brain_read`, `brain_capture`, `brain_tasks`, `brain_task`, `brain_health`)
- **🗃️ ACID SQLite (WAL mode)** — durable task state with write-ahead logging and crash recovery
- **🔁 Optimistic concurrency locking** — multi-agent task claiming with revision-based conflict prevention
- **📝 Idempotent captures** — fingerprinted note deduplication prevents duplicate writes
- **📂 Obsidian-compatible vault** — open your notes in Obsidian, iA Writer, or any Markdown editor alongside your agents

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 24.0 | Uses native `node:test`, `node:sqlite`, ES modules |
| **Git** | any | For cloning |
| **Obsidian** | any (optional) | For browsing your vault visually |
| **An MCP-compatible AI client** | — | Claude Desktop, Cursor, Codex, OpenCode, Windsurf, etc. |

---

## Quick Start

### Option A — Interactive Setup Wizard (Recommended)

```bash
git clone https://github.com/IrfanCodesBTW/omnimind.git
cd omnimind
npm run init
```

The wizard will:
1. Ask where you want your vault (or use an existing one)
2. Copy the starter vault template
3. Detect your AI clients and print the exact config block to add

### Option B — Manual Setup

See the [Manual Setup Guide](#manual-setup-guide) below.

---

## Manual Setup Guide

### 1. Clone the repository

```bash
git clone https://github.com/IrfanCodesBTW/omnimind.git
cd omnimind
```

### 2. Install dependencies

```bash
cd packages/bridge
npm install
cd ../..
```

### 3. Create your vault

Either point to an existing Obsidian vault, or create a new one from the starter template:

```bash
# Option: use the starter template
cp -r packages/templates/starter-vault ~/Documents/MyBrain
```

### 4. Configure your AI client

Add an `omnimind` entry to your MCP client config. Replace the paths with your actual paths:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "omnimind": {
      "command": "node",
      "args": ["/absolute/path/to/omnimind/packages/bridge/server.mjs"],
      "env": {
        "MASTERMIND_VAULT": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "omnimind": {
      "command": "node",
      "args": ["/absolute/path/to/omnimind/packages/bridge/server.mjs"],
      "env": {
        "MASTERMIND_VAULT": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

**OpenCode** (`~/.config/opencode/config.json`):
```json
{
  "mcp": {
    "servers": {
      "omnimind": {
        "type": "local",
        "command": "node",
        "args": ["/absolute/path/to/omnimind/packages/bridge/server.mjs"],
        "env": {
          "MASTERMIND_VAULT": "/absolute/path/to/your/vault"
        }
      }
    }
  }
}
```

### 5. Verify the connection

```bash
MASTERMIND_VAULT="/absolute/path/to/your/vault" node packages/bridge/cli.mjs brain_health
```

You should see:
```json
{
  "status": "ok",
  "vault": "/absolute/path/to/your/vault",
  "notes": 12,
  "tasks": { "open": 0, "total": 0 }
}
```

### 6. Restart your AI client

Restart Claude Desktop / Cursor / etc. — the OmniMind tools will appear in the tool list.

---

## AI Agent Setup Prompt ✨

> **Copy-paste this prompt into any AI coding agent** (Claude Code, Cursor Agent, OpenCode, Codex, Windsurf) to have it set up OmniMind autonomously on your machine.

````
You are setting up the OmniMind MCP Brain on my local machine. Follow these steps autonomously:

1. Clone https://github.com/IrfanCodesBTW/omnimind to ~/OmniMind (or ask me for a preferred location)
2. Run: cd ~/OmniMind/packages/bridge && npm install
3. Create a vault directory at ~/Documents/OmniMind-Vault
4. Copy all files from packages/templates/starter-vault/ into ~/Documents/OmniMind-Vault
5. Locate my AI client MCP config file. Check these locations in order:
   - Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)
   - Claude Desktop: %APPDATA%\Claude\claude_desktop_config.json  (Windows)
   - Cursor: ~/.cursor/mcp.json
   - OpenCode: ~/.config/opencode/config.json
   - Codex: ~/.codex/config.json
   - Windsurf: ~/.codeium/windsurf/mcp_config.json
6. Add the following entry under "mcpServers" in that config file:
   {
     "omnimind": {
       "command": "node",
       "args": ["<absolute path to ~/OmniMind/packages/bridge/server.mjs>"],
       "env": {
         "MASTERMIND_VAULT": "<absolute path to ~/Documents/OmniMind-Vault>"
       }
     }
   }
7. Verify the setup by running:
   MASTERMIND_VAULT="~/Documents/OmniMind-Vault" node ~/OmniMind/packages/bridge/cli.mjs brain_health
8. Report the full health check JSON output and the exact config entry you wrote, including all absolute paths used.
````

---

## The 7 MCP Tools

| Tool | Purpose | Key Arguments |
|---|---|---|
| `brain_context` | Load agent instructions, open tasks, and relevant notes | `query?`, `project_id?`, `task_id?` |
| `brain_search` | Full-text search across the entire vault | `query` |
| `brain_read` | Read a specific note by path or ID | `path` |
| `brain_capture` | Write a new note with deduplication fingerprinting | `category`, `title`, `content`, `agent`, `session_id`, `request_id` |
| `brain_tasks` | List tasks with filters | `status?`, `project_id?`, `agent?` |
| `brain_task` | Create, claim, update, complete, or hand off a task | `action`, varies by action |
| `brain_health` | Health check — vault status, note count, task stats | — |

> **Agents should always call `brain_context` first** at the start of every session to load instructions, open tasks, and relevant memory.

---

## Vault Structure

```
your-vault/
├── Home.md                   # Dashboard / index
├── AGENTS.md                 # Agent instructions and contracts
├── Me/
│   ├── Profile.md            # User identity and preferences
│   └── Preferences.md        # Detailed preferences
├── Areas/
│   └── Areas.md              # Ongoing responsibilities
├── Projects/
│   └── Projects.md           # Active projects hub
├── Knowledge/
│   └── Knowledge.md          # Reference notes
├── Work/
│   └── Task Board.md         # Kanban-style task tracking
└── System/
    ├── Agent Contract.md     # Rules for AI agent behavior
    ├── Graph guide.md        # Vault link conventions
    ├── Naming and organization.md
    └── Backup and restore.md
```

The `.omnimind/` folder (auto-created inside your vault) holds `brain.db` — the SQLite task database.

---

## Testing

```bash
cd packages/bridge
npm test
```

Expected output:
```
✔ human edits of generated views are preserved (26ms)
✔ a junction cannot be used to read outside the vault (2ms)
✔ two independent server processes cannot claim the same revision (72ms)
✔ actual MCP stdio clients discover tools and share notes across connections (159ms)
✔ task projections use readable canonical filenames (44ms)
✔ maintenance lock refuses Brain construction before opening workflow SQLite (0ms)
✔ maintenance lock makes both the CLI and MCP server exit before opening the database (85ms)
✔ OmniMind full functional verification suite (102ms)
...
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started — bug fixes, new AI client support, starter vault notes, and documentation improvements are all fair game.

---

## License

[MIT](LICENSE) © [IrfanCodesBTW](https://github.com/IrfanCodesBTW)
