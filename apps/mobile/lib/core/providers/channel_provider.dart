import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/channel.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../repositories/channel_repository.dart';

class ChannelProvider extends ChangeNotifier {
  final ApiService _api;
  final WsService _ws;
  final ChannelRepository _repo;

  List<Channel> _channels = [];
  List<Channel> _myChannels = [];
  final List<User> _members = [];
  final Set<String> _onlineUserIds = {};
  bool _isLoading = false;
  String? _error;
  String? _activeSpeakerId;
  StreamSubscription? _wsSubscription;

  ChannelProvider(this._api, this._ws, this._repo);

  List<Channel> get channels => _channels;
  List<Channel> get myChannels => _myChannels;
  List<User> get members => _members;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String? get activeSpeakerId => _activeSpeakerId;

  void init() {
    _wsSubscription = _ws.events.listen(_handleWsEvent);
    _ws.getOnlineUsers();
  }

  bool isUserOnline(String userId) => _onlineUserIds.contains(userId);

  void _handleWsEvent(WsEvent event) {
    switch (event.type) {
      case 'speaker-changed':
        _activeSpeakerId = event.data['activeSpeaker'] as String?;
        notifyListeners();
        break;
      case 'channel.user_joined':
        _memberJoined(event.data);
        break;
      case 'channel.user_left':
        _memberLeft(event.data);
        break;
      case 'online_users':
        _onlineUserIds
          ..clear()
          ..addAll((event.data['userIds'] as List<dynamic>?)?.cast<String>() ?? const []);
        _applyOnlineStatus();
        notifyListeners();
        break;
      case 'user.online':
        final userId = event.data['userId'] as String?;
        if (userId != null) {
          _onlineUserIds.add(userId);
          _applyOnlineStatus();
          notifyListeners();
        }
        break;
      case 'user.offline':
        final userId = event.data['userId'] as String?;
        if (userId != null) {
          _onlineUserIds.remove(userId);
          _applyOnlineStatus();
          notifyListeners();
        }
        break;
    }
  }

  void _applyOnlineStatus() {
    for (final m in _members) {
      m.isOnline = _onlineUserIds.contains(m.id);
    }
  }

  void _memberJoined(Map<String, dynamic> data) {
    final member = User.fromJson(data);
    member.isOnline = _onlineUserIds.contains(member.id);
    _members.add(member);
    notifyListeners();
  }

  void _memberLeft(Map<String, dynamic> data) {
    final userId = data['userId'] as String?;
    if (userId != null) {
      _members.removeWhere((m) => m.id == userId);
      notifyListeners();
    }
  }

  Future<void> loadChannels() async {
    _isLoading = true;
    notifyListeners();
    try {
      _channels = await _api.getChannels();
      _myChannels = _channels.where((c) => c.isJoined).toList();
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMembers(String channelId) async {
    final result = await _repo.getMembers(channelId);
    if (result.isSuccess) {
      _members
        ..clear()
        ..addAll(result.valueOrNull!);
      _applyOnlineStatus();
      notifyListeners();
    }
  }

  Future<void> joinChannel(String id) async {
    final result = await _repo.join(id);
    if (result.isSuccess) {
      _ws.joinChannel(id);
      final idx = _channels.indexWhere((c) => c.id == id);
      if (idx != -1) {
        _channels[idx] = _channels[idx].copyWith(memberRole: 'member');
      }
      if (!_myChannels.any((c) => c.id == id)) {
        _myChannels.add(_channels.firstWhere((c) => c.id == id));
      }
      notifyListeners();
    } else {
      _error = result.failureOrNull!.message;
      notifyListeners();
    }
  }

  Future<void> leaveChannel(String id) async {
    final result = await _repo.leave(id);
    if (result.isSuccess) {
      _ws.leaveChannel(id);
      _myChannels.removeWhere((c) => c.id == id);
      final idx = _channels.indexWhere((c) => c.id == id);
      if (idx != -1) {
        _channels[idx] = _channels[idx].copyWith(memberRole: null);
      }
      notifyListeners();
    } else {
      _error = result.failureOrNull!.message;
      notifyListeners();
    }
  }

  void setActiveSpeaker(String? userId) {
    _activeSpeakerId = userId;
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
