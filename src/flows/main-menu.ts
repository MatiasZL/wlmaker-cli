import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { resolveProject } from './project-resolver.js';
import { blocFlow } from './bloc-flow.js';
import { widgetFlow, useCaseFlow } from './widget-flow.js';
import { pageFlow } from './page-flow.js';
import { endpointFlow } from './endpoint-flow.js';
import { packageFlow } from './package-flow.js';
import { envVarFlow } from './env-var-flow.js';
import { appFlow } from './app-flow.js';
import { collaborativeFlow } from './collab-flow.js';
import { docsInteractiveMode } from './docs-flow.js';
import { personalInformationFlow } from './personal-information-flow.js';

export async function interactiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker ')));

  const createType = await clack.select({
    message: 'What do you want to create?',
    options: [
      { value: 'app', label: 'App', hint: 'Create and manage apps' },
      { value: 'bloc', label: 'BLoC', hint: 'State management' },
      { value: 'widget', label: 'Widget', hint: 'Design system component' },
      { value: 'usecase', label: 'Widgetbook Use-Case', hint: 'Component showcase' },
      { value: 'page', label: 'Page', hint: 'GoRoute + View with barrels' },
      { value: 'endpoint', label: 'Endpoint', hint: 'BFF Clean Architecture stack' },
      { value: 'package', label: 'Package', hint: 'Create a new package in the monorepo' },
      { value: 'env-var', label: 'Env Var', hint: 'Add environment variable to monorepo stack' },
      { value: 'personal-information', label: 'Personal Information', hint: 'Scaffold a new PI market (country form)' },
      { value: 'collaborative', label: 'Collaborative', hint: 'Generate collaborative feature / page / bloc / endpoint' },
      { value: 'docs', label: 'Docs', hint: 'Project documentation tools' },
    ],
  });

  if (clack.isCancel(createType)) {
    clack.cancel('Cancelled');
    return;
  }

  const type = createType as string;

  switch (type) {
    case 'bloc': {
      const project = await resolveProject();
      if (!project) return;
      await blocFlow(project);
      break;
    }
    case 'widget':
      await widgetFlow();
      break;
    case 'usecase':
      await useCaseFlow();
      break;
    case 'page':
      await pageFlow();
      break;
    case 'endpoint':
      await endpointFlow();
      break;
    case 'package':
      await packageFlow();
      break;
    case 'env-var':
      await envVarFlow();
      break;
    case 'personal-information':
      await personalInformationFlow();
      break;
    case 'collaborative':
      await collaborativeFlow();
      break;
    case 'app':
      await appFlow();
      break;
    case 'docs':
      await docsInteractiveMode();
      break;
  }
}
