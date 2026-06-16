import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/sos.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../services/location_service.dart';
import '../repositories/sos_repository.dart';
import 'channel_provider.dart';

class SosProvider extends ChangeNotifier {
  // ignore: unused_field
  final ApiService _api;
  final WsService _ws;
  final LocationService _locationService;
  final SosRepository _repo;
  ChannelProvider? _channelProvider;

  List<SosAlert> _activeAlerts = [];
  bool _isLoading = false;
  String? _error;
  StreamSubscription? _wsSubscription;

  SosProvider(this._api, this._ws, this._locationService, this._repo);

  void bindChannelProvider(ChannelProvider cp) {
    _channelProvider = cp;
  }

  List<SosAlert> get activeAlerts => _activeAlerts;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void init() {
    _wsSubscription = _ws.events.listen(_handleWsEvent);
  }

  void _handleWsEvent(WsEvent event) {
    switch (event.type) {
      case 'sos:alert':
      case 'sos.alert':
        try {
          final alert = SosAlert.fromJson(_mapSosEvent(event.data));
          _activeAlerts.insert(0, alert);
          notifyListeners();
        } catch (_) {}
        break;
      case 'sos:resolve':
      case 'sos.resolved':
        final alertId = (event.data['id'] ?? event.data['sosId']) as String?;
        if (alertId != null) {
          _activeAlerts.removeWhere((a) => a.id == alertId);
          notifyListeners();
        }
        break;
      case 'dispatcher.open_channel':
        break;
    }
  }

  Map<String, dynamic> _mapSosEvent(Map<String, dynamic> data) {
    return {
      'id': data['sosId'] ?? data['id'],
      'userId': data['userId'],
      'userName': data['displayName'] ?? data['userName'],
      'type': 'emergency',
      'message': data['message'],
      'channelId': data['channelId'],
      'status': 'active',
      'createdAt': data['createdAt'],
    };
  }

  Future<bool> sendSos({String? message}) async {
    try {
      final loc = await _locationService.getCurrentLocation();
      final channelId = _channelProvider?.myChannels.isNotEmpty == true
          ? _channelProvider!.myChannels.first.id
          : null;
      SosAlert? alert;
      if (channelId != null) {
        await _repo.sendChannelSos(channelId, message: message);
        if (loc?.latitude != null && loc?.longitude != null) {
          _ws.updateLocation(loc!.latitude, loc.longitude);
        }
        alert = SosAlert(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          userId: '',
          userName: 'You',
          type: 'emergency',
          message: message,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          status: 'active',
          createdAt: DateTime.now(),
        );
      } else {
        if (loc?.latitude != null && loc?.longitude != null) {
          _ws.updateLocation(loc!.latitude, loc.longitude);
        }
        _ws.sendSos({
          'message': message,
          'latitude': loc?.latitude,
          'longitude': loc?.longitude,
        });
        alert = SosAlert(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          userId: '',
          userName: 'You',
          type: 'emergency',
          message: message,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          status: 'active',
          createdAt: DateTime.now(),
        );
      }
      _activeAlerts.insert(0, alert);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> resolveSos(String alertId) async {
    try {
      final alert = _activeAlerts.firstWhere(
        (a) => a.id == alertId,
        orElse: () => SosAlert(
          id: alertId,
          userId: '',
          createdAt: DateTime.now(),
        ),
      );
      final channelId = (alert.userId.isNotEmpty && _channelProvider != null)
          ? _channelProvider!.myChannels.isNotEmpty
              ? _channelProvider!.myChannels.first.id
              : null
          : null;
      if (channelId != null) {
        await _repo.resolve(channelId, alertId);
      }
      _activeAlerts.removeWhere((a) => a.id == alertId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> loadActiveAlerts() async {
    _isLoading = true;
    notifyListeners();
    try {
      if (_channelProvider != null && _channelProvider!.myChannels.isNotEmpty) {
        final all = <SosAlert>[];
        for (final ch in _channelProvider!.myChannels) {
          final result = await _repo.getAlerts(ch.id);
          if (result.isSuccess) {
            all.addAll(result.valueOrNull!);
          }
        }
        _activeAlerts = all;
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
