import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/data/models/account.dart';

void main() {
  test('Account.fromJson 全字段映射 + hasSecret', () {
    final a = Account.fromJson({
      'id': 'a1', 'category': 'apple', 'name': 'Apple-A', 'platform_id': 'p1',
      'encrypted_password': 'v2:x', 'phone': '+86', 'twofa_enabled': true,
      'country_id': 'c1', 'register_email_id': 'e1', 'subscribe_apple_id': null,
      'note': 'n', 'recovery_email': 'r@x.com', 'encrypted_2fa': 'v2:y',
    });
    expect(a.id, 'a1');
    expect(a.category, 'apple');
    expect(a.platformId, 'p1');
    expect(a.encryptedPassword, 'v2:x');
    expect(a.twofaEnabled, true);
    expect(a.countryId, 'c1');
    expect(a.registerEmailId, 'e1');
    expect(a.subscribeAppleId, null);
    expect(a.recoveryEmail, 'r@x.com');
    expect(a.encrypted2fa, 'v2:y');
    expect(a.hasSecret, true);
  });

  test('twofa_enabled 缺省 → false；无密文 → hasSecret=false', () {
    final a = Account.fromJson({'id': 'a2', 'category': 'email', 'name': 'x'});
    expect(a.twofaEnabled, false);
    expect(a.hasSecret, false);
  });
}
