import 'package:flutter/material.dart';
import 'field_resolver.dart';

/// 密文字段：fail 时显式提示「解密失败，将保留原密文」。
class CipherField extends StatelessWidget {
  final TextEditingController controller;
  final FieldState state;
  final String label;
  final bool hadCipher;
  const CipherField(
      {super.key,
      required this.controller,
      required this.state,
      required this.label,
      required this.hadCipher});

  @override
  Widget build(BuildContext context) {
    final hint = state == FieldState.loading
        ? '解密中…'
        : (hadCipher ? '已加密 · 留空=清除' : '');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
          controller: controller,
          obscureText: true,
          decoration:
              InputDecoration(labelText: label, hintText: hint)),
      if (state == FieldState.fail)
        Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
                '该字段解密失败（主密码不一致?），留空将保留原密文',
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 12))),
    ]);
  }
}
