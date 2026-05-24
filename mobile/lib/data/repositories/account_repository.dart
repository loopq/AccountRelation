import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/account.dart';
import '../models/platform.dart';
import '../models/country.dart';

class AccountRepository {
  final SupabaseClient _db;
  AccountRepository(this._db);

  Future<List<Platform>> loadPlatforms() async {
    final rows = await _db.from('platforms').select().order('sort');
    return (rows as List).map((e) => Platform.fromJson(e)).toList();
  }

  Future<List<Country>> loadCountries() async {
    final rows = await _db.from('countries').select().order('sort');
    return (rows as List).map((e) => Country.fromJson(e)).toList();
  }

  Future<List<Account>> loadAccounts() async {
    final rows = await _db.from('accounts').select().order('created_at');
    return (rows as List).map((e) => Account.fromJson(e)).toList();
  }

  Future<void> insertAccount(Map<String, dynamic> row) async {
    await _db.from('accounts').insert(row);
  }

  Future<void> updateAccount(String id, Map<String, dynamic> row) async {
    row['updated_at'] = DateTime.now().toUtc().toIso8601String();
    await _db.from('accounts').update(row).eq('id', id);
  }

  Future<void> deleteAccount(String id) async => _db.from('accounts').delete().eq('id', id);

  // 平台/国家管理
  Future<void> addPlatform(String category, String name, String? color) =>
      _db.from('platforms').insert({'category': category, 'name': name, 'color': color});
  Future<void> deletePlatform(String id) => _db.from('platforms').delete().eq('id', id);
  Future<void> addCountry(String name, String color) =>
      _db.from('countries').insert({'name': name, 'color': color});
  Future<void> deleteCountry(String id) => _db.from('countries').delete().eq('id', id);
}
