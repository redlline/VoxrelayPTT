import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../core/providers/ptt_provider.dart';
import '../../../core/providers/media_controls_provider.dart';
import '../../../core/providers/video_source_provider.dart';
import '../../../core/services/api_service.dart';
import '../../../shared/app_drawer.dart';
import '../../../shared/ptt_button.dart';
import '../../../shared/speaking_wave.dart';
import '../../../shared/voice_activity_indicator.dart';

class PttScreen extends StatefulWidget {
  final String? channelId;
  const PttScreen({super.key, this.channelId});

  @override
  State<PttScreen> createState() => _PttScreenState();
}

class _PttScreenState extends State<PttScreen> {
  String? _selectedChannelId;
  bool _showRecordings = false;
  List<Map<String, dynamic>> _recordings = [];
  bool _recordingsLoading = false;

  @override
  void initState() {
    super.initState();
    _selectedChannelId = widget.channelId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChannelProvider>().loadChannels();
    });
  }

  @override
  Widget build(BuildContext context) {
    final cp = context.watch<ChannelProvider>();
    final ptt = context.watch<PttProvider>();
    final media = context.watch<MediaControlsProvider>();
    final video = context.watch<VideoSourceProvider>();
    final channel = _selectedChannelId != null
        ? cp.myChannels.where((c) => c.id == _selectedChannelId).firstOrNull
        : null;
    final isDirectCall = channel?.isDirectCall ?? false;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(channel?.name ?? 'PTT'),
        actions: [
          if (!isDirectCall) ...[
            _toolbarIcon(
              Icons.videocam,
              active: video.isCameraEnabled,
              activeColor: AppTheme.primary,
              onPressed: () => video.toggleCamera(ptt.activeChannelId),
            ),
            _toolbarIcon(
              Icons.screen_share,
              active: video.isScreenSharing,
              activeColor: AppTheme.success,
              onPressed: () => video.toggleScreenShare(ptt.activeChannelId),
            ),
          ],
          _toolbarIcon(
            Icons.mic,
            active: media.isMicEnabled,
            activeColor: AppTheme.success,
            inactiveColor: AppTheme.danger,
            onPressed: media.toggleMic,
          ),
          _toolbarIcon(
            Icons.volume_up,
            active: media.isSpeakerEnabled,
            activeColor: AppTheme.success,
            inactiveColor: AppTheme.danger,
            onPressed: media.toggleSpeaker,
          ),
          _toolbarIcon(
            Icons.history,
            active: _showRecordings,
            activeColor: AppTheme.primary,
            onPressed: () => _toggleRecordings(cp),
          ),
        ],
      ),
      drawer: const AppDrawer(),
      body: Column(
        children: [
          _channelSelector(cp, isDirectCall),
          const Divider(height: 1, color: AppTheme.border),
          Expanded(
            child: _selectedChannelId == null
                ? _noChannelView()
                : Row(
                    children: [
                      Expanded(flex: 3, child: _channelMainView(cp, ptt, media, video, channel, isDirectCall)),
                      if (_showRecordings) _recordingsPanel(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _toolbarIcon(IconData icon, {required bool active, required VoidCallback onPressed, Color? activeColor, Color? inactiveColor}) {
    return Container(
      margin: const EdgeInsets.only(right: 2),
      child: IconButton(
        icon: Icon(icon, size: 20),
        color: active ? activeColor ?? AppTheme.primary : inactiveColor ?? AppTheme.textDim,
        onPressed: onPressed,
      ),
    );
  }

  Widget _channelSelector(ChannelProvider cp, bool isDirectCall) {
    if (isDirectCall) return const SizedBox.shrink();
    if (_selectedChannelId == null) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('SELECT A CHANNEL', style: TextStyle(color: AppTheme.textDim, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 3)),
      );
    }
    return Container(
      height: 52,
      color: AppTheme.surface,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: cp.myChannels.length,
        itemBuilder: (context, index) {
          final c = cp.myChannels[index];
          final selected = c.id == _selectedChannelId;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _selectedChannelId = c.id;
                  _showRecordings = false;
                });
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: selected ? AppTheme.primary.withOpacity(0.15) : AppTheme.surfaceLight,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: selected ? AppTheme.primary : AppTheme.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (selected)
                      Container(
                        width: 6, height: 6,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: AppTheme.primary),
                      ),
                    Text(
                      c.name,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: selected ? AppTheme.primary : AppTheme.textMuted,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _noChannelView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.surfaceLight,
              border: Border.all(color: AppTheme.border),
            ),
            child: const Icon(Icons.mic, color: AppTheme.textDim, size: 36),
          ),
          const SizedBox(height: 24),
          const Text(
            'NO CHANNEL SELECTED',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 3),
          ),
          const SizedBox(height: 8),
          const Text(
            'Join a channel from the list above\nto start transmitting',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textDim, fontSize: 12, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _channelMainView(ChannelProvider cp, PttProvider ptt, MediaControlsProvider media, VideoSourceProvider video, dynamic channel, bool isDirectCall) {
    final members = cp.members;
    final speakerName = ptt.activeSpeakerName ?? (ptt.floorGranted ? 'YOU' : '---');
    final isAnyoneSpeaking = ptt.activeSpeakerId != null && !ptt.floorGranted;
    final isMuted = media.isMuted;

    return Column(
      children: [
        if (video.videoRenderer != null)
          Container(
            height: 200,
            color: Colors.black,
            child: RTCVideoView(
              video.videoRenderer!,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
            ),
          ),
        if (video.remoteVideoRenderer != null)
          Container(
            height: 200,
            color: Colors.black,
            margin: const EdgeInsets.only(top: 2),
            child: Stack(
              children: [
                RTCVideoView(
                  video.remoteVideoRenderer!,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    color: Colors.black54,
                    child: const Text(
                      'REMOTE',
                      style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (isMuted)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: AppTheme.danger.withOpacity(0.15),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.volume_off, color: AppTheme.danger, size: 14),
                SizedBox(width: 8),
                Text('MUTED BY ADMIN', style: TextStyle(color: AppTheme.danger, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
              ],
            ),
          ),
        if (ptt.floorQueuePosition > 0)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: AppTheme.warning.withOpacity(0.15),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.hourglass_bottom, color: AppTheme.warning, size: 14),
                const SizedBox(width: 8),
                Text(
                  'QUEUE POSITION: ${ptt.floorQueuePosition}',
                  style: const TextStyle(color: AppTheme.warning, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2),
                ),
              ],
            ),
          ),
        Expanded(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (isAnyoneSpeaking) ...[
                  Container(
                    width: 12, height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.success,
                      boxShadow: AppShadows.glow(AppTheme.glowGreen),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                SpeakingWave(
                  active: ptt.isSpeaking || isAnyoneSpeaking,
                  color: ptt.isSpeaking ? AppTheme.success : (isAnyoneSpeaking ? AppTheme.success : AppTheme.primary),
                ),
                const SizedBox(height: 12),
                Text(
                  speakerName,
                  style: TextStyle(
                    color: ptt.isSpeaking ? AppTheme.success : (isAnyoneSpeaking ? AppTheme.success : AppTheme.textMuted),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _subtitleText(ptt, media, isDirectCall),
                  style: const TextStyle(color: AppTheme.textDim, fontSize: 11, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 32),
                if (isDirectCall)
                  _endCallButton()
                else
                  PttButton(channelId: _selectedChannelId!, size: 140),
                const SizedBox(height: 20),
                _statusBadge(ptt.state),
                const SizedBox(height: 16),
                VoiceActivityIndicator(level: ptt.isSpeaking ? 0.8 : (isAnyoneSpeaking ? 0.4 : 0)),
              ],
            ),
          ),
        ),
        if (members.isNotEmpty)
          _rosterPanel(members),
      ],
    );
  }

  Widget _endCallButton() {
    return GestureDetector(
      onTap: () {
        context.read<PttProvider>().leaveChannel();
        Navigator.pop(context);
      },
      child: Container(
        width: 88, height: 88,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTheme.danger,
          boxShadow: AppShadows.glow(AppTheme.glowRed),
        ),
        child: const Icon(Icons.call_end, color: Colors.white, size: 36),
      ),
    );
  }

  Widget _statusBadge(PttState state) {
    Color color;
    String text;
    IconData icon;
    switch (state) {
      case PttState.idle:
        color = AppTheme.textMuted;
        text = 'STANDING BY';
        icon = Icons.radio_button_checked;
      case PttState.requesting:
        color = AppTheme.warning;
        text = 'REQUESTING FLOOR';
        icon = Icons.hourglass_bottom;
      case PttState.speaking:
        color = AppTheme.success;
        text = 'TRANSMITTING';
        icon = Icons.wifi_tethering;
      case PttState.denied:
        color = AppTheme.danger;
        text = 'CHANNEL BUSY';
        icon = Icons.block;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2),
          ),
        ],
      ),
    );
  }

  Widget _rosterPanel(List<dynamic> members) {
    return Container(
      height: 160,
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
            child: Row(
              children: [
                const Text('ROSTER', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 3)),
                const Spacer(),
                Text('${members.length}', style: const TextStyle(color: AppTheme.textDim, fontSize: 10)),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: members.length,
              itemBuilder: (context, index) => _memberTile(members[index]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _memberTile(dynamic member) {
    final ptt = context.read<PttProvider>();
    final isSpeaking = member.id == ptt.activeSpeakerId;
    final isMuted = member.isMuted == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isSpeaking ? AppTheme.success.withOpacity(0.08) : AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: isSpeaking ? AppTheme.success.withOpacity(0.3) : AppTheme.border),
      ),
      child: Row(
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isSpeaking ? AppTheme.success : AppTheme.textDim,
              boxShadow: isSpeaking ? AppShadows.glow(AppTheme.glowGreen) : null,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              member.displayName ?? 'User',
              style: TextStyle(
                color: isSpeaking ? AppTheme.success : AppTheme.text,
                fontSize: 12,
                fontWeight: isSpeaking ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
          Icon(
            isSpeaking ? Icons.mic : (isMuted ? Icons.volume_off : Icons.mic_off),
            size: 14,
            color: isSpeaking ? AppTheme.success : (isMuted ? AppTheme.danger : AppTheme.textDim),
          ),
        ],
      ),
    );
  }

  Widget _recordingsPanel() {
    return Container(
      width: 280,
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(left: BorderSide(color: AppTheme.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('RECORDINGS', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 3)),
                GestureDetector(
                  onTap: () => setState(() => _showRecordings = false),
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(color: AppTheme.surfaceLight, borderRadius: BorderRadius.circular(4)),
                    child: const Icon(Icons.close, color: AppTheme.textDim, size: 14),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _recordingsLoading
                ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
                : _recordings.isEmpty
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.history, color: AppTheme.textDim, size: 32),
                            SizedBox(height: 12),
                            Text('No recordings yet', style: TextStyle(color: AppTheme.textDim, fontSize: 11)),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        itemCount: _recordings.length,
                        itemBuilder: (context, index) {
                          final r = _recordings[index];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceLight,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.play_circle, color: AppTheme.primary, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    r['started_at']?.toString() ?? 'Unknown',
                                    style: const TextStyle(color: AppTheme.text, fontSize: 11),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleRecordings(ChannelProvider cp) async {
    if (_showRecordings) {
      setState(() => _showRecordings = false);
      return;
    }
    if (_selectedChannelId == null) return;
    setState(() { _showRecordings = true; _recordingsLoading = true; });
    try {
      final api = Provider.of<ApiService>(context, listen: false);
      final recs = await api.getRecordings(_selectedChannelId!);
      if (mounted) setState(() { _recordings = recs; _recordingsLoading = false; });
    } catch (_) {
      if (mounted) setState(() { _recordings = []; _recordingsLoading = false; });
    }
  }

  String _subtitleText(PttProvider ptt, MediaControlsProvider media, bool isDirectCall) {
    if (isDirectCall) return media.isMicEnabled ? 'CALL ACTIVE' : 'CONNECTING...';
    if (ptt.floorGranted) return 'FLOOR ACQUIRED';
    if (ptt.isMuted) return 'MUTED BY ADMIN';
    if (ptt.activeSpeakerId != null) return 'LISTENING';
    return 'PUSH TO TALK';
  }
}
