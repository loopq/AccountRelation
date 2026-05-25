#!/usr/bin/env bash
# 一键运行 account_graph 移动端。
#
# 背景：本项目用 fvm 钉在 Flutter 3.44.0（见 .fvmrc），而全局 flutter 是 3.24.4。
#       3.44.0 的 Android 构建链（Gradle 9.1 / AGP 9.0.1）需要 JDK 17，
#       但全局 flutter 的 jdk-dir 锁在 JDK 11（给其他老项目用）。
# 本脚本：构建期临时把 jdk-dir 切到 17，退出（含 Ctrl-C / 失败）必定还原回 11。
#
# 用法：
#   tool/run.sh                      # 交互选设备运行
#   tool/run.sh -d vcug49f6eamzjjif  # 指定 M2104K10AC (Android 13)
#   tool/run.sh -d d77de316          # 指定 GM1910 (Android 11)
#   tool/run.sh --release            # 透传任意 flutter run 参数
set -uo pipefail

JDK17="/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"
JDK11="/Library/Java/JavaVirtualMachines/jdk-11.0.13.jdk/Contents/Home"

# 切到 mobile/ 根目录（脚本位于 mobile/tool/）
cd "$(dirname "$0")/.." || exit 1

restore_jdk() {
  flutter config --jdk-dir="$JDK11" >/dev/null 2>&1
  echo "↩︎  jdk-dir 已还原回 JDK 11"
}
trap restore_jdk EXIT

echo "→  本次构建临时把 flutter jdk-dir 切到 JDK 17"
flutter config --jdk-dir="$JDK17" >/dev/null 2>&1

echo "→  fvm flutter (3.44.0) run $*"
fvm flutter run "$@"
