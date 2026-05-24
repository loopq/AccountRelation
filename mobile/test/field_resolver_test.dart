import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/ui/account/field_resolver.dart';

void main() {
  // resolveCipher(currentText, fieldState, originalCipher, newCipherIfText)
  test('有文本 → 用新密文', () async {
    expect(await resolveCipher(text: 'newpw', state: FieldState.success,
        original: 'v2:old', encryptText: (t) async => 'v2:enc($t)'), 'v2:enc(newpw)');
  });
  test('空 + success（解密成功后清空）→ null（清除）', () async {
    expect(await resolveCipher(text: '', state: FieldState.success,
        original: 'v2:old', encryptText: (t) async => 'x'), null);
  });
  test('空 + fail（解密失败）→ 保留原密文', () async {
    expect(await resolveCipher(text: '', state: FieldState.fail,
        original: 'v2:old', encryptText: (t) async => 'x'), 'v2:old');
  });
  test('空 + 无原密文（success 初值）→ null', () async {
    expect(await resolveCipher(text: '', state: FieldState.success,
        original: null, encryptText: (t) async => 'x'), null);
  });
}
