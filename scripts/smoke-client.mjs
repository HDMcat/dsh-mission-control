#!/usr/bin/env node
/**
 * Smoke-test the Client module's registration wiring without a browser or DSH.
 * This verifies the public shape: factory id, inject list, tab type, tab body,
 * and header launcher. It does not render React or prove visuals.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
const failures = [];

let loaded = null;
const window = {
  __ModuleLoader__: {
    load(options) { loaded = options; },
  },
};

const react = {
  createElement() { return null; },
  Fragment: Symbol('Fragment'),
  useState() { return [null, () => {}]; },
  useEffect() {},
  useMemo(fn) { return fn(); },
};

const sandbox = {
  window,
  console,
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async () => { throw new Error('fetch should not run during registration smoke'); },
  setInterval: () => 0,
  clearInterval: () => {},
  Date,
  Math,
  JSON,
  URL,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

if (!loaded) failures.push('module loader was not called');
if (loaded && loaded.id !== 'dsh-mission-control') failures.push(`factory id: ${loaded.id}`);
if (!loaded?.factory) failures.push('factory missing');

let plugin = null;
try {
  plugin = loaded?.factory((name) => {
    if (name === 'react') return react;
    throw new Error(`unexpected require(${name})`);
  });
} catch (error) {
  failures.push(`factory threw: ${error.message}`);
}

if (!Array.isArray(plugin?.inject)) failures.push('inject array missing');
for (const name of ['slots', 'sidebarRight', 'sidebarRightTabs']) {
  if (!plugin?.inject?.includes(name)) failures.push(`inject missing ${name}`);
}

const registered = { tabs: [], slots: [], effects: 0 };
const cleanups = [];
const ctx = {
  effect(fn) {
    registered.effects += 1;
    const dispose = fn();
    if (typeof dispose === 'function') cleanups.push(dispose);
    return dispose;
  },
  slots: {
    inject(owner, fn) {
      const dispose = fn();
      return () => { if (typeof dispose === 'function') dispose(); };
    },
    register(options, component) {
      registered.slots.push({ owner: options.name, key: options.key || options.id, component });
      return () => {};
    },
  },
  sidebarRightTabs: {
    register(definition) {
      registered.tabs.push(definition);
      return () => {};
    },
  },
  sidebarRight: { openTab() {} },
};

try {
  plugin?.apply(ctx);
} catch (error) {
  failures.push(`apply threw: ${error.message}`);
}

const tab = registered.tabs[0];
if (!tab) failures.push('sidebarRightTabs.register not called');
if (tab && tab.kind !== 'mission-control') failures.push(`tab kind: ${tab.kind}`);
if (tab && tab.id !== 'dsh-mission-control') failures.push(`tab id: ${tab.id}`);
if (!registered.slots.some((s) => s.owner === 'sidebar.right.pane.tab' && s.key === 'dsh-mission-control')) {
  failures.push('sidebar.right.pane.tab body not registered');
}
if (!registered.slots.some((s) => s.owner === 'conversation.composer.dock')) {
  failures.push('composer launcher not registered');
}
if (!registered.effects) failures.push('no ctx.effect cleanup registered');

for (const dispose of cleanups.reverse()) {
  try { dispose(); } catch { /* ignore */ }
}

if (failures.length) {
  console.error('[client-smoke] failures:');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}
console.log('[client-smoke] OK', {
  inject: plugin.inject,
  tabs: registered.tabs.map((t) => `${t.kind}:${t.id}`),
  slots: registered.slots.map((s) => s.owner),
  full: true,});
