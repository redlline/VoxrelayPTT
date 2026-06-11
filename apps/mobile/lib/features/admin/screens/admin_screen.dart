import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme.dart';
import '../../../core/models/user.dart';
import '../../../core/services/api_service.dart';
import '../../../shared/app_drawer.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<User> _users = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadUsers());
  }

  Future<void> _loadUsers() async {
    setState(() => _isLoading = true);
    try {
      final api = context.read<ApiService>();
      _users = await api.getUsers();
    } catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ADMIN'),
        actions: [
          if (!_isLoading)
            TextButton(
              onPressed: _loadUsers,
              child: const Text('REFRESH', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
      drawer: const AppDrawer(),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'USER MANAGEMENT',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4),
                ),
                const SizedBox(height: 8),
                ..._users.map((u) => _UserManagementTile(user: u, onChanged: _loadUsers)),
              ],
            ),
    );
  }
}

class _UserManagementTile extends StatelessWidget {
  final User user;
  final VoidCallback onChanged;

  const _UserManagementTile({required this.user, required this.onChanged});

  Color _roleColor(String role) {
    switch (role) {
      case 'admin': return AppTheme.warning;
      case 'dispatcher': return AppTheme.primary;
      default: return AppTheme.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: _roleColor(user.role).withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : '?',
                style: TextStyle(color: _roleColor(user.role), fontWeight: FontWeight.w900, fontSize: 14),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.displayName, style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w700)),
                Text(user.email, style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _roleColor(user.role).withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              user.role.toUpperCase(),
              style: TextStyle(
                color: _roleColor(user.role),
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ),
          const SizedBox(width: 8),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: AppTheme.textMuted, size: 18),
            color: AppTheme.surfaceLight,
            onSelected: (value) async {
              try {
                final api = context.read<ApiService>();
                if (value == 'make_dispatcher') {
                  await api.updateUserRole(user.id, 'dispatcher');
                } else if (value == 'make_admin') {
                  await api.updateUserRole(user.id, 'admin');
                } else if (value == 'make_user') {
                  await api.updateUserRole(user.id, 'user');
                } else if (value == 'deactivate') {
                  await api.deactivateUser(user.id);
                } else if (value == 'activate') {
                  await api.activateUser(user.id);
                }
                onChanged();
              } catch (_) {}
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'make_user', child: Text('Set User', style: TextStyle(fontSize: 12))),
              const PopupMenuItem(value: 'make_dispatcher', child: Text('Set Dispatcher', style: TextStyle(fontSize: 12))),
              const PopupMenuItem(value: 'make_admin', child: Text('Set Admin', style: TextStyle(fontSize: 12))),
              const PopupMenuDivider(),
              PopupMenuItem(
                value: user.isActive ? 'deactivate' : 'activate',
                child: Text(user.isActive ? 'Deactivate' : 'Activate', style: TextStyle(fontSize: 12, color: user.isActive ? AppTheme.danger : AppTheme.success)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
