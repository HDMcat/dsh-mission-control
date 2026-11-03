# Security policy

## Design boundary

Both surfaces bind to **127.0.0.1 only**. This is a single-user local tool; it is
not a remote service. Do not expose ports **7799** or **7800** through a proxy,
reverse tunnel, or firewall rule.

The loopback interface is **not** treated as sufficient authentication by itself:

- **7800 full HUD**: a per-process random `HttpOnly; SameSite=Strict` cookie is
  issued when the HUD page is loaded. All `/api/*` routes except `/api/health`
  require it.
- **7799 compact collector**: cross-origin reads are allowlisted to the exact
  DSH Web origin (`DSH_WEB_URL` / `MC_ALLOWED_ORIGINS`) and the DSH desktop
  `dsh-app://` scheme. There is no wildcard CORS.
- Both servers reject non-loopback `Host` headers (DNS rebinding) and attach
  `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options` headers.
- Mutating full-HUD routes require the HUD cookie, POST, and a same-origin
  `Origin`; a blind cross-site form cannot invoke them.

## Compact collector: 7799

Read-only for normal operations:

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/stream`

Launch capability:

- `GET /api/open-full` — capability probe
- `POST /api/open-full` — launches the full HUD in Chrome/Edge app mode

Cross-origin browser requests are accepted only for the exact DSH Web origin.
Requests without `Origin` (local CLI/demo page) still need a valid loopback
`Host`. There is no process-control, arbitrary-path, or file-open endpoint on
this port.

## Full HUD: 7800

Serves the HUD and, behind the HUD cookie:

- `GET /api/state`, `/api/stream`, `/api/module/status`, `/api/folders`,
  `/api/benchmark`, `/api/balance`;
- `POST /api/settings` (workspace root);
- `POST /api/open-folder`, `/api/open-file` (workspace-contained);
- `POST /api/select` (switch the pinned session);
- `POST /api/proc/kill` **only when** `allowProcessControl: true` /
  `MC_ALLOW_PROC=1`; otherwise 403 and the UI is READONLY.

`/api/health` remains unauthenticated so a local watchdog can probe liveness; it
contains no session, process-command, or workspace contents.

The full HUD displays local DSH session text, process command lines, and
workspace paths. Treat that window as sensitive local content. The default
workspace is a neutral temporary directory until `watchDir` is explicitly set.

## Network egress

By default the plugin makes **no network request outside 127.0.0.1**.

The only optional exception is the balance check:

- Set `MC_BALANCE_URL` explicitly to enable it;
- set `MC_BALANCE_KEY` for the bearer token;
- `DEEPSEEK_API_KEY` is not used implicitly. It is used only when
  `MC_BALANCE_USE_DSH_KEY=1` is also set;
- URLs must be `https:` unless `MC_ALLOW_INSECURE_BALANCE=1` is set for a local
  test.

If you do not set `MC_BALANCE_URL`, `/api/balance` returns `not_configured`
without making a request. This is the only outbound capability in the project.

## Reporting

If you find a vulnerability, do not open a public issue with exploit details.
Contact the maintainer privately (replace this line with a real security contact
before publishing). Please include:

- affected version/commit;
- a minimal reproduction;
- whether the issue crosses the loopback boundary or only affects local display.

## Hardening ideas for future versions

- Replace the loopback HTTP APIs with DSH Host Remotes to remove the fixed-port
  surfaces.
- Add a one-time launch token for the compact FULL trigger.
- Add a strict Content-Security-Policy and a request allowlist at the Host.
- Add a redacted HUD mode for screen sharing.
