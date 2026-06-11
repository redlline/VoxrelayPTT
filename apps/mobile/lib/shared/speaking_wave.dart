import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/theme.dart';

class SpeakingWave extends StatefulWidget {
  final bool active;
  final Color color;
  final double height;
  final double width;

  const SpeakingWave({
    super.key,
    this.active = true,
    this.color = AppTheme.success,
    this.height = 32,
    this.width = 48,
  });

  @override
  State<SpeakingWave> createState() => _SpeakingWaveState();
}

class _SpeakingWaveState extends State<SpeakingWave>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;


  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    if (widget.active) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(SpeakingWave oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.active && _controller.isAnimating) {
      _controller.stop();
      _controller.reset();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return CustomPaint(
          size: Size(widget.width, widget.height),
          painter: _WavePainter(
            value: _controller.value,
            active: widget.active,
            color: widget.color,
          ),
        );
      },
    );
  }
}

class _WavePainter extends CustomPainter {
  final double value;
  final bool active;
  final Color color;

  _WavePainter({required this.value, required this.active, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    if (!active) return;
    final paint = Paint()
      ..color = color.withOpacity(0.6)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    const bars = 4;
    final barWidth = size.width / (bars * 2);
    final centerY = size.height / 2;

    for (int i = 0; i < bars; i++) {
      final phase = (i / bars) * math.pi * 2;
      final amplitude = (math.sin(value * math.pi * 2 + phase) + 1) / 2;
      final barHeight = 4 + (size.height - 8) * amplitude * 0.8;

      final x = barWidth + (i * barWidth * 2);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(x, centerY),
            width: barWidth * 0.6,
            height: barHeight,
          ),
          const Radius.circular(2),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _WavePainter old) => old.value != value;
}
