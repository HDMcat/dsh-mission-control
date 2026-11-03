# Architecture

## Goal

A DSH plugin that shows local system and workspace telemetry **inside the DSH Web
UI**, while keeping the privacy surface small enough to publish as open source.

## Boundaries

- **Compact Host surface**: generic OS metrics and optional file events on
  127.0.0.1:7799. No session logs, no control endpoints.
- **Full-window child**: `dashboard/server.mjs` on 127.0.0.1:7800, a complete
  port of the local HUD. It reads local DSH session projections and filesystem
  events by design; nothing leaves the machine. Process control is opt-in.
- **Client**: a native React panel and two launchers in the composer dock (MC/FULL).
  The compact panel uses host theme tokens; the full window is a separate browser
  surface, not an iframe. There is no floating summon button.
- **DSH**: owns the profile, slot composition, theme, locale, and installation.

## Sequence

```text
DSH profile
  bundle patch inserts row `mission-control`
    Host apply(ctx, config)
      ├─ startTelemetryServer()
      │    createHub() ── setInterval(pollMs)
      │    http.Server 127.0.0.1:7799
      └─ spawn(dashboard/server.mjs)
           env: MC_FULL_PORT/MC_WATCH_DIR/MC_STATE_DIR/MC_ALLOW_PROC
           http.Server 127.0.0.1:7800
    ctx.effect cleanup → close compact server + kill child

DSH Web UI
  dsh.client loads client.js
    register tab type + tab body
    register composer-dock MC/FULL launchers
    MC: fetch /api/snapshot every pollMs
    FULL: POST /api/open-full -> Host launches Chrome/Edge app-mode fullscreen
```

The full HUD is deliberately a child process: its synchronous collectors, DSH
session readers, and recursive watcher are isolated from the DSH host event loop.
It also avoids a same-origin rewrite of the original standalone dashboard.

## Why a loopback API instead of Remote

A full DSH Host↔Client Remote requires generated protocol bindings. For this
open-source cut, loopback HTTP keeps both surfaces dependency-free and reviewable.
The trade-off is fixed ports and a narrow browser CORS allowlist. The full HUD uses a same-site cookie; the compact API only echoes the configured DSH Web origin. A later version can replace the transport with a Host Remote.

## Theme contract

The panel uses DSH alias tokens so it follows light/dark and user themes:

- `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`
- `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`, `--dsw-alias-label-caption`
- `--dsw-alias-border-l2`
- `--dsw-alias-state-{success,business,warn,error}-*`

Literal colors are limited to fallback values and data-series accents. No host
component is imported; no private DOM is read.

## Failure behavior

- GPU unavailable → `gpu: null`, card shows “unavailable”.
- Disk API unavailable → `disk: null`.
- Live disk I/O adds `readBps`, `writeBps`, `peakReadBps`; `HARDWARE` renders `readBps / peakReadBps` as usage.
- File watching unsupported → `watch.enabled: false`; metrics still update.
- API unreachable in the browser → inline error + `OFFLINE` badge; no fake data.
- Port busy → Host logs an error; DSH remains alive.
