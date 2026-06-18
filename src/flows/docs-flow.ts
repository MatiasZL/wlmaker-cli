import { execSync } from 'child_process';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { detectBookDir, serveBook } from '../docs/serve.js';
import { discoverCommands, displayCommands } from '../docs/commands.js';
import { discoverArchitecture, displayArchitecture } from '../docs/architecture.js';

function normalizeChallenge(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[áä]/g, 'a')
    .replace(/[éë]/g, 'e')
    .replace(/[íï]/g, 'i')
    .replace(/[óö]/g, 'o')
    .replace(/[úü]/g, 'u');
}

export async function docsInteractiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker docs ')));

  const action = await clack.select({
    message: 'What do you want to do?',
    options: [
      { value: 'serve', label: 'Serve', hint: 'Start Docusaurus dev server' },
      { value: 'commands', label: 'Commands', hint: 'Show Makefile & melos commands' },
      { value: 'architecture', label: 'Architecture', hint: 'Display monorepo tree' },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel('Cancelled');
    return;
  }

  switch (action) {
    case 'serve': {
      const serveMode = await clack.select({
        message: 'How do you want to view the docs?',
        options: [
          { value: 'local', label: 'Local', hint: 'Start Docusaurus dev server locally' },
          { value: 'remote', label: 'Remote', hint: 'Open the deployed docs in your browser' },
        ],
      });

      if (clack.isCancel(serveMode)) {
        clack.cancel('Cancelled');
        return;
      }

      if (serveMode === 'remote') {
        const expectedAnswer = process.env.WL_DOCS_REMOTE_ANSWER;
        if (!expectedAnswer) {
          clack.outro(
            chalk.red(
              'Remote docs challenge not configured. Set WL_DOCS_REMOTE_ANSWER in your environment.',
            ),
          );
          return;
        }

        const challenge = await clack.text({
          message: 'Pregunta de seguridad: Qué dice mechi cuando tiene una duda en el diseño?',
          placeholder: '...',
          validate: (input) => {
            if (input === undefined || !input.trim()) return 'Respuesta requerida';
            if (normalizeChallenge(input) !== normalizeChallenge(expectedAnswer)) {
              return 'Respuesta incorrecta. Vuelve cuando sepas el lore.';
            }
          },
        });

        if (clack.isCancel(challenge)) {
          clack.cancel('Cancelled');
          return;
        }

        const remoteUrl = process.env.WL_DOCS_URL;
        if (!remoteUrl) {
          clack.outro(chalk.red('Remote docs URL not configured. Set WL_DOCS_URL in your environment.'));
          return;
        }
        clack.log.info(`Opening remote docs: ${chalk.cyan(remoteUrl)}`);
        execSync(`open "${remoteUrl}"`, { stdio: 'ignore' });
        clack.outro(chalk.green('Opened remote docs in browser'));
        return;
      }

      const bookDir = detectBookDir(process.cwd());
      if (!bookDir) {
        clack.outro(
          chalk.red('No Docusaurus book/ directory found. Run from a monorepo root.'),
        );
        return;
      }
      clack.log.info(`Serving docs from ${chalk.cyan(bookDir)}`);
      await serveBook(bookDir);
      break;
    }
    case 'commands': {
      const commands = discoverCommands(process.cwd());
      if (commands.length === 0) {
        clack.outro(chalk.yellow('No commands found. Run from a monorepo root.'));
        return;
      }
      clack.log.info(`Found ${chalk.green(commands.length.toString())} command(s)`);
      displayCommands(commands);
      clack.outro(chalk.green('Done!'));
      break;
    }
    case 'architecture': {
      const info = discoverArchitecture(process.cwd());
      if (!info) {
        clack.outro(
          chalk.yellow('No monorepo detected. Run from within a Melos monorepo.'),
        );
        return;
      }
      displayArchitecture(info);
      clack.outro(chalk.green('Done!'));
      break;
    }
  }
}
