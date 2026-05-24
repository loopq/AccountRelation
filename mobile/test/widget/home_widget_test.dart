import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/data/models/account.dart';
import 'package:account_graph/state/data_provider.dart';
import 'package:account_graph/ui/home/account_card.dart';
import 'package:account_graph/ui/home/home_screen.dart';
import 'package:account_graph/ui/theme/app_theme.dart';

Widget _wrapCard(Account a, GraphData data) => ProviderScope(
      child: MaterialApp(
          theme: buildTheme(Brightness.dark),
          home: Scaffold(body: AccountCard(account: a, data: data))),
    );

void main() {
  testWidgets('无密码 → 复制密码按钮禁用', (tester) async {
    final a = Account(id: 'a', category: 'email', name: 'x');
    await tester.pumpWidget(_wrapCard(a, GraphData([a], [], [])));
    final btn = tester
        .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '复制密码'));
    expect(btn.onPressed, isNull);
  });

  testWidgets('有密码 → 复制密码按钮可用', (tester) async {
    final a = Account(
        id: 'a', category: 'email', name: 'x', encryptedPassword: 'v2:p');
    await tester.pumpWidget(_wrapCard(a, GraphData([a], [], [])));
    final btn = tester
        .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '复制密码'));
    expect(btn.onPressed, isNotNull);
  });

  testWidgets('无 2FA → 不显示复制2FA；有则显示', (tester) async {
    final a1 = Account(id: 'a', category: 'email', name: 'x');
    await tester.pumpWidget(_wrapCard(a1, GraphData([a1], [], [])));
    expect(find.text('复制2FA'), findsNothing);
    final a2 =
        Account(id: 'b', category: 'email', name: 'y', encrypted2fa: 'v2:z');
    await tester.pumpWidget(_wrapCard(a2, GraphData([a2], [], [])));
    expect(find.text('复制2FA'), findsOneWidget);
  });

  testWidgets('空分类 → 显示占位', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        graphDataProvider.overrideWith((ref) async => GraphData([], [], []))
      ],
      child: MaterialApp(
          theme: buildTheme(Brightness.dark), home: const HomeScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('暂无'), findsWidgets);
  });
}
