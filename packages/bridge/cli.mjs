import { Brain, dispatch } from './brain.mjs';
import fs from 'node:fs';

const [name = 'brain_health', file] = process.argv.slice(2);
const vault = process.env.MASTERMIND_VAULT;
if (!vault) {
  console.error('Error: MASTERMIND_VAULT environment variable must be set to the target vault path.');
  process.exit(1);
}

let brain;
try {
  brain = new Brain(vault);
  const args = file ? JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8')) : {};
  console.log(JSON.stringify(name === 'refresh' ? { warnings: brain.refresh() } : dispatch(brain, name, args), null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  brain?.close();
}
