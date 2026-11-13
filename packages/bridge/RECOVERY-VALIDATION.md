# Task recovery validation — November 13, 2026

✔ captured professional context is searchable and an identical request is idempotent (56.306167ms)
✔ handoff survives reopening database and can be claimed by a different app (120.242084ms)
✔ stale revisions, blocked dependencies and completion without evidence are refused (140.103542ms)
✔ human edits of generated views are preserved, hidden paths and traversal are excluded (54.240292ms)
✔ a junction cannot be used to read outside the vault (13.476708ms)
✔ two independent server processes cannot claim the same revision (90.507542ms)
✔ actual MCP stdio clients discover tools and share notes across connections (169.275583ms)
✔ task projections use readable canonical filenames, valid YAML, immutable identifiers and redirect compatibility (42.377334ms)
✔ maintenance lock refuses Brain construction before opening workflow SQLite (0.482542ms)
✔ maintenance lock makes both the CLI and MCP server exit before opening the database (94.761958ms)
✔ older vault data blocks initialization without creating a new database (0.704333ms)
✔ OmniMind full functional verification suite (178.102833ms)
✔ readable Unicode captures have stable collision qualifiers and fingerprint crash recovery (92.78825ms)
✔ capture routing uses mapped real hubs, readable H1 and local date sessions (116.174708ms)
✔ redirects are dynamic and canonicalize reads and cached capture results without changing requests (23.262791ms)
✔ manifest rejects malicious paths, symlink escapes and redirect cycles before writes (37.581375ms)
✔ expired takeover survives reopen, preserves failures and fences old owner (123.023041ms)
✔ heartbeat is owner-only, revisioned, preserves checkpoint and extends expiry (89.66025ms)
✔ recovery requires confirmation and reason even after expiry (46.690542ms)
✔ legacy tasks fail closed unless operator explicitly confirms unleased recovery (78.755709ms)
✔ handoff clears lease and permits ordinary claim, completed tasks cannot recover (98.005458ms)
✔ MCP schema advertises recovery actions and safety inputs (0.178125ms)
✔ two independent processes race to recover: exactly one wins (104.447041ms)
✔ expiry is eligibility only: original owner may resume before confirmed takeover (38.361042ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 873.328791


All mutating tests used disposable vaults. No existing live claims were recovered or reassigned. Existing MCP sessions must restart/reload to use the updated code and discovered input schema. Heartbeats are agent-driven, not a background crash detector.
