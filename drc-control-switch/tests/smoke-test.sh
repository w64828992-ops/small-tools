#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/DRC控制开关.app"
LABEL="com.desktopcommander.remote"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

"$ROOT/scripts/build.sh"

test -x "$APP/Contents/MacOS/DRCControl"
test -f "$APP/Contents/Resources/Banana.icns"
/usr/bin/plutil -lint "$APP/Contents/Info.plist" >/dev/null
/usr/bin/codesign --verify --deep --strict "$APP"

if [ -f "$PLIST" ]; then
  echo "LAUNCH_AGENT_CONFIG=PASS"
else
  echo "LAUNCH_AGENT_CONFIG=NOT_FOUND"
fi

before="disconnected"
if /bin/launchctl print "$DOMAIN/$LABEL" 2>/dev/null | /usr/bin/grep -q "state = running"; then
  before="connected"
fi
echo "CURRENT_DRC_STATE=$before"

open "$APP"
sleep 1
pkill -TERM -f "$APP/Contents/MacOS/DRCControl" >/dev/null 2>&1 || true
sleep 0.5

after="disconnected"
if /bin/launchctl print "$DOMAIN/$LABEL" 2>/dev/null | /usr/bin/grep -q "state = running"; then
  after="connected"
fi

if [ "$before" != "$after" ]; then
  echo "FAIL: closing control panel changed DRC state"
  exit 1
fi
echo "CLOSE_PANEL_PRESERVES_CONNECTION=PASS"

if [ "${DRC_ALLOW_LIVE_TOGGLE_TEST:-0}" != "1" ]; then
  echo "LIVE_TOGGLE_TEST=SKIPPED"
  echo "SMOKE_TEST=PASS"
  exit 0
fi

if [ ! -f "$PLIST" ]; then
  echo "FAIL: live toggle requires $PLIST"
  exit 1
fi

echo "WARNING: live toggle test will temporarily change the real DRC state."

/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
sleep 1
if /bin/launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "LIVE_DISCONNECT=FAIL"
  exit 1
fi
echo "LIVE_DISCONNECT=PASS"

/bin/launchctl bootstrap "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
/bin/launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
/bin/launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
sleep 2
if /bin/launchctl print "$DOMAIN/$LABEL" 2>/dev/null | /usr/bin/grep -q "state = running"; then
  echo "LIVE_RECONNECT=PASS"
else
  echo "LIVE_RECONNECT=FAIL"
  exit 1
fi

echo "SMOKE_TEST=PASS"
