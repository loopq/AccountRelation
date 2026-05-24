// mobile/test/dart_to_web_test.dart
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/core/crypto/vault_crypto.dart';

void main() {
  test('Dart 加密产物写盘，供 Node 反向解密校验', () async {
    final fx = jsonDecode(File('test/fixtures/golden_vectors.json').readAsStringSync());
    final crypto = await VaultCrypto.derive(password: fx['password'], saltB64: fx['saltB64']);
    final out = <Map<String, String>>[];
    for (final pt in ['hunter2', '密码🔐', 'é', '']) {
      out.add({'plaintext': pt, 'packed': await crypto.encrypt(pt)});
    }
    File('test/fixtures/dart_encrypted.json').writeAsStringSync(jsonEncode(out));
  });
}
