import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../state/data_provider.dart';
import '../settings/settings_drawer.dart';
import '../account/account_form_screen.dart';
import 'account_card.dart';

const _cats = ['email', 'apple', 'ai'];
const _catLabels = {
  'email': '📧 Email',
  'apple': '🍎 Apple',
  'ai': '🤖 AI'
};

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dataAsync = ref.watch(graphDataProvider);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('账号图谱'),
          bottom: const TabBar(tabs: [
            Tab(text: '📧 Email'),
            Tab(text: '🍎 Apple'),
            Tab(text: '🤖 AI'),
          ]),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const AccountFormScreen(account: null))),
            ),
          ],
        ),
        drawer: const SettingsDrawer(),
        body: dataAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('加载失败：$e')),
          data: (data) => TabBarView(
            children: _cats.map((cat) {
              final list =
                  data.accounts.where((a) => a.category == cat).toList();
              if (list.isEmpty) {
                return Center(
                    child: Text(
                        '暂无${_catLabels[cat]} 账号\n点右上角 + 添加',
                        textAlign: TextAlign.center));
              }
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) =>
                    AccountCard(account: list[i], data: data),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
