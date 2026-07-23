#!/usr/bin/env bash
# telegram-defaults.sh — subscribe every task on the active Hermes kanban board
# to Telegram home-channel notifications, unless already subscribed.
#
# This is how the "default notification = Telegram" preference is delivered
# WITHOUT touching Hermes core: we just (re)apply `hermes kanban notify-subscribe`
# to any task that isn't yet subscribed. Run it on a schedule (cron / Hermes
# cronjob) and new tasks get Telegram notifications by default.
#
# Requirements:
#   - Hermes gateway running with Telegram connected and a home channel set
#     (e.g. via /sethome in Telegram, or gateway.platforms.telegram.home_channel).
#   - `hermes` on PATH (or set HERMES_BIN below).
#
# Usage:
#   ./telegram-defaults.sh                 # active board
#   ./telegram-defaults.sh --board myboard # a specific board
set -euo pipefail

HERMES_BIN="${HERMES_BIN:-hermes}"
BOARD_FLAG=""
if [ "${1:-}" = "--board" ]; then
  BOARD_FLAG="--board ${2:-}"
fi

# Resolve the Telegram home channel (chat id) from HERMES_KANBAN_BOARD-less config.
# `hermes kanban notify-subscribe --help` documents the flags; we just need the
# chat id + thread id. We fetch it from the gateway config via a tiny python peek.
CHAT_INFO="$("$HERMES_BIN" dashboard --status >/dev/null 2>&1; \
  python3 - "$HERMES_BIN" $BOARD_FLAG <<'PY' 2>/dev/null || true
import sys, json, os, glob
# Best-effort: read the configured telegram home channel from config.yaml.
home = os.path.expanduser("~/.hermes")
cfg = None
for p in [os.path.join(home, "config.yaml")]:
    if os.path.exists(p):
        try:
            import yaml
            cfg = yaml.safe_load(open(p))
        except Exception:
            cfg = None
if not cfg:
    print(""); sys.exit(0)
tg = (cfg.get("gateway", {}).get("platforms", {}).get("telegram", {}) or {})
hc = tg.get("home_channel") or {}
chat = hc.get("chat_id") or ""
thread = hc.get("thread_id") or ""
print(f"{chat}\t{thread}")
PY
)"

CHAT_ID="$(printf '%s' "$CHAT_INFO" | cut -f1)"
THREAD_ID="$(printf '%s' "$CHAT_INFO" | cut -f2)"

if [ -z "$CHAT_ID" ]; then
  echo "telegram-defaults: no Telegram home_channel configured; set one via /sethome in Telegram." >&2
  exit 1
fi

# Enumerate unsubscribed tasks on the active board and subscribe them.
"$HERMES_BIN" kanban list --json $BOARD_FLAG 2>/dev/null | python3 - "$HERMES_BIN" "$CHAT_ID" "$THREAD_ID" $BOARD_FLAG <<'PY'
import sys, json, subprocess
hermes, chat, thread = sys.argv[1], sys.argv[2], sys.argv[3]
board = sys.argv[4:] and " ".join(sys.argv[4:]) or ""
tasks = json.load(sys.stdin)
subscribed = {t.get("id") for t in tasks if (t.get("notify") or {}).get("telegram")}
count = 0
for t in tasks:
    tid = t.get("id")
    if not tid or tid in subscribed:
        continue
    cmd = [hermes, "kanban", "notify-subscribe", tid, "--platform", "telegram", "--chat-id", chat]
    if thread:
        cmd += ["--thread-id", thread]
    if board:
        cmd += board.split()
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        count += 1
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"subscribe failed for {tid}: {e}\n")
print(f"telegram-defaults: subscribed {count} new task(s) to Telegram.")
PY
