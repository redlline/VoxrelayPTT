import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../core/providers/sos_provider.dart';
import '../../shared/app_drawer.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 1.0, end: 1.12).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SosProvider>().loadActiveAlerts();
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sos = context.watch<SosProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('SOS'),
        actions: [
          if (sos.activeAlerts.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.danger,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('${sos.activeAlerts.length}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
            ),
        ],
      ),
      drawer: const AppDrawer(),
      body: Column(
        children: [
          // SOS Trigger Button
          Padding(
            padding: const EdgeInsets.all(32),
            child: Center(
              child: AnimatedBuilder(
                animation: _pulseAnim,
                builder: (context, _) {
                  return Transform.scale(
                    scale: _pulseAnim.value,
                    child: GestureDetector(
                      onTap: () => _showSosDialog(context),
                      child: Container(
                        width: 160,
                        height: 160,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const RadialGradient(
                            colors: [AppTheme.emergency, AppTheme.danger],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.danger.withOpacity(0.5),
                              blurRadius: 40,
                              spreadRadius: 8,
                            ),
                          ],
                          border: Border.all(color: Colors.white.withOpacity(0.2), width: 3),
                        ),
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.warning_amber, color: Colors.white, size: 48),
                            SizedBox(height: 4),
                            Text(
                              'SOS',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 6,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const Text(
            'TAP TO SEND EMERGENCY ALERT',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4),
          ),
          const SizedBox(height: 32),
          if (sos.activeAlerts.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Text(
                    'ACTIVE ALERTS',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 4),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: sos.loadActiveAlerts,
                    child: const Text('REFRESH', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: sos.activeAlerts.length,
                itemBuilder: (_, i) {
                  final alert = sos.activeAlerts[i];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning, color: AppTheme.danger, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                alert.userName ?? 'Unknown User',
                                style: const TextStyle(color: AppTheme.text, fontSize: 13, fontWeight: FontWeight.w700),
                              ),
                              if (alert.message != null)
                                Text(alert.message!, style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                              if (alert.latitude != null)
                                Text(
                                  '${alert.latitude!.toStringAsFixed(4)}, ${alert.longitude!.toStringAsFixed(4)}',
                                  style: const TextStyle(color: AppTheme.textDim, fontSize: 9, fontFamily: 'monospace'),
                                ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => sos.resolveSos(alert.id),
                          style: TextButton.styleFrom(
                            backgroundColor: AppTheme.danger.withOpacity(0.2),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          ),
                          child: const Text(
                            'RESOLVE',
                            style: TextStyle(color: AppTheme.danger, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _showSosDialog(BuildContext context) {
    final msgCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('SEND SOS', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w900, letterSpacing: 2)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('An emergency alert will be sent to all dispatchers.', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(
              controller: msgCtrl,
              decoration: const InputDecoration(hintText: 'Optional message...'),
              maxLines: 3,
              style: const TextStyle(color: AppTheme.text, fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('CANCEL', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () async {
              final messenger = context.read<SosProvider>();
              Navigator.pop(ctx);
              await messenger.sendSos(message: msgCtrl.text.trim());
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            child: const Text('SEND SOS'),
          ),
        ],
      ),
    );
  }
}
