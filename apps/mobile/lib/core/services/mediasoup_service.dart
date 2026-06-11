import 'dart:async';
import 'package:mediasoup_client_flutter/mediasoup_client_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'websocket_service.dart';
import 'api_service.dart';

class MediasoupService {
  final WsService _ws;
  final ApiService _api;

  Device? _device;
  Transport? _sendTransport;
  Transport? _recvTransport;
  String? _sendTransportChannelId;
  String? _recvTransportChannelId;
  MediaStream? _localStream;
  bool _hasMicPermission = false;

  Future<Transport>? _sendTransportFuture;

  final Map<String, Producer> _producers = {};
  Producer? _videoProducer;
  final Map<String, Consumer> _consumers = {};
  int _cancelToken = 0;

  StreamController<double>? _audioLevelController;
  Stream<double>? audioLevelStream;
  StreamController<String?>? _activeSpeakerController;
  Stream<String?>? activeSpeakerStream;
  final Map<String, MediaStream> _remoteVideoStreams = {};
  final StreamController<Map<String, MediaStream>> _remoteVideoController =
      StreamController<Map<String, MediaStream>>.broadcast();
  Stream<Map<String, MediaStream>> get remoteVideoStream => _remoteVideoController.stream;
  Map<String, MediaStream> get remoteVideoStreams => Map.unmodifiable(_remoteVideoStreams);

  MediasoupService(this._ws, this._api);

  bool get hasMicPermission => _hasMicPermission;
  Device? get device => _device;
  MediaStream? get localStream => _localStream;
  Producer? get audioProducer {
    for (final p in _producers.values) {
      if (p.kind == 'audio') return p;
    }
    return null;
  }

