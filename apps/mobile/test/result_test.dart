import 'package:flutter_test/flutter_test.dart';
import 'package:voxrelay_mobile/core/error/result.dart';

void main() {
  group('Result', () {
    test('Success stores value', () {
      const r = Success<int>(42);
      expect(r.isSuccess, true);
      expect(r.valueOrNull, 42);
      expect(r.failureOrNull, isNull);
    });

    test('FailureResult stores failure', () {
      const f = NetworkFailure('offline');
      const r = FailureResult<int>(f);
      expect(r.isFailure, true);
      expect(r.valueOrNull, isNull);
      expect(r.failureOrNull, f);
    });

    test('runCatching catches errors', () {
      final r = runCatching<int>(() => throw Exception('boom'));
      expect(r.isFailure, true);
      expect(r.failureOrNull, isA<UnknownFailure>());
    });

    test('runCatching returns Success for normal result', () {
      final r = runCatching<int>(() => 7);
      expect(r.isSuccess, true);
      expect(r.valueOrNull, 7);
    });

    test('runCatchingAsync awaits and wraps Future result', () async {
      final r = await runCatchingAsync<int>(() async => 99);
      expect(r.isSuccess, true);
      expect(r.valueOrNull, 99);
    });

    test('runCatchingAsync catches async errors', () async {
      final r = await runCatchingAsync<int>(() async => throw Exception('async-boom'));
      expect(r.isFailure, true);
    });
  });
}
