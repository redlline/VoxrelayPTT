import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/websocket_service.dart';
import '../services/mediasoup_service.dart';
import 'media_controls_provider.dart';
import 'video_source_provider.dart';

enum PttState { idle, requesting, speaking, denied }

class PttProvider extends ChangeNotifier {
  final WsService _ws;
  final MediasoupService _ms;
  MediaControlsProvider? _media;

  PttState _state = PttState.idle;
  String? _activeChannelId;
  bool _floorGranted = false;
  int _floorQueuePosition = 0;
  String? _activeSpeakerId;
  String? _activeSpeakerName;
  StreamSubscription<WsEvent>? _wsSubscription;
  Timer? _producersPollTimer;
  String? _selfUserId;
  bool _joinedChannel = false;
  MediaStream? _remoteVideoStream;
  VideoSourceProvider? _video;

  PttProvider(this._ws, this._ms);

  void setMedia(MediaControlsProvider media) {
    _media = media;
  }

  void setVideo(VideoSourceProvider video) {
    _video = video;
  }

  MediaStream? get remoteVideoStream => _remoteVideoStream;

  PttState get state => _state;
  String? get selfUserId => _selfUserId;
  String? get activeChannelId => _activeChannelId;
  bool get floorGranted => _floorGranted;
  int get floorQueuePosition => _floorQueuePosition;
  String? get activeSpeakerId => _activeSpeakerId;
  String? get activeSpeakerName => _activeSpeakerName;
  bool get isSpeaking => _state == PttState.speaking;
  bool get isMuted => _media?.isMuted ?? false;

  void setSelfUserId(String? userId) {
    _selfUserId = userId;
  }

  bool _initialized = false;
  void init() {
    if (_initialized) return;
    _initialized = true;
    _wsSubscription = _ws.events.listen(_handleWsEvent);
    _ms.remoteVideoStream.listen((streams) {
      _remoteVideoStream = streams.values.isNotEmpty ? streams.values.first : null;
      _video?.setRemoteVideoStream(_remoteVideoStream);
      notifyListeners();
    });
  }

  void _handleWsEvent(WsEvent event) {
    switch (event.type) {
      case 'ptt.granted':
        _floorGranted = true;
        _floorQueuePosition = 0;
        _state = PttState.speaking;
        notifyListeners();
        _enableMicAndProduce();
        break;
      case 'ptt.denied':
        _state = PttState.denied;
        notifyListeners();
        Future.delayed(const Duration(milliseconds: 500), () {
          if (_state == PttState.denied) {
            _state = PttState.idle;
            notifyListeners();
          }
        });
        break;
      case 'ptt.released':
        _ms.incrementCancelToken();
        _floorGranted = false;
        _floorQueuePosition = 0;
        _ms.pauseProducer();
        if (_state == PttState.speaking) {
          _state = PttState.idle;
          notifyListeners();
        }
        break;
      case 'ptt.force_release':
        _ms.incrementCancelToken();
        _floorGranted = false;
        _floorQueuePosition = 0;
        _ms.pauseProducer();
        if (_state == PttState.speaking) {
          _state = PttState.idle;
          notifyListeners();
        }
        break;
      case 'ptt.queued':
        _floorQueuePosition = event.data['position'] as int? ?? 0;
        notifyListeners();
        break;
      case 'speaker-changed':
        _activeSpeakerId = event.data['activeSpeaker'] as String?;
        _activeSpeakerName = event.data['displayName'] as String?;
        notifyListeners();
        break;
      case 'channel.user_muted':
        if (event.data['userId'] != null && event.data['userId'] == _selfUserId) {
          _media?.setMuted(true);
        }
        break;
      case 'channel.user_unmuted':
        if (event.data['userId'] != null && event.data['userId'] == _selfUserId) {
          _media?.setMuted(false);
        }
        break;
      case 'new-consumer':
      case 'producers':
        _consumeProducers(event.data);
        break;
      case 'consumer.closed':
        final producerId = event.data['producerId'] as String?;
        if (producerId != null) {
          _ms.removeConsumer(producerId);
        }
        break;
    }
  }

  Future<void> _enableMicAndProduce() async {
    if (_activeChannelId == null) return;
    final savedToken = _ms.cancelToken;
    try {
      final stream = _ms.localStream;
      if (stream == null) return;
      stream.getAudioTracks().forEach((t) => t.enabled = true);
      final track = stream.getAudioTracks().firstOrNull;
      if (track != null) {
        await _ms.createAudioProducer(_activeChannelId!, track);
        if (savedToken != _ms.cancelToken || !_floorGranted) {
          return;
        }
        _ms.resumeProducer();
      }
    } catch (_) {}
  }

  Future<void> _consumeProducers(Map<String, dynamic> data) async {
    if (_activeChannelId == null) return;
    final list = (data['producers'] as List<dynamic>?) ?? const [];
    for (final p in list) {
      if (p is! Map) continue;
      final producerId = p['producerId'] as String?;
      if (producerId == null) continue;
      try {
        await _ms.createConsumer(_activeChannelId!, producerId);
      } catch (_) {}
    }
  }

  Future<void> joinAndStart(String channelId) async {
    _activeChannelId = channelId;
    _state = PttState.requesting;
    notifyListeners();

    _ms.prepareSendTransport(channelId);
    if (!_joinedChannel) {
      _ws.joinChannel(channelId);
      _joinedChannel = true;
    }
    // Send floor request immediately — before await (getUserMedia can be slow)
    _ws.requestFloor(channelId);
    _ws.requestProducers(channelId);

    _producersPollTimer?.cancel();
    _producersPollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      final ch = _activeChannelId;
      if (ch != null) _ws.requestProducers(ch);
    });

    final ok = await _ms.requestPermission();
    if (!ok) {
      _state = PttState.idle;
      notifyListeners();
    }
  }

  void releaseFloor() {
    _ms.incrementCancelToken();
    _ms.pauseProducer();
    if (_activeChannelId != null) {
      _ws.releaseFloor(_activeChannelId!);
    }
    _floorGranted = false;
    if (_state != PttState.idle) {
      _state = PttState.idle;
      notifyListeners();
    }
  }

  void leaveChannel() {
    if (_activeChannelId != null) {
      _ws.leaveChannel(_activeChannelId!);
    }
    _producersPollTimer?.cancel();
    _producersPollTimer = null;
    _ms.closeTransports();
    _ms.stopMic();
    _media?.disposeRenderer();
    _media?.reset();
    _activeChannelId = null;
    _joinedChannel = false;
    _state = PttState.idle;
    _floorGranted = false;
    _floorQueuePosition = 0;
    _activeSpeakerId = null;
    _activeSpeakerName = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    _producersPollTimer?.cancel();
    _ms.dispose();
    super.dispose();
  }
}
