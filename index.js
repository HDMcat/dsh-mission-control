/**
 * Host half of dsh-mission-control.
 *
 * 1) Starts the compact loopback telemetry API used by the right-sidebar panel.
 * 2) Starts the full-window dashboard as an isolated child process. The client
 *    opens it in a separate window; this keeps the full HUD out of the host
 *    single-slot layout while preserving the complete dashboard.
 *
 * No credentials, command lines, or remote write endpoints are exposed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startTelemetryServer } from './src/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const name = 'dsh-mission-control';

export function apply(ctx, config = {}) {
  const port = Number(config.port) || 7799;
  const fullPort = Number(config.fullPort) || 7800;
  const configuredWatch = typeof config.watchDir === 'string' && config.watchDir.trim()
    ? config.watchDir.trim()
    : '';
  const watchDir = configuredWatch || process.cwd();
  const pollMs = Number(config.pollMs) || 2000;
  // Privacy default: never watch an arbitrary process cwd. A user must opt in
  // by setting watchDir in cordis.patch.yml.
  const enableFileWatch = Boolean(configuredWatch) && config.enableFileWatch !== false;
  const demoMode = config.demoMode === true;

  let server;
  try {
    server = startTelemetryServer({
      port,
      watchDir,
      pollMs,
      enableFileWatch,
      demoMode,
      demoDir: null,
      fullPort,
    });
  } catch (error) {
    console.error('[mission-control] compact server failed:', error?.message || error);
  }
  if (server) {
    ctx.effect(() => {
      return () => {
        Promise.resolve(server.close()).catch(() => {});
      };
    }, 'mission-control: compact telemetry server');
  }

  // Full-window dashboard: runs in an isolated child so its synchronous
  // collectors, session readers, and file watcher cannot block the DSH host.
  const fullWindow = config.fullWindow !== false;
  const allowProcessControl = config.allowProcessControl === true;

  if (fullWindow) {
    let child;
    try {
      const stateDir = process.env.DSH_PROFILE_DIR
        ? path.join(process.env.DSH_PROFILE_DIR, 'mission-control')
        : path.join(os.tmpdir(), 'dsh-mission-control');
      fs.mkdirSync(stateDir, { recursive: true });

      const serverPath = path.join(__dirname, 'dashboard', 'server.mjs');
      // Privacy default for the full window: watch a neutral empty directory
      // unless the user configured a workspace explicitly.
      const fullWatchDir = configuredWatch || path.join(os.tmpdir(), 'dsh-mission-control', 'workspace');
      fs.mkdirSync(fullWatchDir, { recursive: true });
      const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        MC_FULL_PORT: String(fullPort),
        MC_WATCH_DIR: fullWatchDir,
        MC_STATE_DIR: stateDir,
        MC_ALLOW_PROC: allowProcessControl ? '1' : '0',
        MC_READONLY: allowProcessControl ? '0' : '1',
      };
      child = spawn(process.execPath, [serverPath], {
        cwd: path.dirname(serverPath),
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const forward = (stream, label) => {
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          for (const line of String(chunk).split(/\r?\n/)) {
            if (line) console.info(`[mission-control full] ${line}`);
          }
        });
      };
      forward(child.stdout, 'out');
      forward(child.stderr, 'err');
      child.on('error', (error) => {
        console.error('[mission-control] full window failed:', error?.message || error);
      });
      child.on('exit', (code, signal) => {
        console.info(`[mission-control] full window exited code=${code} signal=${signal || ''}`);
      });
      ctx.effect(() => {
        return () => {
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
        };
      }, 'mission-control: full-window dashboard');
      console.info(`[mission-control] full window on http://127.0.0.1:${fullPort}/ (readonly=${!allowProcessControl})`);
    } catch (error) {
      console.error('[mission-control] full window start failed:', error?.message || error);
    }
  }

  return {
    fullWindow,
    fullPort,
    panelPort: port,
    readonly: !allowProcessControl,
  };
}
