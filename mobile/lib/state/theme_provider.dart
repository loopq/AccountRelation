import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'supabase_provider.dart';

class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController(this._ref) : super(ThemeMode.system) { _load(); }
  final Ref _ref;

  Future<void> _load() async {
    final m = await _ref.read(secureStoreProvider).getThemeMode();
    state = switch (m) { 'light' => ThemeMode.light, 'dark' => ThemeMode.dark, _ => ThemeMode.system };
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    final s = switch (mode) { ThemeMode.light => 'light', ThemeMode.dark => 'dark', _ => 'system' };
    await _ref.read(secureStoreProvider).setThemeMode(s);
  }
}

final themeProvider = StateNotifierProvider<ThemeController, ThemeMode>((ref) => ThemeController(ref));
