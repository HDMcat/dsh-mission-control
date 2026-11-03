#!/usr/bin/env node
/**
 * Validate the DSH bundle manifest, patch, locales, icon, and client factory id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

check(/^[a-z0-9][a-z0-9._-]*$|^@[a-z0-9._-]+\/[a-z0-9._-]+$/.test(pkg.name), 'invalid package name');
check(Boolean(pkg.version), 'missing version');
check(pkg.type === 'module', 'package type must be module');
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must be ./cordis.patch.yml');
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be web');
check(Array.isArray(pkg.dsh?.client?.inject), 'dsh.client.inject must be an array');

const exportPaths = ['.', './client', './locale/*.json', './icon'];
for (const key of exportPaths) check(pkg.exports?.[key], `exports[${key}] missing`);

for (const file of [pkg.dsh.bundle.patch, pkg.exports['./client'], pkg.exports['./icon']]) {
  if (file) check(fs.existsSync(path.join(root, file)), `missing file: ${file}`);
}

for (const locale of ['locale/en.json', 'locale/zh.json']) {
  const file = path.join(root, locale);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(Boolean(data.meta?.title), `${locale}: meta.title missing`);
    check(Boolean(data.meta?.description), `${locale}: meta.description missing`);
  } catch (error) {
    errors.push(`${locale}: ${error.message}`);
  }
}

const patch = fs.readFileSync(path.join(root, pkg.dsh.bundle.patch), 'utf8');
check(patch.includes('insert:'), 'patch has no insert list');
check(patch.includes(`name: ${pkg.name}`), `patch does not reference ${pkg.name}`);
check(patch.includes('id: mission-control'), 'patch row id should be mission-control');

const client = fs.readFileSync(path.join(root, pkg.exports['./client']), 'utf8');
check(client.includes(`id: '${pkg.name}'`) || client.includes(`id: "${pkg.name}"`), 'client factory id must equal package name');
check(client.includes('__ModuleLoader__.load'), 'client must use window.__ModuleLoader__.load');
check(client.includes('sidebarRightTabs.register'), 'client must register a sidebarRight tab type');
check(client.includes('sidebar.right.pane.tab'), 'client must register the sidebar tab body');

const host = fs.readFileSync(path.join(root, pkg.exports['.']), 'utf8');
check(/export\s+function\s+apply\s*\(/.test(host), 'Host entry must export apply(ctx, config)');

if (errors.length) {
  console.error('[manifest] failures:');
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}
console.log(`[manifest] OK ${pkg.name}@${pkg.version}`);
