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
import '../../../core/services/api_service.dart';

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
  String? _recordingPath;
  DateTime? _recordingStartedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatProvider>().loadMessages(widget.conversationId);
    });
  }

  @override
  void dispose() {
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

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatProvider>();
    final msgs = chat.messages(widget.conversationId);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.conversationName ?? 'Chat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.call, color: AppTheme.success),
            onPressed: () {},
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
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.all(16),
                    itemCount: msgs.length,
                    itemBuilder: (_, i) {
                      final userId = context.read<AuthProvider>().user?.id ?? '';
                      return _MessageBubble(msg: msgs[i], isSelf: msgs[i].senderId == userId);
                    },
                  ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: AppTheme.surfaceLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.image, color: AppTheme.textMuted, size: 18),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _msgCtrl,
              decoration: const InputDecoration(
                hintText: 'Type message...',
                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                border: InputBorder.none,
              ),
              style: const TextStyle(color: AppTheme.text, fontSize: 14),
              onSubmitted: (_) => _send(),
              textInputAction: TextInputAction.send,
              maxLines: null,
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _toggleVoiceRecording,
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: _recording ? AppTheme.danger.withOpacity(0.2) : AppTheme.surfaceLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: _recording
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.danger),
                  )
                : const Icon(Icons.mic, color: AppTheme.textMuted, size: 18),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _send,
            child: Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.send, color: Colors.white, size: 18),
            ),
          ),
        ],
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

class _MessageBubble extends StatelessWidget {
  final Message msg;
  final bool isSelf;

  const _MessageBubble({required this.msg, required this.isSelf});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isSelf ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isSelf ? AppTheme.primary.withOpacity(0.2) : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelf ? AppTheme.primary.withOpacity(0.3) : AppTheme.border),
        ),
        child: IntrinsicWidth(
          child: Column(
            crossAxisAlignment: isSelf ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (msg.sender != null && !isSelf)
                      Text(
                        msg.sender!.displayName,
                        style: const TextStyle(color: AppTheme.primary, fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    if (msg.sender != null && !isSelf) const SizedBox(width: 6),
                    Text(
                      _formatTime(msg.createdAt),
                      style: const TextStyle(color: AppTheme.textVeryDim, fontSize: 9, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: _buildContent(context),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 200,
          height: 150,
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(8),
          ),
          child: url != null && url.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
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
                  ),
                )
              : const Center(
                  child: Icon(Icons.image, color: AppTheme.textDim, size: 32),
                ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Image',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 11),
        ),
      ],
    );
  }

  Widget _voiceContent() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 32, height: 32,
          decoration: const BoxDecoration(
            color: AppTheme.primary,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.play_arrow, color: Colors.white, size: 18),
        ),
        const SizedBox(width: 8),
        const Text(
          'Voice message',
          style: TextStyle(color: AppTheme.text, fontSize: 13),
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
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
