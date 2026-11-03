# Sanitization audit

This project is a **clean-room extraction**: the visual idea and the operational
requirements were carried over; the private implementation, data, and assets were
not.

## What was removed or replaced

| Category | Original private shape | Open-source replacement |
|---|---|---|
| Absolute paths | A hardcoded project root on a drive and private cache paths | Compact: configurable root, relative feed paths. Full HUD: configurable root; session cwd is reduced to a basename |
| User identity | Home directories and a machine-specific desktop shortcut | No home paths, no shortcut, no username |
| Session data | Private static copies of sessions | Compact payload has none. The full HUD reads local DSH projections at runtime and renders them locally; nothing is sent off the machine |
| Process control | Always-on allowlisted termination API | Present in the full HUD but **off by default**; requires `allowProcessControl: true` / `MC_ALLOW_PROC=1` |
| Secrets | API-key files, gateway probes, private probe records | No keys in the repo. Optional balance lookup reads a Host env key and calls a configured endpoint; never logged/returned |
| Private project names | Constraint files, internal plan/guide names, private module names | Generic “workspace” / “Mission Control” wording; private mission-replay and cross-module contracts removed |
| Artwork | User-provided cat logo | User-provided soldering-cat, transparent crop (`cat.png` / `icon.png`); owner confirms redistribution permission, see NOTICE |
| Screenshots | Screenshots of real sessions and private data | Demo screenshots use synthetic/empty-session data only |
| Host identity | Hostname, session IDs, command lines | Compact: platform/arch/CPU model only. Full HUD: local process/session UI remains local |
| File paths | Absolute paths in API and UI | Relative paths; configured root is explicit user configuration; session cwd masked |
| Private benchmark numbers | Proprietary report baselines/values | Generic reference envelope in PAPER; edit `app.js` with your own values |

## Runtime surfaces

### Compact collector (`127.0.0.1:7799`)

Read-only generic metrics; no session data, no command lines, no process control.

### Full-window HUD (`127.0.0.1:7800`)

A complete local port. It can show:

- DSH session titles, messages, tool calls, and token/context pressure;
- process command lines in the COMPUTE/CTRL panel;
- filesystem paths relative to the configured workspace.

All of it is rendered locally from localhost APIs; no remote call is made. The
default full-window workspace is a neutral temporary directory. Process control
is disabled by default; the UI shows READONLY unless explicitly enabled. Treat the
full window as **sensitive local content** and do not screen-share or publish its
screenshots without redaction.

## Payload contract

`GET /api/snapshot` intentionally exposes only:

```text
schema, ts, demo
host { platform, arch, release, uptime_s, load[] }
cpu { pct, cores[], model }
mem { pct, used, total }
gpu { name, pct, memUsed, memTotal, memPct, temp, power, clock } | null
disk { total, free, used, pct } | null
watch { enabled, label, recent }
files [{ id, t, kind, rel, area }]
series { cpu[], mem[], gpu[] }
```

No absolute path, no hostname, no session id, no command line, no environment
variable, no key, no token.

## Review checklist before publishing

- [ ] `npm test` passes (syntax, manifest, sensitive-pattern scan).
- [ ] `README.md` contains no personal path, name, or private project title.
- [ ] `LICENSE` copyright line is updated.
- [ ] `icon.png` / `cat.png` have redistributable rights or are replaced before
  publication.
- [ ] Demo screenshots are generated from the synthetic `DEMO` mode.
- [ ] `cordis.patch.yml` has a unique row id and correct package name.
- [ ] `package.json` `dsh.client.inject` lists only public DSH packages.
- [ ] No `.env`, log, settings, or local screenshot is committed.
- [ ] Run one install test in a clean DSH profile; remove the bundle afterward.

## Privacy defaults

- Collector binds to **127.0.0.1** and refuses non-loopback binds.
- No authentication is implemented; loopback is the security boundary.
- CORS is permissive only because the DSH Web UI is also a loopback origin.
  Do not expose port 7799 through a proxy or firewall rule.
- File watching is opt-in via `enableFileWatch` and can be disabled with
  `enableFileWatch: false`.
- `demoMode` is only used by `demo/server.mjs`; the DSH host row defaults to
  real metrics.
