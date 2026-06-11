import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../core/providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isRegister = false;
  bool _isLoading = false;
  String? _error;
  late AnimationController _animController;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _animController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _isLoading = true; _error = null; });
    final auth = context.read<AuthProvider>();
    auth.clearAuthFail();
    try {
      if (_isRegister) {
        await auth.register(_emailController.text.trim(), _passwordController.text, _nameController.text.trim());
      } else {
        await auth.login(_emailController.text.trim(), _passwordController.text);
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnim,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(colors: [AppTheme.primary, AppTheme.primaryDark]),
                      boxShadow: AppShadows.glow(AppTheme.glowBlue),
                    ),
                    child: const Icon(Icons.radio, color: Colors.white, size: 36),
                  ),
                  const SizedBox(height: 20),
                  const Text('VOXRELAY', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: AppTheme.text, letterSpacing: 6)),
                  const SizedBox(height: 4),
                  Text(_isRegister ? 'CREATE ACCOUNT' : 'SIGN IN', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textMuted, letterSpacing: 4)),
                  const SizedBox(height: 40),
                  if (_isRegister)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: TextField(
                        controller: _nameController,
                        style: const TextStyle(color: AppTheme.text),
                        decoration: const InputDecoration(
                          hintText: 'Display Name',
                          prefixIcon: Icon(Icons.person_outline, color: AppTheme.textDim),
                        ),
                      ),
                    ),
                  TextField(
                    controller: _emailController,
                    style: const TextStyle(color: AppTheme.text),
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      hintText: 'Email',
                      prefixIcon: Icon(Icons.email_outlined, color: AppTheme.textDim),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwordController,
                    style: const TextStyle(color: AppTheme.text),
                    obscureText: true,
                    decoration: const InputDecoration(
                      hintText: 'Password',
                      prefixIcon: Icon(Icons.lock_outline, color: AppTheme.textDim),
                    ),
                  ),
                  if (_error != null || context.watch<AuthProvider>().authFailMessage != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.danger.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: AppTheme.danger, size: 16),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error ?? context.watch<AuthProvider>().authFailMessage ?? '',
                              style: const TextStyle(color: AppTheme.danger, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _submit,
                      child: _isLoading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text(_isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => setState(() { _isRegister = !_isRegister; _error = null; }),
                    child: Text(
                      _isRegister ? 'Already have an account? Sign In' : "Don't have an account? Create one",
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
