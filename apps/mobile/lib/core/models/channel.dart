class Channel {
  final String id;
  final String name;
  final String description;
  final String type;
  final int memberCount;
  final String? ownerName;
  final String? ownerId;
  final String? memberRole;
  final String? activeSpeaker;

  const Channel({
    required this.id,
    required this.name,
    this.description = '',
    this.type = 'public',
    this.memberCount = 0,
    this.ownerName,
    this.ownerId,
    this.memberRole,
    this.activeSpeaker,
  });

  Channel copyWith({
    String? name,
    String? description,
    int? memberCount,
    String? memberRole,
    String? activeSpeaker,
    String? ownerName,
  }) => Channel(
    id: id,
    name: name ?? this.name,
    description: description ?? this.description,
    type: type,
    memberCount: memberCount ?? this.memberCount,
    ownerName: ownerName ?? this.ownerName,
    ownerId: ownerId,
    memberRole: memberRole ?? this.memberRole,
    activeSpeaker: activeSpeaker ?? this.activeSpeaker,
  );

  factory Channel.fromJson(Map<String, dynamic> json) {
    final membersList = (json['members'] as List<dynamic>?)?.cast<String>() ??
        (json['memberIds'] as List<dynamic>?)?.cast<String>() ??
        const <String>[];
    return Channel(
      id: (json['id'] ?? json['channelId']) as String,
      name: (json['name'] ?? json['channelName'] ?? 'Channel') as String,
      description: (json['description'] ?? '') as String,
      type: (json['type'] ?? 'public') as String,
      memberCount: (json['memberCount'] ?? json['member_count'] ?? membersList.length) as int,
      ownerName: json['ownerName'] as String? ?? json['owner_name'] as String?,
      ownerId: json['ownerId'] as String? ?? json['owner_id'] as String?,
      memberRole: json['memberRole'] as String? ?? json['member_role'] as String?,
      activeSpeaker: json['activeSpeaker'] as String?,
    );
  }

  bool get isDirectCall => description == 'Direct call' || description == 'Direct PTT call';
  bool get isJoined => memberRole != null;
}

class DispatcherChannel {
  final String id;
  final String name;
  final int memberCount;
  final bool isRecording;
  final String priority;
  final String? activeSpeakerName;

  const DispatcherChannel({
    required this.id,
    required this.name,
    this.memberCount = 0,
    this.isRecording = false,
    this.priority = 'normal',
    this.activeSpeakerName,
  });

  factory DispatcherChannel.fromJson(Map<String, dynamic> json) => DispatcherChannel(
    id: json['id'] as String,
    name: json['name'] as String? ?? 'Channel',
    memberCount: (json['memberCount'] ?? json['member_count'] ?? 0) as int,
    isRecording: json['isRecording'] as bool? ?? json['is_recording'] as bool? ?? false,
    priority: json['priority'] as String? ?? 'normal',
    activeSpeakerName: json['activeSpeakerName'] as String? ?? json['active_speaker_name'] as String?,
  );
}
