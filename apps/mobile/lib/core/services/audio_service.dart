import 'dart:async';
import 'dart:io';
import 'package:audioplayers/audioplayers.dart';
import 'package:path_provider/path_provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

class AudioService {
  final AudioPlayer _player = AudioPlayer();
  bool _isPlaying = false;
  bool get isPlaying => _isPlaying;
  StreamSubscription? _playerStateSub;

  AudioService() {
    _playerStateSub = _player.onPlayerStateChanged.listen((state) {
      _isPlaying = state == PlayerState.playing;
      if (_isPlaying) {
        WakelockPlus.enable();
      } else {
        WakelockPlus.disable();
      }
    });
  }

  Future<void> enableWakelock() => WakelockPlus.enable();
  Future<void> disableWakelock() => WakelockPlus.disable();

  Stream<void> get onComplete => _player.onPlayerComplete;

  Future<String> get _recordingsDir async {
    final dir = await getApplicationDocumentsDirectory();
    final recDir = Directory('${dir.path}/recordings');
    if (!await recDir.exists()) {
      await recDir.create(recursive: true);
    }
    return recDir.path;
  }

  Future<String> saveAudioData(List<int> audioData, String fileName) async {
    final dir = await _recordingsDir;
    final file = File('$dir/$fileName');
    await file.writeAsBytes(audioData);
    return file.path;
  }

  Future<List<int>> loadAudioData(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) throw Exception('File not found: $filePath');
    return await file.readAsBytes();
  }

  Future<void> playAudio(String filePath) async {
    await _player.stop();
    await _player.play(DeviceFileSource(filePath));
    _isPlaying = true;
  }

  Future<void> stopPlayback() async {
    await _player.stop();
    _isPlaying = false;
  }

  Future<List<String>> getRecordings() async {
    final dir = await _recordingsDir;
    final dirObj = Directory(dir);
    if (!await dirObj.exists()) return [];
    return dirObj.listSync()
        .whereType<File>()
        .map((f) => f.path)
        .where((p) => p.endsWith('.wav') || p.endsWith('.mp3') || p.endsWith('.ogg'))
        .toList();
  }

  Future<bool> deleteRecording(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) {
        await file.delete();
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  void dispose() {
    _playerStateSub?.cancel();
    _player.dispose();
  }
}
