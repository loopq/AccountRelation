import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../state/supabase_provider.dart';

class ConfigScreen extends ConsumerStatefulWidget {
  const ConfigScreen({super.key});
  @override
  ConsumerState<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends ConsumerState<ConfigScreen> {
  final _url =
      TextEditingController(text: 'https://bpirywiujdxtxjwkfapi.supabase.co');
  final _key = TextEditingController(
      text: 'sb_publishable_Zqh_O6qPXdoGMFgwXMPpgQ_gtnEB-WO');
  bool _saving = false;

  Future<void> _save() async {
    setState(() => _saving = true);
    await ref
        .read(secureStoreProvider)
        .setSupaConfig(_url.text.trim(), _key.text.trim());
    ref.invalidate(supaConfigProvider); // 触发 root_gate 重判
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('配置 Supabase')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          TextField(
              controller: _url,
              decoration: const InputDecoration(labelText: 'Supabase URL')),
          const SizedBox(height: 12),
          TextField(
              controller: _key,
              decoration:
                  const InputDecoration(labelText: 'Publishable Key')),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? '保存中…' : '保存并连接'),
          ),
        ]),
      ),
    );
  }
}
