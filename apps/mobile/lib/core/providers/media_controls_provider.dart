import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:flutter/foundation.dart';
import '../services/mediasoup_service.dart';

class MediaControlsProvider extends ChangeNotifier {
  final MediasoupService _ms;

  bool _isMicEnabled = true;
  bool _isSpeakerEnabled = true;
  bool _isCameraEnabled = false;
  bool _isScreenSharing = false;
  bool _isMuted = false;
  RTCVideoRenderer? _videoRenderer;

  MediaControlsProvider(this._ms);

  bool get isMicEnabled => _isMicEnabled;
  bool get isSpeakerEnabled => _isSpeakerEnabled;
  bool get isCameraEnabled => _isCameraEnabled;
  bool get isScreenSharing => _isScreenSharing;
  bool get isMuted => _isMuted;
  RTCVideoRenderer? get videoRenderer => _videoRenderer;

  void setMuted(bool muted) {
    _isMuted = muted;
    notifyListeners();
  }

  void toggleMic() {
    _isMicEnabled = !_isMicEnabled;
    if (!_isMicEnabled) {
      _ms.pauseProducer();
      final stream = _ms.localStream;
      stream?.getAudioTracks().forEach((t) => t.enabled = false);
    } else {
      _ms.resumeProducer();
      final stream = _ms.localStream;
      stream?.getAudioTracks().forEach((t) => t.enabled = true);
    }
    notifyListeners();
  }

  void toggleSpeaker() {
    _isSpeakerEnabled = !_isSpeakerEnabled;
    notifyListeners();
  }

  void setVideoRenderer(RTCVideoRenderer? r) {
    _videoRenderer = r;
  }

  Future<void> disposeRenderer() async {
    final r = _videoRenderer;
    if (r != null) {
      final stream = r.srcObject;
      if (stream != null) {
        stream.getTracks().forEach((t) => t.stop());
        stream.dispose();
      }
      r.srcObject = null;
      await r.dispose();
      _videoRenderer = null;
    }
  }

  void reset() {
    _isCameraEnabled = false;
    _isScreenSharing = false;
    _isMuted = false;
  }
}
