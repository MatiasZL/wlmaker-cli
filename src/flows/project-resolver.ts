import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  analyzeProject,
  findMonorepoRoot,
  discoverPackages,
  discoverProjects,
  type ProjectInfo,
} from '../analyzer/project.js';

export async function resolveProject(): Promise<ProjectInfo | null> {
  const s = clack.spinner();

  s.start('Analyzing current directory...');
  const cwdProject = analyzeProject(process.cwd());
  if (cwdProject && (cwdProject.hasFreezed || cwdProject.hasBloc)) {
    s.stop(`Found ${chalk.green(cwdProject.projectName)}`);
    return cwdProject;
  }

  s.message('Looking for Melos monorepo...');
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (monorepoRoot) {
    const packages = discoverPackages(monorepoRoot);
    if (packages.length > 0) {
      s.stop(`Found monorepo with ${packages.length} feature package(s)`);
      return selectPackage(packages);
    }
  }

  s.message('Scanning for Flutter projects...');
  const homeDev = path.join(os.homedir(), 'Development');
  if (fs.existsSync(homeDev)) {
    const projects = discoverProjects(homeDev, 2);
    if (projects.length > 0) {
      s.stop(`Found ${projects.length} Flutter project(s)`);
      return selectPackage(projects);
    }
  }

  s.stop('No Flutter projects found');
  clack.outro(chalk.red('Could not find any Flutter project with freezed or flutter_bloc.'));
  return null;
}

async function selectPackage(projects: ProjectInfo[]): Promise<ProjectInfo | null> {
  if (projects.length === 1) {
    clack.log.info(`Using ${chalk.green(projects[0].projectName)}`);
    return projects[0];
  }

  const selected = await clack.select({
    message: 'Select a package',
    options: projects.map((p) => ({
      value: p,
      label: p.projectName,
      hint: path.relative(os.homedir(), p.projectRoot),
    })),
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Cancelled');
    return null;
  }

  return selected as ProjectInfo;
}
