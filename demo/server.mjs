import { startTelemetryServer } from '../src/server.mjs';

const port = Number(process.env.MC_PORT || 7799);
const demoMode = process.env.MC_DEMO !== '0';
const handle = startTelemetryServer({
  port,
  host: '127.0.0.1',
  demoMode,
  demoDir: new URL('./public/', import.meta.url),
  pollMs: 2000,
});

console.info(`[mission-control demo] ${demoMode ? 'DEMO' : 'LIVE'} mode, open ${handle.url()}`);

async function shutdown() {
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
