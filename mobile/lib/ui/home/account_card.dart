import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/account.dart';
import '../../data/models/country.dart';
import '../../state/data_provider.dart';
import '../../state/vault_provider.dart';
import '../../core/crypto/vault_crypto.dart';
import '../theme/app_theme.dart';
import '../account/account_form_screen.dart';
import 'clipboard_util.dart';

class AccountCard extends ConsumerWidget {
  final Account account;
  final GraphData data;
  const AccountCard(
      {super.key, required this.account, required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = account;
    final colors = Theme.of(context).extension<AppColors>()!;
    final plat = data.platformById(a.platformId);
    final showCp2fa = a.category == 'email' || a.category == 'apple';
    final country = data.countryById(a.countryId);

    void openEdit(Account target) => Navigator.of(context).push(
        MaterialPageRoute(
            builder: (_) => AccountFormScreen(account: target)));

    Future<void> copyDecrypted(String? cipher, String label) async {
      final crypto = ref.read(vaultProvider).crypto;
      if (cipher == null || crypto == null) return;
      final messenger = ScaffoldMessenger.of(context);
      try {
        await EphemeralClipboard.instance.copy(await crypto.decrypt(cipher));
        messenger.showSnackBar(
            SnackBar(content: Text('$label 已复制（30s 后清空）')));
      } on VaultException {
        messenger.showSnackBar(
            const SnackBar(content: Text('解密失败(主密码不一致?)')));
      }
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: Border(
          left: BorderSide(color: colors.catColor(a.category), width: 4)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(plat?.name ?? '—',
                      style:
                          const TextStyle(fontWeight: FontWeight.bold)),
                  Text(a.name),
                ])),
            TextButton(
                onPressed: () => openEdit(a), child: const Text('编辑 ›')),
          ]),
          if (showCp2fa && country != null)
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: _CountryTag(country: country)),
          if (showCp2fa && a.phone != null)
            Text('手机 ${a.phone}${a.twofaEnabled ? '  · 2FA✓' : ''}'),
          if (showCp2fa && a.phone == null && a.twofaEnabled)
            const Text('2FA✓'),
          if (a.recoveryEmail != null) Text('辅邮 ${a.recoveryEmail}'),
          Text(
              a.encryptedPassword != null ? '密码 已加密 ✓' : '无密码',
              style: TextStyle(
                  color:
                      a.encryptedPassword != null ? colors.ok : null)),
          if (a.encrypted2fa != null)
            Text('2FA密钥 已加密 ✓', style: TextStyle(color: colors.ok)),
          // 关联
          if (a.registerEmailId != null)
            _RelLink(
                label: '→ 注册',
                color: colors.catEmail,
                name: data.byId(a.registerEmailId)?.name ?? '?',
                onTap: () {
                  final t = data.byId(a.registerEmailId);
                  if (t != null) openEdit(t);
                }),
          if (a.subscribeAppleId != null)
            _RelLink(
                label: '→ 订阅于',
                color: colors.catApple,
                name: data.byId(a.subscribeAppleId)?.name ?? '?',
                onTap: () {
                  final t = data.byId(a.subscribeAppleId);
                  if (t != null) openEdit(t);
                }),
          // 快捷复制
          Wrap(spacing: 8, children: [
            OutlinedButton(
              onPressed: () {
                final email = data.emailOf(a);
                if (email == null) {
                  _toast(context, '无邮箱(未关联注册邮箱)');
                  return;
                }
                EphemeralClipboard.instance.copy(email);
                _toast(context, '邮箱 已复制（30s 后清空）');
              },
              child: const Text('复制邮箱'),
            ),
            OutlinedButton(
              onPressed: a.encryptedPassword == null
                  ? null
                  : () => copyDecrypted(a.encryptedPassword, '密码'),
              child: const Text('复制密码'),
            ),
            if (a.encrypted2fa != null)
              OutlinedButton(
                  onPressed: () => copyDecrypted(a.encrypted2fa, '2FA密钥'),
                  child: const Text('复制2FA')),
          ]),
        ]),
      ),
    );
  }
}

class _CountryTag extends StatelessWidget {
  final Country country;
  const _CountryTag({required this.country});

  @override
  Widget build(BuildContext context) => Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
            color: Color(int.parse(
                    country.color.replaceFirst('#', '0xFF')))
                .withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(4)),
        child: Text(country.name,
            style: const TextStyle(fontSize: 12)),
      );
}

class _RelLink extends StatelessWidget {
  final String label, name;
  final Color color;
  final VoidCallback onTap;
  const _RelLink(
      {required this.label,
      required this.name,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Row(children: [
          Text(label, style: TextStyle(color: color)),
          const SizedBox(width: 4),
          Text(name,
              style: const TextStyle(
                  decoration: TextDecoration.underline)),
        ]),
      );
}

void _toast(BuildContext c, String msg) =>
    ScaffoldMessenger.of(c)
        .showSnackBar(SnackBar(content: Text(msg)));
