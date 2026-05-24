import 'dart:convert';
import '../core/crypto/vault_crypto.dart';
import '../data/models/vault_meta.dart';

/// 解锁决策纯类：依赖注入的窄 IO，不碰 Riverpod/Supabase。
class VaultUnlocker {
  final Future<VaultMeta?> Function() fetchMeta;
  final Future<bool> Function(String saltB64, String canary) initMeta;
  final List<int> Function(int n) randomBytes;

  VaultUnlocker({required this.fetchMeta, required this.initMeta, required this.randomBytes});

  Future<VaultCrypto> unlock(String password) async {
    final meta = await fetchMeta();
    if (meta == null) {
      final saltB64 = base64.encode(randomBytes(16));
      final c = await VaultCrypto.derive(password: password, saltB64: saltB64);
      final ok = await initMeta(saltB64, await c.encrypt(kCanaryPlain));
      if (ok) return c;
      final m2 = await fetchMeta(); // 并发冲突：别人已初始化，转非首次
      return _verify(password, m2!);
    }
    return _verify(password, meta);
  }

  Future<VaultCrypto> _verify(String password, VaultMeta meta) async {
    final c = await VaultCrypto.derive(password: password, saltB64: meta.salt);
    try {
      if (await c.decrypt(meta.canary) != kCanaryPlain) throw VaultAuthException();
    } on VaultException {
      throw VaultAuthException();
    }
    return c;
  }
}
