import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/theme.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/audio_service.dart';
import '../../../shared/app_drawer.dart';

class RecordingsScreen extends StatefulWidget {
  const RecordingsScreen({super.key});

  @override
  State<RecordingsScreen> createState() => _RecordingsScreenState();
}

class _RecordingsScreenState extends State<RecordingsScreen> {
  List<_RecordingItem> _recordings = [];
  bool _isLoading = true;
  String? _playingId;
  String? _busyId;
  StreamSubscription? _audioCompleteSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _audioCompleteSub = context.read<AudioService>().onComplete.listen((_) {
        if (mounted) setState(() => _playingId = null);
      });
      await context.read<ChannelProvider>().loadChannels();
      await _loadRecordings();
    });
  }

  @override
  void dispose() {
    _audioCompleteSub?.cancel();
    super.dispose();
  }

  Future<void> _loadRecordings() async {
    setState(() => _isLoading = true);
    final api = context.read<ApiService>();
    final channels = context.read<ChannelProvider>().myChannels;
    final items = <_RecordingItem>[];
    for (final channel in channels) {
      try {
        final sessions = await api.getRecordings(channel.id);
        for (final s in sessions) {
          items.add(_RecordingItem(channelId: channel.id, channelName: channel.name, session: s));
        }
      } catch (_) {}
    }
    items.sort((a, b) {
      final at = a.session['started_at']?.toString() ?? '';
      final bt = b.session['started_at']?.toString() ?? '';
      return bt.compareTo(at);
    });
    if (mounted) setState(() { _recordings = items; _isLoading = false; });
  }

  Future<File?> _download(_RecordingItem item) async {
    final filePath = item.session['file_path'] as String?;
    if (filePath == null) return null;
    final api = context.read<ApiService>();
    final bytes = await api.getRecordingAudio(filePath);
    final ext = filePath.contains('.') ? filePath.split('.').last : 'ogg';
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/recording_${item.session['id']}.$ext');
    await file.writeAsBytes(bytes);
    return file;
  }

  Future<void> _togglePlay(_RecordingItem item) async {
    final id = item.session['id']?.toString();
    if (id == null) return;
    final audio = context.read<AudioService>();

    if (_playingId == id) {
      await audio.stopPlayback();
      if (mounted) setState(() => _playingId = null);
      return;
    }

    setState(() => _busyId = id);
    try {
      final file = await _download(item);
      if (file == null) {
        if (mounted) setState(() => _busyId = null);
        return;
      }
      await audio.playAudio(file.path);
      if (mounted) setState(() { _playingId = id; _busyId = null; });
    } catch (_) {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _shareRecording(_RecordingItem item) async {
    final id = item.session['id']?.toString();
    if (id == null) return;
    setState(() => _busyId = id);
    try {
      final file = await _download(item);
      if (file != null) {
        await Share.shareXFiles([XFile(file.path)], text: 'PTT Recording');
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('RECORDINGS')),
      drawer: const AppDrawer(),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : _recordings.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.folder_off, color: AppTheme.textDim, size: 48),
                      SizedBox(height: 16),
                      Text('No recordings', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                      SizedBox(height: 4),
                      Text('Channel recordings will appear here', style: TextStyle(color: AppTheme.textDim, fontSize: 11)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadRecordings,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _recordings.length,
                    itemBuilder: (_, i) {
                      final item = _recordings[i];
                      final session = item.session;
                      final id = session['id']?.toString();
                      final isPlaying = id != null && _playingId == id;
                      final isBusy = id != null && _busyId == id;
                      final duration = _formatDuration(session['duration_ms']);
                      final started = _formatDate(session['started_at']?.toString());
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: AppTheme.surfaceLight,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                          leading: Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.audio_file, color: AppTheme.primary, size: 20),
                          ),
                          title: Text(item.channelName, style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w600)),
                          subtitle: Text('$started • $duration', style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (isBusy)
                                const SizedBox(
                                  width: 36, height: 36,
                                  child: Padding(
                                    padding: EdgeInsets.all(8),
                                    child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                                  ),
                                )
                              else
                                IconButton(
                                  icon: Icon(isPlaying ? Icons.stop_circle : Icons.play_arrow, color: AppTheme.success, size: 20),
                                  onPressed: () => _togglePlay(item),
                                ),
                              IconButton(
                                icon: const Icon(Icons.share, color: AppTheme.primary, size: 18),
                                onPressed: isBusy ? null : () => _shareRecording(item),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  String _formatDuration(dynamic durationMs) {
    final ms = durationMs is int ? durationMs : (durationMs is num ? durationMs.toInt() : 0);
    final totalSeconds = ms ~/ 1000;
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String _formatDate(String? iso) {
    if (iso == null) return 'Unknown';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final local = dt.toLocal();
    return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year % 100} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}

class _RecordingItem {
  final String channelId;
  final String channelName;
  final Map<String, dynamic> session;
  const _RecordingItem({required this.channelId, required this.channelName, required this.session});
}
