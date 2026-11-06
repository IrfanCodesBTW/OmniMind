import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Brain, dispatch, toolDefinitions } from './brain.mjs';

const vault = process.env.MASTERMIND_VAULT;
if (!vault) throw new Error('MASTERMIND_VAULT must identify the existing Obsidian vault');
let brain;
try { brain = new Brain(vault); }
catch (error) { console.error(error.message); process.exit(75); }
const server = new Server({ name: 'mastermind', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions.map(t => ({ ...t,
  annotations: { readOnlyHint: !['brain_capture', 'brain_task'].includes(t.name), destructiveHint: t.name === 'brain_task', openWorldHint: false }
})) }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = dispatch(brain, request.params.name, request.params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
});
await server.connect(new StdioServerTransport());
process.on('SIGINT', () => { brain.close(); process.exit(0); });
process.on('SIGTERM', () => { brain.close(); process.exit(0); });
