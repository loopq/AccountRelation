import '../../data/models/platform.dart';
import '../../data/models/country.dart';

class ImportResolved {
  final Map<String, dynamic>? row; // 不含加密字段
  final String? passwordPlain, twofaSecretPlain; // 待调用方加密
  final String? error;
  ImportResolved.ok(this.row, this.passwordPlain, this.twofaSecretPlain) : error = null;
  ImportResolved.fail(this.error) : row = null, passwordPlain = null, twofaSecretPlain = null;
}

ImportResolved resolveImportRow(
    Map<String, dynamic> item, List<Platform> platforms, List<Country> countries) {
  final plat = platforms.where((p) => p.name == item['platform']).firstOrNull;
  if (plat == null) return ImportResolved.fail('${item['name'] ?? '?'}: 平台「${item['platform']}」不存在');
  final ctry = item['country'] == null ? null
      : countries.where((c) => c.name == item['country']).firstOrNull;
  final row = <String, dynamic>{
    'category': plat.category, 'platform_id': plat.id, 'name': item['name'],
    'phone': item['phone'], 'twofa_enabled': item['twofa_enabled'] == true || item['twofa_enabled'] == 1,
    'recovery_email': item['recovery_email'], 'country_id': ctry?.id, 'note': item['note'],
    // 关联字段不支持导入（spec §10）
  };
  return ImportResolved.ok(row, item['password'] as String?, item['twofa_secret'] as String?);
}
