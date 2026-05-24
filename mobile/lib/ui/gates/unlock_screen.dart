import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import '../../state/vault_provider.dart';
import '../../state/supabase_provider.dart';
import '../../core/crypto/vault_crypto.dart';

class UnlockScreen extends ConsumerStatefulWidget {
  const UnlockScreen({super.key});
  @override
  ConsumerState<UnlockScreen> createState() => _UnlockScreenState();
}

class _UnlockScreenState extends ConsumerState<UnlockScreen> {
  final _pw = TextEditingController();
  final _auth = LocalAuthentication();
  String? _err;
  bool _busy = false;
  bool _showPasswordFallback = false;

  @override
  void initState() {
    super.initState();
    _tryBiometric();
  }

  /// storage 有 key → 生物识别 → 载入内存。失败/取消/无生物识别 → 露出主密码兜底。
  Future<void> _tryBiometric() async {
    final hasStored =
        (await ref.read(secureStoreProvider).getMasterKeyB64()) != null;
    if (!hasStored) {
      setState(() => _showPasswordFallback = true);
      return;
    }
    try {
      final ok = await _auth.authenticate(
        localizedReason: '解锁账号图谱',
        options:
            const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
      );
      if (ok &&
          await ref.read(vaultProvider.notifier).unlockFromStorage()) {
        return;
      }
      setState(() => _showPasswordFallback = true);
    } catch (_) {
      // 生物识别集变更/不可用 → 清 storage key，强制主密码重解锁
      await ref.read(vaultProvider.notifier).wipe();
      setState(() => _showPasswordFallback = true);
    }
  }

  Future<void> _unlockWithPassword() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await ref.read(vaultProvider.notifier).unlockWithPassword(_pw.text);
    } on VaultAuthException {
      setState(() => _err = '主密码错误');
    } catch (e) {
      setState(() => _err = '解锁失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('解锁')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline, size: 48),
              const SizedBox(height: 16),
              if (!_showPasswordFallback)
                TextButton.icon(
                    onPressed: _tryBiometric,
                    icon: const Icon(Icons.fingerprint),
                    label: const Text('用生物识别解锁')),
              if (_showPasswordFallback) ...[
                TextField(
                    controller: _pw,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '主密码'),
                    onSubmitted: (_) => _unlockWithPassword()),
                if (_err != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_err!,
                          style: TextStyle(
                              color:
                                  Theme.of(context).colorScheme.error))),
                const SizedBox(height: 16),
                FilledButton(
                    onPressed: _busy ? null : _unlockWithPassword,
                    child: Text(_busy ? '派生密钥中…' : '用主密码解锁')),
              ],
            ]),
      ),
    );
  }
}
