import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../models/sos.dart';

class LocationService {
  bool _isTracking = false;
  StreamSubscription<Position>? _positionSubscription;
  Timer? _updateTimer;
  final StreamController<LocationPoint> _locationController = StreamController<LocationPoint>.broadcast();

  Stream<LocationPoint> get locationStream => _locationController.stream;
  LocationPoint? _lastLocation;
  LocationPoint? get lastLocation => _lastLocation;

  Future<bool> requestPermission() async {
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.deniedForever) return false;
    return permission == LocationPermission.whileInUse || permission == LocationPermission.always;
  }

  Future<LocationPoint?> getCurrentLocation() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      final point = LocationPoint(
        userId: '',
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        timestamp: pos.timestamp,
      );
      _lastLocation = point;
      return point;
    } catch (_) {
      return null;
    }
  }

  void startTracking(String userId, {Function(LocationPoint)? onLocation}) {
    if (_isTracking) return;
    _isTracking = true;

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((pos) {
      final point = LocationPoint(
        userId: userId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        timestamp: pos.timestamp,
      );
      _lastLocation = point;
      _locationController.add(point);
      onLocation?.call(point);
    });
  }

  void stopTracking() {
    _isTracking = false;
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _updateTimer?.cancel();
  }

  void dispose() {
    stopTracking();
    _locationController.close();
  }
}
