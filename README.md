# hermes-kanban-trello

A **Trello-style 5-column Kanban dashboard skin for [Hermes Agent](https://github.com/NousResearch/hermes-agent)**.

It renders the built-in Hermes kanban board as five clean columns and adds
**Telegram-by-default** notifications — as a *frontend-only plugin*, with **no
modification to Hermes core**.

> Why a plugin and not a core change? Hermes exposes a first-class dashboard
> plugin extension point: a user plugin under `~/.hermes/plugins/<name>/`
> gets its own tab and (optionally) backend, served by the same dashboard that
> ships the built-in kanban. This skin simply consumes the **bundled** kanban
> backend at `/api/plugins/kanban` and re-presents it. Zero fork, zero patch.

## Columns

The 5 lanes map onto Hermes's fixed internal task statuses (the dispatcher,
blocker, and review flows depend on those statuses, so we never change them —
we only *view* them differently):

| Lane | Shows (internal status) | On drop → status |
|------|------------------------|------------------|
| **Backlog** | `triage` | `triage` |
| **ToDo** | `todo`, `ready` | `ready` |
| **Doing** | `running` | `ready` (dispatcher promotes to `running`) |
| **Waiting** | `blocked`, `review`, `scheduled` | `blocked` |
| **Done** | `done` | `done` |

**Backlog is a brain-dump:** nothing there is worked until you drag it to ToDo
(`ready`), at which point the dispatcher picks it up. To guarantee Backlog is
*never* auto-worked, set `kanban.auto_decompose: false` in `~/.hermes/config.yaml`
(the dispatcher otherwise auto-promotes `triage` → `ready`).

## Features

- 5-column drag-and-drop board (HTML5 DnD).
- Live updates via the kanban `events` WebSocket.
- Add cards straight to **Backlog**.
- Per-card 🔔 toggle to subscribe/unsubscribe the task to **Telegram** home-channel
  notifications (`POST/DELETE /tasks/{id}/home-subscribe/telegram`).
- Multi-board support (uses the built-in boards API).
- Dark theme that follows the host dashboard's CSS variables.

## Install

```bash
# from the Hermes CLI (installs into ~/.hermes/plugins/kanban-trello)
hermes plugins install aishee-mitra/hermes-kanban-trello
hermes plugins enable kanban-trello
# restart the dashboard, then open the "Kanban (Trello)" tab
```

Or manually:

```bash
git clone https://github.com/aishee-mitra/hermes-kanban-trello ~/.hermes/plugins/kanban-trello
cd ~/.hermes/plugins/kanban-trello
npm install && npm run build      # writes dashboard/dist/index.js
# restart the dashboard
```

## Telegram-by-default notifications

Hermes has no single `kanban.default_notify_platform` knob, so the
"default = Telegram" behavior is delivered by a small idempotent cron script
(`scripts/telegram-defaults.sh`) that subscribes any unsubscribed task to the
configured Telegram home channel. No core edit. See `scripts/README.md`.

## Develop

```bash
npm install
npm run build      # one-shot build
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
```

The plugin reads `window.__HERMES_PLUGIN_SDK__` (React + host utilities) at
runtime, so React is marked `external` in the esbuild bundle and is **not**
bundled.

## License

MIT — see [LICENSE](./LICENSE).
