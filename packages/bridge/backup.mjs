import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

if (!process.env.OMNIMIND_VAULT) throw new Error('OMNIMIND_VAULT must be set');
const root = fs.realpathSync(process.env.OMNIMIND_VAULT);
const appData = process.env.LOCALAPPDATA || (process.platform === 'darwin'
  ? path.join(process.env.HOME || '', 'Library', 'Application Support')
  : path.join(process.env.HOME || '', '.local', 'share'));
const destination = path.join(appData, 'OmniMind', 'snapshots', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(root, path.join(destination, 'vault'), { recursive: true, filter: source => {
  const relative = path.relative(root, source);
  return !relative.split(path.sep).includes('.omnimind') && !fs.lstatSync(source).isSymbolicLink();
} });
const db = new DatabaseSync(path.join(root, '.omnimind/workflow.sqlite'), { readOnly: true });
try { await backup(db, path.join(destination, 'workflow.sqlite')); } finally { db.close(); }
const sourceDir = path.join(destination, 'bridge-source');
fs.mkdirSync(sourceDir);
for (const entry of fs.readdirSync(import.meta.dirname)) {
  if (entry.endsWith('.mjs') || ['package.json', 'package-lock.json', 'README.md'].includes(entry)) {
    fs.copyFileSync(path.join(import.meta.dirname, entry), path.join(sourceDir, entry));
  }
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ created_at: new Date().toISOString(), original_vault: root,
  database: 'workflow.sqlite', vault_files: 'vault', source: 'bridge-source', restore: 'Close bridge clients. Review the snapshot. Restore the vault files and workflow.sqlite into the original .omnimind folder; reinstall pinned source dependencies with npm ci. Preserve the current state before replacing it.' }, null, 2));
console.log(JSON.stringify({ snapshot: destination, status: 'complete', scheduled: false }));
