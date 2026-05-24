import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/ui/settings/import_logic.dart';
import 'package:account_graph/data/models/platform.dart';
import 'package:account_graph/data/models/country.dart';

void main() {
  final platforms = [Platform(id: 'p1', category: 'email', name: 'Gmail')];
  final countries = [Country(id: 'c1', name: '美区', color: '#fff')];

  test('平台不存在 → 失败项', () {
    final r = resolveImportRow({'platform': 'X', 'name': 'a'}, platforms, countries);
    expect(r.error, contains('平台'));
  });
  test('正常 → category 推导自平台, country 命中', () {
    final r = resolveImportRow(
        {'platform': 'Gmail', 'name': 'a@x.com', 'country': '美区', 'twofa_enabled': 1}, platforms, countries);
    expect(r.error, null);
    expect(r.row!['category'], 'email');
    expect(r.row!['platform_id'], 'p1');
    expect(r.row!['country_id'], 'c1');
    expect(r.row!['twofa_enabled'], true);
    // 明文 password/twofa_secret 在调用方加密；此处仅透传待加密文本
    expect(r.passwordPlain, null);
  });
  test('country 找不到 → 静默 null', () {
    final r = resolveImportRow({'platform': 'Gmail', 'name': 'a', 'country': '火星'}, platforms, countries);
    expect(r.error, null);
    expect(r.row!['country_id'], null);
  });
}
