// ============================================================
// Atom Templates
// ============================================================

/** Atom Pattern A: Single file, public constructor */
export function atomTemplateA(name: string, pascal: string): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

class Wl${pascal} extends StatelessWidget {
  const Wl${pascal}({super.key});

  static const skeleton = _Wl${pascal}SkeletonFactory();

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`;
}

/** Atom Pattern B: Single file, private constructor + factories */
export function atomTemplateB(name: string, pascal: string): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

enum Wl${pascal}Variant {
  primary,
  secondary,
}

class Wl${pascal} extends StatelessWidget {
  final Wl${pascal}Variant variant;

  const Wl${pascal}._internal({required this.variant, super.key});

  factory Wl${pascal}.primary({Key? key}) =>
      Wl${pascal}._internal(variant: Wl${pascal}Variant.primary, key: key);

  factory Wl${pascal}.secondary({Key? key}) =>
      Wl${pascal}._internal(variant: Wl${pascal}Variant.secondary, key: key);

  static const skeleton = _Wl${pascal}SkeletonFactory();

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`;
}

// ============================================================
// Molecule Templates
// ============================================================

/** Molecule Pattern A: Single file StatelessWidget */
export function moleculeTemplateA(name: string, pascal: string): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

enum Wl${pascal}Variant {
  primary,
  secondary,
}

class Wl${pascal} extends StatelessWidget {
  final Wl${pascal}Variant variant;

  const Wl${pascal}({
    this.variant = Wl${pascal}Variant.primary,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }

  static const skeleton = _Wl${pascal}SkeletonFactory();
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`;
}

/** Molecule Pattern B: Subdirectory with part files */
export function moleculeTemplateB(
  name: string,
  pascal: string,
): { main: string; type: string } {
  return {
    main: `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

part 'wl_${name}_type.dart';

class Wl${pascal} extends StatelessWidget {
  final Wl${pascal}Variant variant;

  const Wl${pascal}({
    this.variant = Wl${pascal}Variant.primary,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }

  static const skeleton = _Wl${pascal}SkeletonFactory();
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`,
    type: `part of 'wl_${name}.dart';

enum Wl${pascal}Variant {
  primary,
  secondary,
}

extension Wl${pascal}VariantExt on Wl${pascal}Variant {
  bool get isPrimary => this == Wl${pascal}Variant.primary;
}
`,
  };
}

/** Molecule Pattern C: Subdirectory with widgets/ and utils/ */
export function moleculeTemplateC(name: string, pascal: string): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

class Wl${pascal} extends StatelessWidget {
  const Wl${pascal}({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }

  static const skeleton = _Wl${pascal}SkeletonFactory();
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`;
}

// ============================================================
// Organism Templates
// ============================================================

/** Organism Pattern A: Subdirectory with factories + variant/i18n/skeleton parts */
export function organismTemplateA(
  name: string,
  pascal: string,
): { main: string; variant: string; i18n: string; skeleton: string } {
  return {
    main: `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

part 'wl_${name}_variant.dart';
part 'wl_${name}_i18n.dart';
part 'wl_${name}_skeleton.dart';

class Wl${pascal} extends StatelessWidget {
  final Wl${pascal}Variant variant;
  final Wl${pascal}I18n i18n;

  factory Wl${pascal}({
    required Wl${pascal}I18n i18n,
    Key? key,
  }) {
    return Wl${pascal}._(
      key: key,
      variant: Wl${pascal}Variant.primary,
      i18n: i18n,
    );
  }

  factory Wl${pascal}.secondary({
    required Wl${pascal}I18n i18n,
    Key? key,
  }) {
    return Wl${pascal}._(
      key: key,
      variant: Wl${pascal}Variant.secondary,
      i18n: i18n,
    );
  }

  const Wl${pascal}._({
    required this.variant,
    required this.i18n,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}
`,
    variant: `part of 'wl_${name}.dart';

enum Wl${pascal}Variant {
  primary,
  secondary,
}
`,
    i18n: `part of 'wl_${name}.dart';

class Wl${pascal}I18n {
  const Wl${pascal}I18n({
    this.title = '',
    this.subtitle = '',
  });

  final String title;
  final String subtitle;
}
`,
    skeleton: `part of 'wl_${name}.dart';

class Wl${pascal}Skeleton extends StatelessWidget {
  const Wl${pascal}Skeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;

    return WlSkeleton(
      width: double.infinity,
      height: 120,
      radius: theme.borderRadius.radiusL,
    );
  }
}
`,
  };
}

/** Organism Pattern B: Single file simple */
export function organismTemplateB(name: string, pascal: string): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

class Wl${pascal} extends StatefulWidget {
  const Wl${pascal}({super.key});

  static const skeleton = _Wl${pascal}SkeletonFactory();

  @override
  State<Wl${pascal}> createState() => _Wl${pascal}State();
}

class _Wl${pascal}State extends State<Wl${pascal}> {
  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}

class _Wl${pascal}SkeletonFactory {
  const _Wl${pascal}SkeletonFactory();

  Widget call({Key? key}) => const SizedBox.shrink();
}
`;
}

// ============================================================
// Template Templates
// ============================================================

/** Template Pattern A: Simple with i18n + body + skeleton */
export function templateA(
  name: string,
  pascal: string,
): { main: string; i18n: string; body: string; skeleton: string } {
  return {
    main: `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

part '${name}_i18n.dart';
part '${name}_body.dart';
part '${name}_skeleton.dart';

class Wl${pascal}Template extends StatefulWidget {
  const Wl${pascal}Template({super.key});

  @override
  State<Wl${pascal}Template> createState() => _Wl${pascal}TemplateState();
}

class _Wl${pascal}TemplateState extends State<Wl${pascal}Template> {
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    // TODO: Load data
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(Wl${pascal}I18n.title)),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _isLoading
            ? const _Wl${pascal}Skeleton()
            : const _Wl${pascal}Body(),
      ),
    );
  }
}
`,
    i18n: `part of '${name}_template.dart';

