import 'dart:convert';
import 'dart:math';
import '../../core/crypto/vault_crypto.dart';
import '../../data/models/account.dart';
import '../../data/repositories/account_repository.dart';
import '../../data/repositories/meta_repository.dart';

/// 重加密计划（纯函数，可单测）：只含带密文账户，password→ct、2fa→fa，新 key 重加密。
class RotationPlan {
  final List<Map<String, dynamic>> updates;
  final int expectedCount;
  RotationPlan(this.updates, this.expectedCount);
}

Future<RotationPlan> buildRotationUpdates(
    List<Account> accounts, VaultCrypto oldCrypto, VaultCrypto newCrypto) async {
  final toRotate = accounts.where((a) => a.hasSecret).toList();
  final updates = <Map<String, dynamic>>[];
  for (final a in toRotate) {
    final upd = <String, dynamic>{'id': a.id};
    if (a.encryptedPassword != null) {
      upd['ct'] = await newCrypto.encrypt(await oldCrypto.decrypt(a.encryptedPassword!));
    }
    if (a.encrypted2fa != null) {
      upd['fa'] = await newCrypto.encrypt(await oldCrypto.decrypt(a.encrypted2fa!));
    }
    updates.add(upd);
  }
  return RotationPlan(updates, toRotate.length);
}

/// 返回成功后的新 VaultCrypto（调用方 swapKey）。
Future<VaultCrypto> changeMasterPassword({
  required String newPassword,
  required VaultCrypto oldCrypto,
  required AccountRepository accountRepo,
  required MetaRepository metaRepo,
}) async {
  // 1. 强制重新全量拉取（不复用陈旧内存）
  final accounts = await accountRepo.loadAccounts();
  // 2. 新 salt + 新 key
  final saltB64 = base64.encode(List<int>.generate(16, (_) => Random.secure().nextInt(256)));
  final newCrypto = await VaultCrypto.derive(password: newPassword, saltB64: saltB64);
  // 3. 构造重加密计划（纯函数，round-trip 已单测）
  final plan = await buildRotationUpdates(accounts, oldCrypto, newCrypto);
  // 4. 新 canary + rotate（必传 expected_count，不一致服务端回滚）
  final newCanary = await newCrypto.encrypt(kCanaryPlain);
  await metaRepo.rotateMasterKey(
      saltB64: saltB64, canary: newCanary, updates: plan.updates, expectedCount: plan.expectedCount);
  return newCrypto; // 仅在 RPC 成功后返回 → 调用方 swapKey
}
