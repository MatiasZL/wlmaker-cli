import { pascalCase } from 'change-case';

export function pageTemplate(name: string, packageName: string): string {
  const pascal = pascalCase(name);
  const routePath = '/' + name;

  const imports = [
    `package:flutter/material.dart`,
    `package:go_router/go_router.dart`,
    `package:${packageName}/pages/views/${name}_view.dart`,
  ].sort();

  return `${imports.map((i) => `import '${i}';`).join('\n')}

class ${pascal}Page extends GoRoute {
  ${pascal}Page({super.name, super.routes})
      : super(
          path: fullPath,
          pageBuilder: (context, state) =>
              const MaterialPage(child: ${pascal}View()),
        );

  static const fullPath = '${routePath}';

  static void open(BuildContext context) => context.go(fullPath);
}
`;
}

export function viewTemplate(name: string): string {
  const pascal = pascalCase(name);

  return `import 'package:flutter/material.dart';

class ${pascal}View extends StatelessWidget {
  const ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: const Center(child: Text('${pascal}')),
    );
  }
}
`;
}
