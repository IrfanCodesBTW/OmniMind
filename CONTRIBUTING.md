# Contributing to OmniMind

Thanks for your interest in OmniMind! This is a community-first project — contributions of all kinds are welcome.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

Be respectful. Be constructive. We're all here to build something useful.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/omnimind.git
   cd omnimind
   ```
3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/IrfanCodesBTW/omnimind.git
   ```

---

## How to Contribute

| Type | Where to start |
|---|---|
| 🐛 Bug fix | Open an issue first, then a PR |
| ✨ New feature | Open a Discussion or issue to align first |
| 📝 Docs improvement | PR directly — no issue needed |
| 🧪 New tests | Always welcome, PR directly |
| 🌐 New AI client support in `bin/init.mjs` | Open a PR with client config detection logic |
| 📦 New starter vault notes | Add to `packages/templates/starter-vault/` |

---

## Development Setup

```bash
# Install bridge dependencies
cd packages/bridge
npm install

# Verify everything works
npm test
```

> **Node.js ≥ 24** is required (uses native `node:test` runner and ES modules throughout).

---

## Running Tests

```bash
# From repo root
npm test

# Or from packages/bridge directly
cd packages/bridge && npm test
```

All 15 tests must pass before submitting a PR. Do not weaken existing assertions.

---

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for Windsurf MCP client
fix: handle missing vault directory gracefully
docs: improve AI agent setup prompt
test: add e2e test for brain_task handoff
chore: update @modelcontextprotocol/sdk to 1.33.0
```

---

## Pull Request Process

1. Create a feature branch off `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and ensure tests pass
3. Push and open a PR against `main`
4. Fill out the PR template (describe what, why, and how to test)
5. A maintainer will review within a few days

---

## Reporting Bugs

Open a [GitHub Issue](https://github.com/IrfanCodesBTW/omnimind/issues) with:
- OmniMind version (`git log --oneline -1`)
- Node.js version (`node --version`)
- OS and AI client name
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs

---

## Suggesting Features

Open a [GitHub Discussion](https://github.com/IrfanCodesBTW/omnimind/discussions) under **Ideas**. Describe the use case first — implementation details can follow.

---

## Questions?

Open a Discussion or start a thread in Issues. We prefer async public conversations so everyone benefits.
