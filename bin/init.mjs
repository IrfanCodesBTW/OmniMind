#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATE_VAULT = path.join(ROOT_DIR, 'packages', 'templates', 'starter-vault');
const BRIDGE_SERVER = path.join(ROOT_DIR, 'packages', 'bridge', 'server.mjs');

function ask(question, defaultVal) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [${defaultVal}]: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function main() {
  console.log('\n🧠 ==========================================');
  console.log('         OMNIMIND ONBOARDING WIZARD');
  console.log('   Local-First Multi-Agent Memory & Tasks');
  console.log('==========================================\n');

  const defaultVault = path.join(os.homedir(), 'Documents', 'OmniMind');
  const targetVault = path.resolve(await ask('Where should your OmniMind vault be created?', defaultVault));

  if (!fs.existsSync(targetVault)) {
    fs.mkdirSync(targetVault, { recursive: true });
    console.log(`\n✔ Created vault directory at: ${targetVault}`);
  } else {
    console.log(`\n✔ Using existing directory: ${targetVault}`);
  }

  // Initialize SQLite workflow store
  console.log('⚙️ Initializing local SQLite workflow engine...');
  // Brain checks for older vaults before creating the workflow directory.
  
  // Test connection using brain.mjs
  const { Brain } = await import(pathToFileURL(path.join(ROOT_DIR, 'packages', 'bridge', 'brain.mjs')).href);
  const brain = new Brain(targetVault);
  const health = brain.health();
  brain.close();
  console.log(`✔ Local database initialized: ${health.storage}`);


  // Copy template files
  console.log('📦 Seeding starter Obsidian vault structure...');
  fs.cpSync(TEMPLATE_VAULT, targetVault, { recursive: true, force: false, errorOnExist: false });
  console.log('✔ Starter vault structure seeded.');


  // Detect and configure AI clients
  console.log('\n🔍 Scanning for installed AI clients on your system...\n');

  const nodeExecutable = process.execPath;
  const configuredClients = [];

  // 1. Claude Desktop
  const claudeConfigPath = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude', 'claude_desktop_config.json');

  if (fs.existsSync(path.dirname(claudeConfigPath))) {
    try {
      let cfg = {};
      if (fs.existsSync(claudeConfigPath)) {
        cfg = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      }
      cfg.mcpServers = cfg.mcpServers || {};
      const entry = {
        command: nodeExecutable,
        args: [BRIDGE_SERVER],
        env: { OMNIMIND_VAULT: targetVault }
      };
      const previous = cfg.mcpServers.omnimind;
      if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
        throw new Error('Existing omnimind registration differs; preserve it and configure manually');
      }
      if (!previous) {
        cfg.mcpServers.omnimind = entry;
        if (fs.existsSync(claudeConfigPath)) {
          const backup = `${claudeConfigPath}.${Date.now()}.bak`;
          fs.copyFileSync(claudeConfigPath, backup, fs.constants.COPYFILE_EXCL);
          console.log(`Configuration backup: ${backup}`);
        }
        const temporary = `${claudeConfigPath}.${process.pid}.tmp`;
        try {
          fs.writeFileSync(temporary, JSON.stringify(cfg, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
          fs.renameSync(temporary, claudeConfigPath);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      configuredClients.push('Claude Desktop');
      console.log('✔ Registered: Claude Desktop (restart and verify connection)');
    } catch (e) {
      console.log(`⚠️ Claude Desktop detected but failed to update: ${e.message}`);
    }
  }

  // 2. Hermes Agent
  const hermesConfigPath = path.join(os.homedir(), '.hermes', 'config.yaml');
  if (fs.existsSync(hermesConfigPath)) {
    console.log('ℹ️ Hermes Agent detected at ~/.hermes/config.yaml');
  }

  // 3. OpenAI Codex
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  if (fs.existsSync(codexConfigPath)) {
    console.log('ℹ️ OpenAI Codex detected at ~/.codex/config.toml');
  }

  console.log('\n🎉 ==========================================');
  console.log('           OMNIMIND SETUP COMPLETE!        ');
  console.log('==========================================\n');
  console.log(`Vault Location:   ${targetVault}`);
  console.log(`Bridge Server:    ${BRIDGE_SERVER}`);
  console.log(`Registered Clients: ${configuredClients.join(', ') || 'Manual setup'}\n`);
  console.log('Next steps:');
  console.log('1. Open your vault in Obsidian: select "Open folder as vault" -> ' + targetVault);
  console.log('2. Start your AI agent and ask: "Check my OmniMind context and tell me what tasks are open."\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err);
  process.exit(1);
});
