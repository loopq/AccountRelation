import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/storage/secure_store.dart';

final secureStoreProvider = Provider((_) => SecureStore());

/// 配置是否就绪（决定是否进 config 门）
final supaConfigProvider = FutureProvider<({String url, String key})?>((ref) async {
  final s = ref.read(secureStoreProvider);
  final url = await s.getSupaUrl();
  final key = await s.getSupaKey();
  if (url == null || key == null) return null;
  return (url: url, key: key);
});

/// 已初始化的 SupabaseClient（配置就绪后可用）
final supabaseClientProvider = Provider<SupabaseClient>((ref) {
  // 在 root_gate 确认配置后调用 Supabase.initialize；此处返回全局实例
  return Supabase.instance.client;
});
