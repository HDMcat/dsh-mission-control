# Security policy

## Design boundary

Both surfaces bind to **127.0.0.1 only**. There is no authentication layer because
there is no remote listener; the local loopback is the security boundary. Do not
expose ports **7799** or **7800** through a proxy, reverse tunnel, or firewall rule.

### Compact collector: 7799

Read-only:

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/stream`

No POST/DELETE, no process control, no session data, no arbitrary path input.

### Full HUD: 7800

The complete local dashboard. It serves the HUD and:

- `GET /api/state`, `GET /api/stream`, `GET /api/module/status`, `/api/health`;
- `POST /api/settings` (switch the workspace root; token + Origin checked);
- `POST /api/proc/kill` **only when** `allowProcessControl: true` /
  `MC_ALLOW_PROC=1`; otherwise 403 and the UI is READONLY.

The full HUD can display local DSH session text, process command lines, and
workspace paths. Treat that window as sensitive local content. File watching uses
a neutral temporary workspace until `watchDir` is explicitly configured.

## Reporting

If you find a vulnerability, do not open a public issue with exploit details.
Contact the maintainer privately (replace this line with a real security contact
before publishing). Please include:

- affected version/commit;
- a minimal reproduction;
- whether the issue crosses the loopback boundary or only affects local display.

## Hardening ideas for future versions

- Replace the loopback HTTP APIs with DSH Host Remotes to remove the CORS/port
  surfaces.
- Add a per-install bearer token if a non-loopback bind is ever supported.
- Add a strict Content-Security-Policy and a request allowlist at the Host.
- Gate the full HUD behind an explicit enable flag and a short-lived session token.
