import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../state/supabase_provider.dart';
import '../../state/auth_provider.dart';
import '../../state/vault_provider.dart';
import 'config_screen.dart';
import 'login_screen.dart';
import 'unlock_screen.dart';
import '../home/home_screen.dart';

/// 决策顺序：无配置→config；未初始化 Supabase→初始化；未登录→login；未解锁→unlock；否则 home。
class RootGate extends ConsumerStatefulWidget {
  const RootGate({super.key});
  @override
  ConsumerState<RootGate> createState() => _RootGateState();
}

class _RootGateState extends ConsumerState<RootGate> {
  bool _supaReady = false;

  @override
  Widget build(BuildContext context) {
    final cfg = ref.watch(supaConfigProvider);
    return cfg.when(
      loading: () => const _Splash(),
      error: (e, _) => _ErrorScreen('$e'),
      data: (config) {
        if (config == null) return const ConfigScreen();
        if (!_supaReady) {
          _initSupabase(config.url, config.key);
          return const _Splash();
        }
        final session = ref.watch(sessionProvider);
        if (session == null) return const LoginScreen();
        final vault = ref.watch(vaultProvider);
        if (!vault.unlocked) return const UnlockScreen();
        return const HomeScreen();
      },
    );
  }

  Future<void> _initSupabase(String url, String key) async {
    if (_supaReady) return;
    try {
      await Supabase.initialize(url: url, anonKey: key);
    } catch (_) {
      // 已经初始化过（热重载 / 重新配置后 invalidate），直接标记就绪
    }
    if (mounted) setState(() => _supaReady = true);
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext c) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class _ErrorScreen extends StatelessWidget {
  final String msg;
  const _ErrorScreen(this.msg);
  @override
  Widget build(BuildContext c) => Scaffold(
      body: Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('启动失败：$msg'))));
}
