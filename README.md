# OmniMind

Local-first shared memory and transactional task coordination for AI agents.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green)](https://nodejs.org/) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![MCP](https://img.shields.io/badge/MCP-stdio-blue)

```text
AI clients  ── stdio MCP ──>  OmniMind bridge  ──>  Markdown notes
                                             └──>  SQLite tasks and revisions
```

## Features

- Share context, search notes, and record attributed captures across MCP clients.
- Coordinate task claims, revisions, checkpoints, and handoffs using SQLite.
- Browse a plain Markdown vault in a text editor or Obsidian.
- Run locally without an external database or API key for the bridge.

## Prerequisites

- Git, Node.js 24 or later, and npm.
- An MCP client supporting local stdio servers.
- A writable vault directory. Obsidian is optional.
- The AI client may have its own account or API requirements.

## Manual setup

1. Clone the repository:

   ```bash
   git clone https://github.com/IrfanCodesBTW/OmniMind.git omnimind
   cd omnimind
   ```

2. Install dependencies from the root:

   ```bash
   npm ci
   ```

3. Choose a **new** vault directory and copy the starter vault. On macOS/Linux:

   ```bash
   export OMNIMIND_VAULT="$HOME/Documents/OmniMind"
   cp -R packages/templates/starter-vault "$OMNIMIND_VAULT"
   ```

   In PowerShell:

   ```powershell
   $env:OMNIMIND_VAULT = Join-Path $HOME 'Documents/OmniMind'
   Copy-Item -Recurse packages/templates/starter-vault -Destination $env:OMNIMIND_VAULT
   ```

   For an existing vault, back it up and merge missing notes individually. The bridge refuses vaults with a database from the earlier implementation; stop all clients and migrate it before use. Do not create a second database alongside it.

4. Initialize and inspect the vault:

   ```bash
   npm run brain:health
   npm run brain:cli -- brain_context
   ```

   Confirm the vault path and `quick_check: ok`. `OMNIMIND_VAULT` must be set in each process; `.env.example` is a reference and is not loaded automatically.

5. Configure the client. For clients accepting `mcpServers` JSON, merge the following entry into the existing configuration, replacing all paths with absolute paths:

   ```json
   {
     "mcpServers": {
       "omnimind": {
         "command": "/absolute/path/to/node",
         "args": ["/absolute/path/to/omnimind/packages/bridge/server.mjs"],
         "env": { "OMNIMIND_VAULT": "/absolute/path/to/vault" }
       }
     }
   }
   ```

   Find Node with `node -p "process.execPath"`. Back up configuration first and preserve existing servers. Cursor uses `.cursor/mcp.json` for project scope or `~/.cursor/mcp.json` globally; see [Cursor's MCP documentation](https://cursor.com/docs/context/mcp). Claude Code supports project `.mcp.json` and native management commands; see [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp). Other clients may use different schemas.

6. Restart or reload the client. Verify that it discovers `brain_context`, `brain_search`, `brain_read`, `brain_capture`, `brain_tasks`, `brain_task`, and `brain_health`. Call `brain_health` and `brain_context` through the client. A CLI check alone does not confirm a client connection.

## Tools and workflow

Begin with `brain_context`, search and read relevant notes, and inspect tasks before starting work. Use `brain_task` to create, claim, checkpoint, hand off, and complete work; existing task mutations require the current revision and owner. Use `brain_capture` for attributed notes and `brain_read` to verify them. Request IDs make identical retries idempotent. SQLite stores authoritative task state; Markdown task views are generated.

## Development and backups

```bash
npm test
npm run brain:health
npm run backup
```

Set `OMNIMIND_VAULT` before running vault commands. The backup utility uses SQLite's online backup API and prints its snapshot location. Stop clients before restoring and review the snapshot manifest. Notes sent to an AI client may be shared with its model provider.

`npm run init` seeds missing starter files and registers Claude Desktop if detected. It preserves existing starter files, backs up an existing Claude configuration before changing it, and leaves a differing existing server registration untouched. Hermes and Codex are detected only; configure them manually. Restart and verify the host after registration.

## Troubleshooting

- Missing MCP SDK: run `npm ci` at the repository root.
- Missing `node:sqlite`: ensure the host uses Node 24 or newer.
- Missing vault variable: set `OMNIMIND_VAULT` in the client configuration.
- Server waiting silently: stdio servers wait for protocol input; connect through a client.
- Revision conflict: retrieve the current task and reconcile its owner and revision.
- Earlier vault database detected: stop all clients and migrate the database and its companion files together before using this version.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE).

## AI agent setup: MCP Brain

Copy this prompt into your coding agent:

```text
You are setting up the OmniMind MCP Brain on my local machine. Follow these steps autonomously:

1. Inspect the operating system, current host, existing checkout, and repository instructions. Preserve uncommitted work. Clone https://github.com/IrfanCodesBTW/OmniMind.git if needed.
2. Check Node.js >=24 and npm, inspect package manifests, and run npm ci and npm test from the repository root. Report failures honestly.
3. Select an existing intended vault or create a fresh dedicated vault from packages/templates/starter-vault. Back up existing data; never overwrite existing notes or create a second workflow database. If an older database is detected, stop and report the migration requirement.
4. Set OMNIMIND_VAULT to the absolute vault path. Run npm run brain:health and verify the path and quick_check. Read initial context using npm run brain:cli -- brain_context.
5. Identify the current host's MCP configuration using its official documentation or installed help. Back up the configuration and merge an omnimind stdio entry using absolute paths to Node and packages/bridge/server.mjs and env.OMNIMIND_VAULT. Preserve unrelated entries and do not replace a conflicting registration.
6. Reload or restart the host as supported. Verify discovery of all seven brain tools and call brain_health and brain_context through the host. A CLI check alone is not connection verification.
7. Save a harmless attributed setup note with brain_capture, then read the exact returned path with brain_read. Do not include credentials.
8. Report the checkout, commit, Node version, test results, vault, configuration and backup paths, tool-discovery and connection results, and any required restart or blocker. Include rollback steps. Do not claim a host connection was verified unless host-side calls succeeded.
```
