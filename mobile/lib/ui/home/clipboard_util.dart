import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// 复制并 best-effort 30s 后清空；切后台立即清空。
class EphemeralClipboard with WidgetsBindingObserver {
  static final EphemeralClipboard instance = EphemeralClipboard._();
  EphemeralClipboard._() {
    WidgetsBinding.instance.addObserver(this);
  }

  bool _pending = false;

  Future<void> copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    _pending = true;
    Future.delayed(
        const Duration(seconds: 30), () {
      if (_pending) _clear();
    });
  }

  void _clear() {
    Clipboard.setData(const ClipboardData(text: ''));
    _pending = false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _pending) _clear();
  }
}
