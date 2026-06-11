import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../core/providers/auth_provider.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Drawer(
      backgroundColor: AppTheme.surface,
      child: Column(
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.surfaceLight, AppTheme.background],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppTheme.primary.withOpacity(0.2),
                    border: Border.all(color: AppTheme.primary, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      (user?.displayName.isNotEmpty == true
                          ? user!.displayName[0]
                          : '?').toUpperCase(),
                      style: const TextStyle(
                        color: AppTheme.primary,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        user?.displayName ?? 'User',
                        style: const TextStyle(
                          color: AppTheme.text,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.role.toUpperCase() ?? 'USER',
                        style: const TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          _MenuItem(icon: Icons.dashboard, label: 'Dashboard', onTap: () => Navigator.pushReplacementNamed(context, '/dashboard')),
          _MenuItem(icon: Icons.group, label: 'Channels', onTap: () => Navigator.pushReplacementNamed(context, '/channels')),
          _MenuItem(icon: Icons.chat_bubble, label: 'Chat', onTap: () => Navigator.pushReplacementNamed(context, '/chat')),
          _MenuItem(icon: Icons.map, label: 'Map', onTap: () => Navigator.pushReplacementNamed(context, '/map')),
          if (auth.isDispatcher) ...[
            const Divider(color: AppTheme.border),
            _MenuItem(icon: Icons.settings_suggest, label: 'Dispatcher', onTap: () => Navigator.pushReplacementNamed(context, '/dispatcher')),
          ],
          if (auth.isAdmin) ...[
            _MenuItem(icon: Icons.admin_panel_settings, label: 'Admin', onTap: () => Navigator.pushReplacementNamed(context, '/admin')),
          ],
          const Divider(color: AppTheme.border),
          _MenuItem(icon: Icons.sos, label: 'SOS', onTap: () => Navigator.pushReplacementNamed(context, '/sos'), color: AppTheme.danger),
          _MenuItem(icon: Icons.folder, label: 'Recordings', onTap: () => Navigator.pushReplacementNamed(context, '/recordings')),
          const Spacer(),
          _MenuItem(
            icon: Icons.logout,
            label: 'Logout',
            color: AppTheme.textMuted,
            onTap: () async {
              Navigator.of(context).pop();
              await auth.logout();
              if (context.mounted) {
                Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
              }
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  const _MenuItem({required this.icon, required this.label, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color ?? AppTheme.textMuted, size: 20),
      title: Text(
        label,
        style: TextStyle(
          color: color ?? AppTheme.text,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
      onTap: onTap,
      dense: true,
      horizontalTitleGap: 8,
    );
  }
}
