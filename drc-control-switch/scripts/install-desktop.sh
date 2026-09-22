#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/DRC控制开关.app"
TARGET="$HOME/Desktop/DRC控制开关.app"

if [ ! -d "$APP" ]; then
  "$ROOT/scripts/build.sh"
fi

rm -rf "$TARGET"
cp -R "$APP" "$TARGET"

/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$TARGET" >/dev/null 2>&1 || true
touch "$TARGET"

echo "INSTALL_OK: $TARGET"
echo "安装不会自动连接或断开 DRC；打开 App 后由用户操作开关。"
