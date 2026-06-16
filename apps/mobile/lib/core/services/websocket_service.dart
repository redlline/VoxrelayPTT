import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

enum WsConnectionState { disconnected, connecting, connected }

class WsEvent {
  final String type;
  final Map<String, dynamic> data;
  WsEvent(this.type, this.data);
}

class WsService {
  WebSocketChannel? _channel;
  final StreamController<WsEvent> _eventController = StreamController<WsEvent>.broadcast();
  final StreamController<WsConnectionState> _stateController =
      StreamController<WsConnectionState>.broadcast();

  WsConnectionState _state = WsConnectionState.disconnected;
  WsConnectionState get state => _state;
  Stream<WsEvent> get events => _eventController.stream;
  Stream<WsConnectionState> get stateStream => _stateController.stream;

  Timer? _reconnectTimer;
  Timer? _pingTimer;
  Timer? _authFailTimer;
  String? _token;
  int _reconnectAttempt = 0;
  bool _authFailed = false;
  static const int _maxReconnectDelay = 30000;
  static const int _authFailWindowMs = 5000;

  static const String _defaultWsUrl = 'wss://ptt.turkmenportal.com/ws';
  static const String _wsUrl = String.fromEnvironment('WS_URL', defaultValue: _defaultWsUrl);

  void _setState(WsConnectionState s) {
    _state = s;
    _stateController.add(s);
  }

  Future<void> connect(String token) async {
    _token = token;
    _authFailed = false;
    _setState(WsConnectionState.connecting);
    _authFailTimer?.cancel();
    _authFailTimer = Timer(const Duration(milliseconds: _authFailWindowMs), () {
      _authFailTimer = null;
    });
    try {
      final uri = Uri.parse('$_wsUrl?token=$token');
      _channel = WebSocketChannel.connect(uri);
      await _channel!.ready;
      _setState(WsConnectionState.connected);
      _reconnectAttempt = 0;
      _authFailTimer = null;
      _startPing();
      _channel!.stream.listen(_onData, onError: _onError, onDone: _onDone);
    } catch (e) {
      _setState(WsConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _onData(dynamic data) {
    try {
      final decoded = jsonDecode(data as String) as Map<String, dynamic>;
      final type = decoded['type'] as String? ?? '';
      if (type.isEmpty || type == 'pong') return;
      final payload = Map<String, dynamic>.from(decoded)..remove('type');
      _eventController.add(WsEvent(type, payload));
    } catch (_) {}
  }

  void _onError(dynamic error) {
    _setState(WsConnectionState.disconnected);
    _handleClose();
  }

  void _onDone() {
    _setState(WsConnectionState.disconnected);
    _handleClose();
  }

  void _handleClose() {
    if (_authFailed) return;
    if (_authFailTimer != null) {
      _authFailed = true;
      _reconnectTimer?.cancel();
      _reconnectAttempt = 0;
      _eventController.add(WsEvent('auth.failed', {}));
      return;
    }
    _scheduleReconnect();
  }

  void _startPing() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      send('ping', {});
    });
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    final delay = Duration(milliseconds: _reconnectAttempt < 10
        ? 1000 * (1 << _reconnectAttempt)
        : _maxReconnectDelay);
    _reconnectAttempt++;
    _reconnectTimer = Timer(delay, () {
      if (_state == WsConnectionState.disconnected && _token != null) {
        connect(_token!);
      }
    });
  }

  void send(String type, Map<String, dynamic> data) {
    if (_channel != null && _state == WsConnectionState.connected) {
      try {
        final msg = <String, dynamic>{'type': type}..addAll(data);
        _channel!.sink.add(jsonEncode(msg));
      } catch (_) {
        _setState(WsConnectionState.disconnected);
        _scheduleReconnect();
      }
    }
  }

  void joinChannel(String channelId) {
    send('channel.join', {'channelId': channelId});
  }

  void leaveChannel(String channelId) {
    send('channel.leave', {'channelId': channelId});
  }

  void requestFloor(String channelId) {
    send('ptt.request', {'channelId': channelId});
  }

  void releaseFloor(String channelId) {
    send('ptt.release', {'channelId': channelId});
  }

  void sendChatMessage(String channelId, String content, {String type = 'text'}) {
    send('message.new', {'channelId': channelId, 'content': content, 'type': type});
  }

  void updateLocation(double lat, double lng, {double? accuracy}) {
    send('location.update', {'latitude': lat, 'longitude': lng, 'accuracy': accuracy});
  }

  void sendSos(Map<String, dynamic> data) {
    send('sos.alert', data);
  }

  void startTyping(String conversationId) {
    send('user:typing', {'conversationId': conversationId, 'typing': true});
  }

  void stopTyping(String conversationId) {
    send('user:typing', {'conversationId': conversationId, 'typing': false});
  }

  void sendMessage(String conversationId, String content, {String type = 'text'}) {
    send('message.new', {'conversationId': conversationId, 'content': content, 'type': type});
  }

  void markRead(String conversationId) {
    send('chat:read', {'conversationId': conversationId});
  }

  void startCall(String userId, String conversationId) {
    send('direct_ptt.call', {'targetUserId': userId, 'conversationId': conversationId});
  }

  void acceptCall(String callId) {
    send('direct_ptt.accept', {'callId': callId});
  }

  void rejectCall(String callId) {
    send('direct_ptt.reject', {'callId': callId});
  }

  void endCall(String callId) {
    send('direct_ptt.end', {'callId': callId});
  }

  void sendTransportCreate(String channelId, String direction) {
    send('transport.create', {'channelId': channelId, 'direction': direction});
  }

  void sendTransportConnect(String channelId, String transportId, Map<String, dynamic> dtlsParameters) {
    send('transport.connect', {
      'channelId': channelId,
      'transportId': transportId,
      'dtlsParameters': dtlsParameters,
    });
  }

  void sendProduce(String channelId, String transportId, String kind, Map<String, dynamic> rtpParameters) {
    send('produce', {
      'channelId': channelId,
      'transportId': transportId,
      'kind': kind,
      'rtpParameters': rtpParameters,
    });
  }

  void requestProducers(String channelId) {
    send('producers.list', {'channelId': channelId});
  }

  void getOnlineUsers() {
    send('get_online_users', {});
  }

  void sendConsume(String channelId, String transportId, String producerId, Map<String, dynamic> rtpCapabilities) {
    send('consume', {
      'channelId': channelId,
      'transportId': transportId,
      'producerId': producerId,
      'rtpCapabilities': rtpCapabilities,
    });
  }

  void sendConsumerResume(String consumerId) {
    send('consumer.resume', {'consumerId': consumerId});
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _authFailTimer?.cancel();
    _authFailTimer = null;
    _authFailed = false;
    _channel?.sink.close();
    _setState(WsConnectionState.disconnected);
  }

  void dispose() {
    disconnect();
    _eventController.close();
    _stateController.close();
  }
}
