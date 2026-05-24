import 'package:flutter/material.dart';

/// 分类色 + 语义色，挂在 ThemeExtension，UI 用 Theme.of(ctx).extension<AppColors>()。
@immutable
class AppColors extends ThemeExtension<AppColors> {
  final Color bg, panel, accent, danger, ok, catEmail, catApple, catAi;
  const AppColors({
    required this.bg,
    required this.panel,
    required this.accent,
    required this.danger,
    required this.ok,
    required this.catEmail,
    required this.catApple,
    required this.catAi,
  });

  Color catColor(String category) => switch (category) {
        'email' => catEmail,
        'apple' => catApple,
        'ai' => catAi,
        _ => accent,
      };

  @override
  AppColors copyWith({
    Color? bg,
    Color? panel,
    Color? accent,
    Color? danger,
    Color? ok,
    Color? catEmail,
    Color? catApple,
    Color? catAi,
  }) =>
      AppColors(
        bg: bg ?? this.bg,
        panel: panel ?? this.panel,
        accent: accent ?? this.accent,
        danger: danger ?? this.danger,
        ok: ok ?? this.ok,
        catEmail: catEmail ?? this.catEmail,
        catApple: catApple ?? this.catApple,
        catAi: catAi ?? this.catAi,
      );

  @override
  AppColors lerp(AppColors? other, double t) => other ?? this;
}

const _darkColors = AppColors(
  bg: Color(0xFF0e0f13),
  panel: Color(0xFF16181f),
  accent: Color(0xFFd4a857),
  danger: Color(0xFFc2554d),
  ok: Color(0xFF6fae6a),
  catEmail: Color(0xFF5b8fb0),
  catApple: Color(0xFFd4a857),
  catAi: Color(0xFF9b7fc4),
);
const _lightColors = AppColors(
  bg: Color(0xFFf4f4f0),
  panel: Color(0xFFffffff),
  accent: Color(0xFFb07d2e),
  danger: Color(0xFFc2554d),
  ok: Color(0xFF6fae6a),
  catEmail: Color(0xFF5b8fb0),
  catApple: Color(0xFFb07d2e),
  catAi: Color(0xFF9b7fc4),
);

ThemeData buildTheme(Brightness b) {
  final colors = b == Brightness.dark ? _darkColors : _lightColors;
  final scheme = ColorScheme.fromSeed(
      seedColor: colors.accent,
      brightness: b,
      surface: colors.panel,
      error: colors.danger);
  return ThemeData(
    useMaterial3: true,
    brightness: b,
    colorScheme: scheme,
    scaffoldBackgroundColor: colors.bg,
    extensions: [colors],
  );
}
