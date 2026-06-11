import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../repositories/auth_repository.dart';
import '../error/result.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api;
  final WsService _ws;
  final AuthRepository _repo;

  User? _user;
  bool _isLoading = false;
  String? _error;
  String? _authFailMessage;

  AuthProvider(this._api, this._ws, this._repo) {
    _ws.events.listen(_handleWsEvent);
  }

  User? get user => _user;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String? get authFailMessage => _authFailMessage;
  bool get isAuthenticated => _user != null;
  bool get isAdmin => _user?.role == 'admin';
  bool get isDispatcher => _user?.role == 'dispatcher' || _user?.role == 'admin';

  void _handleWsEvent(WsEvent event) {
    if (event.type != 'auth.failed') return;
    _authFailMessage = 'Session expired. Please sign in again.';
    _user = null;
    _api.clearToken();
    _ws.disconnect();
    notifyListeners();
  }

  void clearAuthFail() {
    if (_authFailMessage == null) return;
    _authFailMessage = null;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    final result = await _repo.login(email, password);
    return _handleAuthResult(result);
  }

  Future<bool> register(String email, String password, String displayName) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    final result = await _repo.register(email, password, displayName);
    return _handleAuthResult(result);
  }

  bool _handleAuthResult(Result<AuthResponse> result) {
    if (result.isSuccess) {
      _user = result.valueOrNull!.user;
      _isLoading = false;
      notifyListeners();
      return true;
    }
    _error = result.failureOrNull!.message;
    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<void> logout() async {
    _ws.disconnect();
    await _api.logout();
    _user = null;
    _error = null;
    _authFailMessage = null;
    notifyListeners();
  }

  Future<void> loadProfile() async {
    final result = await _repo.getProfile();
    if (result.isSuccess) {
      _user = result.valueOrNull;
      notifyListeners();
    }
  }

  Future<void> checkAuth() async {
    final token = await _api.accessToken;
    if (token == null) return;
    final profileResult = await _repo.getProfile();
    if (profileResult.isSuccess) {
      _user = profileResult.valueOrNull;
      await _ws.connect(token);
      notifyListeners();
      return;
    }
    final refreshResult = await _repo.refreshToken();
    if (refreshResult.isSuccess) {
      final reProfile = await _repo.getProfile();
      if (reProfile.isSuccess) {
        _user = reProfile.valueOrNull;
        notifyListeners();
        return;
      }
    }
    await _api.clearToken();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
