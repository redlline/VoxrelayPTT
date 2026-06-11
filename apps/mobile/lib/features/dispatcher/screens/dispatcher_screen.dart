import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../core/providers/sos_provider.dart';
import '../../../core/services/api_service.dart';
import '../../../shared/app_drawer.dart';
import '../../../shared/pulsating_dot.dart';

class DispatcherScreen extends StatefulWidget {
  const DispatcherScreen({super.key});

  @override
  State<DispatcherScreen> createState() => _DispatcherScreenState();
}

class _DispatcherScreenState extends State<DispatcherScreen> {
  final Map<String, bool> _recordingChannels = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final cp = context.read<ChannelProvider>();
      final api = context.read<ApiService>();
      final sos = context.read<SosProvider>();
      await cp.loadChannels();
      if (!mounted) return;
      for (final ch in cp.myChannels) {
        try {
          final active = await api.isChannelRecording(ch.id);
          if (mounted) setState(() => _recordingChannels[ch.id] = active);
        } catch (_) {}
      }
      if (!mounted) return;
      await sos.loadActiveAlerts();
    });
  }

  Future<void> _toggleRecording(String channelId, String channelName) async {
    final api = context.read<ApiService>();
    final isRecording = _recordingChannels[channelId] ?? false;
    try {
      if (isRecording) {
        await api.stopChannelRecording(channelId);
        if (mounted) {
          setState(() => _recordingChannels[channelId] = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Recording stopped for $channelName'), backgroundColor: AppTheme.textDim),
          );
        }
      } else {
        await api.startChannelRecording(channelId);
        if (mounted) {
          setState(() => _recordingChannels[channelId] = true);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Recording started for $channelName'), backgroundColor: AppTheme.success),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Recording action failed'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cp = context.watch<ChannelProvider>();
    final sos = context.watch<SosProvider>();
    final activeChannels = cp.myChannels;

    return Scaffold(
      appBar: AppBar(title: const Text('DISPATCHER')),
      drawer: const AppDrawer(),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (sos.activeAlerts.isNotEmpty) ...[
            const Text('EMERGENCY', style: TextStyle(color: AppTheme.danger, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4)),
            const SizedBox(height: 8),
            ...sos.activeAlerts.map((alert) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.danger.withOpacity(0.15), AppTheme.danger.withOpacity(0.05)],
                ),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const PulsatingDot(color: AppTheme.danger),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(alert.userName ?? 'Unknown', style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w700)),
                        if (alert.message != null)
                          Text(alert.message!, style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () => sos.resolveSos(alert.id),
                    style: TextButton.styleFrom(backgroundColor: AppTheme.danger.withOpacity(0.2)),
                    child: const Text('RESOLVE', style: TextStyle(color: AppTheme.danger, fontSize: 9, fontWeight: FontWeight.w900)),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 16),
          ],
          const Text('ACTIVE CHANNELS', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4)),
          const SizedBox(height: 8),
          if (activeChannels.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: Text('No active channels', style: TextStyle(color: AppTheme.textDim, fontSize: 13))),
            )
          else
            ...activeChannels.map((c) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.surfaceLight,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (c.activeSpeaker != null)
                        const PulsatingDot(color: AppTheme.success, size: 8),
                      if (c.activeSpeaker != null) const SizedBox(width: 8),
                      Text(c.name, style: const TextStyle(color: AppTheme.text, fontSize: 14, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      Text('${c.memberCount} members', style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                    ],
                  ),
                  if (c.activeSpeaker != null) ...[
                    const SizedBox(height: 6),
                    Text('Speaker: ${c.activeSpeaker}', style: const TextStyle(color: AppTheme.success, fontSize: 11)),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (_recordingChannels[c.id] == true)
                        const Row(
                          children: [
                            PulsatingDot(color: AppTheme.danger, size: 6),
                            SizedBox(width: 4),
                            Text('REC', style: TextStyle(color: AppTheme.danger, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 2)),
                          ],
                        ),
                      const Spacer(),
                      _RecButton(
                        isRecording: _recordingChannels[c.id] ?? false,
                        onPressed: () => _toggleRecording(c.id, c.name),
                      ),
                    ],
                  ),
                ],
              ),
            )),
        ],
      ),
    );
  }
}

class _RecButton extends StatelessWidget {
  final bool isRecording;
  final VoidCallback onPressed;

  const _RecButton({required this.isRecording, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isRecording ? AppTheme.danger.withOpacity(0.2) : AppTheme.surfaceLighter,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: isRecording ? AppTheme.danger : AppTheme.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6, height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isRecording ? AppTheme.danger : AppTheme.textDim,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              isRecording ? 'STOP REC' : 'START REC',
              style: TextStyle(
                color: isRecording ? AppTheme.danger : AppTheme.textMuted,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
