import { installMcpServer } from './mcp-install.js';

async function main() {
  console.log('Registering wlmaker-cli as an MCP server...');
  await installMcpServer();
}

main().catch(console.error);
