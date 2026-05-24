import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';

/// 加密异常基类
abstract class VaultException implements Exception {}

/// 密文格式损坏（段数/iv 长度/ct 长度/base64）
class VaultFormatException implements VaultException {
  final String message;
  VaultFormatException(this.message);
  @override
  String toString() => 'VaultFormatException: $message';
}

/// 版本不符（非 v2）
class VaultVersionException implements VaultException {
  final String ver;
  VaultVersionException(this.ver);
  @override
  String toString() => 'VaultVersionException: $ver';
}

/// GCM tag 校验失败（主密码不一致 / 密文被篡改）
class VaultAuthException implements VaultException {
  @override
  String toString() => 'VaultAuthException: 主密码不一致或密文被篡改';
}

const String kCanaryPlain = 'account-graph-canary-v1';
const int _kIter = 600000;

class VaultCrypto {
  final SecretKey _key;
  static final _algo = AesGcm.with256bits();
  static final _pbkdf2 = Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: _kIter,
    bits: 256,
  );

  VaultCrypto._(this._key);

  /// 从主密码 + base64(salt) 派生 key。
  static Future<VaultCrypto> derive({required String password, required String saltB64}) async {
    final salt = base64.decode(saltB64);
    final key = await _pbkdf2.deriveKey(
      secretKey: SecretKey(utf8.encode(password)),
      nonce: salt,
    );
    return VaultCrypto._(key);
  }

  /// 从已派生的原始 key bytes 还原（secure storage 持久化用）。
  static VaultCrypto fromKeyBytes(List<int> keyBytes) => VaultCrypto._(SecretKey(keyBytes));

  Future<List<int>> exportKeyBytes() async => (await _key.extractBytes());

  /// 加密 → v2:b64(iv):b64(cipherText‖tag)，对齐 WebCrypto。
  Future<String> encrypt(String plaintext) async {
    final box = await _algo.encrypt(utf8.encode(plaintext), secretKey: _key);
    final packed = Uint8List(box.cipherText.length + box.mac.bytes.length)
      ..setAll(0, box.cipherText)
      ..setAll(box.cipherText.length, box.mac.bytes);
    return 'v2:${base64.encode(box.nonce)}:${base64.encode(packed)}';
  }

  /// 严格解包 + 解密。失败按类型抛异常（对齐 spec §2 校验表）。
  Future<String> decrypt(String packed) async {
    final parts = packed.split(':');
    if (parts.length != 3) throw VaultFormatException('段数=${parts.length}，应为 3');
    if (parts[0] != 'v2') throw VaultVersionException(parts[0]);

    final Uint8List iv, ctTag;
    try {
      iv = base64.decode(parts[1]);
      ctTag = base64.decode(parts[2]);
    } on FormatException catch (e) {
      throw VaultFormatException('base64 解码失败: ${e.message}');
    }
    if (iv.length != 12) throw VaultFormatException('iv 长度=${iv.length}，应为 12');
    if (ctTag.length < 16) throw VaultFormatException('ct 长度=${ctTag.length}，不足 16(tag)');

    final cipherText = ctTag.sublist(0, ctTag.length - 16);
    final mac = Mac(ctTag.sublist(ctTag.length - 16));
    try {
      final clear = await _algo.decrypt(
        SecretBox(cipherText, nonce: iv, mac: mac),
        secretKey: _key,
      );
      return utf8.decode(clear);
    } on SecretBoxAuthenticationError {
      throw VaultAuthException();
    }
  }
}
