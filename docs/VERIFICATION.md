# Sandbox verification (2026-11-03)

Goal: install the local bundle in an **isolated DSH profile**, not the user's
working desktop profile, and observe the actual Host row and Web panel.

## Setup

```text
source repo:     <repo>
sandbox profile: <DSH_HOME>/profiles/mc-sandbox   (copy of a desktop profile)
DSH host:        installed DeepSeek Harness CLI
port:            7865 (sandbox web) / 7799 (plugin collector)
```

The sandbox profile was a copy of the desktop profile with its own name. The
desktop profile files were not edited.

## Install

The CLI equivalent of the Plugin Manager's local-directory install was used:

```text
dsh plugin --profile mc-sandbox add file:<repo>
```

Result:

- `dsh-mission-control` added to `dependencies`;
- `dsh-mission-control` appended to `dsh.profile.bundles`;
- `dsh --profile mc-sandbox --dump-config` contained:

```yaml
# == dsh-mission-control
- id: mission-control
  name: dsh-mission-control
  config:
    port: 7799
    watchDir: ''
    pollMs: 2000
    enableFileWatch: true
```

The empty `watchDir` is intentional: the Host now defaults to **file-watching
off** unless a path is configured.

## Boot and Host checks

```text
dsh --profile mc-sandbox --host 127.0.0.1 --port 7865 --no-open
```

Observed:

```text
[mission-control] listening on http://127.0.0.1:7799
GET /api/health -> {"ok":true,"service":"dsh-mission-control","demo":false}
```

## Client checks

In the sandbox Web UI:

1. Open a conversation.
2. An **MC** button is present in the composer dock.
3. Click **MC**; the right sidebar opens the **Mission Control** tab.
4. The panel rendered:
   - `LIVE` badge;
   - CPU / MEMORY / GPU / DISK tiles with live values;
   - **File watch disabled** (privacy default);
   - no `.mc-error` and no Mission Control client exceptions.

The panel fetched its data from `http://127.0.0.1:7799/api/snapshot`; this also
confirms the browser CORS path works in the DSH Web UI.

### First failed attempt (kept for maintainers)

The initial Client registered a launcher in
`conversation.session.header.corner`. That slot is a **single** slot already
occupied by the host's open-in-app control:

```text
single slot "conversation.session.header.corner" already has a registration at
priority 0 — register at a different priority to shadow it (lowest renders)
```

The launcher was moved to `conversation.composer.dock`, and the Client then
registered the sidebar tab, body, and launcher with no Mission Control errors.
Do not shadow the header corner; that would replace the host control.

## Sandbox profile issues (not this plugin)

The copied experimental profile also logged unrelated host warnings:

- `conversation.input: sessions service unavailable`
- `dynamicCordisRunner/syncInspectManifest` cancellation / missing Remote

These came from the copied experimental profile/client composition, not from
`dsh-mission-control`; the Mission Control panel itself was rendered and live.
A clean minimal profile may not include every experimental UI package.

## Actual desktop-profile install

After the sandbox pass, the bundle was installed into the **real desktop profile**
with the DSH CLI local-directory path:

```text
dsh plugin --profile desktop add file:<repo>
```

Result:

- `dependencies` gained `dsh-mission-control`;
- `dsh.profile.bundles` automatically gained `dsh-mission-control`;
- HMR activated the Host **without a restart**: ports 7799 (compact) and 7800
  (full HUD) opened;
- both `/api/health` endpoints returned 200;
- the current DSH UI showed **MC** and **FULL** in the composer dock;
- clicking **FULL** opened `http://127.0.0.1:7800/` and rendered the complete HUD:
  hardware/PAPER visible, DSH workflow, filesystem radar, telemetry, settings.

The desktop profile was backed up before the install. Local-directory installs are
copied into the profile `node_modules`; editing `<repo>` later does **not** update
an installed copy until it is reinstalled/replaced and DSH reloads a fresh module
generation.

## Full-window check (0.2.0)

After reinstalling the updated bundle in the same sandbox:

```text
[mission-control] full window on http://127.0.0.1:7800/ (readonly=true)
[mission-control] listening on http://127.0.0.1:7799
[mission-control full] MISSION CONTROL -> http://127.0.0.1:7800
[mission-control full] watching <temporary neutral workspace>
```

Browser checks:

- the composer dock contained **MC** and **FULL**;
- a real pointer click on **FULL** opened a separate target at
  `http://127.0.0.1:7800/`;
- the full HUD reported `gauges=5`, `panels=9`, radar/chart/settings present,
  and **no page errors**;
- HARDWARE and PAPER are restored in the full-window port (they remain hidden in
  the compact source lineage only if you copy a later layout change);
- killing the plugin context stopped the child (`full window exited ... SIGTERM`).

The full HUD contains local DSH session text; it was inspected but not captured
into the public repository.

## Cat identity + standalone fullscreen check (0.5.0)

- `icon.png` / `logo.png` are the user-provided cat artwork; no desk pet is mounted.
- The full HUD has no `.mc-pet`, no `pet.js`, no `pet.css` and no `/pet-*.png`.
- **FULL** calls `POST /api/open-full`; the Host launched:
  `chrome.exe --app=http://127.0.0.1:7800/?fullscreen=1 --start-fullscreen ...`
  as a separate 2560×1440 OS window, not a DSH tab.
- The launcher capability probe returned
  `{ok:true, available:true, browser:"chrome.exe"}`; the launched window was
  captured in `runs/perf_gen7/fullscreen_launch.png` (private, local only).
- Page: 2660×1440 exact screenshot, no overflow, no pageerror; no pet.
- **Not claimed:** Qwen visual review of the unredacted live session; the
  performance panel probe is sanitized.

## Evidence policy

The full sandbox screenshot contained an existing private conversation in the
left pane, so it is **not committed**. The panel-only crop contained real CPU/GPU
model names and was also kept out of the public repo. The public demo image
(`docs/demo.png`) is synthetic and labelled `DEMO`.

## Remaining before a stable release

- Test the Plugins-page **UI** installation path (local directory) in addition to
  the CLI path.
- Test light and dark host themes and a narrow right-sidebar width in both the
  compact panel and the full window.
- Confirm behavior after replacing the installed package and restarting.
- If you change a slot, launcher, or the full child port, re-run this verification
  in a clean profile.
