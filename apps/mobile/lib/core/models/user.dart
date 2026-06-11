class User {
  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String role;
  final bool isActive;
  bool isOnline;
  bool isSpeaking;
  bool isMuted;

  User({
    required this.id,
    this.email = '',
    required this.displayName,
    this.avatarUrl,
    this.role = 'user',
    this.isActive = true,
    this.isOnline = false,
    this.isSpeaking = false,
    this.isMuted = false,
  });

  User copyWith({
    bool? isOnline,
    bool? isSpeaking,
    String? displayName,
    String? role,
    bool? isMuted,
  }) => User(
    id: id,
    email: email,
    displayName: displayName ?? this.displayName,
    avatarUrl: avatarUrl,
    role: role ?? this.role,
    isActive: isActive,
    isOnline: isOnline ?? this.isOnline,
    isSpeaking: isSpeaking ?? this.isSpeaking,
    isMuted: isMuted ?? this.isMuted,
  );

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: (json['id'] ?? json['userId'] ?? json['sub']) as String,
    email: json['email'] as String? ?? '',
    displayName: json['displayName'] as String? ?? json['display_name'] as String? ?? 'User',
    avatarUrl: json['avatarUrl'] as String? ?? json['avatar_url'] as String?,
    role: json['role'] as String? ?? 'user',
    isActive: json['isActive'] as bool? ?? json['is_active'] as bool? ?? true,
    isOnline: json['isOnline'] as bool? ?? json['is_online'] as bool? ?? false,
    isSpeaking: json['isSpeaking'] as bool? ?? false,
    isMuted: json['isMuted'] as bool? ?? json['is_muted'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'displayName': displayName,
    'role': role,
  };
}

class AuthResponse {
  final User user;
  final String accessToken;
  AuthResponse({required this.user, required this.accessToken});

  factory AuthResponse.fromJson(Map<String, dynamic> json) => AuthResponse(
    user: User.fromJson(json['user'] as Map<String, dynamic>),
    accessToken: json['accessToken'] as String,
  );
}
