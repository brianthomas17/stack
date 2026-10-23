#!/bin/sh
# Stack installer for macOS.
#   curl -fsSL <friends server>/install.sh | sh
# Safe to run again: it updates an existing install instead of starting over.
set -eu

REPO="${STACK_REPO:-https://github.com/brianthomas17/stack.git}"
APP_DIR="${STACK_APP_DIR:-$HOME/.stack-app}"
DATA_DIR="${STACK_DATA_DIR:-$HOME/StackData}"
PORT="${STACK_PORT:-4747}"
LABEL="${STACK_SERVICE_LABEL:-com.stack.app}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/Stack.log"
NODE_MIN=22

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
fail() { printf '\n\033[1;31mStopped:\033[0m %s\n' "$1" >&2; exit 1; }

# `curl | sh` gives the script stdin, so questions are read from the terminal.
ask() {
  printf '%s [Y/n] ' "$1"
  if [ -r /dev/tty ]; then read -r reply < /dev/tty || reply=n; else reply=n; fi
  case "$reply" in [nN]*) return 1 ;; *) return 0 ;; esac
}

[ "$(uname)" = "Darwin" ] || fail "This installer is for macOS. On Windows, use the PowerShell command on the Get Stack page."

bold "Installing Stack"

step "Checking what's already here"

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1 || true
  fail "macOS needs its developer tools (for git). A window should have opened to install them. Finish that, then run this command again."
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js isn't installed. Download the LTS version from https://nodejs.org, install it, then run this command again."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge "$NODE_MIN" ] || fail "Node.js $NODE_MIN or newer is needed (you have $(node -v)). Get the LTS version from https://nodejs.org, then run this again."
echo "Node $(node -v)"

if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  echo "Claude Code isn't installed. Stack uses it for research and chat, on your own Claude subscription."
  if ask "Install Claude Code now?"; then
    curl -fsSL https://claude.ai/install.sh | bash
  else
    echo "Skipping. Stack still tracks your stack and friends; research and chat need Claude Code."
  fi
fi
CLAUDE_BIN=$(command -v claude 2>/dev/null || echo "$HOME/.local/bin/claude")
[ -x "$CLAUDE_BIN" ] && echo "Claude Code $("$CLAUDE_BIN" --version 2>/dev/null | head -1)"

step "Getting Stack"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only -q
  echo "Updated $APP_DIR"
else
  git clone -q "$REPO" "$APP_DIR"
  echo "Downloaded to $APP_DIR"
fi

step "Installing (this takes a minute)"
cd "$APP_DIR"
npm install --no-audit --no-fund --loglevel=error
npm run build --silent >/dev/null

mkdir -p "$DATA_DIR"
if [ ! -f .env ]; then
  cat > .env <<EOF
STACK_DATA_DIR=$DATA_DIR
STACK_API_PORT=$PORT
STACK_INSTALLED=1
EOF
fi

if [ "${STACK_NO_SERVICE:-}" = "1" ]; then
  step "Done (no background service, as requested)"
  echo "Start it with: cd \"$APP_DIR\" && npm start"
  exit 0
fi

step "Setting Stack to run in the background"
# launchd starts with a bare PATH, so record where node, npm and claude live.
NODE_DIR=$(dirname "$(command -v node)")
CLAUDE_DIR=$(dirname "$CLAUDE_BIN")
SERVICE_PATH="$NODE_DIR:$CLAUDE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_DIR/npm</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$SERVICE_PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

step "Starting"
i=0
until curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 60 ] || fail "Stack didn't start. Details are in $LOG"
  sleep 1
done

URL="http://localhost:$PORT"
[ -n "${STACK_INVITE:-}" ] && URL="$URL/#join=$STACK_INVITE"
open "$URL" 2>/dev/null || true

bold ""
bold "Stack is running at http://localhost:$PORT"
echo "Bookmark it. It starts by itself when you log in, so there's nothing to keep open."
echo "Your data lives in $DATA_DIR"
echo ""
echo "To uninstall: launchctl bootout gui/\$(id -u)/$LABEL; rm \"$PLIST\"; rm -rf \"$APP_DIR\""
echo "(Your data folder is left alone.)"
