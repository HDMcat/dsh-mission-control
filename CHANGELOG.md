# Changelog

## 0.5.1 — security hardening

- Full HUD APIs now require a per-process `HttpOnly; SameSite=Strict` cookie;
  the control token is no longer exposed in `/api/state`.
- Mutating HUD routes (`open-file`, `open-folder`, `select`, `settings`,
  `proc/kill`) require POST + same-origin Origin.
- Compact 7799 CORS is an exact DSH Web origin allowlist; wildcard CORS removed.
- Both servers validate loopback Host headers and send baseline security headers.
- `/api/balance` no longer forwards `DEEPSEEK_API_KEY` implicitly; it is opt-in
  via `MC_BALANCE_URL` and requires HTTPS by default.
- Node engine aligned to >=22; installed profile synchronized with source.
- Added `scripts/security-check.mjs` to the test suite.

## 0.5.0 — standalone fullscreen, no desk pet

- Removed the desk pet and the floating DSH summon bar; the bottom **MC/FULL**
  dock is the only launcher.
- **FULL** now starts a separate Chrome/Edge app-mode fullscreen window via
  `POST /api/open-full`; no in-DSH movable window.
- 0.618 / 0.382 layout: TASK BAR left, radar right, HARDWARE left-bottom,
  PROJECT FOLDER right-bottom; TELEMETRY panel removed.
- PROJECT FOLDER lists both directories and files; single-click opens a file
  with the OS default app, `↗` reveals it in Explorer.
- HARDWARE enumerates all fixed disks and marks unavailable CPU/disk sensors as
  `N/A` instead of blank/fake values.
- Esc exits HTML fullscreen / restores an app-mode fullscreen window; F11 toggles.
- Reinitialized Git with no prior commit history; sanitized open-source tree.

## 0.4.0 — cat identity + desk pet

- Replaced the cat-radar vector identity with the user-provided soldering-cat
  artwork, cropped transparent and reused as plugin icon, HUD logo, favicon and
  pet sprite.
- Added a bottom-right **draggable desk pet** in the full HUD with tail/body sway,
  pointer-capture dragging, position persistence and viewport clamping.
- Added pet states/menus: `余额 / 报告 / 晚安 / 拜拜`; error smoke, turn-complete
  report, sleep and goodbye.
- Added four local cat sticker assets (`pet-sleep/fail/report/money.png`) and a
  CSS smoke/shake animation.
- Added `GET /api/balance` with a configurable DeepSeek/custom balance endpoint;
  no fake balance and no key exposure.
- Pet/full-HUD balance/frontend copied into the installed desktop profile; full
  child restarted via HMR.

## 0.3.0 — identity + one-click summon

- New **cat-radar logo** (`icon.svg`): paper/ink/cinnabar palette, radar rings,
  cinnabar sweep, four metric bars; reused as the full HUD favicon.
- Rewrote zh/en locale metadata and the package description into a detailed
  product summary; the Plugins page now shows the full feature set.
- Added a **fixed bottom-right "MISSION CONTROL" summon button** to the DSH Web
  client. One click opens the full HUD; `Ctrl+Shift+M` does the same. If the
  popup is blocked it falls back to the compact right-sidebar tab.
- Mounted and cleaned up with the plugin context (no duplicate buttons on HMR).
- Full HUD layout v3: duplicate HARDWARE table hidden, full-width TELEMETRY,
  footer time only; docs updated.
- Tests: `npm test` / manifest / client and host smokes pass.

## 0.2.0 — full-window port

- Ported the complete dashboard into `dashboard/`: four gauges + COMPUTE, DSH
  workflow/session timeline, filesystem radar + git, TELEMETRY/TRACE export,
  HARDWARE matrix, PAPER 0.5 budget view, 21 themes, directory settings.
- Added **FULL** launcher in the composer dock; opens the full HUD in a separate
  window at `127.0.0.1:7800`, sized to the available screen.
- Host now starts the full HUD in an isolated child process with cleanup.
- Restored HARDWARE/PAPER in the full port; kept the compact lineage separate.
- Sanitized private report values in PAPER to a generic reference envelope.
- Masked the DSH session cwd to a basename; neutral temp workspace for the full
  file radar until `watchDir` is configured.
- Process control is opt-in (`allowProcessControl: false` by default).
- Sandbox verification: full popup target, full HUD DOM, no page errors; child
  terminated with the plugin context.
- **Installed into the actual desktop profile** with HMR: `dsh plugin add` appended
  the dependency and bundle; both 7799/7800 came up; MC/FULL appeared in the live
  composer dock; FULL opened the complete HUD.

## 0.1.0 — first open-source cut

- Clean-room, sanitized extraction of a private monitoring dashboard.
- Host collector: CPU, memory, optional `nvidia-smi`, disk, file-change events.
- Loopback-only HTTP API with `/api/health`, `/api/snapshot`, `/api/stream`.
- Native DSH client: right-sidebar `mission-control` tab + **composer-dock** MC launcher.
- Theme-token styling; no iframe or second app root.
- Standalone synthetic demo (`npm start`) and zero-dependency CI checks.
- Removed private paths, session logs, process control, and secrets. The provided
  cat mark is the only user artwork and is documented in the README/NOTICE.
- **Sandbox verification:** installed into an isolated `mc-sandbox` profile, Host
  row active on 127.0.0.1:7799, panel rendered four live metrics with no Mission
  Control client errors. First header-slot placement collided with a host
  single-slot registration; moved to the composer dock.
- Privacy default: file watching is **off** unless `watchDir` is configured.
