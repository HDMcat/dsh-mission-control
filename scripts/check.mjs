#!/usr/bin/env node
/**
 * Dependency-free CI checks: syntax, JSON, YAML shape, and privacy scan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`  FAIL ${message}`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const codeFiles = files.filter((f) => /\.(mjs|cjs|js)$/.test(f));
const dataFiles = files.filter((f) => /\.(json|yml|yaml)$/.test(f));
const scanFiles = files.filter((f) => /\.(mjs|cjs|js|json|yml|yaml|md|html|css|svg|txt)$/.test(f));

console.log(`[check] root=${root}`);
console.log(`[check] ${codeFiles.length} JS files, ${dataFiles.length} JSON/YAML files`);

for (const file of codeFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`syntax: ${path.relative(root, file)}\n${String(error.stderr || error.message).trim()}`);
  }
}

for (const file of dataFiles) {
  try {
    if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`json: ${path.relative(root, file)}: ${error.message}`);
  }
}

const forbidden = [
  ['absolute Windows user path', /[A-Za-z]:[\\/]+Users[\\/]/i],
  ['unix home path', /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['API key literal', /\bsk-[A-Za-z0-9]{20,}\b/],
  ['private key file reference', /api[_-]?key\.txt/i],
];

for (const file of scanFiles) {
  if (path.resolve(file) === path.resolve(fileURLToPath(import.meta.url))) continue;
  const rel = path.relative(root, file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const [label, regex] of forbidden) {
    if (regex.test(text)) fail(`privacy (${label}) in ${rel}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!pkg.name || !pkg.version) fail('package.json: name/version missing');
if (!pkg.dsh?.bundle?.patch) fail('package.json: dsh.bundle.patch missing');
if (!pkg.dsh?.client?.platform) fail('package.json: dsh.client.platform missing');
if (!pkg.exports?.['./client']) fail('package.json: exports["./client"] missing');
if (!pkg.exports?.['./icon']) fail('package.json: exports["./icon"] missing');
if (!fs.existsSync(path.join(root, pkg.dsh.bundle.patch))) fail('patch file missing');
const iconRel = String(pkg.exports['./icon']).replace(/^\.\//, '');
const iconPath = path.join(root, iconRel);
if (!fs.existsSync(iconPath)) fail(`icon missing: ${iconRel}`);
if (fs.statSync(iconPath).size > 256 * 1024) fail(`${iconRel} exceeds 256 KiB`);

console.log(failures.length ? `[check] ${failures.length} failure(s)` : '[check] OK');
process.exit(failures.length ? 1 : 0);