  Future<bool> requestPermission() async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      _hasMicPermission = false;
      return false;
    }

    if (_localStream != null) {
      _hasMicPermission = true;
      return true;
    }

    try {
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });
      _localStream = stream;
      _hasMicPermission = true;
      return true;
    } catch (e) {
      _hasMicPermission = false;
      return false;
    }
  }

  Future<Device> initDevice(String channelId) async {
    if (_device?.loaded == true) return _device!;

    _device = Device();
    final rtpCapabilities = await _fetchRtpCapabilities(channelId);
    await _device!.load(routerRtpCapabilities: rtpCapabilities);
    return _device!;
  }

  Future<RtpCapabilities> _fetchRtpCapabilities(String channelId) async {
    final data = await _api.getRtpCapabilities(channelId);
    return RtpCapabilities.fromMap(data);
  }

  void prepareSendTransport(String channelId) {
    if (_sendTransport != null && _sendTransportChannelId == channelId) return;
    _sendTransportFuture ??= _buildSendTransport(channelId).then((t) {
      _sendTransportFuture = null;
      return t;
    }).catchError((Object e) {
      _sendTransportFuture = null;
      throw e;
    });
  }

  Future<Transport> createSendTransport(String channelId) async {
    if (_sendTransport != null && _sendTransportChannelId == channelId) {
      return _sendTransport!;
    }
    if (_sendTransportFuture != null) {
      final transport = await _sendTransportFuture!;
      _sendTransportFuture = null;
      return transport;
    }
    return await _buildSendTransport(channelId);
  }

  Future<Transport> _buildSendTransport(String channelId) async {
    if (_sendTransport != null && _sendTransportChannelId != channelId) {
      await _sendTransport!.close();
      _sendTransport = null;
      _sendTransportChannelId = null;
    }

    final dev = await initDevice(channelId);
    final transportOptions = await _requestTransport(channelId, 'send');

    _sendTransport = dev.createSendTransport(
      id: transportOptions['id'] as String,
      iceParameters: IceParameters.fromMap(Map<String, dynamic>.from(transportOptions['iceParameters'] as Map)),
      iceCandidates: (transportOptions['iceCandidates'] as List? ?? const [])
          .map((c) => IceCandidate.fromMap(Map<String, dynamic>.from(c as Map)))
          .toList(),
      dtlsParameters: DtlsParameters.fromMap(Map<String, dynamic>.from(transportOptions['dtlsParameters'] as Map)),
      producerCallback: (Producer producer) {
        _producers[producer.id] = producer;
        producer.on('transportclose', () {
          _producers.remove(producer.id);
        });
      },
    );

    _sendTransportChannelId = channelId;

    _sendTransport!.on('connect', (Map<String, dynamic> data) {
      final dtls = data['dtlsParameters'] as DtlsParameters;
      final callback = data['callback'] as void Function(Object?);
      final errback = data['errback'] as void Function(Object, StackTrace)?;
      _ws.sendTransportConnect(channelId, _sendTransport!.id, dtls.toMap());
      _waitForEvent('transport.connected', (_) {
        callback(null);
        return true;
      }, timeoutMs: 8000, onTimeout: () {
        errback?.call('transport.connect timeout', StackTrace.current);
      });
    });

    _sendTransport!.on('produce', (Map<String, dynamic> data) {
      final kind = data['kind'] as String;
      final rtpParams = data['rtpParameters'] as RtpParameters;
      final callback = data['callback'] as void Function(Object?);
      final errback = data['errback'] as void Function(Object, StackTrace)?;
      _ws.sendProduce(channelId, _sendTransport!.id, kind, rtpParams.toMap());
      _waitForEvent('produced', (WsEvent msg) {
        callback(msg.data['producerId'] as String);
        return true;
      }, timeoutMs: 8000, onTimeout: () {
        errback?.call('transport.produce timeout', StackTrace.current);
      });
    });

    _sendTransport!.on('connectionstatechange', (Map<String, dynamic> data) {
      final state = data['connectionState'] as String? ?? data.toString();
      if (state == 'failed') {
        try { _sendTransport!.close(); } catch (_) {}
        _sendTransport = null;
        _sendTransportChannelId = null;
      }
    });

    await Future.delayed(Duration.zero);

    return _sendTransport!;
  }

  Future<Transport> createRecvTransport(String channelId) async {
    if (_recvTransport != null && _recvTransportChannelId == channelId) {
      return _recvTransport!;
    }
    if (_recvTransport != null && _recvTransportChannelId != channelId) {
      await _recvTransport!.close();
      _recvTransport = null;
      _recvTransportChannelId = null;
    }

    final dev = await initDevice(channelId);
    final transportOptions = await _requestTransport(channelId, 'recv');

    _recvTransport = dev.createRecvTransport(
      id: transportOptions['id'] as String,
      iceParameters: IceParameters.fromMap(Map<String, dynamic>.from(transportOptions['iceParameters'] as Map)),
      iceCandidates: (transportOptions['iceCandidates'] as List? ?? const [])
          .map((c) => IceCandidate.fromMap(Map<String, dynamic>.from(c as Map)))
          .toList(),
      dtlsParameters: DtlsParameters.fromMap(Map<String, dynamic>.from(transportOptions['dtlsParameters'] as Map)),
      consumerCallback: (Consumer consumer, Function? accept) {
        _consumers[consumer.producerId] = consumer;
        _ws.sendConsumerResume(consumer.id);
        _attachRemoteVideoStream(consumer);
        consumer.on('trackended', (_) {
          consumer.close();
          _consumers.remove(consumer.producerId);
          if (_remoteVideoStreams.remove(consumer.producerId) != null) {
            _remoteVideoController.add(Map.unmodifiable(_remoteVideoStreams));
          }
        });
      },
    );

    _recvTransportChannelId = channelId;

    _recvTransport!.on('connect', (Map<String, dynamic> data) {
      final dtls = data['dtlsParameters'] as DtlsParameters;
      final callback = data['callback'] as void Function(Object?);
      final errback = data['errback'] as void Function(Object, StackTrace)?;
      _ws.sendTransportConnect(channelId, _recvTransport!.id, dtls.toMap());
      _waitForEvent('transport.connected', (_) {
        callback(null);
        return true;
      }, timeoutMs: 8000, onTimeout: () {
        errback?.call('transport.connect timeout', StackTrace.current);
      });
    });

    _recvTransport!.on('connectionstatechange', (Map<String, dynamic> data) {
      final state = data['connectionState'] as String? ?? data.toString();
      if (state == 'failed') {
        try { _recvTransport!.close(); } catch (_) {}
        _recvTransport = null;
        _recvTransportChannelId = null;
      }
    });

    return _recvTransport!;
  }

  Future<Map<String, dynamic>> _requestTransport(String channelId, String direction) async {
    final completer = Completer<Map<String, dynamic>>();
    Timer? timeout;
    StreamSubscription<WsEvent>? sub;

    sub = _ws.events.listen((event) {
      if (event.type == 'transport.created' &&
          event.data['channelId'] == channelId &&
          event.data['direction'] == direction) {
        timeout?.cancel();
        if (!completer.isCompleted) {
          completer.complete({
            'id': event.data['transportId'],
            'iceParameters': event.data['iceParameters'],
            'iceCandidates': event.data['iceCandidates'],
            'dtlsParameters': event.data['dtlsParameters'],
          });
        }
      }
    });

    timeout = Timer(const Duration(seconds: 10), () {
      if (!completer.isCompleted) {
        completer.completeError(Exception('Transport creation timeout'));
      }
    });

    try {
      _ws.sendTransportCreate(channelId, direction);
      return await completer.future;
    } finally {
      timeout.cancel();
      await sub.cancel();
    }
  }

  Future<Producer?> createAudioProducer(String channelId, MediaStreamTrack track) async {
    final existing = audioProducer;
    if (existing != null) {
      try { existing.resume(); } catch (_) {}
      return existing;
    }
    final transport = await createSendTransport(channelId);
    if (_localStream == null) {
      return null;
    }
    final completer = Completer<Producer?>();
    final oldCallback = transport.producerCallback;
    transport.producerCallback = (Producer producer) {
      oldCallback?.call(producer);
      if (!completer.isCompleted) completer.complete(producer);
    };
    try {
      transport.produce(
        track: track,
        stopTracks: false,
        stream: _localStream!,
        encodings: [
          RtpEncodingParameters(maxBitrate: 48000),
        ],
        codecOptions: ProducerCodecOptions(
          opusStereo: 0,
          opusFec: 1,
          opusDtx: 1,
          opusMaxPlaybackRate: 48000,
        ),
        source: 'user',
      );
      return await completer.future.timeout(const Duration(seconds: 10));
    } catch (e) {
      return null;
    }
  }

  Future<Producer?> createVideoProducer(String channelId, MediaStreamTrack track, MediaStream stream) async {
    final transport = await createSendTransport(channelId);
    final completer = Completer<Producer?>();
    final oldCallback = transport.producerCallback;
    transport.producerCallback = (Producer producer) {
      oldCallback?.call(producer);
      if (producer.track.kind == 'video') {
        _videoProducer = producer;
        if (!completer.isCompleted) completer.complete(producer);
      }
    };
    try {
      transport.produce(
        track: track,
        stopTracks: false,
        stream: stream,
        encodings: [
          RtpEncodingParameters(maxBitrate: 500000, scaleResolutionDownBy: 1),
        ],
        source: 'user',
      );
      return await completer.future.timeout(const Duration(seconds: 10));
    } catch (e) {
      return null;
    }
  }

  void closeVideoProducer() {
    final p = _videoProducer;
    if (p != null) {
      try { p.close(); } catch (_) {}
      _videoProducer = null;
    }
  }

  Future<Consumer?> createConsumer(String channelId, String producerId) async {
    if (_consumers.containsKey(producerId)) return _consumers[producerId];
    final transport = await createRecvTransport(channelId);
    try {
      final dev = await initDevice(channelId);
      final completer = Completer<Consumer?>();
      Timer? timeout;
      StreamSubscription<WsEvent>? sub;

      sub = _ws.events.listen((event) {
        if (event.type != 'consumed') return;
        if (event.data['producerId'] != producerId) return;
        final evChannelId = event.data['channelId'];
        if (evChannelId != null && evChannelId != channelId) return;
        timeout?.cancel();
        final consumerId = event.data['consumerId'] as String;
        final kind = event.data['kind'] as String;
        final rtpParams = RtpParameters.fromMap(Map<String, dynamic>.from(event.data['rtpParameters'] as Map));

        transport.consume(
          id: consumerId,
          producerId: producerId,
          peerId: event.data['producerPeerId'] as String? ?? '',
          kind: kind == 'audio' ? RTCRtpMediaType.RTCRtpMediaTypeAudio : RTCRtpMediaType.RTCRtpMediaTypeVideo,
          rtpParameters: rtpParams,
        );

        if (!completer.isCompleted) {
          completer.complete(_consumers[producerId]);
        }
      });

      timeout = Timer(const Duration(seconds: 10), () {
        if (!completer.isCompleted) completer.complete(null);
      });

      _ws.sendConsume(channelId, transport.id, producerId, dev.rtpCapabilities.toMap());
      final result = await completer.future;
      timeout.cancel();
      await sub.cancel();
      return result;
    } catch (e) {
      return null;
    }
  }

  void _waitForEvent(
    String type,
    bool Function(WsEvent) handler, {
    int timeoutMs = 8000,
    void Function()? onTimeout,
    String? channelId,
    String? transportId,
  }) {
    StreamSubscription<WsEvent>? sub;
    Timer? timer;

    sub = _ws.events.listen((event) {
      if (event.type != type) return;
      if (channelId != null && event.data['channelId'] != channelId) return;
      if (transportId != null && event.data['transportId'] != transportId) return;
      final done = handler(event);
      if (done) {
        sub?.cancel();
        timer?.cancel();
      }
    });

    timer = Timer(Duration(milliseconds: timeoutMs), () {
      sub?.cancel();
      onTimeout?.call();
    });
  }

  void pauseProducer() {
    for (final p in _producers.values) {
      if (p.kind != 'audio') continue;
      try { p.pause(); } catch (_) {}
    }
  }

  void resumeProducer() {
    for (final p in _producers.values) {
      if (p.kind != 'audio') continue;
      try { p.resume(); } catch (_) {}
    }
  }

  void closeProducers() {
    for (final p in _producers.values) {
      try { p.close(); } catch (_) {}
    }
    _producers.clear();
    closeVideoProducer();
  }

  void removeConsumer(String producerId) {
    final c = _consumers.remove(producerId);
    if (c != null) {
      try { c.close(); } catch (_) {}
    }
    if (_remoteVideoStreams.remove(producerId) != null) {
      _remoteVideoController.add(Map.unmodifiable(_remoteVideoStreams));
    }
  }

  Future<void> _attachRemoteVideoStream(Consumer consumer) async {
    final track = consumer.track;
    if (track.kind != 'video') return;
    try {
      final stream = await createLocalMediaStream('remote-${consumer.producerId}');
      await stream.addTrack(track);
      _remoteVideoStreams[consumer.producerId] = stream;
      _remoteVideoController.add(Map.unmodifiable(_remoteVideoStreams));
    } catch (_) {}
  }

  void closeConsumers() {
    for (final c in _consumers.values) {
      try { c.close(); } catch (_) {}
    }
    _consumers.clear();
    if (_remoteVideoStreams.isNotEmpty) {
      _remoteVideoStreams.clear();
      _remoteVideoController.add(const {});
    }
  }

  void closeTransports() {
    closeProducers();
    closeConsumers();
    try { _sendTransport?.close(); } catch (_) {}
    try { _recvTransport?.close(); } catch (_) {}
    _sendTransport = null;
    _recvTransport = null;
    _sendTransportChannelId = null;
    _recvTransportChannelId = null;
    _sendTransportFuture = null;
  }

  void stopMic() {
    if (_localStream != null) {
      _localStream!.getTracks().forEach((t) => t.stop());
      _localStream!.dispose();
      _localStream = null;
    }
  }

  void dispose() {
    closeTransports();
    stopMic();
    _audioLevelController?.close();
    _activeSpeakerController?.close();
    _remoteVideoController.close();
  }

  int get cancelToken => _cancelToken;
  int incrementCancelToken() => ++_cancelToken;
}
