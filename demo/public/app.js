const COLORS = {
  cpu: '--cpu',
  mem: '--mem',
  gpu: '--gpu',
  disk: '--disk',
};

const root = document.querySelector('#metrics');
const eventsEl = document.querySelector('#events');
const evtCount = document.querySelector('#evtCount');
const badge = document.querySelector('#badge');
const updated = document.querySelector('#updated');
const platform = document.querySelector('#platform');
const watch = document.querySelector('#watch');
let timer = null;
let resizeTimer = null;
let errorEl = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#58a6ff';
}

function fmtBytes(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${u[i]}`;
}

function fmtTime(ts) {
  const d = new Date(ts || Date.now());
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function metricDefs(data) {
  const gpu = data.gpu;
  const disk = data.disk;
  return [
    { key: 'cpu', label: 'CPU LOAD', value: data.cpu?.pct ?? 0, name: data.cpu?.model || 'CPU', series: data.series?.cpu },
    { key: 'mem', label: 'MEMORY', value: data.mem?.pct ?? 0, name: `${fmtBytes(data.mem?.used)} / ${fmtBytes(data.mem?.total)}`, series: data.series?.mem },
    { key: 'gpu', label: 'GPU', value: gpu?.pct ?? null, name: gpu ? `${gpu.name} · ${gpu.temp ?? '—'}°C` : 'GPU unavailable', series: data.series?.gpu },
    { key: 'disk', label: 'DISK', value: disk?.pct ?? null, name: disk ? `${fmtBytes(disk.free)} free` : 'Disk unavailable', series: null },
  ];
}

function ensureCards(defs) {
  if (root.children.length === defs.length) return;
  root.innerHTML = '';
  for (const def of defs) {
    const card = document.createElement('article');
    card.className = 'metric';
    card.dataset.key = def.key;
    card.innerHTML = `
      <div class="metric-head"><span>${def.label}</span><span data-pct>—</span></div>
      <div class="ring" data-ring><div class="ring-inner"><span data-num>0</span><small>%</small></div></div>
      <div class="metric-name" data-name>—</div>
      <canvas class="spark" data-spark></canvas>`;
    root.appendChild(card);
  }
}

function drawSpark(canvas, values, color) {
  const cssW = canvas.clientWidth || 160;
  const cssH = canvas.clientHeight || 34;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const vals = Array.isArray(values) ? values.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
  if (vals.length < 2) return;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = (i / (vals.length - 1)) * (cssW - 2) + 1;
    const y = cssH - 2 - ((v - min) / span) * (cssH - 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color || getComputedStyle(document.documentElement).getPropertyValue('--mem');
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function render(data) {
  const defs = metricDefs(data);
  ensureCards(defs);
  for (const def of defs) {
    const card = root.querySelector(`[data-key="${def.key}"]`);
    if (!card) continue;
    const pct = def.value == null ? 0 : Math.max(0, Math.min(100, Number(def.value)));
    card.querySelector('[data-ring]').style.setProperty('--pct', String(pct));
    card.querySelector('[data-ring]').style.setProperty('--color', `var(${COLORS[def.key]})`);
    card.querySelector('[data-pct]').textContent = def.value == null ? 'N/A' : `${Math.round(pct)}%`;
    card.querySelector('[data-num]').textContent = def.value == null ? '—' : String(Math.round(pct));
    card.querySelector('[data-name]').textContent = def.name || '—';
    card.querySelector('[data-name]').title = def.name || '';
    drawSpark(card.querySelector('[data-spark]'), def.series, cssVar(COLORS[def.key]));
  }

  const files = Array.isArray(data.files) ? data.files : [];
  evtCount.textContent = `${files.length} recent`;
  eventsEl.innerHTML = files.length
    ? files.slice(0, 14).map((f) => `<div class="event"><time>${fmtTime(f.t)}</time><b>${f.kind === 'rename' ? '±' : '~'}</b><span title="${esc(f.rel)}">${esc(f.rel)}</span></div>`).join('')
    : '<div class="empty">No file changes yet.</div>';

  badge.textContent = data.demo ? 'DEMO' : 'LIVE';
  badge.className = `pill${data.demo ? ' demo' : ''}`;
  updated.textContent = data.ts ? `updated ${fmtTime(data.ts)}` : 'waiting';
  platform.textContent = `loopback · ${data.host?.platform || '—'}/${data.host?.arch || '—'}`;
  watch.textContent = data.watch?.enabled ? `watching ${data.watch.label}` : 'file watch disabled';
  if (errorEl) { errorEl.remove(); errorEl = null; }
}

function showError(message) {
  badge.textContent = 'OFFLINE';
  badge.className = 'pill';
  updated.textContent = 'collector offline';
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'error';
    root.before(errorEl);
  }
  errorEl.textContent = `Cannot reach the local collector: ${message}`;
}

async function tick() {
  try {
    const res = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (err) {
    showError(err?.message || String(err));
  }
}

tick();
timer = setInterval(tick, 2000);
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(tick, 120);
});
