import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import '../../../core/theme.dart';
import '../../../core/models/message.dart';
import '../../../core/providers/chat_provider.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/websocket_service.dart';
import '../../../shared/member_avatar.dart';

class ChatMessagesScreen extends StatefulWidget {
  final String conversationId;
  final String? conversationName;

  const ChatMessagesScreen({
    super.key,
    required this.conversationId,
    this.conversationName,
  });

  @override
  State<ChatMessagesScreen> createState() => _ChatMessagesScreenState();
}

class _ChatMessagesScreenState extends State<ChatMessagesScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _picker = ImagePicker();
  final _recorder = AudioRecorder();
  bool _recording = false;
  bool _hasText = false;
  String? _recordingPath;
  DateTime? _recordingStartedAt;

  @override
  void initState() {
    super.initState();
    final chat = context.read<ChatProvider>();
    chat.setActiveConversation(widget.conversationId);
    _msgCtrl.addListener(() {
      final hasText = _msgCtrl.text.trim().isNotEmpty;
      if (hasText != _hasText) setState(() => _hasText = hasText);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      chat.loadMessages(widget.conversationId).then((_) => _scrollToBottom(animate: false));
    });
  }

  @override
  void dispose() {
    context.read<ChatProvider>().setActiveConversation(null);
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    if (_recording) {
      _recording = false;
      _recordingPath = null;
      _recordingStartedAt = null;
      _recorder.stop();
    }
    _recorder.dispose();
    super.dispose();
  }

  void _send() {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    context.read<ChatProvider>().sendMessage(widget.conversationId, text);
    _msgCtrl.clear();
    _scrollToBottom();
  }

  void _scrollToBottom({bool animate = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      final target = _scrollCtrl.position.maxScrollExtent;
      if (animate) {
        _scrollCtrl.animateTo(target, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      } else {
        _scrollCtrl.jumpTo(target);
      }
    });
  }

  String? _otherParticipantId(ChatProvider chat, String userId) {
    for (final c in chat.conversations) {
      if (c.id == widget.conversationId && c.type == 'direct') {
        for (final p in c.participants) {
          if (p.userId != userId) return p.userId;
        }
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatProvider>();
    final channel = context.watch<ChannelProvider>();
    final msgs = chat.messages(widget.conversationId);
    final userId = context.read<AuthProvider>().user?.id ?? '';
    final otherId = _otherParticipantId(chat, userId);
    final isOnline = otherId != null && channel.isUserOnline(otherId);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            MemberAvatar(name: widget.conversationName, size: 36, isOnline: isOnline),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    widget.conversationName ?? 'Chat',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.text),
                  ),
                  if (otherId != null)
                    Text(
                      isOnline ? 'Online' : 'Offline',
                      style: TextStyle(
                        fontSize: 11,
                        color: isOnline ? AppTheme.success : AppTheme.textDim,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.call, color: AppTheme.success),
            onPressed: otherId == null
                ? null
                : () => context.read<WsService>().startCall(otherId, widget.conversationId),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: msgs.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.chat, color: AppTheme.textDim, size: 40),
                        SizedBox(height: 12),
                        Text('No messages yet', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                        SizedBox(height: 4),
                        Text('Send a message to start', style: TextStyle(color: AppTheme.textDim, fontSize: 11)),
                      ],
                    ),
                  )
                : _buildMessageList(msgs, userId),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildMessageList(List<Message> msgs, String userId) {
    // Build a flat list interleaving date separators between messages from different days.
    final items = <Object>[];
    DateTime? lastDay;
    for (final m in msgs) {
      final day = DateTime(m.createdAt.year, m.createdAt.month, m.createdAt.day);
      if (lastDay == null || day != lastDay) {
        items.add(day);
        lastDay = day;
      }
      items.add(m);
    }

    return ListView.builder(
      controller: _scrollCtrl,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final item = items[i];
        if (item is DateTime) {
          return _DateSeparator(date: item);
        }
        final msg = item as Message;
        return _MessageBubble(msg: msg, isSelf: msg.senderId == userId);
      },
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Container(
                constraints: const BoxConstraints(minHeight: 44),
                decoration: BoxDecoration(
                  color: AppTheme.surfaceLight,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.image, color: AppTheme.textMuted, size: 20),
                      onPressed: _pickImage,
                    ),
                    Expanded(
                      child: TextField(
                        controller: _msgCtrl,
                        decoration: const InputDecoration(
                          hintText: 'Message',
                          isCollapsed: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                          border: InputBorder.none,
                        ),
                        style: const TextStyle(color: AppTheme.text, fontSize: 14),
                        onSubmitted: (_) => _send(),
                        textInputAction: TextInputAction.send,
                        minLines: 1,
                        maxLines: 5,
                      ),
                    ),
                    const SizedBox(width: 4),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _hasText ? _send : _toggleVoiceRecording,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: _recording ? AppTheme.danger : AppTheme.success,
                  shape: BoxShape.circle,
                ),
                child: _recording
                    ? const Icon(Icons.stop, color: Colors.white, size: 20)
                    : Icon(_hasText ? Icons.send : Icons.mic, color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage() async {
    try {
      final file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      if (!mounted) return;
      final api = context.read<ApiService>();
      final url = await api.uploadFile(file.path);
      if (url.isEmpty) return;
      if (!mounted) return;
      final chat = context.read<ChatProvider>();
      await chat.sendMessage(widget.conversationId, file.name,
          type: 'image', metadata: {'url': url});
      _scrollToBottom();
    } catch (_) {}
  }

  Future<void> _toggleVoiceRecording() async {
    if (_recording) {
      setState(() => _recording = false);
      try {
        final stoppedPath = await _recorder.stop();
        final path = stoppedPath ?? _recordingPath;
        final startedAt = _recordingStartedAt;
        _recordingPath = null;
        _recordingStartedAt = null;
        if (path != null && await File(path).exists()) {
          if (!mounted) return;
          final api = context.read<ApiService>();
          final url = await api.uploadFile(path);
          if (url.isNotEmpty) {
            if (!mounted) return;
            final chat = context.read<ChatProvider>();
            final durationMs = startedAt != null
                ? DateTime.now().difference(startedAt).inMilliseconds
                : 0;
            await chat.sendMessage(widget.conversationId, 'Voice message',
                type: 'voice', metadata: {'url': url, 'durationMs': durationMs});
            _scrollToBottom();
          }
        }
      } catch (_) {}
    } else {
      try {
        final hasPermission = await _recorder.hasPermission();
        if (!hasPermission) return;
        final dir = await getApplicationDocumentsDirectory();
        final voiceDir = Directory('${dir.path}/voice');
        if (!await voiceDir.exists()) {
          await voiceDir.create(recursive: true);
        }
        final path = '${voiceDir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
        _recordingPath = path;
        _recordingStartedAt = DateTime.now();
        await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
        setState(() => _recording = true);
      } catch (_) {}
    }
  }
}

