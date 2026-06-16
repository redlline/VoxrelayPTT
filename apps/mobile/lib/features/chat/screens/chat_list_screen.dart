import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/models/message.dart';
import '../../../core/providers/chat_provider.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/providers/channel_provider.dart';
import '../../../shared/app_drawer.dart';
import '../../../shared/member_avatar.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatProvider>().loadConversations();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatProvider>();
    final channel = context.watch<ChannelProvider>();
    final userId = context.read<AuthProvider>().user?.id ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('CHAT')),
      drawer: const AppDrawer(),
      body: chat.conversations.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.chat_bubble, color: AppTheme.textDim, size: 48),
                  SizedBox(height: 16),
                  Text('No conversations yet', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                ],
              ),
            )
          : ListView.separated(
              itemCount: chat.conversations.length,
              separatorBuilder: (_, __) => const Divider(height: 1, indent: 80),
              itemBuilder: (_, i) {
                final conv = chat.conversations[i];
                bool isOnline = false;
                if (conv.type == 'direct') {
                  for (final p in conv.participants) {
                    if (p.userId != userId && channel.isUserOnline(p.userId)) {
                      isOnline = true;
                      break;
                    }
                  }
                }
                return _ConversationTile(conv: conv, isOnline: isOnline, onTap: () {
                  chat.clearUnread(conv.id);
                  Navigator.pushNamed(context, '/chat/messages', arguments: conv);
                });
              },
            ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final dynamic conv;
  final bool isOnline;
  final VoidCallback onTap;

  const _ConversationTile({required this.conv, required this.isOnline, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final unread = conv.unreadCount as int;
    final Message? last = conv.lastMessage as Message?;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            MemberAvatar(name: conv.name as String?, size: 50, isOnline: isOnline),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (conv.name as String?) ?? 'Conversation',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppTheme.text, fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (last != null) ..._previewIcon(last),
                      Expanded(
                        child: Text(
                          _previewText(last),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: unread > 0 ? AppTheme.text : AppTheme.textMuted,
                            fontSize: 13,
                            fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w400,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  last != null ? _formatTime(last.createdAt) : '',
                  style: TextStyle(
                    color: unread > 0 ? AppTheme.success : AppTheme.textDim,
                    fontSize: 11,
                    fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 6),
                if (unread > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    constraints: const BoxConstraints(minWidth: 20),
                    decoration: BoxDecoration(
                      color: AppTheme.success,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                    ),
                  )
                else
                  const SizedBox(height: 20),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _previewIcon(Message msg) {
    IconData? icon;
    switch (msg.type) {
      case 'image':
        icon = Icons.photo_camera;
        break;
      case 'voice':
        icon = Icons.mic;
        break;
      case 'file':
        icon = Icons.insert_drive_file;
        break;
      case 'location':
        icon = Icons.location_on;
        break;
      default:
        icon = null;
    }
    if (icon == null) return const [];
    return [
      Icon(icon, size: 14, color: AppTheme.textMuted),
      const SizedBox(width: 4),
    ];
  }

  String _previewText(Message? msg) {
    if (msg == null) return 'No messages yet';
    switch (msg.type) {
      case 'image':
        return 'Photo';
      case 'voice':
        return 'Voice message';
      case 'file':
        return 'File';
      case 'location':
        return 'Location';
      default:
        return msg.content;
    }
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);
    final diffDays = today.difference(msgDay).inDays;

    if (diffDays == 0) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } else if (diffDays == 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return days[dt.weekday - 1];
    }
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year % 100}';
  }
}
