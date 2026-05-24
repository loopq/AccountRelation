import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/vault_meta.dart';

class MetaRepository {
  final SupabaseClient _db;
  MetaRepository(this._db);

  Future<VaultMeta?> fetchMeta() async {
    final row = await _db.from('vault_meta').select('salt,canary').eq('id', 1).maybeSingle();
    return row == null ? null : VaultMeta.fromJson(row);
  }

  /// 首次初始化；若并发冲突（已存在）则返回 false，调用方转 canary 校验分支。
  Future<bool> initMeta(String saltB64, String canary) async {
    try {
      await _db.from('vault_meta').insert({'id': 1, 'salt': saltB64, 'canary': canary});
      return true;
    } on PostgrestException catch (e) {
      if (e.code == '23505') return false; // unique_violation：已被其他设备初始化
      rethrow;
    }
  }

  /// updates: [{id, ct?, fa?}]；expectedCount = 本次 loadAll 中 hasSecret 的账户数。
  Future<void> rotateMasterKey({
    required String saltB64,
    required String canary,
    required List<Map<String, dynamic>> updates,
    required int expectedCount,
  }) async {
    await _db.rpc('rotate_master_key', params: {
      'p_salt': saltB64,
      'p_canary': canary,
      'p_updates': updates,
      'p_expected_count': expectedCount,
    });
  }
}
