import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../state/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _pw = TextEditingController();
  String? _err;
  bool _busy = false;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await ref
          .read(authControllerProvider)
          .signIn(_email.text.trim(), _pw.text);
      // session 变化由 authStateProvider 推动 root_gate
    } catch (e) {
      setState(() => _err = '登录失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: '邮箱')),
          const SizedBox(height: 12),
          TextField(
              controller: _pw,
              obscureText: true,
              decoration: const InputDecoration(labelText: '密码'),
              onSubmitted: (_) => _login()),
          if (_err != null)
            Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_err!,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 24),
          FilledButton(
              onPressed: _busy ? null : _login,
              child: Text(_busy ? '登录中…' : '登录')),
        ]),
      ),
    );
  }
}
