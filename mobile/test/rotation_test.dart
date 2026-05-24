import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/core/crypto/vault_crypto.dart';
import 'package:account_graph/data/models/account.dart';
import 'package:account_graph/ui/settings/change_master_password.dart';

void main() {
  late VaultCrypto oldC, newC;
  setUp(() async {
    oldC = await VaultCrypto.derive(password: 'old-pw', saltB64: base64.encode(List.filled(16, 1)));
    newC = await VaultCrypto.derive(password: 'new-pw', saltB64: base64.encode(List.filled(16, 2)));
  });

  test('只轮换 hasSecret 账户；expectedCount = 待轮换数', () async {
    final accounts = [
      Account(id: 'a1', category: 'email', name: 'x', encryptedPassword: await oldC.encrypt('p1')),
      Account(id: 'a2', category: 'email', name: 'y'), // 无密文，不进 updates
    ];
    final plan = await buildRotationUpdates(accounts, oldC, newC);
    expect(plan.updates.length, 1);
    expect(plan.expectedCount, 1);
    expect(plan.updates.first['id'], 'a1');
  });

  test('round-trip：新 key 能解开 updates 里的 ct/fa（防静默损坏）', () async {
    final accounts = [
      Account(id: 'a1', category: 'apple', name: 'x',
          encryptedPassword: await oldC.encrypt('secret-pw'),
          encrypted2fa: await oldC.encrypt('totp-seed')),
    ];
    final plan = await buildRotationUpdates(accounts, oldC, newC);
    final upd = plan.updates.first;
    expect(await newC.decrypt(upd['ct'] as String), 'secret-pw');
    expect(await newC.decrypt(upd['fa'] as String), 'totp-seed');
  });

  test('只有 password → upd 只含 ct；只有 2fa → 只含 fa', () async {
    final accounts = [
      Account(id: 'p', category: 'email', name: 'p', encryptedPassword: await oldC.encrypt('a')),
      Account(id: 'f', category: 'email', name: 'f', encrypted2fa: await oldC.encrypt('b')),
    ];
    final plan = await buildRotationUpdates(accounts, oldC, newC);
    final byId = {for (final u in plan.updates) u['id'] as String: u};
    expect(byId['p']!.containsKey('ct'), true);
    expect(byId['p']!.containsKey('fa'), false);
    expect(byId['f']!.containsKey('fa'), true);
    expect(byId['f']!.containsKey('ct'), false);
  });
}
