import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../models/channel.dart';
import '../models/message.dart';
import '../models/sos.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiService {
  static const String _defaultBaseUrl = 'https://ptt.turkmenportal.com/api/v1';
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: _defaultBaseUrl);
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  String? _accessToken;
  String? _refreshToken;

  final http.Client _client = http.Client();

  Future<String?> get accessToken async {
    _accessToken ??= await _storage.read(key: 'access_token');
    return _accessToken;
  }

  Future<String?> get refreshToken async {
    _refreshToken ??= await _storage.read(key: 'refresh_token');
    return _refreshToken;
  }

  Map<String, String> _headers({bool auth = true}) {
    final h = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (auth && _accessToken != null) {
      h['Authorization'] = 'Bearer $_accessToken';
    }
    return h;
  }

  Future<Map<String, dynamic>> _request(
    String method, String path, {Map<String, dynamic>? body, bool auth = true, bool retried = false}
  ) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = _headers(auth: auth);
    http.Response res;
    try {
      res = await _client.send(
        http.Request(method, uri)
          ..headers.addAll(headers)
          ..body = body != null ? jsonEncode(body) : '',
      ).then((r) => http.Response.fromStream(r));
    } catch (e) {
      throw ApiException(0, 'Network error: $e');
    }
    if (res.statusCode == 401 && auth && !retried) {
      final refreshed = await _refreshAccessToken();
      if (refreshed) {
        return _request(method, path, body: body, auth: auth, retried: true);
      }
      await clearToken();
      throw ApiException(401, 'Session expired');
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return {};
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) return decoded;
        return {'data': decoded};
      } catch (_) {
        return {'raw': res.body};
      }
    }
    String msg = 'Request failed';
    try {
      final err = jsonDecode(res.body);
      msg = err['error'] as String? ?? err['message'] as String? ?? msg;
    } catch (_) {}
    throw ApiException(res.statusCode, msg);
  }

  Future<bool> _refreshAccessToken() async {
    try {
      final rt = await refreshToken;
      if (rt == null) return false;
      final res = await _client.post(
        Uri.parse('$baseUrl/auth/refresh'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cookie': 'refreshToken=$rt',
        },
        body: jsonEncode({'refreshToken': rt}),
      );
      if (res.statusCode != 200) return false;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final newToken = data['accessToken'] as String?;
      if (newToken == null) return false;
      setToken(newToken);
      String? newRefresh = data['refreshToken'] as String?;
      if (newRefresh == null) {
        final rawCookies = res.headers['set-cookie'];
        if (rawCookies != null) {
          for (final c in rawCookies.split(',')) {
            final m = RegExp(r'refreshToken=([^;]+)').firstMatch(c);
            if (m != null) {
              newRefresh = m.group(1);
              break;
            }
          }
        }
      }
      if (newRefresh != null) {
        await _storage.write(key: 'refresh_token', value: newRefresh);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> get(String path, {bool auth = true}) =>
      _request('GET', path, auth: auth);
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body, bool auth = true}) =>
      _request('POST', path, body: body, auth: auth);
  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body, bool auth = true}) =>
      _request('PUT', path, body: body, auth: auth);
  Future<Map<String, dynamic>> delete(String path, {bool auth = true}) =>
      _request('DELETE', path, auth: auth);
  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body, bool auth = true}) =>
      _request('PATCH', path, body: body, auth: auth);

  setToken(String? token) {
    _accessToken = token;
    if (token != null) {
      _storage.write(key: 'access_token', value: token);
    } else {
      _storage.delete(key: 'access_token');
    }
  }

  Future<void> clearToken() async {
    _accessToken = null;
    _refreshToken = null;
    await _storage.deleteAll();
  }

  Future<AuthResponse> login(String email, String password) async {
    final uri = Uri.parse('$baseUrl/auth/login');
    final res = await _client.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String msg = 'Login failed';
      try {
        final err = jsonDecode(res.body) as Map<String, dynamic>;
        msg = err['error'] as String? ?? err['message'] as String? ?? msg;
      } catch (_) {}
      throw ApiException(res.statusCode, msg);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final ar = AuthResponse.fromJson(data);
    setToken(ar.accessToken);
    _extractAndStoreRefreshToken(res, data);
    return ar;
  }

  Future<AuthResponse> register(String email, String password, String displayName) async {
    final uri = Uri.parse('$baseUrl/auth/register');
    final res = await _client.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({'email': email, 'password': password, 'displayName': displayName}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String msg = 'Registration failed';
      try {
        final err = jsonDecode(res.body) as Map<String, dynamic>;
        msg = err['error'] as String? ?? err['message'] as String? ?? msg;
      } catch (_) {}
      throw ApiException(res.statusCode, msg);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final ar = AuthResponse.fromJson(data);
    setToken(ar.accessToken);
    _extractAndStoreRefreshToken(res, data);
    return ar;
  }

  Future<void> _extractAndStoreRefreshToken(http.Response res, Map<String, dynamic> data) async {
    String? rt = data['refreshToken'] as String?;
    if (rt == null) {
      final rawCookies = res.headers['set-cookie'];
      if (rawCookies != null) {
        for (final c in rawCookies.split(',')) {
          final m = RegExp(r'refreshToken=([^;]+)').firstMatch(c);
          if (m != null) {
            rt = m.group(1);
            break;
          }
        }
      }
    }
    if (rt != null) {
      await _storage.write(key: 'refresh_token', value: rt);
    }
  }

  Future<Map<String, dynamic>?> refreshAccessToken() async {
    final refreshed = await _refreshAccessToken();
    if (!refreshed) return null;
    final at = await accessToken;
    return {'accessToken': at};
  }

  Future<void> logout() async {
    try { await post('/auth/logout'); } catch (_) {}
    await clearToken();
  }

  Future<User> getProfile() async {
    final res = await get('/auth/me');
    return User.fromJson(res['user'] as Map<String, dynamic>? ?? res);
  }

  Future<User> updateProfile(Map<String, dynamic> data) async {
    final res = await put('/auth/me', body: data);
    return User.fromJson(res['user'] as Map<String, dynamic>? ?? res);
  }

  Future<List<Channel>> getChannels() async {
    final res = await get('/channels');
    final list = res['channels'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => Channel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Channel> getChannel(String id) async {
    final res = await get('/channels/$id');
    return Channel.fromJson(res['channel'] as Map<String, dynamic>? ?? res);
  }

  Future<List<User>> getChannelMembers(String id) async {
    final res = await get('/channels/$id/members');
    final list = res['members'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => User.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> joinChannel(String id) async {
    await post('/channels/$id/join');
  }

  Future<void> leaveChannel(String id) async {
    await post('/channels/$id/leave');
  }

  Future<List<Conversation>> getConversations() async {
    final res = await get('/conversations');
    final list = res['conversations'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => Conversation.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Conversation> getConversation(String id) async {
    final res = await get('/conversations/$id');
    return Conversation.fromJson(res['conversation'] as Map<String, dynamic>? ?? res);
  }

  Future<Conversation> createConversation(List<String> participantIds,
      {String type = 'direct', String? name}) async {
    final res = await post('/conversations', body: {
      'type': type,
      if (name != null) 'name': name,
      'memberIds': participantIds,
    });
    return Conversation.fromJson(res['conversation'] as Map<String, dynamic>? ?? res);
  }

  Future<List<Message>> getMessages(String conversationId, {int offset = 0, int limit = 50}) async {
    final res = await get('/conversations/$conversationId/messages?offset=$offset&limit=$limit');
    final list = res['messages'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => Message.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Message> sendMessage(String conversationId, String content,
      {String type = 'text', Map<String, dynamic>? metadata}) async {
    final res = await post('/conversations/$conversationId/messages', body: {
      'content': content, 'type': type, if (metadata != null) 'metadata': metadata,
    });
    return Message.fromJson(res['message'] as Map<String, dynamic>? ?? res);
  }

  Future<List<SosAlert>> getSosAlerts(String channelId) async {
    final res = await get('/channels/$channelId/sos');
    final list = res['sosAlerts'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => SosAlert.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> resolveSos(String channelId, String sosId) async {
    await post('/channels/$channelId/sos/$sosId/resolve');
  }

  Future<List<User>> getUsers() async {
    final res = await get('/admin/users');
    final list = res['users'] as List<dynamic>? ?? res['data'] as List<dynamic>? ?? [];
    return list.map((e) => User.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> updateUserRole(String userId, String role) async {
    await put('/admin/users/$userId', body: {'role': role});
  }

  Future<void> deactivateUser(String userId) async {
    await post('/admin/users/$userId/deactivate');
  }

  Future<void> activateUser(String userId) async {
    await post('/admin/users/$userId/activate');
  }

  Future<List<Map<String, dynamic>>> getRecordings(String channelId) async {
    final res = await get('/recordings/$channelId');
    return (res['sessions'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getRecordingSession(String sessionId) async {
    return await get('/recordings/session/$sessionId');
  }

  Future<void> startChannelRecording(String channelId) async {
    await post('/recordings/$channelId/start');
  }

  Future<void> stopChannelRecording(String channelId) async {
    await post('/recordings/$channelId/stop');
  }

  Future<bool> isChannelRecording(String channelId) async {
    final res = await get('/recordings/active/$channelId');
    return res['active'] == true;
  }

  Future<void> uploadClientSegment(String channelId, String base64Audio, int durationMs) async {
    await post('/recordings/$channelId/client-segment', body: {
      'base64': base64Audio,
      'durationMs': durationMs,
      'contentType': 'audio/aac',
    });
  }

  Future<String> uploadFile(String filePath) async {
    final uri = Uri.parse('$baseUrl/upload');
    final request = http.MultipartRequest('POST', uri);
    request.headers.addAll(_headers());
    request.files.add(await http.MultipartFile.fromPath('file', filePath));
    final streamed = await request.send();
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      return data['url'] as String? ?? data['fileUrl'] as String? ?? '';
    }
    throw ApiException(res.statusCode, 'Upload failed');
  }

  Future<void> muteMember(String channelId, String memberId, {bool muted = true}) async {
    await patch('/channels/$channelId/members/$memberId/mute', body: {'muted': muted});
  }

  Future<void> sendChannelSos(String channelId, {String? message}) async {
    await post('/channels/$channelId/sos', body: {'message': message ?? ''});
  }

  Future<Map<String, dynamic>> getSfuConfig() async {
    return await get('/sfu/config');
  }

  Future<Map<String, dynamic>> getRtpCapabilities(String channelId) async {
    final res = await get('/sfu/rtp-capabilities/$channelId');
    return res['rtpCapabilities'] as Map<String, dynamic>? ?? res;
  }
}
