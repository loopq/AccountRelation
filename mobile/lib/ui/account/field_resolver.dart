enum FieldState { loading, success, fail }

/// 落库密文决策（对齐 Web _pwLoaded/_faLoaded）：
/// - 文本非空 → 加密新值
/// - 文本空 + success → null（清除）
/// - 文本空 + fail → 保留原密文（防误清）
/// loading 时不应调用本函数（UI 用 state 禁用保存）。
Future<String?> resolveCipher({
  required String text,
  required FieldState state,
  required String? original,
  required Future<String> Function(String) encryptText,
}) async {
  if (text.isNotEmpty) return encryptText(text);
  return state == FieldState.fail ? original : null;
}
