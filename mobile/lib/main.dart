import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cryptography_flutter/cryptography_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // ignore: deprecated_member_use
  FlutterCryptography.enable(); // PBKDF2/AES-GCM 走系统原生（plan 要求保留）
  await SystemChrome.setPreferredOrientations(
      [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
  runApp(const ProviderScope(child: AccountGraphApp()));
}

class AccountGraphApp extends StatelessWidget {
  const AccountGraphApp({super.key});
  @override
  Widget build(BuildContext context) {
    // 主题与 root 在 Phase 5/6 接入；此处先占位可编译
    return const MaterialApp(
      title: '账号图谱',
      home: Scaffold(body: Center(child: Text('账号图谱'))),
    );
  }
}
