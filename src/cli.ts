import { createRequire } from 'module';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import * as clack from '@clack/prompts';
import { createBloc } from './core/create-bloc.js';
import { createWidget } from './core/create-widget.js';
import { createUseCase } from './core/create-usecase.js';
import { createPage } from './core/create-page.js';
import { createPackage } from './core/create-package.js';
import { interactiveMode, resolveProject, endpointFlow, docsInteractiveMode, envVarFlow, pageFlow, packageFlow, collaborativeFlow } from './interactive.js';
import { detectBookDir, serveBook } from './core/docs-serve.js';
import { discoverCommands, displayCommands } from './core/docs-commands.js';
import { discoverArchitecture, displayArchitecture } from './core/docs-architecture.js';
import { runMcpServer } from './mcp-server.js';
import { installMcpServer } from './mcp-install.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('wlmaker')
  .description(
    'Create Flutter BLoCs, Widgets, and Widgetbook Use-Cases from the terminal',
  )
  .version(pkg.version);

// BLoC subcommand
program
  .command('bloc')
  .description('Create a new BLoC with Freezed sealed classes')
  .argument('[name]', 'BLoC name in snake_case (e.g. user_login)')
  .option('-d, --dir <path>', 'target directory', process.cwd())
  .option('--no-build-runner', 'skip build_runner execution')
  .action(
    async (
      name: string | undefined,
      options: { dir: string; buildRunner: boolean },
    ) => {
      if (!name) {
        await interactiveMode();
        return;
      }
      try {
        await createBloc(name, options);
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
        process.exit(1);
      }
    },
  );

