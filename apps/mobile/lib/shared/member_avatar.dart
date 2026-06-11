import 'package:flutter/material.dart';
import '../core/theme.dart';

class MemberAvatar extends StatelessWidget {
  final String? name;
  final String? imageUrl;
  final double size;
  final bool isOnline;
  final bool isSpeaking;
  final bool isMuted;

  const MemberAvatar({
    super.key,
    this.name,
    this.imageUrl,
    this.size = 40,
    this.isOnline = false,
    this.isSpeaking = false,
    this.isMuted = false,
  });

  @override
  Widget build(BuildContext context) {
    final initials = name != null && name!.isNotEmpty
        ? name!.split(' ').map((s) => s.isNotEmpty ? s[0] : '').take(2).join('').toUpperCase()
        : '?';

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isSpeaking ? AppTheme.success.withOpacity(0.2) : AppTheme.surfaceLight,
            border: Border.all(
              color: isSpeaking ? AppTheme.success : AppTheme.border,
              width: isSpeaking ? 2 : 1,
            ),
            boxShadow: isSpeaking
                ? [BoxShadow(color: AppTheme.success.withOpacity(0.3), blurRadius: 8)]
                : null,
          ),
          child: Center(
            child: Text(
              initials,
              style: TextStyle(
                color: isSpeaking ? AppTheme.success : AppTheme.textMuted,
                fontSize: size * 0.35,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
          ),
        ),
        if (isOnline)
          Positioned(
            bottom: 0,
            right: 0,
            child: Container(
              width: size * 0.3,
              height: size * 0.3,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.success,
                border: Border.all(color: AppTheme.surface, width: 2),
              ),
            ),
          ),
        if (isMuted)
          Positioned(
            top: -2,
            right: -2,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.danger,
              ),
              child: const Icon(Icons.mic_off, size: 10, color: Colors.white),
            ),
          ),
      ],
    );
  }
}
