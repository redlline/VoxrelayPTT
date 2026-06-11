import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../core/services/websocket_service.dart';

class IncomingCallData {
  final String callId;
  final String channelId;
  final String callerName;
  final String callerId;
  final String? conversationId;
  const IncomingCallData({
    required this.callId,
    required this.channelId,
    required this.callerName,
    required this.callerId,
    this.conversationId,
  });
}

class IncomingCallHandler extends StatelessWidget {
  final IncomingCallData? incomingCall;
  final WsService ws;
  final VoidCallback onDismiss;
  final Widget child;

  const IncomingCallHandler({
    super.key,
    required this.incomingCall,
    required this.ws,
    required this.onDismiss,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        children: [
          child,
          if (incomingCall != null)
            Positioned.fill(
              child: Material(
                color: Colors.black54,
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.all(32),
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppTheme.success.withOpacity(0.15),
                            boxShadow: AppShadows.glow(AppTheme.glowGreen),
                          ),
                          child: const Icon(Icons.phone_in_talk, color: AppTheme.success, size: 32),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'INCOMING CALL',
                          style: TextStyle(color: AppTheme.text, fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 2),
                        ),
                        const SizedBox(height: 8),
                        Text(incomingCall!.callerName, style: const TextStyle(color: AppTheme.textMuted, fontSize: 14)),
                        const SizedBox(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _callButton('Decline', Icons.call_end, AppTheme.danger, () {
                              ws.send('direct_ptt.end', {'callId': incomingCall!.callId, 'channelId': incomingCall!.channelId});
                              onDismiss();
                            }),
                            const SizedBox(width: 16),
                            _callButton('Accept', Icons.call, AppTheme.success, () {
                              Navigator.pushNamed(context, '/ptt', arguments: incomingCall!.channelId);
                              onDismiss();
                            }),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _callButton(String label, IconData icon, Color color, VoidCallback onPressed) {
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
