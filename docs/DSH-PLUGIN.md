# DSH plugin integration

This repository is a **Cordis bundle** with a Host row and a Web Client module.
It follows the public `cordis-plugin-development` contract:

- `package.json` → `dsh.bundle.patch` + `dsh.client`
- `cordis.patch.yml` → inserts the Host row
- `index.js` → Host `apply(ctx, config)`
- `client.js` → `window.__ModuleLoader__.load({ id, factory })`
- `locale/*.json` + `icon.png` → Plugin Manager metadata
- `exports["./client"]` → the Web artifact

## Install / update / remove

### UI path (recommended)

DSH Web sidebar → **Plugins** → **Add plugin** → **Install a third-party plugin**
→ paste the **absolute local directory** of this repo → read the check screen →
**Install** → **Enable now**.

A new install can activate through HMR; replacing an already-installed package
requires a DSH restart to load the new Client JavaScript generation.

### Agent / `plugin_manager` path

Ask an agent with Full access in the target profile to run:

```text
install_bundle  target: <absolute path to this repo>
```

The installer links the package into the profile and applies the bundle patch.
Interpret the result, not the logs:

- `application: applied` → the row is live.
- `failed` / `overridden` / `restart-required` → do not claim success.

Remove with `remove_bundle` using the returned bundle identifier.

## Open the panel

The Client registers:

1. a **tab type** in `sidebarRightTabs` with kind `mission-control`;
2. a **body** in `sidebar.right.pane.tab` keyed by `dsh-mission-control`;
3. a launcher in `conversation.composer.dock` with two actions:
   - **MC** → `ctx.sidebarRight.openTab('mission-control')` (compact panel);
   - **FULL** → `POST /api/open-full`; the Host launches Chrome/Edge app mode
     (`--app=http://127.0.0.1:7800/?fullscreen=1 --start-fullscreen`) as a
     separate OS window. Esc exits fullscreen; F11 toggles. No floating DSH
     button remains.

So the user-facing routes are:

**Composer dock → MC (compact) or FULL (standalone fullscreen)**

The FULL window is served by an isolated child process on the loopback port
`fullPort` (default 7800). It is the complete dashboard port: gauges + COMPUTE,
TASK BAR/workflow timeline, filesystem radar/git, HARDWARE matrix, PROJECT FOLDER,
24 themes, directory settings, and
opt-in process control. The child is cleaned up with the plugin context.

If the composer dock is unavailable in a future DSH version, the tab can still be
opened from the sidebar-right API by an integrating plugin. This is a narrow
integration surface, not a second application shell.

## Data path

```text
DSH Host process
  index.js / apply
    ├─ src/server.mjs (127.0.0.1:7799)
    │    └─ src/telemetry.mjs (CPU, memory, optional nvidia-smi, disk)
    │         GET /api/snapshot  (compact panel JSON)
    │
    └─ dashboard/server.mjs (child process, 127.0.0.1:7800)
         └─ full Mission Control HUD + DSH session reader / fs radar / git /
            telemetry / process list
              GET /            (full window)
              GET /api/state        (HUD cookie)
              GET /api/stream       (HUD cookie)
              POST /api/select      (cookie + same-origin)
              POST /api/open-file   (cookie + same-origin)
              POST /api/open-folder (cookie + same-origin)
              POST /api/settings    (cookie + same-origin)
              POST /api/proc/kill   (only when allowProcessControl=true)

DSH Web UI (browser)
  client.js → MC: native React panel (7799)
              FULL: popup window to http://127.0.0.1:7800/
```

The compact renderer is React in a DSH slot. The full HUD is a separate window
served by the child process; no iframe is used.

## Configuration

`cordis.patch.yml` is the user's durable patch layer. Supported fields:

| Field | Default | Meaning |
|---|---|---|
| `port` | `7799` | Loopback port for the compact collector |
| `fullPort` | `7800` | Loopback port for the full-window dashboard |
| `fullWindow` | `true` | Start the full dashboard child process |
| `allowedOrigins` | `DSH_WEB_URL` | Exact DSH Web origin(s) allowed to read the compact API |
| `allowProcessControl` | `false` | Enable `/api/proc/kill` in the full HUD |
| `watchDir` | `""` | Workspace root; empty keeps file watching off / neutral temp root |
| `pollMs` | `2000` | Collector refresh and UI polling cadence |
| `enableFileWatch` | `true` | Only used when `watchDir` is set; otherwise metrics-only |

The compact Client default API base is `http://127.0.0.1:7799`; the full-window
base is `http://127.0.0.1:7800/`. If you change a port, update `DEFAULT_API` /
`DEFAULT_FULL` in `client.js` or set:

```js
localStorage.setItem('dsh-mission-control-api', 'http://127.0.0.1:PORT');
localStorage.setItem('dsh-mission-control-full', 'http://127.0.0.1:FULL_PORT/');
```

## Standalone fullscreen (no desk pet)

The full HUD is **not** an in-DSH movable widget. **FULL** calls
`POST /api/open-full` on the compact loopback server. The Host launches
Chrome/Edge in app mode:

```text
chrome.exe --app=http://127.0.0.1:7800/?fullscreen=1 --start-fullscreen
```

That is a separate OS window filling the screen, not another DSH tab. If no
Chrome/Edge is available, the client falls back to a screen-sized popup and the
page requests fullscreen / shows the F11 / ⛶ hint. The desk pet was removed.

## Verification

1. `npm test` in this directory.
2. `curl http://127.0.0.1:7799/api/health` → `{"ok":true,...}`.
3. `curl http://127.0.0.1:7799/api/snapshot` → no absolute paths and no private
   fields (see `docs/SANITIZATION.md`).
4. DSH: install, check the plugin row has title/description/icon; open the compact
   panel with **MC** and the full HUD with **FULL**. Verify light/dark themes.
5. Confirm the browser console has no Mission Control slot-entry crash.
6. Remove the bundle and confirm both launchers and the full child process stop.

Visual verification inside DSH cannot be done from this repository alone; a
successful install and slot registration are not proof of what a user sees.

## Known limitations of 0.5.1

- The standalone fullscreen launcher needs Chrome or Edge on the same Windows
  machine; otherwise it falls back to a screen-sized popup.
- The compact surface is a right-sidebar panel; the full HUD is a separate popup
  window (non-iframe). Popup blockers may require allowing one window.
- Loopback ports are used because this cut does not generate typert Remote
  bindings. If your DSH deployment restricts browser connections to another
  origin, move both surfaces behind a Host Remote in a later version.
- The full HUD reads local DSH session projections, so it can display local
  workflow/tool text inside the window. Nothing is sent off the machine; the
  neutral default workspace for the radar is a temporary directory until
  `watchDir` is configured.
- Process control is **off** by default (`allowProcessControl: false`); enable it
  only in a trusted local environment.
- `fs.watch(..., { recursive: true })` is reliable on Windows/macOS; on some
  Linux Node builds recursive watching is unsupported, so events stay empty.
- `nvidia-smi` is optional; without it the GPU card shows “unavailable”.
- The full HUD uses a per-process local cookie, and the compact panel uses a DSH-origin allowlist. There is still no remote/multi-user auth; keep both ports private.

