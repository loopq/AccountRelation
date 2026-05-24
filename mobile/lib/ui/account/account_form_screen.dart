import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/account.dart';
import '../../state/data_provider.dart';
import '../../state/vault_provider.dart';
import 'field_resolver.dart';
import 'cipher_field.dart';

class AccountFormScreen extends ConsumerStatefulWidget {
  final Account? account; // null=新增
  const AccountFormScreen({super.key, required this.account});
  @override
  ConsumerState<AccountFormScreen> createState() =>
      _AccountFormScreenState();
}

class _AccountFormScreenState extends ConsumerState<AccountFormScreen> {
  String? _platformId, _countryId, _registerEmailId, _subscribeAppleId;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _recovery = TextEditingController();
  final _note = TextEditingController();
  final _pw = TextEditingController();
  final _twofaKey = TextEditingController();
  bool _twofaEnabled = false;

  FieldState _pwState = FieldState.success; // 无密文默认 success（空）
  FieldState _faState = FieldState.success;

  String _category = 'email'; // 由平台推导

  @override
  void initState() {
    super.initState();
    final a = widget.account;
    if (a != null) {
      _platformId = a.platformId;
      _name.text = a.name;
      _phone.text = a.phone ?? '';
      _countryId = a.countryId;
      _recovery.text = a.recoveryEmail ?? '';
      _note.text = a.note ?? '';
      _twofaEnabled = a.twofaEnabled;
      _registerEmailId = a.registerEmailId;
      _subscribeAppleId = a.subscribeAppleId;
      _category = a.category;
      _pwState = a.encryptedPassword == null
          ? FieldState.success
          : FieldState.loading;
      _faState =
          a.encrypted2fa == null ? FieldState.success : FieldState.loading;
      _decryptPrefill();
    }
  }

  Future<void> _decryptPrefill() async {
    final crypto = ref.read(vaultProvider).crypto!;
    final a = widget.account!;
    if (a.encryptedPassword != null) {
      try {
        _pw.text = await crypto.decrypt(a.encryptedPassword!);
        _setS(() => _pwState = FieldState.success);
      } catch (_) {
        _setS(() => _pwState = FieldState.fail);
      }
    }
    if (a.encrypted2fa != null) {
      try {
        _twofaKey.text = await crypto.decrypt(a.encrypted2fa!);
        _setS(() => _faState = FieldState.success);
      } catch (_) {
        _setS(() => _faState = FieldState.fail);
      }
    }
  }

  void _setS(VoidCallback fn) {
    if (mounted) setState(fn);
  }

  bool get _loading =>
      _pwState == FieldState.loading || _faState == FieldState.loading;

