import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/crypto/vault_crypto.dart';
import '../../data/models/vault_meta.dart';
import '../../data/repositories/meta_repository.dart';
import '../../state/data_provider.dart';
import '../../state/vault_provider.dart';
import '../../state/auth_provider.dart';
import '../../state/theme_provider.dart';
import '../../state/supabase_provider.dart';
import 'import_logic.dart';
import 'change_master_password.dart';

class SettingsDrawer extends ConsumerWidget {
  const SettingsDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dataAsync = ref.watch(graphDataProvider);
    return Drawer(
      child: SafeArea(
        child: dataAsync.when(
          loading: () =>
              const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (data) => ListView(children: [
            const ListTile(
                title: Text('设置',
                    style:
                        TextStyle(fontWeight: FontWeight.bold))),
            ExpansionTile(
                title: const Text('平台管理'),
                children: [
                  ...data.platforms.map((p) => ListTile(
                        title: Text('${p.category} · ${p.name}'),
                        trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              if (data.platformInUse(p.id)) {
                                _toast(context,
                                    '有账号在用此平台，不能删');
                                return;
                              }
                              await ref
                                  .read(accountRepoProvider)
                                  .deletePlatform(p.id);
                              refreshGraph(ref);
                            }),
                      )),
                  ListTile(
                      title: const Text('+ 新增平台'),
                      onTap: () =>
                          _addPlatformDialog(context, ref)),
                ]),
            ExpansionTile(
                title: const Text('国家管理'),
                children: [
                  ...data.countries.map((c) => ListTile(
                        title: Text(c.name),
                        trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              if (data.countryInUse(c.id)) {
                                _toast(context,
                                    '有账号在用此国家，不能删');
                                return;
                              }
                              await ref
                                  .read(accountRepoProvider)
                                  .deleteCountry(c.id);
                              refreshGraph(ref);
                            }),
                      )),
                  ListTile(
                      title: const Text('+ 新增国家'),
                      onTap: () =>
                          _addCountryDialog(context, ref)),
                ]),
            const ListTile(
                title: Text('主题'),
                trailing: _ThemeSelector()),
            ListTile(
                title: const Text('改主密码'),
                onTap: () => _changePwDialog(context, ref)),
            ListTile(
                title: const Text('批量导入'),
                onTap: () =>
                    _importDialog(context, ref, data)),
            ListTile(
                title: const Text('重新配置 Supabase'),
                onTap: () async {
                  await ref
                      .read(secureStoreProvider)
                      .setSupaConfig('', ''); // 清空触发 config 门
                  ref.invalidate(supaConfigProvider);
                }),
            const Divider(),
            ListTile(
                leading: const Icon(Icons.lock),
                title: const Text('锁定'),
                onTap: () {
                  ref.read(vaultProvider.notifier).lock();
                  Navigator.pop(context);
                }),
            ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('退出登录'),
                onTap: () async {
                  await ref.read(vaultProvider.notifier).wipe();
                  await ref
                      .read(authControllerProvider)
                      .signOut();
                }),
          ]),
        ),
      ),
    );
  }

  Future<void> _changePwDialog(
      BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final oldPw = TextEditingController();
    final newPw = TextEditingController();
    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('改主密码'),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                        controller: oldPw,
                        obscureText: true,
                        decoration: const InputDecoration(
                            labelText: '旧主密码（验证）')),
                    TextField(
                        controller: newPw,
                        obscureText: true,
                        decoration: const InputDecoration(
                            labelText: '新主密码')),
                  ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('确认')),
              ],
            ));
    if (ok != true) return;
    final db = ref.read(supabaseClientProvider);
    final meta = MetaRepository(db);
    try {
      final m = await meta.fetchMeta();
      if (m == null) {
        messenger.showSnackBar(
            const SnackBar(content: Text('改密失败：vault_meta 未初始化')));
        return;
      }
      final probe = await verifyOld(oldPw.text, m);
      final newCrypto = await changeMasterPassword(
          newPassword: newPw.text,
          oldCrypto: probe,
          accountRepo: ref.read(accountRepoProvider),
          metaRepo: meta);
      await ref.read(vaultProvider.notifier).swapKey(newCrypto);
      refreshGraph(ref);
      messenger.showSnackBar(
          const SnackBar(content: Text('主密码已更新')));
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text('改密失败：$e（DB 未变，旧密码仍有效）')));
    }
  }

  Future<void> _importDialog(
      BuildContext context, WidgetRef ref, dynamic data) async {
    final messenger = ScaffoldMessenger.of(context);
    final ctrl = TextEditingController();
    final go = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('批量导入（粘贴 JSON 数组）'),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                        '⚠️ 重复执行会产生重复账号；不支持关联字段。',
                        style: TextStyle(fontSize: 12)),
                    TextField(
                        controller: ctrl,
                        maxLines: 8,
                        decoration: const InputDecoration(
                            hintText: '[{...}]')),
                  ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('导入')),
              ],
            ));
    if (go != true) return;
    final crypto = ref.read(vaultProvider).crypto!;
    final repo = ref.read(accountRepoProvider);
    int okCount = 0, fail = 0;
    final errs = <String>[];
    try {
      final arr = jsonDecode(ctrl.text) as List;
      for (final item in arr) {
        final r = resolveImportRow(item as Map<String, dynamic>,
            data.platforms, data.countries);
        if (r.error != null) {
          fail++;
          errs.add(r.error!);
          continue;
        }
        final row = Map<String, dynamic>.from(r.row!);
        row['encrypted_password'] = r.passwordPlain == null
            ? null
            : await crypto.encrypt(r.passwordPlain!);
        row['encrypted_2fa'] = r.twofaSecretPlain == null
            ? null
            : await crypto.encrypt(r.twofaSecretPlain!);
        try {
          await repo.insertAccount(row);
          okCount++;
        } catch (e) {
          fail++;
          errs.add('${row['name']}: $e');
        }
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('JSON 解析失败：$e')));
      return;
    }
    refreshGraph(ref);
    messenger.showSnackBar(SnackBar(
        content: Text(
            '导入：成功 $okCount，失败 $fail${errs.isEmpty ? '' : ' — ${errs.join('; ')}'}')));
  }

  /// 新增平台：category 三选一 + 名称输入，调 addPlatform 后 refreshGraph。
  Future<void> _addPlatformDialog(
      BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    String selectedCat = 'email';
    final nameCtrl = TextEditingController();

    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => StatefulBuilder(
              builder: (c, setDialogState) => AlertDialog(
                title: const Text('新增平台'),
                content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: selectedCat,
                        decoration: const InputDecoration(
                            labelText: '分类'),
                        items: const [
                          DropdownMenuItem(
                              value: 'email',
                              child: Text('📧 Email')),
                          DropdownMenuItem(
                              value: 'apple',
                              child: Text('🍎 Apple')),
                          DropdownMenuItem(
                              value: 'ai',
                              child: Text('🤖 AI')),
                        ],
                        onChanged: (v) {
                          if (v != null) {
                            setDialogState(
                                () => selectedCat = v);
                          }
                        },
                      ),
                      const SizedBox(height: 12),
                      TextField(
                          controller: nameCtrl,
                          decoration: const InputDecoration(
                              labelText: '平台名称 *')),
                    ]),
                actions: [
                  TextButton(
                      onPressed: () =>
                          Navigator.pop(c, false),
                      child: const Text('取消')),
                  FilledButton(
                      onPressed: () =>
                          Navigator.pop(c, true),
                      child: const Text('添加')),
                ],
              ),
            ));
    if (ok != true) return;
    final name = nameCtrl.text.trim();
    if (name.isEmpty) {
      messenger.showSnackBar(
          const SnackBar(content: Text('平台名称不能为空')));
      return;
    }
    try {
      await ref
          .read(accountRepoProvider)
          .addPlatform(selectedCat, name, null);
      refreshGraph(ref);
      messenger.showSnackBar(
          SnackBar(content: Text('平台「$name」已添加')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('添加失败：$e')));
    }
  }

  /// 新增国家：名称 + 颜色（十六进制，如 #ff5500），调 addCountry 后 refreshGraph。
  Future<void> _addCountryDialog(
      BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final nameCtrl = TextEditingController();
    final colorCtrl = TextEditingController(text: '#5b8fb0');

    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('新增国家 / 地区'),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                        controller: nameCtrl,
                        decoration: const InputDecoration(
                            labelText: '名称 *')),
                    const SizedBox(height: 12),
                    TextField(
                        controller: colorCtrl,
                        decoration: const InputDecoration(
                            labelText: '颜色（#rrggbb）',
                            hintText: '#5b8fb0')),
                  ]),
              actions: [
                TextButton(
                    onPressed: () =>
                        Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () =>
                        Navigator.pop(c, true),
                    child: const Text('添加')),
              ],
            ));
    if (ok != true) return;
    final name = nameCtrl.text.trim();
    final color = colorCtrl.text.trim();
    if (name.isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('名称不能为空')));
      return;
    }
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color)) {
      messenger.showSnackBar(
          const SnackBar(content: Text('颜色格式错误，请输入 #rrggbb')));
      return;
    }
    try {
      await ref
          .read(accountRepoProvider)
          .addCountry(name, color);
      refreshGraph(ref);
      messenger.showSnackBar(
          SnackBar(content: Text('国家「$name」已添加')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('添加失败：$e')));
    }
  }
}

/// 验证旧主密码：用已存储的 salt 派生并验 canary；失败抛 VaultAuthException。
/// 签名简化：不依赖 WidgetRef。
Future<VaultCrypto> verifyOld(
    String oldPassword, VaultMeta meta) async {
  final c =
      await VaultCrypto.derive(password: oldPassword, saltB64: meta.salt);
  try {
    if (await c.decrypt(meta.canary) != kCanaryPlain) {
      throw VaultAuthException();
    }
  } on VaultException {
    throw VaultAuthException();
  }
  return c;
}

class _ThemeSelector extends ConsumerWidget {
  const _ThemeSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeProvider);
    return DropdownButton<ThemeMode>(
      value: mode,
      items: const [
        DropdownMenuItem(
            value: ThemeMode.light, child: Text('亮')),
        DropdownMenuItem(
            value: ThemeMode.dark, child: Text('暗')),
        DropdownMenuItem(
            value: ThemeMode.system, child: Text('跟随系统')),
      ],
      onChanged: (m) {
        if (m != null) ref.read(themeProvider.notifier).set(m);
      },
    );
  }
}

void _toast(BuildContext c, String m) =>
    ScaffoldMessenger.of(c)
        .showSnackBar(SnackBar(content: Text(m)));
