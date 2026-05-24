import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/core/crypto/vault_crypto.dart';

void main() {
  final fixture = jsonDecode(File('test/fixtures/golden_vectors.json').readAsStringSync())
      as Map<String, dynamic>;
  final password = fixture['password'] as String;
  final saltB64 = fixture['saltB64'] as String;

  late VaultCrypto crypto;
  setUp(() async {
    crypto = await VaultCrypto.derive(password: password, saltB64: saltB64);
  });

  group('Web→Dart 解密（字节级互通）', () {
    for (final v in (fixture['vectors'] as List)) {
      final pt = v['plaintext'] as String;
      final packed = v['packed'] as String;
      test('解密: "${pt.length > 12 ? '${pt.substring(0, 12)}…' : pt}"', () async {
        expect(await crypto.decrypt(packed), pt);
      });
    }
    test('canary 解密一致', () async {
      expect(await crypto.decrypt(fixture['canaryPacked'] as String),
          fixture['canaryPlain'] as String);
    });
  });

  group('Dart 自洽 round-trip', () {
    for (final pt in ['hunter2', '', '密码🔐', 'é', 'x' * 5000]) {
      test('round-trip: len=${pt.length}', () async {
        expect(await crypto.decrypt(await crypto.encrypt(pt)), pt);
      });
    }
  });

  group('错误向量必须按类型失败', () {
    test('错版本 → VaultFormatException', () {
      expect(() => crypto.decrypt('v1:AAAA:BBBB'), throwsA(isA<VaultVersionException>()));
    });
    test('段数≠3 → VaultFormatException', () {
      expect(() => crypto.decrypt('v2:onlytwo'), throwsA(isA<VaultFormatException>()));
    });
    test('iv 长度错（11 字节）→ VaultFormatException', () {
      final badIv = base64.encode(List.filled(11, 0));
      expect(() => crypto.decrypt('v2:$badIv:${base64.encode(List.filled(32, 0))}'),
          throwsA(isA<VaultFormatException>()));
    });
    test('ct 不足 16 字节 → VaultFormatException', () {
      final iv = base64.encode(List.filled(12, 0));
      expect(() => crypto.decrypt('v2:$iv:${base64.encode(List.filled(8, 0))}'),
          throwsA(isA<VaultFormatException>()));
    });
    test('tag 篡改 → VaultAuthException', () async {
      final good = await crypto.encrypt('hello');
      final parts = good.split(':');
      final ct = base64.decode(parts[2]);
      ct[ct.length - 1] ^= 0xFF; // 翻转 tag 末字节
      final tampered = 'v2:${parts[1]}:${base64.encode(ct)}';
      expect(() => crypto.decrypt(tampered), throwsA(isA<VaultAuthException>()));
    });
  });
}
