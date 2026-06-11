import 'package:flutter/material.dart';
import '../core/theme.dart';

class VoiceActivityIndicator extends StatelessWidget {
  final double level;

  const VoiceActivityIndicator({super.key, this.level = 0});

  @override
  Widget build(BuildContext context) {
    const bars = 8;
    final activeBars = (level * bars).round().clamp(0, bars);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(bars, (i) {
        final active = i < activeBars;
        return Container(
          width: 4,
          height: 6 + (i * 3).toDouble(),
          margin: const EdgeInsets.symmetric(horizontal: 1.5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            color: active ? AppTheme.success : AppTheme.textDim,
          ),
        );
      }),
    );
  }
}
