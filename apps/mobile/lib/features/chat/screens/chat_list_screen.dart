import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/providers/chat_provider.dart';
import '../../../shared/app_drawer.dart';

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
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: chat.conversations.length,
              itemBuilder: (_, i) {
                final conv = chat.conversations[i];
                return _ConversationTile(conv: conv, onTap: () {
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
  final VoidCallback onTap;

  const _ConversationTile({required this.conv, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: conv.unreadCount > 0 ? AppTheme.surfaceLight : AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: conv.unreadCount > 0 ? AppTheme.primary.withOpacity(0.3) : AppTheme.border,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: AppTheme.primary.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.person, color: AppTheme.primary, size: 22),
        ),
        title: Text(
          conv.name ?? 'Conversation',
          style: const TextStyle(color: AppTheme.text, fontSize: 14, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          conv.lastMessage?.content ?? 'No messages yet',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
        ),
        trailing: conv.unreadCount > 0
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${conv.unreadCount}',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900),
                ),
              )
            : null,
        onTap: onTap,
      ),
    );
  }
}
