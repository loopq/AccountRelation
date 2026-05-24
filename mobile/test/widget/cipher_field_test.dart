import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/ui/account/field_resolver.dart';
import 'package:account_graph/ui/account/cipher_field.dart';

Widget _wrap(Widget c) => MaterialApp(home: Scaffold(body: c));

void main() {
  testWidgets('fail → 显示「解密失败…保留原密文」提示', (tester) async {
    await tester.pumpWidget(_wrap(CipherField(
        controller: TextEditingController(),
        state: FieldState.fail,
        label: '密码',
        hadCipher: true)));
    expect(find.textContaining('解密失败'), findsOneWidget);
    expect(find.textContaining('保留原密文'), findsOneWidget);
  });

  testWidgets('loading → hint「解密中…」，无错误提示', (tester) async {
    await tester.pumpWidget(_wrap(CipherField(
        controller: TextEditingController(),
        state: FieldState.loading,
        label: '密码',
        hadCipher: true)));
    expect(find.textContaining('解密失败'), findsNothing);
    expect(
        tester
            .widget<TextField>(find.byType(TextField))
            .decoration!
            .hintText,
        '解密中…');
  });

  testWidgets('success + 有原密文 → hint「已加密 · 留空=清除」，无错误提示',
      (tester) async {
    await tester.pumpWidget(_wrap(CipherField(
        controller: TextEditingController(),
        state: FieldState.success,
        label: '密码',
        hadCipher: true)));
    expect(find.textContaining('解密失败'), findsNothing);
    expect(
        tester
            .widget<TextField>(find.byType(TextField))
            .decoration!
            .hintText,
        '已加密 · 留空=清除');
  });
}
