import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../core/models/sos.dart';
import '../../core/services/location_service.dart';
import '../../shared/app_drawer.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  LocationPoint? _currentLocation;
  bool _isLoading = true;
  String? _error;
  StreamSubscription? _locSub;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  Future<void> _initLocation() async {
    final locationService = context.read<LocationService>();
    final hasPermission = await locationService.requestPermission();
    if (!hasPermission) {
      setState(() {
        _isLoading = false;
        _error = 'Location permission denied';
      });
      return;
    }
    final loc = await locationService.getCurrentLocation();
    setState(() {
      _currentLocation = loc;
      _isLoading = false;
    });
  }

  @override
  void dispose() {
    _locSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('MAP'),
        actions: [
          if (_currentLocation != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Text(
                '${_currentLocation!.latitude.toStringAsFixed(4)}, ${_currentLocation!.longitude.toStringAsFixed(4)}',
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 9, fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
      drawer: const AppDrawer(),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.location_off, color: AppTheme.textDim, size: 48),
                      const SizedBox(height: 16),
                      Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _initLocation,
                        child: const Text('RETRY'),
                      ),
                    ],
                  ),
                )
              : Stack(
                  children: [
                    _buildMapPlaceholder(),
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 24,
                      child: _LocationInfoCard(location: _currentLocation!),
                    ),
                  ],
                ),
    );
  }

  Widget _buildMapPlaceholder() {
    final center = _currentLocation != null
        ? LatLng(_currentLocation!.latitude, _currentLocation!.longitude)
        : const LatLng(37.7749, -122.4194);
    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: 13,
        onTap: (tapPos, latlng) {},
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.turkmenportal.voxrelay_mobile',
        ),
        if (_currentLocation != null)
          MarkerLayer(
            markers: [
              Marker(
                width: 24,
                height: 24,
                point: center,
                child: Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppTheme.primary,
                    boxShadow: AppShadows.glow(AppTheme.glowBlue),
                  ),
                  child: const Icon(Icons.my_location, color: Colors.white, size: 16),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _LocationInfoCard extends StatelessWidget {
  final LocationPoint location;

  const _LocationInfoCard({required this.location});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.gps_fixed, color: AppTheme.success, size: 20),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('CURRENT POSITION', style: TextStyle(color: AppTheme.textMuted, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 2)),
              const SizedBox(height: 4),
              Row(
                children: [
                  Text(
                    '${location.latitude.toStringAsFixed(4)}, ${location.longitude.toStringAsFixed(4)}',
                    style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w600, fontFamily: 'monospace'),
                  ),
                ],
              ),
              if (location.accuracy != null) ...[
                const SizedBox(height: 2),
                Text('±${location.accuracy!.toStringAsFixed(1)}m accuracy', style: const TextStyle(color: AppTheme.textDim, fontSize: 10)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
