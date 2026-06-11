import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/theme.dart';
import '../../../core/services/audio_service.dart';
import '../../../shared/app_drawer.dart';

class RecordingsScreen extends StatefulWidget {
  const RecordingsScreen({super.key});

  @override
  State<RecordingsScreen> createState() => _RecordingsScreenState();
}

class _RecordingsScreenState extends State<RecordingsScreen> {
  List<_RecordingInfo> _recordings = [];
  bool _isLoading = true;

  AudioService get _audioService => context.read<AudioService>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRecordings());
  }

  Future<void> _loadRecordings() async {
    setState(() => _isLoading = true);
    final paths = await _audioService.getRecordings();
    final infos = <_RecordingInfo>[];
    for (final p in paths) {
      int size = 0;
      try {
        size = await File(p).length();
      } catch (_) {}
      infos.add(_RecordingInfo(path: p, size: size));
    }
    if (mounted) setState(() { _recordings = infos; _isLoading = false; });
  }

  Future<void> _deleteRecording(String path) async {
    final deleted = await _audioService.deleteRecording(path);
    if (deleted) _loadRecordings();
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
                      Text('Recordings will appear here', style: TextStyle(color: AppTheme.textDim, fontSize: 11)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _recordings.length,
                  itemBuilder: (_, i) {
                    final rec = _recordings[i];
                    final name = rec.path.split('\\').last.split('/').last;
                    final size = _formatSize(rec.size);
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
                        title: Text(name, style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w600)),
                        subtitle: Text(size, style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.play_arrow, color: AppTheme.success, size: 20),
                              onPressed: () async {
                                await _audioService.playAudio(rec.path);
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.share, color: AppTheme.primary, size: 18),
                              onPressed: () => Share.shareXFiles([XFile(rec.path)], text: 'PTT Recording'),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: AppTheme.danger, size: 18),
                              onPressed: () => _deleteRecording(rec.path),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class _RecordingInfo {
  final String path;
  final int size;
  const _RecordingInfo({required this.path, required this.size});
}
