import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/core/crypto/vault_crypto.dart';

void main() {
  test('导出 key bytes 再还原 → 仍能解开同一密文', () async {
    final fx = jsonDecode(File('test/fixtures/golden_vectors.json').readAsStringSync());
    final c1 = await VaultCrypto.derive(password: fx['password'], saltB64: fx['saltB64']);
    final packed = await c1.encrypt('persist-me');

    final bytes = await c1.exportKeyBytes();
    expect(bytes.length, 32); // 256-bit

    // 模拟 secure storage 往返（base64 编解码）
    final restored = VaultCrypto.fromKeyBytes(base64.decode(base64.encode(bytes)));
    expect(await restored.decrypt(packed), 'persist-me');

    // 还原后的 key 也能解 Web 写入的黄金向量
    expect(await restored.decrypt(fx['canaryPacked']), fx['canaryPlain']);
  });
}
