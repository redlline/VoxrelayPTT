import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../shared/app_drawer.dart';
import '../../../shared/pulsating_dot.dart';

class ChannelsScreen extends StatefulWidget {
  const ChannelsScreen({super.key});

  @override
  State<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends State<ChannelsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChannelProvider>().loadChannels();
    });
  }

  @override
  Widget build(BuildContext context) {
    final cp = context.watch<ChannelProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('CHANNELS')),
      drawer: const AppDrawer(),
      body: cp.isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'JOINED CHANNELS',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4),
                ),
                const SizedBox(height: 8),
                if (cp.myChannels.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text('No channels joined yet', style: TextStyle(color: AppTheme.textDim, fontSize: 13)),
                  )
                else
                  ...cp.myChannels.map((c) => _ChannelCard(
                    channel: c,
                    isJoined: true,
                    onToggle: () => cp.leaveChannel(c.id),
                    onOpen: () => Navigator.pushNamed(context, '/ptt', arguments: c.id),
                  )),
                const SizedBox(height: 24),
                const Text(
                  'AVAILABLE CHANNELS',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4),
                ),
                const SizedBox(height: 8),
                ...cp.channels.where((c) => !c.isJoined).map((c) => _ChannelCard(
                  channel: c,
                  isJoined: false,
                  onToggle: () => cp.joinChannel(c.id),
                )),
              ],
            ),
    );
  }
}

class _ChannelCard extends StatelessWidget {
  final dynamic channel;
  final bool isJoined;
  final VoidCallback onToggle;
  final VoidCallback? onOpen;

  const _ChannelCard({required this.channel, required this.isJoined, required this.onToggle, this.onOpen});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isJoined ? AppTheme.primary.withOpacity(0.3) : AppTheme.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: isJoined ? AppTheme.primary.withOpacity(0.15) : AppTheme.surfaceLighter,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Center(
            child: channel.isDirectCall
                ? const Icon(Icons.call, color: AppTheme.success, size: 18)
                : Icon(isJoined ? Icons.volume_up : Icons.volume_mute, color: isJoined ? AppTheme.primary : AppTheme.textDim, size: 18),
          ),
        ),
        title: Text(channel.name, style: const TextStyle(color: AppTheme.text, fontSize: 14, fontWeight: FontWeight.w700)),
        subtitle: Text(
          '${channel.memberCount} members${channel.activeSpeaker != null ? ' • ${channel.activeSpeaker} speaking' : ''}',
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (channel.activeSpeaker != null)
              const PulsatingDot(color: AppTheme.success, size: 8),
            const SizedBox(width: 8),
            if (isJoined && onOpen != null)
              GestureDetector(
                onTap: onOpen,
                child: const Icon(Icons.mic, size: 20, color: AppTheme.primary),
              ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: onToggle,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                isJoined ? 'LEAVE' : 'JOIN',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                  color: isJoined ? AppTheme.danger : AppTheme.success,
                ),
              ),
            ),
          ],
        ),
        onTap: isJoined && onOpen != null ? onOpen : null,
      ),
    );
  }
}
