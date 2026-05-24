import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/core/crypto/vault_crypto.dart';
import 'package:account_graph/data/models/vault_meta.dart';
import 'package:account_graph/state/vault_unlocker.dart';

void main() {
  const pw = 'master-pw';

  test('首次：meta 为空 → 初始化并返回可解 canary 的 crypto', () async {
    VaultMeta? stored;
    final u = VaultUnlocker(
      fetchMeta: () async => stored,
      initMeta: (salt, canary) async { stored = VaultMeta(salt: salt, canary: canary); return true; },
      randomBytes: (n) => List.filled(n, 7),
    );
    final c = await u.unlock(pw);
    expect(await c.decrypt(stored!.canary), kCanaryPlain);
  });

  test('非首次：正确密码解锁', () async {
    final salt = base64.encode(List.filled(16, 3));
    final seed = await VaultCrypto.derive(password: pw, saltB64: salt);
    final meta = VaultMeta(salt: salt, canary: await seed.encrypt(kCanaryPlain));
    final u = VaultUnlocker(
        fetchMeta: () async => meta, initMeta: (_, __) async => true, randomBytes: (n) => List.filled(n, 0));
    final c = await u.unlock(pw);
    expect(await c.decrypt(meta.canary), kCanaryPlain);
  });

  test('非首次：错误密码 → VaultAuthException', () async {
    final salt = base64.encode(List.filled(16, 3));
    final seed = await VaultCrypto.derive(password: pw, saltB64: salt);
    final meta = VaultMeta(salt: salt, canary: await seed.encrypt(kCanaryPlain));
    final u = VaultUnlocker(
        fetchMeta: () async => meta, initMeta: (_, __) async => true, randomBytes: (n) => List.filled(n, 0));
    expect(() => u.unlock('wrong-pw'), throwsA(isA<VaultAuthException>()));
  });

  test('并发冲突：initMeta 返回 false → 转用已存在 meta 验证', () async {
    final salt = base64.encode(List.filled(16, 9));
    final other = await VaultCrypto.derive(password: pw, saltB64: salt);
    final existing = VaultMeta(salt: salt, canary: await other.encrypt(kCanaryPlain));
    int calls = 0;
    final u = VaultUnlocker(
      fetchMeta: () async => calls++ == 0 ? null : existing, // 首次 null；冲突后返回别人写的
      initMeta: (_, __) async => false,                      // 模拟 unique 冲突
      randomBytes: (n) => List.filled(n, 1),
    );
    final c = await u.unlock(pw);
    expect(await c.decrypt(existing.canary), kCanaryPlain);
  });
}
