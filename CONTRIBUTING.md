# Contributing

Thanks for considering a contribution.

## Ground rules

1. **No private data in the repository.** Do not add personal paths, usernames,
   hostnames, pre-recorded session ids, prompts, command lines, API keys, or
   private screenshots. The full HUD may read local session data at runtime; that
   is a runtime surface, not committed content.
2. **No always-on destructive endpoints.** The compact collector is read-only.
   Full-HUD process control and directory switching must stay opt-in and
   explicitly documented; file deletion/shell execution are out of scope.
3. **Loopback only.** Do not add a remote bind option or an authentication-free
   `0.0.0.0` listener.
4. **UI surfaces.** The compact panel renders through DSH slots as React. The
   full HUD may be a separate window served by the child process; do not add an
   iframe or a bundled DSH Client package.
5. **Theme tokens.** Use `--dsw-alias-*` tokens for UI surfaces and text; literal
   colors are allowed only for data-series accents and fallbacks.
6. **Small dependency surface.** Prefer Node built-ins and the React provided by
   the DSH module table. Do not add a runtime package dependency without a clear
   reason and a license review.

## Development

```bash
npm test
npm start        # synthetic demo at http://127.0.0.1:7799/
```

The demo must remain usable with no GPU and on Windows, macOS, and Linux. Missing
hardware must degrade to `null`, never to invented numbers. Synthetic values are
allowed only in `demoMode`, and the UI must keep the `DEMO` badge.

## Pull requests

- Describe the user-visible behavior and the privacy impact.
- Include the exact commands you ran to verify.
- Do not commit generated screenshots, logs, `.env`, or local settings.
- If you change the payload, update `docs/SANITIZATION.md` and `docs/DSH-PLUGIN.md`.
- If you change the manifest, run `npm run manifest`.
