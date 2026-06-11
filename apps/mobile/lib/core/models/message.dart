import 'dart:convert';

class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final String type;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final MessageSender? sender;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    this.type = 'text',
    this.metadata,
    required this.createdAt,
    this.sender,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    dynamic metaRaw = json['metadata'];
    if (metaRaw is String) {
      try {
        metaRaw = jsonDecode(metaRaw);
      } catch (_) {
        metaRaw = null;
      }
    }
    return Message(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String? ?? json['conversation_id'] as String? ?? '',
      senderId: json['senderId'] as String? ?? json['sender_id'] as String? ?? '',
      content: json['content'] as String? ?? '',
      type: json['type'] as String? ?? json['messageType'] as String? ?? 'text',
      metadata: metaRaw as Map<String, dynamic>?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
      sender: json['sender'] != null ? MessageSender.fromJson(json['sender'] as Map<String, dynamic>) : null,
    );
  }
}

class MessageSender {
  final String id;
  final String displayName;
  final String? avatarUrl;

  const MessageSender({required this.id, required this.displayName, this.avatarUrl});

  factory MessageSender.fromJson(Map<String, dynamic> json) => MessageSender(
    id: json['id'] as String,
    displayName: json['displayName'] as String? ?? json['display_name'] as String? ?? 'Unknown',
    avatarUrl: json['avatarUrl'] as String? ?? json['avatar_url'] as String?,
  );
}

class Conversation {
  final String id;
  final String type;
  final String? name;
  final DateTime createdAt;
  final DateTime updatedAt;
  final Message? lastMessage;
  final int unreadCount;
  final List<ConversationParticipant> participants;

  const Conversation({
    required this.id,
    required this.type,
    this.name,
    required this.createdAt,
    required this.updatedAt,
    this.lastMessage,
    this.unreadCount = 0,
    this.participants = const [],
  });

  Conversation copyWith({Message? lastMessage, int? unreadCount}) => Conversation(
    id: id,
    type: type,
    name: name,
    createdAt: createdAt,
    updatedAt: updatedAt,
    lastMessage: lastMessage ?? this.lastMessage,
    unreadCount: unreadCount ?? this.unreadCount,
    participants: participants,
  );

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final parts = (json['participants'] as List<dynamic>?)
        ?.map((e) => ConversationParticipant.fromJson(e as Map<String, dynamic>))
        .toList() ?? [];
    return Conversation(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'direct',
      name: json['name'] as String?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? json['updated_at'] as String? ?? '') ?? DateTime.now(),
      lastMessage: json['lastMessage'] != null ? Message.fromJson(json['lastMessage'] as Map<String, dynamic>) : null,
      unreadCount: (json['unreadCount'] ?? json['unread_count'] ?? 0) as int,
      participants: parts,
    );
  }
}

class ConversationParticipant {
  final String userId;
  final String? displayName;
  final String? lastReadAt;

  const ConversationParticipant({required this.userId, this.displayName, this.lastReadAt});

  factory ConversationParticipant.fromJson(Map<String, dynamic> json) => ConversationParticipant(
    userId: json['userId'] as String? ?? json['user_id'] as String? ?? '',
    displayName: json['displayName'] as String? ?? json['display_name'] as String?,
    lastReadAt: json['lastReadAt'] as String? ?? json['last_read_at'] as String?,
  );
}
