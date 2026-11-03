/**
 * Loopback-only HTTP/SSE server for the dashboard.
 *
 * The server intentionally has no write endpoints and no process-control API.
 * It binds to 127.0.0.1. Cross-origin reads are limited to the exact DSH Web
 * origin via an allowlist; there is no wildcard CORS.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHub } from './telemetry.mjs';
import {
  allowedOriginSet, isLoopbackHost, originAllowed, setCorsForAllowedOrigin,
  setSecurityHeaders,
} from './http-security.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function findFullScreenBrowser() {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const candidates = [
    'Google\\Chrome\\Application\\chrome.exe',
    'Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const root of roots) {
    for (const rel of candidates) {
      const file = path.join(root, rel);
      if (fs.existsSync(file)) return file;
    }
  }
  return '';
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(res, rootDir, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return false; }
  if (!rel || rel.includes('\0')) return false;
  const target = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (target !== root && !target.startsWith(root + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(target); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
  });
  fs.createReadStream(target).pipe(res);
  return true;
}

export function startTelemetryServer({
  port = 7799,
  host = '127.0.0.1',
  watchDir = process.cwd(),
  pollMs = 2000,
  enableFileWatch = true,
  demoMode = false,
  demoDir = null,
  fullPort = 7800,
  allowedOrigins = [],
} = {}) {
  // Hard safety default: never expose telemetry on a non-loopback interface.
  const bindHost = '127.0.0.1';
  const demoRoot = demoDir instanceof URL ? fileURLToPath(demoDir) : demoDir;
  const hub = createHub({ watchDir, pollMs, enableFileWatch, demoMode });
  const clients = new Set();
  let broadcast = null;
  const allowed = allowedOriginSet(allowedOrigins);
  const requestedPort = Number(port);
  const configuredPort = Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 7799;
  const currentPort = () => Number(server.address()?.port) || configuredPort;

  const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    setSecurityHeaders(res);
    if (!isLoopbackHost(req.headers.host, currentPort())) {
      return json(res, 403, { ok: false, error: 'host not allowed' });
    }
    if (!originAllowed(req, allowed)) {
      return json(res, 403, { ok: false, error: 'origin not allowed' });
    }
    setCorsForAllowedOrigin(req, res, allowed);
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); } catch {
      json(res, 400, { ok: false, error: 'bad request' });
      return;
    }
    const pathname = url.pathname;

    // Standalone full-screen HUD: launch Chrome/Edge app mode instead of
    // opening another DSH tab. GET is a capability probe; POST launches once.
    if (pathname === '/api/open-full') {
      const browser = findFullScreenBrowser();
      const target = `http://127.0.0.1:${fullPort}/?fullscreen=1`;
      if (method === 'GET') {
        return json(res, 200, { ok: true, available: Boolean(browser), browser: browser ? path.basename(browser) : null, target });
      }
      if (method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
      if (!browser) return json(res, 501, { ok: false, error: 'Chrome/Edge not found', target });
      try {
        const profile = path.join(os.tmpdir(), 'dsh-mission-control-fullscreen-chrome');
        fs.mkdirSync(profile, { recursive: true });
        const child = spawn(browser, [
          `--app=${target}`,
          '--start-fullscreen',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${profile}`,
        ], { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        return json(res, 200, { ok: true, launched: true, browser: path.basename(browser), target });
      } catch (error) {
        return json(res, 500, { ok: false, error: String(error?.message || error), target });
      }
    }

    if (method !== 'GET') {
      json(res, 405, { ok: false, error: 'GET only' });
      return;
    }

    if (pathname === '/api/health') {
      json(res, 200, { ok: true, service: 'dsh-mission-control', demo: demoMode });
      return;
    }
    if (pathname === '/api/snapshot') {
      json(res, 200, hub.snapshot());
      return;
    }
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-store',
      });
      res.write(`data: ${JSON.stringify(hub.snapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      if (demoRoot && serveStatic(res, demoRoot, '/index.html')) return;
      json(res, 200, {
        name: 'dsh-mission-control',
        version: '0.1.0',
        api: ['/api/health', '/api/snapshot', '/api/stream'],
        note: 'Loopback-only telemetry API. The DSH plugin renders the native panel.',
      });
      return;
    }
    if (demoRoot && serveStatic(res, demoRoot, pathname)) return;
    json(res, 404, { ok: false, error: 'not found' });
  });

  server.on('error', (error) => {
    // Keep the plugin alive; a busy port should be reported, not crash DSH.
    console.error('[mission-control] server error:', error?.code || error?.message || error);
  });

  server.listen(configuredPort, bindHost, () => {
    hub.start();
    broadcast = setInterval(() => {
      if (!clients.size) return;
      const payload = `data: ${JSON.stringify(hub.snapshot())}\n\n`;
      for (const res of clients) {
        try { res.write(payload); } catch { clients.delete(res); }
      }
    }, Math.max(500, Number(pollMs) || 2000));
    console.info(`[mission-control] listening on http://${bindHost}:${server.address()?.port || port}`);
  });

  return {
    hub,
    server,
    url: () => `http://${bindHost}:${server.address()?.port || port}`,
    close() {
      hub.stop();
      if (broadcast) clearInterval(broadcast);
      broadcast = null;
      for (const res of clients) {
        try { res.end(); } catch { /* ignore */ }
      }
      clients.clear();
      return new Promise((resolve) => {
        try { server.close(() => resolve()); } catch { resolve(); }
      });
    },
  };
}
