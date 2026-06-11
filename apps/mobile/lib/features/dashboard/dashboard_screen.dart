import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../core/services/websocket_service.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/channel_provider.dart';
import '../../core/providers/sos_provider.dart';
import '../../shared/app_drawer.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final cp = context.read<ChannelProvider>();
      await cp.loadChannels();
      if (!mounted) return;
      for (final ch in cp.myChannels) {
        cp.loadMembers(ch.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final cp = context.watch<ChannelProvider>();
    final sos = context.watch<SosProvider>();
    final ws = context.watch<WsService>();
    final isConnected = ws.state == WsConnectionState.connected;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 10, height: 10,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isConnected ? AppTheme.success : AppTheme.danger,
                boxShadow: isConnected ? AppShadows.glow(AppTheme.glowGreen) : null,
              ),
            ),
            const SizedBox(width: 10),
            Text(isConnected ? 'CONNECTED' : 'DISCONNECTED', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 2, color: isConnected ? AppTheme.success : AppTheme.danger)),
          ],
        ),
      ),
      drawer: const AppDrawer(),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _welcomeSection(auth, cp),
            const SizedBox(height: 24),
            _statsGrid(cp, sos),
            const SizedBox(height: 24),
            _quickActions(context),
          ],
        ),
      ),
    );
  }

  Widget _welcomeSection(AuthProvider auth, ChannelProvider cp) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primary.withOpacity(0.15), AppTheme.surface],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.primary.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppTheme.primary.withOpacity(0.2),
                  border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                ),
                child: Center(
                  child: Text(
                    (auth.user?.displayName ?? 'U').substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: AppTheme.primary, fontSize: 20, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(auth.user?.displayName ?? 'User', style: const TextStyle(color: AppTheme.text, fontSize: 18, fontWeight: FontWeight.w700)),
                  Text(auth.user?.role.toUpperCase() ?? 'USER', style: const TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 3)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _infoBadge('JOINED', '${cp.myChannels.length}'),
              const SizedBox(width: 12),
              _infoBadge('AVAILABLE', '${cp.channels.length}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _infoBadge(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, style: const TextStyle(color: AppTheme.text, fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: AppTheme.textDim, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 2)),
        ],
      ),
    );
  }

  Widget _statsGrid(ChannelProvider cp, SosProvider sos) {
    return Row(
      children: [
        Expanded(child: _statCard('CHANNELS', '${cp.myChannels.length}', Icons.wifi_tethering, AppTheme.primary)),
        const SizedBox(width: 12),
        Expanded(child: _statCard('ONLINE', '${cp.members.where((m) => m.isOnline).length}', Icons.person, AppTheme.success)),
        const SizedBox(width: 12),
        Expanded(child: _statCard('ALERTS', '${sos.activeAlerts.length}', Icons.warning_amber, AppTheme.warning)),
      ],
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: AppTheme.textDim, fontSize: 8, fontWeight: FontWeight.w700, letterSpacing: 2)),
        ],
      ),
    );
  }

  Widget _quickActions(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 12),
          child: Text('QUICK ACTIONS', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 3)),
        ),
        Row(
          children: [
            Expanded(child: _actionButton(context, 'CHANNELS', Icons.wifi_tethering, AppTheme.primary, '/channels')),
            const SizedBox(width: 10),
            Expanded(child: _actionButton(context, 'CHAT', Icons.chat, AppTheme.info, '/chat')),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _actionButton(context, 'MAP', Icons.map, AppTheme.success, '/map')),
            const SizedBox(width: 10),
            Expanded(child: _actionButton(context, 'SOS', Icons.warning, AppTheme.danger, '/sos')),
          ],
        ),
      ],
    );
  }

  Widget _actionButton(BuildContext context, String label, IconData icon, Color color, String route) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, route),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 2)),
          ],
        ),
      ),
    );
  }
}
