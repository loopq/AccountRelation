import 'dart:convert';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/crypto/vault_crypto.dart';
import '../data/repositories/meta_repository.dart';
import 'supabase_provider.dart';
import 'vault_unlocker.dart';

/// 内存中的解锁状态：null 表示锁定。
class VaultState {
  final VaultCrypto? crypto; // 非空=已解锁
  const VaultState(this.crypto);
  bool get unlocked => crypto != null;
}

class VaultController extends StateNotifier<VaultState> {
  VaultController(this._ref) : super(const VaultState(null));
  final Ref _ref;

  MetaRepository get _meta => MetaRepository(_ref.read(supabaseClientProvider));
  get _store => _ref.read(secureStoreProvider);

  /// 用主密码解锁：firstTime 则初始化 vault_meta，否则验证 canary。
  /// 成功后把 key bytes 写 secure storage。
  Future<void> unlockWithPassword(String password) async {
    final unlocker = VaultUnlocker(
      fetchMeta: _meta.fetchMeta,
      initMeta: _meta.initMeta,
      randomBytes: _randomBytes,
    );
    final c = await unlocker.unlock(password);
    await _persist(c);
    state = VaultState(c);
  }

  /// 冷启动/回前台：storage 有 key（生物识别已通过）→ 直接载入内存。
  Future<bool> unlockFromStorage() async {
    final b64 = await _store.getMasterKeyB64();
    if (b64 == null) return false;
    state = VaultState(VaultCrypto.fromKeyBytes(base64.decode(b64)));
    return true;
  }

  Future<void> _persist(VaultCrypto c) async =>
      _store.setMasterKeyB64(base64.encode(await c.exportKeyBytes()));

  /// 锁定：只清内存，保留 storage（回来走生物识别）。
  void lock() => state = const VaultState(null);

  /// 退出：清内存 + 删 storage key。（signOut 由 AuthController 负责）
  Future<void> wipe() async {
    state = const VaultState(null);
    await _store.clearMasterKey();
  }

  /// 改主密码成功后切换内存 key + 更新 storage。
  Future<void> swapKey(VaultCrypto newCrypto) async {
    await _persist(newCrypto);
    state = VaultState(newCrypto);
  }
}

final vaultProvider =
    StateNotifierProvider<VaultController, VaultState>((ref) => VaultController(ref));

List<int> _randomBytes(int n) {
  final rnd = Random.secure();
  return List<int>.generate(n, (_) => rnd.nextInt(256));
}
