import { createRequire } from 'module';
import { Command } from 'commander';
import chalk from 'chalk';
import { createBloc } from './core/create-bloc.js';
import { interactiveMode } from './interactive.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('wlmaker')
  .description('Create Flutter BLoCs with Freezed sealed classes from the terminal')
  .version(pkg.version);

program
  .command('bloc')
  .description('Create a new BLoC with Freezed sealed classes')
  .argument('[name]', 'BLoC name in snake_case (e.g. user_login)')
  .option('-d, --dir <path>', 'target directory', process.cwd())
  .option('--no-build-runner', 'skip build_runner execution')
  .action(async (name: string | undefined, options: { dir: string; buildRunner: boolean }) => {
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
  });

// Default action: no subcommand → interactive mode
program.action(async () => {
  await interactiveMode();
});

program.parse();