// Widget subcommand
program
  .command('widget')
  .description('Create a new widget in the design system')
  .argument('<name>', 'Widget name in snake_case (e.g. toggle)')
  .requiredOption('-t, --tier <tier>', 'tier: atom, molecule, organism, template')
  .option('-p, --pattern <pattern>', 'pattern (default depends on tier)')
  .option('-d, --dir <path>', 'project root directory', process.cwd())
  .action(
    async (
      name: string,
      options: { tier: string; pattern?: string; dir: string },
    ) => {
      try {
        await createWidget(name, options.tier, {
          projectRoot: options.dir,
          pattern: options.pattern,
        });

        // Auto-create use case
        try {
          await createUseCase(name, options.tier, {
            projectRoot: options.dir,
            buildRunner: false,
          });
          console.log(chalk.green('Widgetbook use-case created'));
        } catch {
          console.log(chalk.yellow('Use-case skipped (may already exist)'));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
        process.exit(1);
      }
    },
  );

// UseCase subcommand
program
  .command('usecase')
  .description('Create a Widgetbook use-case for an existing widget')
  .argument('<name>', 'Widget name in snake_case (e.g. toggle)')
  .requiredOption('-t, --tier <tier>', 'tier: atom, molecule, organism, template')
  .option('-d, --dir <path>', 'project root directory', process.cwd())
  .option('--no-build-runner', 'skip build_runner execution')
  .action(
    async (
      name: string,
      options: { tier: string; dir: string; buildRunner: boolean },
    ) => {
      try {
        await createUseCase(name, options.tier, {
          projectRoot: options.dir,
          buildRunner: options.buildRunner,
        });
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
        process.exit(1);
      }
    },
  );

// Page subcommand
program
  .command('page')
  .description('Create a new page (GoRoute + View) with barrel updates')
  .argument('[name]', 'Page name in snake_case (e.g. profile, order_detail)')
  .option('-p, --path <path>', 'absolute path to the pages directory')
  .action(
    async (
      name: string | undefined,
      options: { path?: string },
    ) => {
      if (!name || !options.path) {
        await pageFlow(name, options.path);
        return;
      }
      try {
        await createPage(name, { pagesPath: options.path });
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
        process.exit(1);
      }
    },
  );

// Endpoint subcommand
program
  .command('endpoint')
  .description('Generate Clean Architecture stack for a BFF endpoint')
  .action(async () => {
    await endpointFlow();
  });

// Package subcommand
program
  .command('package')
  .description('Create a new package in the monorepo')
  .action(async () => {
    await packageFlow();
  });

// Env Var subcommand
program
  .command('env-var')
  .description('Add an environment variable across the Flutter monorepo')
  .action(async () => {
    await envVarFlow();
  });

// Collaborative subcommand group
const collabCmd = program
  .command('collaborative')
  .description('Generate collaborative feature structure (WL collaborative template)');

collabCmd
  .command('feature')
  .description('Create a complete collaborative feature')
  .argument('[name]', 'Feature name in snake_case (e.g. feature_orders)')
  .action(async (name: string | undefined) => {
    if (!name) {
      await collaborativeFlow();
      return;
    }
    const { findMonorepoRoot } = await import('./core/project-analyzer.js');
    const monorepoRoot = findMonorepoRoot(process.cwd());
    if (!monorepoRoot) {
      console.error(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
      process.exit(1);
    }
    try {
      const { createCollaborativeFeature } = await import('./core/collaborative/create-collaborative-feature.js');
      await createCollaborativeFeature({ monorepoRoot, featureName: name });
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

collabCmd
  .command('page')
  .description('Add a page + view to an existing collaborative feature')
  .argument('[name]', 'Page name in snake_case')
  .option('-f, --feature <path>', 'path to the collaborative feature package')
  .action(async (name: string | undefined, options: { feature?: string }) => {
    if (!name || !options.feature) {
      await collaborativeFlow();
      return;
    }
    try {
      const { createCollaborativePage } = await import('./core/collaborative/create-collaborative-page.js');
      await createCollaborativePage({ featurePath: options.feature, pageName: name });
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

collabCmd
  .command('bloc')
  .description('Add a BLoC to an existing collaborative feature')
  .argument('[name]', 'BLoC name in snake_case')
  .option('-f, --feature <path>', 'path to the collaborative feature package')
  .action(async (name: string | undefined, options: { feature?: string }) => {
    if (!name || !options.feature) {
      await collaborativeFlow();
      return;
    }
    try {
      const { createCollaborativeBloc } = await import('./core/collaborative/create-collaborative-bloc.js');
      await createCollaborativeBloc({ featurePath: options.feature, blocName: name });
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

collabCmd
  .command('endpoint')
  .description('Generate endpoint stack for a collaborative feature')
  .action(async () => {
    await collaborativeFlow();
  });

// Default action for `wlmaker collaborative` (no sub-command) -> interactive menu
collabCmd.action(async () => {
  await collaborativeFlow();
});

// Docs command group
const docsCmd = program
  .command('docs')
  .description('Project documentation tools');

docsCmd
  .command('serve')
  .description('Start Docusaurus dev server')
  .option('-d, --dir <path>', 'project root directory', process.cwd())
  .action(async (options: { dir: string }) => {
    const bookDir = detectBookDir(options.dir);
    if (!bookDir) {
      console.error(chalk.red('No Docusaurus book/ directory found. Run from a monorepo root.'));
      process.exit(1);
    }
    console.log(chalk.cyan(`Serving docs from ${bookDir}`));
    await serveBook(bookDir);
  });

docsCmd
  .command('commands')
  .description('Show Makefile & melos commands reference')
  .option('-d, --dir <path>', 'project root directory', process.cwd())
  .action(async (options: { dir: string }) => {
    const commands = discoverCommands(options.dir);
    if (commands.length === 0) {
      console.log(chalk.yellow('No commands found. Run from a monorepo root.'));
      return;
    }
    console.log(chalk.green(`Found ${commands.length} command(s)\n`));
    displayCommands(commands);
  });

docsCmd
  .command('architecture')
  .description('Display monorepo architecture tree')
  .option('-d, --dir <path>', 'project root directory', process.cwd())
  .action(async (options: { dir: string }) => {
    const info = discoverArchitecture(options.dir);
    if (!info) {
      console.log(chalk.yellow('No monorepo detected. Run from within a Melos monorepo.'));
      return;
    }
    displayArchitecture(info);
  });

// MCP Subcommands
program
  .command('mcp')
  .description('Start the wlmaker MCP server (used automatically by AI clients)')
  .action(async () => {
    await runMcpServer();
  });

program
  .command('mcp-install')
  .description('Manually install/register the wlmaker MCP server into compatible clients (Claude, Cursor, Cline)')
  .action(async () => {
    await installMcpServer();
  });

// Default action for `wlmaker docs` (no sub-command) → interactive menu
docsCmd.action(async () => {
  await docsInteractiveMode();
});

// Default action: no subcommand -> interactive mode
program.action(async () => {
  await interactiveMode();
});

program.parse();
