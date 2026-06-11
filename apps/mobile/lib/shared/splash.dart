import 'package:flutter/material.dart';
import '../core/theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(colors: [AppTheme.primary, AppTheme.primaryDark]),
                boxShadow: AppShadows.glow(AppTheme.glowBlue),
              ),
              child: const Icon(Icons.radio, color: Colors.white, size: 40),
            ),
            const SizedBox(height: 24),
            const Text(
              'VOXRELAY',
              style: TextStyle(color: AppTheme.text, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 8),
            ),
            const SizedBox(height: 8),
            const Text(
              'PTT COMMUNICATION',
              style: TextStyle(color: AppTheme.textDim, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 4),
            ),
            const SizedBox(height: 32),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}
