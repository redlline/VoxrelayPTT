import '../models/user.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../error/result.dart';

class AuthRepository {
  final ApiService _api;
  final WsService _ws;

  AuthRepository(this._api, this._ws);

  Future<Result<AuthResponse>> login(String email, String password) async {
    return runCatchingAsync(() async {
      final response = await _api.login(email, password);
      await _ws.connect(response.accessToken);
      return response;
    });
  }

  Future<Result<AuthResponse>> register(String email, String password, String displayName) async {
    return runCatchingAsync(() async {
      final response = await _api.register(email, password, displayName);
      await _ws.connect(response.accessToken);
      return response;
    });
  }

  Future<Result<User>> getProfile() => runCatchingAsync(() => _api.getProfile());

  Future<Result<bool>> refreshToken() => runCatchingAsync(() async {
        final result = await _api.refreshAccessToken();
        if (result == null) throw const AuthFailure('Refresh failed');
        await _ws.connect(result['accessToken'] as String);
        return true;
      });

  Future<User?> getCurrentUser() async {
    final token = await _api.accessToken;
    if (token == null) return null;
    final r = await getProfile();
    return r.valueOrNull;
  }

  Future<void> logout() async {
    _ws.disconnect();
    await _api.logout();
  }
}
