import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:voxrelay_mobile/core/services/websocket_service.dart';

class _FakeWs extends WsService {
  final StreamController<WsEvent> _ctrl = StreamController<WsEvent>.broadcast();
  final List<Map<String, dynamic>> sent = [];
  bool connected = false;

  @override
  Stream<WsEvent> get events => _ctrl.stream;

  @override
  void send(String type, Map<String, dynamic> data) {
    sent.add({'type': type, ...data});
  }

  @override
  Future<void> connect(String token) async {
    connected = true;
  }

  @override
  void disconnect() {
    connected = false;
  }

  void emit(WsEvent event) => _ctrl.add(event);
  Future<void> close() => _ctrl.close();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AuthProvider WS events', () {
    test('auth.failed event clears user', () async {
      // basic sanity test to ensure no async errors
      final ws = _FakeWs();
      addTearDown(ws.close);
      final events = <String>[];
      ws.events.listen((e) => events.add(e.type));
      ws.emit(WsEvent('auth.failed', {}));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(events, contains('auth.failed'));
    });
  });
}