class _DateSeparator extends StatelessWidget {
  final DateTime date;

  const _DateSeparator({required this.date});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: AppTheme.surfaceLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.border),
          ),
          child: Text(
            _label(date),
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }

  String _label(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(date).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    if (date.year == now.year) {
      return '${months[date.month - 1]} ${date.day}';
    }
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}

class _MessageBubble extends StatelessWidget {
  final Message msg;
  final bool isSelf;

  const _MessageBubble({required this.msg, required this.isSelf});

  @override
  Widget build(BuildContext context) {
    final bubbleColor = isSelf ? AppTheme.success.withOpacity(0.18) : AppTheme.surfaceLight;
    final borderColor = isSelf ? AppTheme.success.withOpacity(0.35) : AppTheme.border;
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(14),
      topRight: const Radius.circular(14),
      bottomLeft: Radius.circular(isSelf ? 14 : 4),
      bottomRight: Radius.circular(isSelf ? 4 : 14),
    );

    return Align(
      alignment: isSelf ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: radius,
          border: Border.all(color: borderColor),
        ),
        child: IntrinsicWidth(
          child: Column(
            crossAxisAlignment: isSelf ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (msg.sender != null && !isSelf)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Text(
                    msg.sender!.displayName,
                    style: const TextStyle(color: AppTheme.primary, fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
              Padding(
                padding: EdgeInsets.fromLTRB(12, msg.sender != null && !isSelf ? 2 : 8, 12, 4),
                child: _buildContent(context),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 10, 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _formatTime(msg.createdAt),
                      style: const TextStyle(color: AppTheme.textVeryDim, fontSize: 10, fontWeight: FontWeight.w600),
                    ),
                    if (isSelf) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.done, size: 13, color: AppTheme.textVeryDim),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    switch (msg.type) {
      case 'image':
        return _imageContent();
      case 'voice':
        return _voiceContent();
      case 'file':
        return _fileContent();
      case 'location':
        return _locationContent();
      default:
        return _textContent();
    }
  }

  Widget _textContent() {
    return Text(
      msg.content,
      style: const TextStyle(color: AppTheme.text, fontSize: 14),
    );
  }

  Widget _imageContent() {
    final url = msg.metadata?['url'] as String?;

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 200,
        height: 150,
        color: AppTheme.surface,
        child: url != null && url.isNotEmpty
            ? Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Center(
                  child: Icon(Icons.broken_image, color: AppTheme.textDim, size: 32),
                ),
                loadingBuilder: (_, child, progress) =>
                    progress == null ? child : const Center(
                      child: SizedBox(
                        width: 24, height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                      ),
                    ),
              )
            : const Center(
                child: Icon(Icons.image, color: AppTheme.textDim, size: 32),
              ),
      ),
    );
  }

  Widget _voiceContent() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 32, height: 32,
          decoration: const BoxDecoration(
            color: AppTheme.success,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.play_arrow, color: Colors.white, size: 18),
        ),
        const SizedBox(width: 8),
        Container(
          width: 100,
          height: 2,
          decoration: BoxDecoration(
            color: AppTheme.border,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          msg.metadata?['durationMs'] != null
              ? '${(msg.metadata!['durationMs'] as num) ~/ 1000}s'
              : '',
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
        ),
      ],
    );
  }

  Widget _fileContent() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: AppTheme.surfaceLighter,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.insert_drive_file, color: AppTheme.textMuted, size: 18),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            msg.metadata?['fileName'] as String? ?? 'File',
            style: const TextStyle(color: AppTheme.text, fontSize: 13),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Widget _locationContent() {
    return GestureDetector(
      onTap: () {},
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: AppTheme.success.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.location_on, color: AppTheme.success, size: 18),
          ),
          const SizedBox(width: 8),
          const Text(
            'Location',
            style: TextStyle(color: AppTheme.text, fontSize: 13),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
