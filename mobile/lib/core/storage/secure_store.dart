import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 统一封装 Supabase 配置 / master key bytes / 主题。
/// iOS：first_unlock_this_device + 不同步 iCloud；Android：EncryptedSharedPreferences。
class SecureStore {
  static const _opts = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,
    ),
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kSupaUrl = 'supa_url';
  static const _kSupaKey = 'supa_key';
  static const _kMasterKey = 'master_key_b64';
  static const _kTheme = 'theme_mode'; // light|dark|system

  // —— Supabase 配置 ——
  Future<String?> getSupaUrl() => _opts.read(key: _kSupaUrl);
  Future<String?> getSupaKey() => _opts.read(key: _kSupaKey);
  Future<void> setSupaConfig(String url, String key) async {
    await _opts.write(key: _kSupaUrl, value: url);
    await _opts.write(key: _kSupaKey, value: key);
  }

  // —— master key（base64 of raw 32 bytes）——
  Future<String?> getMasterKeyB64() => _opts.read(key: _kMasterKey);
  Future<void> setMasterKeyB64(String b64) => _opts.write(key: _kMasterKey, value: b64);
  Future<void> clearMasterKey() => _opts.delete(key: _kMasterKey);

  // —— 主题 ——
  Future<String?> getThemeMode() => _opts.read(key: _kTheme);
  Future<void> setThemeMode(String mode) => _opts.write(key: _kTheme, value: mode);
}
