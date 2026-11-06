---
type: "system"
category: "system"
title: "Backup and restore"
---

# Backup and restore

[[Home|Home]]

### Safe Backup Procedures
1. Never copy a live SQLite database while its WAL file has uncommitted writes.
2. Always use the SQLite online backup API (`sqlite3 ".backup backup.sqlite"`) or the included `backup.mjs` script.
3. Restore by shutting down active agents, restoring the vault folder, and verifying integrity with `PRAGMA integrity_check`.
