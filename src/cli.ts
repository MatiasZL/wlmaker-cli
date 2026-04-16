import { createRequire } from 'module';
import { Command } from 'commander';
import chalk from 'chalk';
import { createBloc } from './core/create-bloc.js';
import { createWidget } from './core/create-widget.js';
import { createUseCase } from './core/create-usecase.js';
import { interactiveMode, resolveProject, endpointFlow } from './interactive.js';

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

// Endpoint subcommand
program
  .command('endpoint')
  .description('Generate Clean Architecture stack for a BFF endpoint')
  .action(async () => {
    const project = await resolveProject();
    if (!project) return;
    await endpointFlow(project);
  });

// Default action: no subcommand -> interactive mode
program.action(async () => {
  await interactiveMode();
});

program.parse();
