# Publishing checklist

This repository is a working local bundle; the following steps turn it into a
public package. Nothing here requires a private key or a remote service.

## 1. Choose identity

Pick a package name and owner. The default name is `dsh-mission-control`; for npm
you will usually publish under a scope:

```json
"name": "@your-scope/dsh-mission-control"
```

If you change it, update **all three** in lockstep:

1. `package.json` `name`
2. `client.js` `id:` inside `window.__ModuleLoader__.load`
3. `cordis.patch.yml` `name:`

`npm run manifest` fails if the client id and package name diverge.

## 2. Replace placeholders

- `package.json`: `author`, `repository`, `homepage`.
- `LICENSE`: copyright line.
- `SECURITY.md`: real security contact.
- `README.md`: screenshots and repository URL.
- `icon.png`: user-provided cat artwork; owner confirms redistribution permission (see NOTICE).

## 3. Verify

```bash
npm test                 # syntax + manifest + host smoke
npm pack --dry-run       # inspect the published file list
```

Then install the **local directory** in a clean DSH profile with
`plugin_manager install_bundle` and exercise the compact panel **and** the FULL
popup window. A successful manifest check is not a substitute for that install
test.

## 4. Publish

```bash
npm publish --access public
git tag v0.5.0
git push --tags
```

Add a GitHub release with the demo screenshot and the install instructions from
`docs/DSH-PLUGIN.md`.

## 5. DSH discoverability

- Keep `locale/en.json` and `locale/zh.json` `meta.title`/`meta.description`
  meaningful; Plugin Manager reads them without activating the plugin.
- Keep `icon.png` under 256 KiB and inside the package.
- If you change the client artifact, a DSH **restart** is required after replacing
  an installed package; HMR is not a guarantee of a new JavaScript generation.
- Do not add a second app root, an iframe, or a bundled DSH Client package. The
  panel must stay a slot registration so themes, locale, and unload work.

## 6. What not to ship

Do not add any of the following to the public repo:

- absolute user/project paths, hostnames, usernames, session ids;
- real session transcripts, prompts, command lines, or screenshots;
- API keys, gateway URLs, probe records;
- process-control endpoints or file deletion;
- user-provided artwork without a redistributable license; this repository records the owner's confirmation in NOTICE.
