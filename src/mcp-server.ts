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
import { createPackage } from './core/create-package.js';
import { createEndpoint } from './core/create-endpoint.js';
import { createEnvVar, type EnvVarType } from './core/create-env-var.js';
import { createCollaborativeFeature } from './core/collaborative/create-collaborative-feature.js';
import { createCollaborativePage } from './core/collaborative/create-collaborative-page.js';
import { createCollaborativeBloc } from './core/collaborative/create-collaborative-bloc.js';
import { createCollaborativeEndpoint } from './core/collaborative/create-collaborative-endpoint.js';
import { execSync } from 'child_process';
import * as path from 'path';
import { discoverCommands } from './core/docs-commands.js';
import { discoverArchitecture } from './core/docs-architecture.js';

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
        {
          name: 'create_usecase',
          description: 'Create a Widgetbook use-case for an existing widget',
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
          name: 'create_endpoint',
          description: 'Generate Clean Architecture stack for a BFF endpoint',
          inputSchema: {
            type: 'object',
            properties: {
              projectRoot: { type: 'string', description: 'Root directory of the BFF package' },
              projectName: { type: 'string', description: 'Name of the BFF package' },
              httpMethod: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                description: 'HTTP method',
              },
              endpointPath: { type: 'string', description: 'Endpoint path (e.g. /api/users/{id})' },
              bffApiFile: { type: 'string', description: 'Absolute or relative path to the BFF API dart file' },
              useCaseName: { type: 'string', description: 'UseCase name in snake_case' },
              diTarget: { type: 'string', description: 'DI target (e.g. app_base, none)', default: 'none' },
              diLazySingleton: { type: 'boolean', description: 'Use @lazySingleton', default: true },
            },
            required: ['projectRoot', 'projectName', 'httpMethod', 'endpointPath', 'bffApiFile', 'useCaseName'],
          },
        },
        {
          name: 'create_package',
          description: 'Create a new package in the monorepo',
          inputSchema: {
            type: 'object',
            properties: {
              monorepoRoot: { type: 'string', description: 'Root directory of the monorepo' },
              packageName: { type: 'string', description: 'Package name in snake_case' },
            },
            required: ['monorepoRoot', 'packageName'],
          },
        },
        {
          name: 'create_env_var',
          description: 'Add an environment variable across the Flutter monorepo',
          inputSchema: {
            type: 'object',
            properties: {
              monorepoRoot: { type: 'string', description: 'Root directory of the monorepo' },
              variableName: { type: 'string', description: 'Variable name in SCREAMING_SNAKE_CASE' },
              dartType: {
                type: 'string',
                enum: ['String', 'int', 'bool', 'List<String>'],
                description: 'Dart type',
              },
              defaultValue: { type: 'string', description: 'Default value (optional)' },
              selectedApps: { type: 'array', items: { type: 'string' }, description: 'List of apps to update' },
              vendorsTargets: { type: 'array', items: { type: 'string' }, description: 'List of vendor module packages' },
              includeInRemoteConfig: { type: 'boolean', description: 'Include in Remote Config' },
              includeInAppConfig: { type: 'boolean', description: 'Include in AppConfig entity' },
            },
            required: ['monorepoRoot', 'variableName', 'dartType', 'selectedApps', 'vendorsTargets', 'includeInRemoteConfig', 'includeInAppConfig'],
          },
        },
        {
          name: 'docs_commands',
          description: 'Show Makefile & melos commands reference',
          inputSchema: {
            type: 'object',
            properties: {
              dir: { type: 'string', description: 'Project root directory' },
            },
            required: ['dir'],
          },
        },
        {
          name: 'docs_architecture',
          description: 'Display monorepo architecture info as JSON',
          inputSchema: {
            type: 'object',
            properties: {
              dir: { type: 'string', description: 'Project root directory' },
            },
            required: ['dir'],
          },
        },
        {
          name: 'create_collaborative_feature',
          description: 'Create a complete collaborative feature: scaffold (directories, barrels, DI modules, pubspec), default endpoint (entity, model, datasource, repository, usecase, BFF API), BLoC (Freezed), page + view (GoRoute), melos bootstrap, and build_runner. Returns a fully compilable feature package.',
          inputSchema: {
            type: 'object',
            properties: {
              monorepoRoot: { type: 'string', description: 'Root directory of the monorepo' },
              featureName: { type: 'string', description: 'Feature name in snake_case (e.g. feature_orders)' },
              description: { type: 'string', description: 'Feature description' },
            },
            required: ['monorepoRoot', 'featureName'],
          },
        },
        {
          name: 'create_collaborative_page',
          description: 'Add a page + view to an existing collaborative feature',
          inputSchema: {
            type: 'object',
            properties: {
              featurePath: { type: 'string', description: 'Absolute path to the collaborative feature package' },
              pageName: { type: 'string', description: 'Page name in snake_case' },
            },
            required: ['featurePath', 'pageName'],
          },
        },
        {
          name: 'create_collaborative_bloc',
          description: 'Add a BLoC to an existing collaborative feature',
          inputSchema: {
            type: 'object',
            properties: {
              featurePath: { type: 'string', description: 'Absolute path to the collaborative feature package' },
              blocName: { type: 'string', description: 'BLoC name in snake_case' },
            },
            required: ['featurePath', 'blocName'],
          },
        },
        {
          name: 'create_collaborative_endpoint',
          description: 'Generate endpoint stack (entity, model, datasource, repository, usecase) for a collaborative feature',
          inputSchema: {
            type: 'object',
            properties: {
              featurePath: { type: 'string', description: 'Absolute path to the collaborative feature package' },
              featureName: { type: 'string', description: 'Feature package name' },
              httpMethod: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                description: 'HTTP method',
              },
              endpointPath: { type: 'string', description: 'Endpoint path (e.g. /api/items/{id})' },
              useCaseName: { type: 'string', description: 'UseCase name in snake_case' },
            },
            required: ['featurePath', 'featureName', 'httpMethod', 'endpointPath', 'useCaseName'],
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

      if (request.params.name === 'create_usecase') {
        const { name, tier, dir } = request.params.arguments as any;
        const projectRoot = dir || process.cwd();
        await createUseCase(name, tier, { projectRoot, buildRunner: false });
        return {
          content: [{ type: 'text', text: `Successfully created UseCase for ${name} (${tier}) in ${projectRoot}` }],
        };
      }

      if (request.params.name === 'create_endpoint') {
        const args = request.params.arguments as any;
        await createEndpoint({
          ...args,
          diTarget: args.diTarget || 'none',
          diLazySingleton: args.diLazySingleton ?? true,
        });
        return {
          content: [{ type: 'text', text: `Successfully generated endpoint stack for ${args.useCaseName}` }],
        };
      }

      if (request.params.name === 'create_package') {
        const { monorepoRoot, packageName } = request.params.arguments as any;
        await createPackage({ monorepoRoot, packageName });
        return {
          content: [{ type: 'text', text: `Successfully created package ${packageName} in ${monorepoRoot}/packages` }],
        };
      }

      if (request.params.name === 'create_env_var') {
        const args = request.params.arguments as any;
        await createEnvVar(args);
        return {
          content: [{ type: 'text', text: `Successfully added environment variable ${args.variableName}` }],
        };
      }

      if (request.params.name === 'docs_commands') {
        const { dir } = request.params.arguments as any;
        const commands = discoverCommands(dir || process.cwd());
        return {
          content: [{ type: 'text', text: JSON.stringify(commands, null, 2) }],
        };
      }

      if (request.params.name === 'docs_architecture') {
        const { dir } = request.params.arguments as any;
        const info = discoverArchitecture(dir || process.cwd());
        if (!info) {
          return { content: [{ type: 'text', text: 'No monorepo detected.' }] };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
        };
      }

      if (request.params.name === 'create_collaborative_feature') {
        const args = request.params.arguments as any;
        const { monorepoRoot, featureName, description } = args;

        await createCollaborativeFeature({
          monorepoRoot,
          featureName,
          description,
          runBootstrap: true,
        });

        const featurePath = path.join(monorepoRoot, 'packages', 'collaborative', featureName);
        const domain = featureName.replace(/^feature_/, '');

        await createCollaborativeEndpoint({
          featurePath,
          featureName,
          httpMethod: 'GET',
          endpointPath: `/api/${domain}`,
          useCaseName: `get_${featureName}_items`,
        });

        await createCollaborativeBloc({
          featurePath,
          blocName: featureName,
        });

        await createCollaborativePage({
          featurePath,
          pageName: featureName,
        });

        try {
          execSync(
            'dart run build_runner build --delete-conflicting-outputs',
            { cwd: featurePath, stdio: 'pipe' },
          );
        } catch {
          // build_runner may fail if injectable imports are missing, that's OK
        }

        return {
          content: [{ type: 'text', text: `Successfully created complete collaborative feature ${featureName} at ${featurePath}` }],
        };
      }

      if (request.params.name === 'create_collaborative_page') {
        const args = request.params.arguments as any;
        await createCollaborativePage({
          featurePath: args.featurePath,
          pageName: args.pageName,
        });
        return {
          content: [{ type: 'text', text: `Successfully created page ${args.pageName} in ${args.featurePath}` }],
        };
      }

      if (request.params.name === 'create_collaborative_bloc') {
        const args = request.params.arguments as any;
        await createCollaborativeBloc({
          featurePath: args.featurePath,
          blocName: args.blocName,
        });
        return {
          content: [{ type: 'text', text: `Successfully created BLoC ${args.blocName} in ${args.featurePath}` }],
        };
      }

      if (request.params.name === 'create_collaborative_endpoint') {
        const args = request.params.arguments as any;
        await createCollaborativeEndpoint({
          featurePath: args.featurePath,
          featureName: args.featureName,
          httpMethod: args.httpMethod,
          endpointPath: args.endpointPath,
          useCaseName: args.useCaseName,
        });
        return {
          content: [{ type: 'text', text: `Successfully generated endpoint ${args.useCaseName} in ${args.featurePath}` }],
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
