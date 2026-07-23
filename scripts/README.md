# Telegram-default notifications

The Trello skin's "default notification = Telegram" preference is delivered by
this cron script rather than by editing Hermes core. It subscribes any task on
the active board that isn't already subscribed to Telegram's home channel.

## Prereqs
- Telegram connected to the gateway, with a home channel set:
  - in Telegram, send `/sethome`, or
  - set `gateway.platforms.telegram.home_channel: {chat_id: "...", thread_id: "..."}` in `~/.hermes/config.yaml`.
- `hermes` on PATH.

## Run manually
```bash
bash scripts/telegram-defaults.sh                 # active board
bash scripts/telegram-defaults.sh --board myboard
```

## Run on a schedule (recommended)
Wire it as a Hermes cronjob so new tasks get Telegram by default:
```
hermes cron create --name "kanban telegram defaults" --schedule "*/15 * * * *" \
  --prompt "Run: bash ~/.hermes/plugins/kanban-trello/scripts/telegram-defaults.sh" \
  --skills hermes-kanban
```
(Adjust the interval to taste. Every 15 min is plenty for a personal board.)

## How it works
1. Reads the configured Telegram `home_channel` from `config.yaml`.
2. Lists board tasks; for any without a Telegram subscription, calls
   `hermes kanban notify-subscribe --platform telegram --chat-id <id> [--thread-id <id>]`.
3. Idempotent — already-subscribed tasks are skipped.
