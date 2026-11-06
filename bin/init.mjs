#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

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
  console.log('       MASTERMIND ONBOARDING WIZARD');
  console.log('   Local-First Multi-Agent Memory & Tasks');
  console.log('==========================================\n');

  const defaultVault = path.join(os.homedir(), 'Documents', 'Mastermind');
  const targetVault = path.resolve(await ask('Where should your Mastermind vault be created?', defaultVault));

  if (!fs.existsSync(targetVault)) {
    fs.mkdirSync(targetVault, { recursive: true });
    console.log(`\n✔ Created vault directory at: ${targetVault}`);
  } else {
    console.log(`\n✔ Using existing directory: ${targetVault}`);
  }

  // Copy template files
  console.log('📦 Seeding starter Obsidian vault structure...');
  fs.cpSync(TEMPLATE_VAULT, targetVault, { recursive: true });
  console.log('✔ Starter vault structure seeded.');

  // Initialize SQLite workflow store
  console.log('⚙️ Initializing local SQLite workflow engine...');
  const internalDir = path.join(targetVault, '.mastermind');
  fs.mkdirSync(internalDir, { recursive: true });
  
  // Test connection using brain.mjs
  const { Brain } = await import(path.join(ROOT_DIR, 'packages', 'bridge', 'brain.mjs'));
  const brain = new Brain(targetVault);
  const health = brain.health();
  brain.close();
  console.log(`✔ Local database initialized: ${health.storage}`);

  // Detect and configure AI clients
  console.log('\n🔍 Scanning for installed AI clients on your system...\n');

  const nodeExecutable = process.execPath;
  const configuredClients = [];

  // 1. Claude Desktop
  const claudeConfigPath = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');

  if (fs.existsSync(path.dirname(claudeConfigPath))) {
    try {
      let cfg = {};
      if (fs.existsSync(claudeConfigPath)) {
        cfg = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      }
      cfg.mcpServers = cfg.mcpServers || {};
      cfg.mcpServers.mastermind = {
        command: nodeExecutable,
        args: [BRIDGE_SERVER],
        env: { MASTERMIND_VAULT: targetVault }
      };
      fs.writeFileSync(claudeConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      configuredClients.push('Claude Desktop');
      console.log('✔ Connected: Claude Desktop');
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
  console.log('           MASTERMIND SETUP COMPLETE!        ');
  console.log('==========================================\n');
  console.log(`Vault Location:   ${targetVault}`);
  console.log(`Bridge Server:    ${BRIDGE_SERVER}`);
  console.log(`Connected Clients: ${configuredClients.join(', ') || 'Manual setup'}\n`);
  console.log('Next steps:');
  console.log('1. Open your vault in Obsidian: select "Open folder as vault" -> ' + targetVault);
  console.log('2. Start your AI agent and ask: "Check my Mastermind context and tell me what tasks are open."\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err);
  process.exit(1);
});
