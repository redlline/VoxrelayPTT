import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/ptt_provider.dart';
import '../core/theme.dart';

class PttButton extends StatefulWidget {
  final String channelId;
  final double size;

  const PttButton({super.key, required this.channelId, this.size = 120});

  @override
  State<PttButton> createState() => _PttButtonState();
}

class _PttButtonState extends State<PttButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  bool _holding = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Color _getColor(PttState state) {
    switch (state) {
      case PttState.idle:
        return AppTheme.primary;
      case PttState.requesting:
        return const Color(0xFFF59E0B);
      case PttState.speaking:
        return const Color(0xFF10B981);
      case PttState.denied:
        return const Color(0xFFEF4444);
    }
  }

  String _getLabel(PttState state) {
    switch (state) {
      case PttState.idle:
        return 'HOLD\nTO TALK';
      case PttState.requesting:
        return 'WAIT';
      case PttState.speaking:
        return 'TALK';
      case PttState.denied:
        return 'BUSY';
    }
  }

  IconData _getIcon(PttState state) {
    switch (state) {
      case PttState.idle:
        return Icons.mic_off;
      case PttState.requesting:
        return Icons.hourglass_top;
      case PttState.speaking:
        return Icons.mic;
      case PttState.denied:
        return Icons.block;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ptt = context.watch<PttProvider>();
    final state = ptt.state;
    final color = _getColor(state);

    return Listener(
      onPointerDown: (_) {
        if (_holding) return;
        _holding = true;
        ptt.joinAndStart(widget.channelId);
      },
      onPointerUp: (_) {
        if (!_holding) return;
        _holding = false;
        ptt.releaseFloor();
      },
      onPointerCancel: (_) {
        if (!_holding) return;
        _holding = false;
        ptt.releaseFloor();
      },
      child: AnimatedBuilder(
        listenable: _pulseAnimation,
        builder: (context, child) {
          final scale =
              state == PttState.speaking ? _pulseAnimation.value : 1.0;
          return Transform.scale(
            scale: scale,
            child: Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    color.withOpacity(0.9),
                    color.withOpacity(0.6),
                  ],
                ),
                boxShadow: [
                  BoxShadow(
                    color: color.withOpacity(
                        state == PttState.speaking ? 0.5 : 0.25),
                    blurRadius: state == PttState.speaking ? 32 : 16,
                    spreadRadius: state == PttState.speaking ? 4 : 1,
                  ),
                ],
                border: Border.all(
                  color: Colors.white.withOpacity(0.15),
                  width: 2,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(_getIcon(state), color: Colors.white, size: 36),
                  const SizedBox(height: 4),
                  Text(
                    _getLabel(state),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5,
                      height: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

}

class AnimatedBuilder extends AnimatedWidget {
  final Widget Function(BuildContext context, Widget? child) builder;
  final Widget? child;

  const AnimatedBuilder({
    super.key,
    required super.listenable,
    required this.builder,
    this.child,
  });

  @override
  Widget build(BuildContext context) => builder(context, child);
}
