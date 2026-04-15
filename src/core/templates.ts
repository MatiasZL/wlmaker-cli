export function blocTemplate(name: string, pascal: string): string {
  return `import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part '${name}_bloc.freezed.dart';
part '${name}_event.dart';
part '${name}_state.dart';

class ${pascal}Bloc extends Bloc<${pascal}Event, ${pascal}State> {
  ${pascal}Bloc() : super(${pascal}State.initial()) {
    on<_Started>(_startedEvent);
  }

  void _startedEvent(_Started event, Emitter<${pascal}State> emit) {
    // TODO: implement event
  }
}
`;
}

export function blocEventTemplate(name: string, pascal: string): string {
  return `part of '${name}_bloc.dart';

@freezed
sealed class ${pascal}Event with _\$${pascal}Event {
  const factory ${pascal}Event.started() = _Started;
}
`;
}

export function blocStateTemplate(name: string, pascal: string): string {
  return `part of '${name}_bloc.dart';

@freezed
sealed class ${pascal}State with _\$${pascal}State {
  const factory ${pascal}State({
    @Default(false) bool fakeVar,
  }) = _${pascal}State;

  const ${pascal}State._();

  factory ${pascal}State.initial() => const ${pascal}State();
}
`;
}
