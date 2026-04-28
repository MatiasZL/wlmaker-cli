import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { createBloc } from './core/create-bloc.js';
import { createWidget } from './core/create-widget.js';
import { createUseCase } from './core/create-usecase.js';
import { createPage } from './core/create-page.js';

export async function runMcpServer() {
  const server = new Server(
    {
      name: 'wlmaker-cli',
      version: '1.5.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'create_bloc',
          description: 'Create a new BLoC with Freezed sealed classes in the Flutter project',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'BLoC name in snake_case (e.g. user_login)',
              },
              dir: {
                type: 'string',
                description: 'Target directory for the BLoC',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'create_widget',
          description: 'Create a new widget in the design system',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Widget name in snake_case (e.g. toggle)',
              },
              tier: {
                type: 'string',
                description: 'Tier: atom, molecule, organism, template',
                enum: ['atom', 'molecule', 'organism', 'template'],
              },
              dir: {
                type: 'string',
                description: 'Project root directory (optional)',
              },
            },
            required: ['name', 'tier'],
          },
        },
        {
          name: 'create_page',
          description: 'Create a new page (GoRoute + View) with barrel updates',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Page name in snake_case (e.g. profile, order_detail)',
              },
              path: {
                type: 'string',
                description: 'Absolute path to the pages directory',
              },
            },
            required: ['name', 'path'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    try {
      if (request.params.name === 'create_bloc') {
        const { name, dir } = request.params.arguments as { name: string; dir?: string };
        const targetDir = dir || process.cwd();
        await createBloc(name, { dir: targetDir, buildRunner: false });
        return {
          content: [{ type: 'text', text: `Successfully created BLoC ${name} in ${targetDir}` }],
        };
      }

      if (request.params.name === 'create_widget') {
        const { name, tier, dir } = request.params.arguments as { name: string; tier: string; dir?: string };
        const projectRoot = dir || process.cwd();
        await createWidget(name, tier, { projectRoot, pattern: undefined });
        
        try {
          await createUseCase(name, tier, { projectRoot, buildRunner: false });
          return {
            content: [{ type: 'text', text: `Successfully created Widget ${name} (${tier}) and its UseCase in ${projectRoot}` }],
          };
        } catch {
          return {
            content: [{ type: 'text', text: `Successfully created Widget ${name} (${tier}) in ${projectRoot} (UseCase creation skipped/failed)` }],
          };
        }
      }

      if (request.params.name === 'create_page') {
        const { name, path } = request.params.arguments as { name: string; path: string };
        await createPage(name, { pagesPath: path });
        return {
          content: [{ type: 'text', text: `Successfully created Page ${name} in ${path}` }],
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error?.message || String(error)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('wlmaker-cli MCP server running on stdio');
}
