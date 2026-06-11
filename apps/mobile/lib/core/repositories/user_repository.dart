import '../models/user.dart';
import '../services/api_service.dart';
import '../error/result.dart';

class UserRepository {
  final ApiService _api;
  UserRepository(this._api);

  Future<Result<List<User>>> getUsers() => runCatchingAsync(() => _api.getUsers());
  Future<Result<void>> updateRole(String userId, String role) => runCatchingAsync(() => _api.updateUserRole(userId, role));
  Future<Result<void>> deactivate(String userId) => runCatchingAsync(() => _api.deactivateUser(userId));
  Future<Result<void>> activate(String userId) => runCatchingAsync(() => _api.activateUser(userId));
  Future<Result<User>> updateProfile(Map<String, dynamic> data) => runCatchingAsync(() => _api.updateProfile(data));
}