  Future<void> _save(dynamic data) async {
    final crypto = ref.read(vaultProvider).crypto!;
    final plat = data.platformById(_platformId);
    if (plat == null) {
      _toast('请选择平台');
      return;
    }
    if (_name.text.trim().isEmpty) {
      _toast('请填账号名');
      return;
    }
    final cat = plat.category;

    // 关联类别断言（spec §9）
    if (_registerEmailId != null &&
        data.byId(_registerEmailId)?.category != 'email') {
      _toast('注册邮箱必须是 Email 账号');
      return;
    }
    if (_subscribeAppleId != null &&
        data.byId(_subscribeAppleId)?.category != 'apple') {
      _toast('订阅 Apple 必须是 Apple 账号');
      return;
    }

    final a = widget.account;
    final row = <String, dynamic>{
      'category': cat,
      'platform_id': plat.id,
      'name': _name.text.trim(),
      'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
      'register_email_id':
          (cat == 'apple' || cat == 'ai') ? _registerEmailId : null,
      'subscribe_apple_id': cat == 'ai' ? _subscribeAppleId : null,
    };
    if (cat == 'email' || cat == 'apple') {
      row['phone'] =
          _phone.text.trim().isEmpty ? null : _phone.text.trim();
      row['country_id'] = _countryId;
      row['twofa_enabled'] = _twofaEnabled;
      row['recovery_email'] =
          _recovery.text.trim().isEmpty ? null : _recovery.text.trim();
    } else {
      row['phone'] = null;
      row['country_id'] = null;
      row['twofa_enabled'] = false;
      row['recovery_email'] = null;
    }
    // 密码（所有类别）
    row['encrypted_password'] = await resolveCipher(
        text: _pw.text,
        state: _pwState,
        original: a?.encryptedPassword,
        encryptText: crypto.encrypt);
    // 2FA 密钥（email/apple）
    row['encrypted_2fa'] = (cat == 'email' || cat == 'apple')
        ? await resolveCipher(
            text: _twofaKey.text,
            state: _faState,
            original: a?.encrypted2fa,
            encryptText: crypto.encrypt)
        : null;

    final repo = ref.read(accountRepoProvider);
    if (a == null) {
      await repo.insertAccount(row);
    } else {
      await repo.updateAccount(a.id, row);
    }
    if (mounted) {
      refreshGraph(ref);
      Navigator.of(context).pop();
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final dataAsync = ref.watch(graphDataProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.account == null ? '新增账号' : '编辑账号'),
        actions: [
          if (widget.account != null)
            IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () => _confirmDelete()),
        ],
      ),
      body: dataAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (data) => _buildForm(data),
      ),
    );
  }

  Widget _buildForm(dynamic data) {
    final plat = data.platformById(_platformId);
    final cat = plat?.category ?? _category;
    final showEmailApple = cat == 'email' || cat == 'apple';
    final showRegister = cat == 'apple' || cat == 'ai';
    final showSubscribe = cat == 'ai';

    return ListView(padding: const EdgeInsets.all(16), children: [
      DropdownButtonFormField<String>(
        initialValue: _platformId,
        decoration: const InputDecoration(labelText: '平台 *'),
        items: (data.platforms as List).map<DropdownMenuItem<String>>((p) =>
            DropdownMenuItem(
                value: p.id,
                child: Text(
                    '${_catLabel(p.category)} ${p.name}'))).toList(),
        onChanged: (v) => setState(() => _platformId = v),
      ),
      TextField(
          controller: _name,
          decoration:
              const InputDecoration(labelText: '账号名 *')),
      if (showEmailApple) ...[
        TextField(
            controller: _phone,
            decoration:
                const InputDecoration(labelText: '绑定手机号')),
        DropdownButtonFormField<String>(
          initialValue: _countryId,
          decoration:
              const InputDecoration(labelText: '国家 / 地区'),
          items: [
            const DropdownMenuItem(value: null, child: Text('— 无 —')),
            ...(data.countries as List).map<DropdownMenuItem<String>>(
                (c) => DropdownMenuItem(
                    value: c.id, child: Text(c.name)))
          ],
          onChanged: (v) => setState(() => _countryId = v),
        ),
        TextField(
            controller: _recovery,
            decoration:
                const InputDecoration(labelText: '辅助邮箱')),
        SwitchListTile(
            value: _twofaEnabled,
            onChanged: (v) => setState(() => _twofaEnabled = v),
            title: const Text('已开启 2FA 两步验证')),
        CipherField(
            controller: _twofaKey,
            state: _faState,
            label: '2FA 密钥 / TOTP 种子',
            hadCipher: widget.account?.encrypted2fa != null),
      ],
      if (showRegister)
        DropdownButtonFormField<String>(
          initialValue: _registerEmailId,
          decoration: const InputDecoration(
              labelText: '注册邮箱（关联 Email 账号）'),
          items: [
            const DropdownMenuItem(value: null, child: Text('— 无 —')),
            ...(data.accounts as List)
                .where((x) => x.category == 'email')
                .map<DropdownMenuItem<String>>(
                    (x) => DropdownMenuItem(
                        value: x.id, child: Text(x.name)))
          ],
          onChanged: (v) => setState(() => _registerEmailId = v),
        ),
      if (showSubscribe)
        DropdownButtonFormField<String>(
          initialValue: _subscribeAppleId,
          decoration: const InputDecoration(
              labelText: '订阅 Apple（关联 Apple 账号）'),
          items: [
            const DropdownMenuItem(value: null, child: Text('— 无 —')),
            ...(data.accounts as List)
                .where((x) => x.category == 'apple')
                .map<DropdownMenuItem<String>>(
                    (x) => DropdownMenuItem(
                        value: x.id, child: Text(x.name)))
          ],
          onChanged: (v) => setState(() => _subscribeAppleId = v),
        ),
      CipherField(
          controller: _pw,
          state: _pwState,
          label: '密码',
          hadCipher: widget.account?.encryptedPassword != null),
      TextField(
          controller: _note,
          decoration: const InputDecoration(labelText: '备注'),
          maxLines: 2),
      const SizedBox(height: 24),
      FilledButton(
        onPressed: _loading ? null : () => _save(data),
        child: Text(_loading ? '解密中…请稍候' : '保存'),
      ),
    ]);
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('删除账号'),
              content: const Text('确定删除？不可恢复。'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('删除')),
              ],
            ));
    if (ok == true) {
      await ref
          .read(accountRepoProvider)
          .deleteAccount(widget.account!.id);
      if (mounted) {
        refreshGraph(ref);
        Navigator.of(context).pop();
      }
    }
  }
}

String _catLabel(String c) => switch (c) {
      'email' => '📧',
      'apple' => '🍎',
      'ai' => '🤖',
      _ => '',
    };
