import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/models/account.dart';
import '../data/models/platform.dart';
import '../data/models/country.dart';
import '../data/repositories/account_repository.dart';
import 'supabase_provider.dart';

final accountRepoProvider = Provider((ref) => AccountRepository(ref.read(supabaseClientProvider)));

class GraphData {
  final List<Account> accounts;
  final List<Platform> platforms;
  final List<Country> countries;
  GraphData(this.accounts, this.platforms, this.countries);

  Account? byId(String? id) {
    if (id == null) return null;
    for (final a in accounts) {
      if (a.id == id) return a;
    }
    return null;
  }

  Platform? platformById(String? id) {
    if (id == null) return null;
    for (final p in platforms) {
      if (p.id == id) return p;
    }
    return null;
  }

  Country? countryById(String? id) {
    if (id == null) return null;
    for (final c in countries) {
      if (c.id == id) return c;
    }
    return null;
  }

  /// emailOf：email 取自身 name；apple/ai 取关联注册邮箱 name。对齐 Web emailOf。
  String? emailOf(Account a) {
    if (a.category == 'email') return a.name;
    return byId(a.registerEmailId)?.name;
  }

  bool platformInUse(String id) => accounts.any((a) => a.platformId == id);
  bool countryInUse(String id) => accounts.any((a) => a.countryId == id);
}

final graphDataProvider = FutureProvider<GraphData>((ref) async {
  final repo = ref.read(accountRepoProvider);
  final results = await Future.wait([repo.loadAccounts(), repo.loadPlatforms(), repo.loadCountries()]);
  return GraphData(results[0] as List<Account>, results[1] as List<Platform>, results[2] as List<Country>);
});

/// 调用以刷新（CRUD 后）
void refreshGraph(WidgetRef ref) => ref.invalidate(graphDataProvider);
