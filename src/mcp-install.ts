import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

export async function installMcpServer() {
  const homeDir = os.homedir();
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, 'cli.mjs');

  const wlmakerConfig = {
    command: process.execPath,
    args: [cliPath, 'mcp'],
  };

  // Config file paths for different clients
  const configs: { name: string; paths: string[] }[] = [
    {
      name: 'Claude Desktop',
      paths: isMac
        ? [path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json')]
        : isWin
        ? [path.join(homeDir, 'AppData/Roaming/Claude/claude_desktop_config.json')]
        : [],
    },
    {
      name: 'Claude Code',
      paths: [path.join(homeDir, '.claude.json')],
    },
    {
      name: 'Gemini CLI',
      paths: [path.join(homeDir, '.gemini/settings.json')],
    },
    {
      name: 'Cursor',
      paths: [path.join(homeDir, '.cursor/mcp.json')],
    },
    {
      name: 'Cline / RooCode (VSCode)',
      paths: isMac
        ? [
            path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'),
            path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json'),
          ]
        : isWin
        ? [
            path.join(homeDir, 'AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'),
            path.join(homeDir, 'AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json'),
          ]
        : [
            path.join(homeDir, '.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'),
            path.join(homeDir, '.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json'),
          ],
    },
  ];

  let anyInstalled = false;

  for (const client of configs) {
    for (const configPath of client.paths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const json = JSON.parse(content);
          
          json.mcpServers = json.mcpServers || {};
          json.mcpServers['wlmaker-cli'] = wlmakerConfig;

          fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
          console.log(`✅ Successfully added wlmaker-cli to ${client.name} configuration.`);
          anyInstalled = true;
        } catch (error) {
          console.error(`❌ Failed to update ${client.name} configuration at ${configPath}:`, error);
        }
      }
    }
  }

  if (!anyInstalled) {
    console.log('⚠️ No supported MCP clients (Claude Desktop, Cursor, Cline) found to auto-configure.');
    console.log('You can manually add the following configuration to your client:');
    console.log(JSON.stringify({
      mcpServers: {
        'wlmaker-cli': wlmakerConfig
      }
    }, null, 2));
  }
}
