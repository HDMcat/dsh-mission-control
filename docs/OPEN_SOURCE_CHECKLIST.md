# Open-source publication checklist

This repository is staged for a clean initial public commit, but it is **not
uploaded** by the agent.

## Must fill before publishing

- [x] Public identity `HDMcat` is set in `LICENSE` and `package.json`.
- [x] Repository homepage/bugs URLs are set to the public GitHub repository.
- [x] Copyright holder and package author are set to `HDMcat`.
- [x] Redistribution permission for `icon.png` / `cat.png` / `demo/public/cat.png`
  is recorded in `NOTICE` (owner-confirmed).
- [ ] Follow [`GITHUB-NOREPLY.md`](GITHUB-NOREPLY.md) to create a GitHub noreply
  address, set it locally, and make the first commit. Do not use the global
  personal identity.
- [ ] Add the GitHub remote and push. No remote is configured here.
- [ ] Optional: upload the generated source archive instead of `.git` if you want
  to avoid local Git configuration entirely.

## Verified clean

- 43 tracked files, ~0.7 MB, no `node_modules`, session logs, screenshots, or
  local settings.
- No home paths, usernames, e-mail addresses, private project names, credentials,
  keys, or absolute local paths in the tracked tree.
- `scripts/check.mjs`, `manifest-check.mjs`, host smoke, and client smoke pass.
- The old `.git` index was replaced; the new repo has **no commit history** and no
  remote, so no stale staged blobs are available to clone.
- `docs/demo.png` is a synthetic DEMO screenshot; no live session content.

## Deliberately excluded

- A separate private research tree is **not** part of this repository and must
  not be uploaded as-is. It contains large data/model/environment volumes,
  session logs, private planning documents, and credentials. See the private
  audit outside this repo.
- The full HUD reads local DSH session content at runtime only; it does not ship
  transcripts.

## Commands after filling identity

```bash
git add -A
git commit -m "feat: initial public Mission Control"
git remote add origin <your-github-repo>
git push -u origin main
```