class Wl${pascal}I18n extends Equatable {
  final String title;

  const Wl${pascal}I18n({
    this.title = '',
  });

  static const empty = Wl${pascal}I18n();

  @override
  List<Object?> get props => [title];
}
`,
    body: `part of '${name}_template.dart';

class _Wl${pascal}Body extends StatelessWidget {
  const _Wl${pascal}Body();

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}
`,
    skeleton: `part of '${name}_template.dart';

class _Wl${pascal}Skeleton extends StatelessWidget {
  const _Wl${pascal}Skeleton();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(),
    );
  }
}
`,
  };
}

/** Template Pattern B: With Config/Data/Callbacks */
export function templateB(
  name: string,
  pascal: string,
): {
  main: string;
  i18n: string;
  body: string;
  skeleton: string;
  callbacks: string;
  config: string;
  data: string;
} {
  return {
    main: `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

import 'contracts/${name}_callbacks.dart';
import 'contracts/${name}_config.dart';
import 'contracts/${name}_data.dart';

part '${name}_i18n.dart';
part '${name}_body.dart';
part '${name}_skeleton.dart';

class Wl${pascal}Template extends StatefulWidget {
  final Wl${pascal}Config config;
  final Wl${pascal}Callbacks callbacks;

  const Wl${pascal}Template({
    required this.config,
    required this.callbacks,
    super.key,
  });

  @override
  State<Wl${pascal}Template> createState() => _Wl${pascal}TemplateState();
}

class _Wl${pascal}TemplateState extends State<Wl${pascal}Template> {
  Wl${pascal}Data _data = const Wl${pascal}Data();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    // TODO: Load data
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.config.i18n.title)),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _isLoading
            ? const _Wl${pascal}Skeleton()
            : _Wl${pascal}Body(
                data: _data,
                callbacks: widget.callbacks,
              ),
      ),
    );
  }
}
`,
    i18n: `part of '${name}_template.dart';

class Wl${pascal}I18n extends Equatable {
  final String title;

  const Wl${pascal}I18n({
    this.title = '',
  });

  static const empty = Wl${pascal}I18n();

  @override
  List<Object?> get props => [title];
}
`,
    body: `part of '${name}_template.dart';

class _Wl${pascal}Body extends StatelessWidget {
  final Wl${pascal}Data data;
  final Wl${pascal}Callbacks callbacks;

  const _Wl${pascal}Body({
    required this.data,
    required this.callbacks,
  });

  @override
  Widget build(BuildContext context) {
    final theme = context.theme;
    return const SizedBox.shrink();
  }
}
`,
    skeleton: `part of '${name}_template.dart';

class _Wl${pascal}Skeleton extends StatelessWidget {
  const _Wl${pascal}Skeleton();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(),
    );
  }
}
`,
    callbacks: `import 'package:flutter/material.dart';

class Wl${pascal}Callbacks {
  final VoidCallback onBack;
  final VoidCallback onRetry;

  const Wl${pascal}Callbacks({
    required this.onBack,
    required this.onRetry,
  });
}
`,
    config: `import 'package:flutter/material.dart';
import '../${name}_template.dart';

class Wl${pascal}Config extends Equatable {
  final Wl${pascal}I18n i18n;
  final bool showAppBar;

  const Wl${pascal}Config({
    this.i18n = Wl${pascal}I18n.empty,
    this.showAppBar = true,
  });

  @override
  List<Object?> get props => [i18n, showAppBar];
}
`,
    data: `import 'package:flutter/material.dart';

class Wl${pascal}Data extends Equatable {
  const Wl${pascal}Data();

  @override
  List<Object?> get props => [];
}
`,
  };
}

// ============================================================
// Widgetbook Use-Case Template
// ============================================================

export function useCaseTemplate(
  name: string,
  pascal: string,
  tierPlural: string,
): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:widgetbook/widgetbook.dart';
import 'package:widgetbook_annotation/widgetbook_annotation.dart' as widgetbook;

@widgetbook.UseCase(
  name: 'Wl${pascal}',
  type: Wl${pascal},
  path: 'wl_design_system/${tierPlural}/wl_${name}',
)
Widget useCaseWl${pascal}(BuildContext context) {
  return const Wl${pascal}();
}
`;
}
