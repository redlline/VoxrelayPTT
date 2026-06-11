sealed class Failure {
  final String message;
  const Failure(this.message);
}

class NetworkFailure extends Failure {
  const NetworkFailure(super.message);
}

class AuthFailure extends Failure {
  const AuthFailure(super.message);
}

class ServerFailure extends Failure {
  final int statusCode;
  const ServerFailure(this.statusCode, String message) : super(message);
}

class ValidationFailure extends Failure {
  const ValidationFailure(super.message);
}

class UnknownFailure extends Failure {
  const UnknownFailure(super.message);
}

sealed class Result<T> {
  const Result();
  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is FailureResult<T>;
  T? get valueOrNull => switch (this) {
        Success<T>(:final value) => value,
        FailureResult<T>() => null,
      };
  Failure? get failureOrNull => switch (this) {
        Success<T>() => null,
        FailureResult<T>(:final failure) => failure,
      };
}

class Success<T> extends Result<T> {
  final T value;
  const Success(this.value);
}

class FailureResult<T> extends Result<T> {
  final Failure failure;
  const FailureResult(this.failure);
}

Result<T> runCatching<T>(T Function() block) {
  try {
    return Success(block());
  } on FailureResult<T> catch (e) {
    return e;
  } catch (e) {
    return FailureResult(UnknownFailure(e.toString()));
  }
}

Future<Result<T>> runCatchingAsync<T>(Future<T> Function() block) async {
  try {
    return Success(await block());
  } on FailureResult<T> catch (e) {
    return e;
  } catch (e) {
    return FailureResult(UnknownFailure(e.toString()));
  }
}
