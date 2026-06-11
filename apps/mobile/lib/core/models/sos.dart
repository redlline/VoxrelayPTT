class SosAlert {
  final String id;
  final String userId;
  final String? userName;
  final String type;
  final String? message;
  final double? latitude;
  final double? longitude;
  final String? address;
  final String status;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? resolvedBy;
  final String? resolvedByName;

  const SosAlert({
    required this.id,
    required this.userId,
    this.userName,
    this.type = 'emergency',
    this.message,
    this.latitude,
    this.longitude,
    this.address,
    this.status = 'active',
    required this.createdAt,
    this.resolvedAt,
    this.resolvedBy,
    this.resolvedByName,
  });

  SosAlert copyWith({String? status, DateTime? resolvedAt, String? resolvedBy, String? resolvedByName}) => SosAlert(
    id: id,
    userId: userId,
    userName: userName,
    type: type,
    message: message,
    latitude: latitude,
    longitude: longitude,
    address: address,
    status: status ?? this.status,
    createdAt: createdAt,
    resolvedAt: resolvedAt ?? this.resolvedAt,
    resolvedBy: resolvedBy ?? this.resolvedBy,
    resolvedByName: resolvedByName ?? this.resolvedByName,
  );

  factory SosAlert.fromJson(Map<String, dynamic> json) => SosAlert(
    id: json['id'] as String,
    userId: json['userId'] as String? ?? json['user_id'] as String? ?? '',
    userName: json['userName'] as String? ?? json['user_name'] as String?,
    type: json['type'] as String? ?? 'emergency',
    message: json['message'] as String?,
    latitude: (json['latitude'] as num?)?.toDouble(),
    longitude: (json['longitude'] as num?)?.toDouble(),
    address: json['address'] as String?,
    status: json['status'] as String? ?? 'active',
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
    resolvedAt: json['resolvedAt'] != null ? DateTime.tryParse(json['resolvedAt'] as String) : null,
    resolvedBy: json['resolvedBy'] as String? ?? json['resolved_by'] as String?,
    resolvedByName: json['resolvedByName'] as String? ?? json['resolved_by_name'] as String?,
  );
}

class LocationPoint {
  final String userId;
  final String? userName;
  final double latitude;
  final double longitude;
  final double? accuracy;
  final DateTime timestamp;

  const LocationPoint({
    required this.userId,
    this.userName,
    required this.latitude,
    required this.longitude,
    this.accuracy,
    required this.timestamp,
  });

  factory LocationPoint.fromJson(Map<String, dynamic> json) => LocationPoint(
    userId: json['userId'] as String? ?? json['user_id'] as String? ?? '',
    userName: json['userName'] as String? ?? json['user_name'] as String?,
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
    accuracy: (json['accuracy'] as num?)?.toDouble(),
    timestamp: DateTime.tryParse(json['timestamp'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
  );
}
