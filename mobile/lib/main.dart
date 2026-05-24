import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cryptography_flutter/cryptography_flutter.dart';
import 'state/theme_provider.dart';
import 'ui/theme/app_theme.dart';
import 'ui/gates/root_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // ignore: deprecated_member_use
  FlutterCryptography.enable(); // PBKDF2/AES-GCM 走系统原生（plan 要求保留）
  await SystemChrome.setPreferredOrientations(
      [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
  runApp(const ProviderScope(child: AccountGraphApp()));
}

class AccountGraphApp extends ConsumerWidget {
  const AccountGraphApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeProvider);
    return MaterialApp(
      title: '账号图谱',
      themeMode: mode,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      home: const RootGate(),
    );
  }
}
