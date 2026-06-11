import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/mediasoup_service.dart';

const _screenShareChannel = MethodChannel('voxrelay/screen_share');

class VideoSourceProvider extends ChangeNotifier {
  final MediasoupService _ms;

  bool _isCameraEnabled = false;
  bool _isScreenSharing = false;
  RTCVideoRenderer? _videoRenderer;
  RTCVideoRenderer? _remoteVideoRenderer;
  MediaStream? _localStream;

  VideoSourceProvider(this._ms);

  bool get isCameraEnabled => _isCameraEnabled;
  bool get isScreenSharing => _isScreenSharing;
  RTCVideoRenderer? get videoRenderer => _videoRenderer;
  RTCVideoRenderer? get remoteVideoRenderer => _remoteVideoRenderer;
  MediaStream? get localStream => _localStream;

  Future<void> _stopNativeScreenShare() async {
    if (!_isScreenSharing) return;
    try {
      await _screenShareChannel.invokeMethod<void>('stop');
    } on PlatformException catch (_) {}
  }

  Future<void> toggleCamera(String? activeChannelId) async {
    if (_isCameraEnabled) {
      _stopRenderer();
      _ms.closeVideoProducer();
      _isCameraEnabled = false;
      notifyListeners();
      return;
    }
    if (_isScreenSharing) {
      await _stopNativeScreenShare();
      _stopRenderer();
      _ms.closeVideoProducer();
      _isScreenSharing = false;
      notifyListeners();
    }
    final cam = await Permission.camera.request();
    if (!cam.isGranted) {
      _isCameraEnabled = false;
      notifyListeners();
      return;
    }
    try {
      final stream = await navigator.mediaDevices.getUserMedia({
        'video': {
          'width': {'ideal': 640},
          'height': {'ideal': 480},
          'frameRate': {'ideal': 15},
        },
      });
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      renderer.srcObject = stream;
      _attachOnEndedHandlers(stream, () {
        _stopRenderer();
        _ms.closeVideoProducer();
        _isCameraEnabled = false;
        notifyListeners();
      });
      _videoRenderer = renderer;
      _isCameraEnabled = true;
      notifyListeners();
      if (activeChannelId != null) {
        final track = stream.getVideoTracks().firstOrNull;
        if (track != null) {
          await _ms.createVideoProducer(activeChannelId, track, stream);
        }
      }
    } catch (_) {
      _isCameraEnabled = false;
      notifyListeners();
    }
  }

  Future<void> toggleScreenShare(String? activeChannelId) async {
    if (_isScreenSharing) {
      await _stopNativeScreenShare();
      _stopRenderer();
      _ms.closeVideoProducer();
      _isScreenSharing = false;
      notifyListeners();
      return;
    }
    if (_isCameraEnabled) {
      _stopRenderer();
      _ms.closeVideoProducer();
      _isCameraEnabled = false;
      notifyListeners();
    }
    try {
      try {
        await _screenShareChannel.invokeMethod<void>('start');
      } on PlatformException catch (_) {}
      final stream = await navigator.mediaDevices.getDisplayMedia({
        'video': {
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
          'frameRate': {'ideal': 15},
        },
        'audio': false,
      });
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      renderer.srcObject = stream;
      _attachOnEndedHandlers(stream, () {
        _stopRenderer();
        _ms.closeVideoProducer();
        _isScreenSharing = false;
        _screenShareChannel.invokeMethod<void>('stop').catchError((_) {});
        notifyListeners();
      });
      _videoRenderer = renderer;
      _isScreenSharing = true;
      notifyListeners();
      if (activeChannelId != null) {
        final track = stream.getVideoTracks().firstOrNull;
        if (track != null) {
          await _ms.createVideoProducer(activeChannelId, track, stream);
        }
      }
    } catch (_) {
      await _stopNativeScreenShare();
      _isScreenSharing = false;
      notifyListeners();
    }
  }

  void _attachOnEndedHandlers(MediaStream stream, void Function() onEnded) {
    for (final t in stream.getVideoTracks()) {
      t.onEnded = () => onEnded();
    }
  }

  Future<void> setRemoteVideoStream(MediaStream? stream) async {
    if (stream == null) {
      await _disposeRemoteRenderer();
      notifyListeners();
      return;
    }
    if (_remoteVideoRenderer == null) {
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      _remoteVideoRenderer = renderer;
    }
    _remoteVideoRenderer!.srcObject = stream;
    notifyListeners();
  }

  Future<void> _disposeRemoteRenderer() async {
    final r = _remoteVideoRenderer;
    if (r == null) return;
    r.srcObject = null;
    unawaited(r.dispose());
    _remoteVideoRenderer = null;
  }

  void _stopRenderer() {
    final r = _videoRenderer;
    if (r == null) return;
    final stream = r.srcObject;
    if (stream != null) {
      stream.getTracks().forEach((t) {
        t.onEnded = null;
        t.stop();
      });
      stream.dispose();
    }
    r.srcObject = null;
    unawaited(r.dispose());
    _videoRenderer = null;
  }

  Future<void> disposeRenderer() async {
    _stopRenderer();
    await _stopNativeScreenShare();
  }

  void reset() {
    _isCameraEnabled = false;
    _isScreenSharing = false;
  }

  @override
  void dispose() {
    _stopRenderer();
    _stopNativeScreenShare();
    super.dispose();
  }
}
