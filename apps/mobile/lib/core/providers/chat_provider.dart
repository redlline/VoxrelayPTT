import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/message.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../repositories/chat_repository.dart';

class ChatProvider extends ChangeNotifier {
  // ignore: unused_field
  final ApiService _api;
  final WsService _ws;
  final ChatRepository _repo;

  List<Conversation> _conversations = [];
  final Map<String, List<Message>> _messages = {};
  final Map<String, bool> _typing = {};
  StreamSubscription? _wsSubscription;
  bool _isLoading = false;

  ChatProvider(this._api, this._ws, this._repo);

  List<Conversation> get conversations => _conversations;
  List<Message> messages(String convId) => _messages[convId] ?? [];
  bool isLoading(String convId) => _isLoading;
  bool isTyping(String userId) => _typing[userId] ?? false;

  void init() {
    _wsSubscription = _ws.events.listen(_handleWsEvent);
  }

  void _handleWsEvent(WsEvent event) {
    switch (event.type) {
      case 'chat:message':
      case 'message.new':
        _onNewMessage(event.data);
        break;
      case 'user:typing':
        _onTyping(event.data);
        break;
      case 'chat:read':
        break;
    }
  }

  void _onNewMessage(Map<String, dynamic> data) {
    final msg = Message.fromJson(data);
    final convId = msg.conversationId;
    if (!_messages.containsKey(convId)) {
      _messages[convId] = [];
    }
    _messages[convId]!.add(msg);
    final idx = _conversations.indexWhere((c) => c.id == convId);
    if (idx != -1) {
      _conversations[idx] = _conversations[idx].copyWith(
        lastMessage: msg,
        unreadCount: _conversations[idx].unreadCount + 1,
      );
    }
    notifyListeners();
  }

  void _onTyping(Map<String, dynamic> data) {
    final userId = data['userId'] as String?;
    final typing = data['typing'] as bool? ?? false;
    if (userId != null) {
      _typing[userId] = typing;
      notifyListeners();
    }
  }

  Future<void> loadConversations() async {
    _isLoading = true;
    notifyListeners();
    final result = await _repo.getConversations();
    if (result.isSuccess) {
      _conversations = result.valueOrNull!;
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadMessages(String conversationId) async {
    if (_messages.containsKey(conversationId) && _messages[conversationId]!.isNotEmpty) return;
    _isLoading = true;
    notifyListeners();
    final result = await _repo.getMessages(conversationId);
    if (result.isSuccess) {
      _messages[conversationId] = result.valueOrNull!;
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> sendMessage(String conversationId, String content,
      {String type = 'text', Map<String, dynamic>? metadata}) async {
    final result = await _repo.sendMessage(conversationId, content, type: type, metadata: metadata);
    if (!result.isSuccess) return;
    final msg = result.valueOrNull!;
    _messages[conversationId] ??= [];
    _messages[conversationId]!.add(msg);
    final idx = _conversations.indexWhere((c) => c.id == conversationId);
    if (idx != -1) {
      _conversations[idx] = _conversations[idx].copyWith(lastMessage: msg);
    }
    notifyListeners();
  }

  void startTyping(String conversationId) {
    _ws.startTyping(conversationId);
  }

  void stopTyping(String conversationId) {
    _ws.stopTyping(conversationId);
  }

  void clearUnread(String conversationId) {
    _ws.markRead(conversationId);
    final idx = _conversations.indexWhere((c) => c.id == conversationId);
    if (idx != -1) {
      _conversations[idx] = _conversations[idx].copyWith(unreadCount: 0);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
