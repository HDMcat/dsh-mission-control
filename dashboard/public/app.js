/* ============================================================
   MISSION CONTROL — client
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI, TAU = PI * 2;

  const state = {
    system: null,
    series: { gpu: [], cpu: [], mem: [], temp: [], vram: [] },
    session: null,
    workspace: null,
    connected: false,
    lastFeedT: 0,
    blips: [],
    chartBlocks: [],
    chartFiles: [],
    now: 0,
    sampleMs: 2000,
    lastAt: 0,
    pinnedInit: false,
    controlToken: '',
    readonly: false,
    root: '',
  };
  let docTitleAt = 0;
  let sessChoice = 'auto';
  let sessSig = '';

  // HDM/0.5性能报告.md, §0.2 / §3.2 (full-load envelope, 12 s matmul)
  const PAPER = { clock: 2400, power: 100, temp: 80, vramMiB: 12288 };
  const APP_MODE = new URLSearchParams(location.search).get('app') === 'qt';
  const C = {
    ink: '#1C2A35', ink2: '#2B3B47', ink3: '#4E5A63', ink4: '#7A7264',
    cinnabar: '#B43A2B', cinnabar2: '#D0604A',
    ochre: '#A06A42', ochre2: '#C39367',
    blue: '#2E4C66', blue2: '#5A7A93',
    paper: '#FAF4E8', panel: '#FCF7ED', disc: '#FFFDF8', white: '#FFFDF8',
  };

  /* ============================================================
     THEME ENGINE — 7 groups × 3 palettes
     ============================================================ */
  const THEME_KEY = 'mission-control-theme';
  const DEFAULT_THEME = 'guofeng-xuan';
  const THEME_GROUPS = [
    { id: 'guofeng', name: '国风', themes: [
      { id: 'guofeng-xuan', name: '宣纸朱砂', mode: 'light', paper: '#F6EFE3', panel: '#FCF7ED', accent: '#C3272B', blue: '#0B3D6B', ochre: '#A9792B' },
      { id: 'guofeng-jade', name: '青绿山水', mode: 'light', paper: '#EAF0E6', panel: '#F7FAF3', accent: '#2F6B5E', blue: '#1F4E5F', ochre: '#8A6A3C' },
      { id: 'guofeng-ink', name: '墨夜竹影', mode: 'dark', paper: '#121713', panel: '#18201A', accent: '#D0604A', blue: '#3F6B5E', ochre: '#A9792B' },
    ] },
    { id: 'girl', name: '少女', themes: [
      { id: 'girl-sakura', name: '樱花奶油', mode: 'light', paper: '#FFF1F3', panel: '#FFF9FA', accent: '#D96A8A', blue: '#7A6A9E', ochre: '#E0A06A' },
      { id: 'girl-mint', name: '薄荷苏打', mode: 'light', paper: '#EFFBF7', panel: '#F8FFFC', accent: '#4AAE9B', blue: '#3A7CA5', ochre: '#D6A45E' },
      { id: 'girl-peach', name: '蜜桃晚霞', mode: 'light', paper: '#FFF0E7', panel: '#FFF8F2', accent: '#E2765C', blue: '#8A6A9E', ochre: '#C98A4B' },
    ] },
    { id: 'scifi', name: '科幻', themes: [
      { id: 'scifi-orbit', name: '深空蓝白', mode: 'light', paper: '#EAF2FA', panel: '#F7FBFF', accent: '#2F6FD0', blue: '#0B3D6B', ochre: '#6A8FAE' },
      { id: 'scifi-ion', name: '离子青', mode: 'light', paper: '#E6F7FA', panel: '#F4FDFE', accent: '#00A6B8', blue: '#0B4F6C', ochre: '#4F7F8C' },
      { id: 'scifi-lunar', name: '月面银', mode: 'light', paper: '#EEF0F2', panel: '#FAFBFC', accent: '#5B6B7C', blue: '#2C5A7C', ochre: '#A9792B' },
    ] },
    { id: 'dark', name: '暗黑', themes: [
      { id: 'dark-copper', name: '炭黑赤铜', mode: 'dark', paper: '#0F1113', panel: '#171A1D', accent: '#C0603A', blue: '#4F7A93', ochre: '#A9792B' },
      { id: 'dark-graphite', name: '石墨幽蓝', mode: 'dark', paper: '#0D1117', panel: '#151B23', accent: '#3C7EA8', blue: '#2C5A7C', ochre: '#7A6A4A' },
      { id: 'dark-celadon', name: '墨黑青瓷', mode: 'dark', paper: '#0E1210', panel: '#161D19', accent: '#6E8B74', blue: '#2F5D7A', ochre: '#A9792B' },
    ] },
    { id: 'zombie', name: '丧尸', themes: [
      { id: 'zombie-soil', name: '腐土橄榄', mode: 'dark', paper: '#14140F', panel: '#1D1D15', accent: '#8A9A3B', blue: '#5A6E4A', ochre: '#A9792B' },
      { id: 'zombie-toxic', name: '毒沼黄绿', mode: 'dark', paper: '#10140C', panel: '#192113', accent: '#B6C93A', blue: '#4F7A5A', ochre: '#8E9A3B' },
      { id: 'zombie-ash', name: '血红灰烬', mode: 'dark', paper: '#140F0F', panel: '#1E1615', accent: '#B33A2B', blue: '#6A5A55', ochre: '#8A6A4A' },
    ] },
    { id: 'wasteland', name: '末日', themes: [
      { id: 'wasteland-ember', name: '焦土橙灰', mode: 'dark', paper: '#171310', panel: '#211B16', accent: '#C26A2E', blue: '#5E6A72', ochre: '#A9792B' },
      { id: 'wasteland-dune', name: '沙尘褐', mode: 'dark', paper: '#1B1711', panel: '#262019', accent: '#B08A55', blue: '#6A6A5A', ochre: '#C39367' },
      { id: 'wasteland-nuclear', name: '核冬灰蓝', mode: 'dark', paper: '#11161A', panel: '#1A2228', accent: '#6E8FA3', blue: '#2C5A7C', ochre: '#8A7A5A' },
    ] },
    { id: 'cyber', name: '赛博朋克', themes: [
      { id: 'cyber-magenta', name: '霓虹洋红', mode: 'dark', paper: '#0C0A12', panel: '#151020', accent: '#FF3D9A', blue: '#00D4FF', ochre: '#FFB000' },
      { id: 'cyber-violet', name: '电光青紫', mode: 'dark', paper: '#090D16', panel: '#111827', accent: '#00E5FF', blue: '#7A5CFF', ochre: '#FF4FD8' },
      { id: 'cyber-acid', name: '酸性黄绿', mode: 'dark', paper: '#0A0F0A', panel: '#121A10', accent: '#C6FF00', blue: '#00E5FF', ochre: '#FF9F1C' },
    ] },
  ];
  const THEMES = THEME_GROUPS.flatMap((g) => g.themes.map((t) => buildTheme(g, t)));
  let activeTheme = DEFAULT_THEME;

  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixHex(a, b, t) {
    const A = hexRgb(a), B = hexRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + c.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function buildTheme(group, def) {
    const dark = def.mode === 'dark';
    const paper = def.paper, panel = def.panel;
    const ink = dark ? '#E9E3D7' : '#1F1B16';
    const ink2 = mixHex(ink, paper, dark ? 0.30 : 0.38);
    const ink3 = mixHex(ink, paper, dark ? 0.50 : 0.56);
    const ink4 = mixHex(ink, paper, dark ? 0.64 : 0.70);
    const line = mixHex(ink, paper, dark ? 0.72 : 0.80);
    const lineSoft = mixHex(ink, paper, dark ? 0.86 : 0.91);
    const accent2 = mixHex(def.accent, '#000000', 0.28);
    const blue2 = mixHex(def.blue, dark ? '#000000' : '#FFFFFF', 0.28);
    const ochre2 = mixHex(def.ochre, dark ? '#000000' : '#FFFFFF', 0.25);
    const top1 = mixHex(dark ? panel : ink, '#000000', dark ? 0.35 : 0.18);
    const top2 = mixHex(top1, '#000000', 0.32);
    const headerInk = '#F7F0E4';
    const headerMuted = mixHex(headerInk, top1, 0.52);
    return {
      ...def, group: group.id, groupName: group.name, dark,
      ink, ink2, ink3, ink4, line, lineSoft,
      accent2, blue2, ochre2, top1, top2, headerInk, headerMuted,
      panel2: mixHex(panel, ink, dark ? 0.08 : 0.05),
      band: mixHex(panel, def.accent, 0.10),
      gaugeA: panel,
      gaugeB: mixHex(panel, ink, 0.04),
      discA: dark ? mixHex(panel, '#FFFFFF', 0.10) : mixHex(panel, '#FFFFFF', 0.65),
      discB: mixHex(panel, ink, 0.12),
    };
  }
  function findTheme(id) {
    return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME) || THEMES[0];
  }
  function refreshGaugeColors() {
    if (typeof GAUGES === 'undefined') return;
    const map = {
      gpu: ['blue', 'blue2'], vram: ['ochre', 'ochre2'],
      cpu: ['cinnabar', 'cinnabar2'], ram: ['ink2', 'blue'],
    };
    for (const g of GAUGES) {
      const [a, b] = map[g.key] || ['ink2', 'ink2'];
      g.color = C[a];
      g.color2 = C[b];
      g.accent = rgba(C[a], 0.5);
    }
  }
  function applyTheme(id) {
    const t = findTheme(id);
    const s = document.documentElement.style;
    const vars = {
      '--paper': t.paper, '--paper-2': t.panel, '--paper-3': t.panel2,
      '--panel-a': t.panel, '--panel-b': t.panel2,
      '--ink': t.ink, '--ink-2': t.ink2, '--ink-3': t.ink3, '--ink-4': t.ink4,
      '--line': t.line, '--line-soft': t.lineSoft,
      '--cinnabar': t.accent, '--cinnabar-2': t.accent2, '--cinnabar-deep': t.accent2,
      '--ochre': t.ochre, '--ochre-2': t.ochre2,
      '--blue': t.blue, '--blue-2': t.blue2,
      '--band': t.band, '--top1': t.top1, '--top2': t.top2,
      '--header-ink': t.headerInk, '--header-muted': t.headerMuted,
      '--gauge-a': t.gaugeA, '--gauge-b': t.gaugeB,
      '--disc-a': t.discA, '--disc-b': t.discB,
      '--text': t.ink, '--dim': t.ink3, '--dimmer': t.ink4,
      '--bg': t.paper, '--cyan': t.blue, '--violet': t.ochre,
      '--amber': t.ochre, '--green': t.blue2, '--pink': t.accent,
    };
    for (const [k, v] of Object.entries(vars)) s.setProperty(k, v);
    document.documentElement.dataset.mode = t.dark ? 'dark' : 'light';
    document.body.dataset.theme = t.id;
    C.ink = t.ink; C.ink2 = t.ink2; C.ink3 = t.ink3; C.ink4 = t.ink4;
    C.cinnabar = t.accent; C.cinnabar2 = t.accent2;
    C.ochre = t.ochre; C.ochre2 = t.ochre2;
    C.blue = t.blue; C.blue2 = t.blue2;
    C.paper = t.paper; C.panel = t.panel; C.disc = t.discA; C.white = t.discA;
    activeTheme = t.id;
    refreshGaugeColors();
    RADAR_COLORS = [C.cinnabar, C.ochre, C.blue, C.ochre2, C.blue2, C.cinnabar2, C.ink2, C.ink4];
    refreshToolColors();
    try { localStorage.setItem(THEME_KEY, t.id); } catch { /* ignore */ }
    document.querySelectorAll('.theme-card').forEach((el) => el.classList.toggle('on', el.dataset.theme === t.id));
  }

  /* ---------------- formatters ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i];
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }
  function fmtDur(ms) {
    const s = (Number(ms) || 0) / 1000;
    if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm' + pad2(Math.floor(s % 60));
    return Math.floor(m / 60) + 'h' + pad2(m % 60);
  }
  function rateShort(b) {
    b = Number(b) || 0;
    if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + 'M';
    if (b >= 1e3) return Math.round(b / 1e3) + 'K';
    return String(Math.round(b));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return Math.floor(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  const hhmmss = (t) => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  const pct = (v) => (Number.isFinite(v) ? v.toFixed(0) : '0') + '%';
  function fmtPerm(p) {
    const s = p?.sandbox || '';
    const a = p?.approval || '';
    const sLabel = s.includes('danger') ? 'FULL'
      : s.includes('workspace') ? 'WORKSPACE'
        : s.includes('read') ? 'READ-ONLY'
          : (s || '—').toUpperCase();
    return `${(a || '—').toUpperCase()} · ${sLabel}`;
  }

  /* ---------------- canvas helper ---------------- */
  function prep(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 100, h = cv.clientHeight || 100;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* ============================================================
     GAUGES
     ============================================================ */
  const GAUGES = [
    {
      key: 'gpu', cap: 'GPU LOAD', color: C.blue, color2: C.blue2, accent: 'rgba(46,76,102,.5)',
      value: (s) => s.system?.gpu?.util || 0,
      badge: (s) => s.system?.gpu ? s.system.gpu.temp + '°C' : '—',
      name: (s) => s.system?.gpu?.name || 'GPU 不可用',
      foot: (s) => s.system?.gpu
        ? `${(s.system.gpu.memUsed / 2 ** 30).toFixed(1)} / ${(s.system.gpu.memTotal / 2 ** 30).toFixed(0)} GB · ${Math.round(s.system.gpu.power)} W · ${s.system.gpu.clock} MHz`
        : '等待 nvidia-smi',
      series: 'gpu',
    },
    {
      key: 'vram', cap: 'VRAM', color: C.ochre, color2: C.ochre2, accent: 'rgba(160,106,66,.5)',
      value: (s) => s.system?.gpu?.memPct || 0,
      badge: () => 'GDDR7',
      name: () => 'VRAM · 显存占用',
      foot: (s) => s.system?.gpu
        ? `${(s.system.gpu.memUsed / 2 ** 30).toFixed(2)} / ${(s.system.gpu.memTotal / 2 ** 30).toFixed(1)} GB`
        : '—',
      series: 'vram',
    },
    {
      key: 'cpu', cap: 'CPU LOAD', color: C.cinnabar, color2: C.cinnabar2, accent: 'rgba(180,58,43,.5)',
      value: (s) => s.system?.cpu?.pct || 0,
      badge: (s) => (s.system?.cpu?.cores || 0) + 'C',
      name: (s) => s.system?.cpu?.model || 'CPU',
      foot: (s) => s.system?.cpu ? `${(s.system.cpu.speed / 1000).toFixed(2)} GHz · ${s.system.cpu.cores} 线程` : '—',
      series: 'cpu',
    },
    {
      key: 'ram', cap: 'MEMORY', color: C.ink2, color2: C.blue, accent: 'rgba(34,48,60,.45)',
      value: (s) => s.system?.mem?.pct || 0,
      badge: () => 'DDR5',
      name: () => 'System Memory',
      foot: (s) => s.system?.mem
        ? `${fmtBytes(s.system.mem.used)} / ${fmtBytes(s.system.mem.total)}`
        : '—',
      series: 'mem',
    },
  ];

  const gaugeEls = [];
  function buildGauges() {
    const row = $('#gaugeRow');
    const workers = $('#workersCard');
    for (const def of GAUGES) {
      const el = document.createElement('article');
      el.className = 'panel gauge';
      el.style.setProperty('--c', def.color);
      el.style.setProperty('--accent', def.accent);
      el.innerHTML = `
        <div class="gauge-vis">
          <canvas></canvas>
          <div class="gauge-center">
            <div class="g-val"><span>0</span><small>%</small></div>
            <div class="g-cap">${def.cap}</div>
          </div>
        </div>
        <div class="g-side">
          <div class="g-label"><span>${def.key.toUpperCase()}</span><span class="g-badge">—</span></div>
          <div class="g-name">—</div>
          <canvas class="g-spark"></canvas>
          ${def.key === 'gpu' ? '<div class="g-engines"></div>' : ''}
          ${def.key === 'cpu' ? '<div class="g-cores"></div>' : ''}
          <div class="g-foot">—</div>
        </div>`;
      row.insertBefore(el, workers);
      const gauge = {
        def, el,
        gcv: $('canvas', el), scv: $('.g-spark', el),
        valEl: $('.g-val span', el), badgeEl: $('.g-badge', el),
        nameEl: $('.g-name', el), footEl: $('.g-foot', el),
        target: 0, shown: 0, spark: [],
      };
      if (def.key === 'gpu') {
        const wrap = $('.g-engines', el);
        wrap.title = 'GPU 引擎占用：3D / 显存控制器 / 编码 / 解码';
        wrap.innerHTML = ['3D', 'MEM', 'ENC', 'DEC'].map((k) => `<div class="ge" data-k="${k}"><span>${k}</span><b>0</b><i></i></div>`).join('');
        gauge.engines = [...wrap.querySelectorAll('.ge')];
      }
      if (def.key === 'cpu') {
        const wrap = $('.g-cores', el);
        for (let i = 0; i < 20; i++) {
          const bar = document.createElement('i');
          if (i < 8) bar.className = 'p';
          bar.title = `CPU ${i}`;
          wrap.appendChild(bar);
        }
        gauge.cores = [...wrap.children];
      }
      gaugeEls.push(gauge);
    }
  }

  function drawGauge(g) {
    const { ctx, w, h } = prep(g.gcv);
    const cx = w / 2, cy = h / 2 + 2, r = Math.min(w, h) * 0.385;
    const start = PI * 0.75, sweep = PI * 1.5;
    ctx.clearRect(0, 0, w, h);

    // outer faint ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, start - 0.06, start + sweep + 0.06);
    ctx.strokeStyle = rgba(C.ink, .24);
    ctx.lineWidth = 1;
    ctx.stroke();

    // track
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.strokeStyle = rgba(C.ink, .32);
    ctx.lineWidth = 7;
    ctx.lineCap = 'butt';
    ctx.stroke();

    // ticks
    const n = 36;
    for (let i = 0; i <= n; i++) {
      const a = start + (sweep * i) / n;
      const on = i / n <= g.shown / 100;
      const r1 = r + 8, r2 = r + (i % 6 === 0 ? 13 : 10.5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = on ? g.def.color : rgba(C.ink, .32);
      ctx.globalAlpha = on ? 0.9 : 0.55;
      ctx.lineWidth = i % 6 === 0 ? 1.4 : 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // progress arc
    const end = start + (sweep * clamp(g.shown, 0, 100)) / 100;
    const c1 = g.shown >= 90 ? C.cinnabar : g.shown >= 75 ? C.ochre : g.def.color;
    const c2 = g.shown >= 90 ? C.cinnabar2 : g.shown >= 75 ? C.ochre2 : g.def.color2;
    if (g.shown > 0.3) {
      const grad = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 5;
      ctx.shadowColor = c1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // tip
      const tx = cx + Math.cos(end) * r, ty = cy + Math.sin(end) * r;
      ctx.beginPath();
      ctx.arc(tx, ty, 2.1, 0, TAU);
      ctx.fillStyle = C.disc;
      ctx.shadowBlur = 5;
      ctx.shadowColor = c1;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // inner paper glow
    const ig = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    ig.addColorStop(0, rgba(C.disc, .65));
    ig.addColorStop(1, rgba(C.ink, .05));
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, TAU);
    ctx.fillStyle = ig;
    ctx.fill();
  }

  function drawSpark(g) {
    const { ctx, w, h } = prep(g.scv);
    ctx.clearRect(0, 0, w, h);
    const data = g.spark;
    if (!data || data.length < 2) return;
    const min = Math.min(...data), max = Math.max(...data);
    const span = Math.max(1, max - min);
    const x = (i) => (i / (data.length - 1)) * w;
    const y = (v) => h - 2 - ((v - min) / span) * (h - 5);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, g.def.color + '55');
    grad.addColorStop(1, g.def.color + '00');
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = g.def.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(w - 1, y(data[data.length - 1]), 1.8, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 7;
    ctx.shadowColor = g.def.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function updateGauges(s) {
    for (const g of gaugeEls) {
      const v = clamp(Number(g.def.value(s)) || 0, 0, 100);
      g.target = v;
      g.badgeEl.textContent = (g.def.key === 'cpu' && s.system?.cpu?.cores === 20) ? '8P+12E' : g.def.badge(s);
      g.nameEl.textContent = g.def.name(s);
      g.footEl.textContent = g.def.foot(s);
      if (g.def.key === 'cpu') {
        const w = s.system?.cpu?.winPct;
        const n = s.system?.cpu?.nodePct;
        g.el.title = `Windows % Processor Time: ${w ?? '—'}% · Node os.cpus 估算: ${n ?? '—'}%`;
      }
      const arr = s.series?.[g.def.series] || [];
      g.spark = arr.slice(-40);
      if (g.engines) {
        const gp = s.system?.gpu;
        const vals = { '3D': gp?.util || 0, MEM: gp?.memUtil || 0, ENC: gp?.encUtil || 0, DEC: gp?.decUtil || 0 };
        for (const engEl of g.engines) {
          const val = clamp(vals[engEl.dataset.k] || 0, 0, 100);
          engEl.querySelector('b').textContent = Math.round(val) + '%';
          engEl.querySelector('i').style.width = val + '%';
        }
      }
      if (g.cores) {
        const per = s.system?.cpu?.perCore || [];
        for (let i = 0; i < g.cores.length; i++) {
          const val = clamp(per[i] || 0, 0, 100);
          const bar = g.cores[i];
          bar.style.height = Math.max(2, (val / 100) * 14) + 'px';
          bar.style.background = val >= 88 ? C.cinnabar : val >= 62 ? C.ochre : val >= 28 ? C.blue : rgba(C.blue, .25);
          bar.title = `CPU ${i}: ${Math.round(val)}%`;
        }
      }
    }
  }

  function animateGauges() {
    for (const g of gaugeEls) {
      const diff = g.target - g.shown;
      g.shown += diff * (Math.abs(diff) < 0.15 ? 1 : 0.09);
      g.shown = clamp(g.shown, 0, 100);
      g.valEl.textContent = String(Math.round(g.shown));
      const hot = g.shown >= 90 ? C.cinnabar : g.shown >= 75 ? C.ochre : null;
      if (g.hotColor !== hot) {
        g.hotColor = hot;
        g.el.style.setProperty('--c', hot || g.def.color);
      }
      drawGauge(g);
      drawSpark(g);
    }
  }

  /* ============================================================
     WORKERS
     ============================================================ */
  function renderWorkers(s) {
    const box = $('#workers');
    const procs = (s.system?.procs || []).filter((p) => p && p.pid);
    const wanted = procs.filter((p) => ['python', 'pythonw', 'node'].includes(p.name));
    const list = (wanted.length ? wanted : procs).slice(0, 5);
    $('#workersCount').textContent = String(wanted.length || procs.length);
    if (!list.length) {
      box.innerHTML = '<div class="wc-empty">无活跃计算进程</div>';
      renderIo(s);
      return;
    }
    box.innerHTML = list.map((p) => {
      const name = (p.exe || '').replace(/\\/g, '/').split('/').pop() || (p.name + '.exe');
      const short = name.length > 22 ? name.slice(0, 20) + '…' : name;
      const c = p.name === 'python' ? C.blue2 : p.name === 'node' ? C.ochre : C.ink3;
      const width = clamp(p.pct * 8, 1.5, 100);
      return `<div class="wc-row" title="${(p.exe || '').replace(/"/g, '')}">
        <span class="wc-dot" style="--c:${c}"></span>
        <span class="wc-name">${short}<b>#${p.pid}</b></span>
        <span class="wc-pct">${p.pct.toFixed(1)}%</span>
        <span class="wc-mem">${fmtBytes(p.mem)}</span>
        <span class="wc-bar"><i style="width:${width}%"></i></span>
      </div>`;
    }).join('');
    renderIo(s);
  }

  function renderIo(s) {
    const el = $('#ioLine');
    if (!el) return;
    const net = s.system?.net;
    const e = s.system?.disks?.['E:'];
    const parts = [];
    if (net) parts.push(`NET ↓${rateShort(net.rx)} ↑${rateShort(net.tx)}`);
    if (e) parts.push(`E ${e.pct}%`);
    el.textContent = parts.length ? parts.join('  ·  ') : 'I/O 采样中…';
    const tips = [];
    if (net) tips.push(`${net.name}: 下行 ${fmtBytes(net.rx)}/s · 上行 ${fmtBytes(net.tx)}/s`);
    if (e) tips.push(`E: 已用 ${e.pct}% · 剩余 ${fmtBytes(e.free)}`);
    el.title = tips.join(' | ');
  }

  function renderIoStrip(s) {
    const b = state.bench || {};
    const net = s?.system?.net || {};
    const diskRead = Number.isFinite(Number(b.diskReadMBs)) ? `${Math.round(b.diskReadMBs)} MB/s` : 'BENCH…';
    const diskWrite = Number.isFinite(Number(b.diskWriteMBs)) ? `${Math.round(b.diskWriteMBs)} MB/s` : 'BENCH…';
    const peak = Number.isFinite(Number(net.peakMbps)) ? `${Math.round(net.peakMbps)} Mbps`
      : Number.isFinite(Number(b.net?.peakMbps)) ? `${Math.round(b.net.peakMbps)} Mbps` : '—';
    const link = Number.isFinite(Number(net.linkMbps)) ? `${Math.round(net.linkMbps)} Mbps`
      : Number.isFinite(Number(b.net?.linkMbps)) ? `${Math.round(b.net.linkMbps)} Mbps` : 'N/A';
    const set = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
    set('ioDiskRead', diskRead);
    set('ioDiskWrite', diskWrite);
    set('ioNetPeak', peak);
    set('ioNetLink', link);
    const tip = (id, v) => { const el = $('#' + id); if (el) el.title = v; };
    tip('ioDiskRead', `首次加载顺序读：${diskRead}`);
    tip('ioDiskWrite', `首次加载顺序写 + fsync：${diskWrite}`);
    tip('ioNetPeak', `SSE 采样期间观测到的最高吞吐：${peak}`);
    tip('ioNetLink', net.linkLabel || b.net?.linkLabel || '链路协商速率');
  }

  function showBenchToast(b) {
    const el = $('#benchToast');
    if (!el) return;
    const cpu = Number.isFinite(Number(b.cpuMops)) ? `${Math.round(b.cpuMops)} Mops/s` : 'N/A';
    const mem = Number.isFinite(Number(b.memGBs)) ? `${b.memGBs} GB/s` : 'N/A';
    const dr = Number.isFinite(Number(b.diskReadMBs)) ? `${Math.round(b.diskReadMBs)} MB/s` : 'N/A';
    const dw = Number.isFinite(Number(b.diskWriteMBs)) ? `${Math.round(b.diskWriteMBs)} MB/s` : 'N/A';
    const link = Number.isFinite(Number(b.net?.linkMbps)) ? `${Math.round(b.net.linkMbps)} Mbps` : 'N/A';
    $('#benchToastBody').textContent = `CPU ${cpu} · MEM ${mem} · DISK R ${dr} / W ${dw} · NET ${link}`;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(showBenchToast._t);
    showBenchToast._t = setTimeout(() => el.classList.remove('show'), 8000);
  }

  async function loadBench() {
    try {
      const r = await fetch('/api/benchmark', { cache: 'no-store' });
      if (!r.ok) throw new Error('bench HTTP ' + r.status);
      const b = await r.json();
      if (!b.ok) throw new Error(b.error || 'bench failed');
      state.bench = b;
      renderIoStrip(state);
      let seen = false;
      try { seen = !!localStorage.getItem('mcBenchV1'); } catch { /* ignore */ }
      if (!seen) {
        showBenchToast(b);
        try { localStorage.setItem('mcBenchV1', JSON.stringify({ at: b.at, cpuMops: b.cpuMops })); } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn('[bench]', err);
      renderIoStrip(state);
    }
  }

  /* ============================================================
     SESSION SUMMARY
     ============================================================ */
  function renderSession(s) {
    const se = s.session || {};
    const title = se.title || '等待 DeepSeek 会话…';
    $('#sessTitle').textContent = title;
    $('#sessTitle').title = title;
    $('#sessModel').textContent = (se.model?.model || '—') + (se.model?.effort ? ' · ' + se.model.effort.toUpperCase() : '');
    $('#sessPerm').textContent = fmtPerm(se.permissions);
    $('#sessCwd').textContent = se.cwd || '';
    renderSessSelect(s);

    $('#wfTurn').textContent = 'T' + (se.stats?.turns ?? '—');
    const open = se.stats?.openStep;
    $('#wfStep').textContent = 'S' + (se.stats?.steps ?? '—') + (open ? ` · ${Math.max(0, Math.round(open.elapsed / 1000))}s` : '');
    $('#wfCalls').textContent = (se.stats?.calls ?? 0) + ' CALLS';
    $('#wfLive').classList.toggle('off', !se.live);
    $('#wfLive').lastChild.textContent = se.live ? 'LIVE' : 'IDLE';

    $('#chipSession').textContent = se.id ? se.id.replace('session-', '').slice(0, 8).toUpperCase() : '—';
    $('#chipModel').textContent = se.model?.model || '—';
    $('#chipMode').textContent = fmtPerm(se.permissions);

    const st = se.stats || {};
    const items = [
      ['LLM', fmtDur(st.llmMs)],
      ['TOOL', fmtDur(st.toolMs)],
      ['TTFT', st.ttftAvg ? fmtDur(st.ttftAvg) : '—'],
      ['TOK/S', (st.decodeTps ?? 0).toFixed(1)],
      ['CALLS', String(st.calls ?? 0)],
      ['ERR', String(st.errors ?? 0)],
    ];
    $('#sessStats').innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

    const ctx = se.context || {};
    const p = clamp(ctx.pct || 0, 0, 100);
    $('#ctxFill').style.width = p + '%';
    $('#ctxMark').style.left = p + '%';
    $('#ctxText').textContent = `${p.toFixed(1)}% · ${fmtNum(ctx.pressure)} / ${fmtNum(ctx.window)} TOK`;

    const tk = se.tokens || {};
    $('#tokenChips').innerHTML = [
      ['CACHE', fmtNum(tk.cacheRead)],
      ['IN', fmtNum(tk.input)],
      ['OUT', fmtNum(tk.output)],
      ['SURFACE', fmtNum(ctx.surface)],
    ].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');

    renderGoal(se);
  }

  function renderSessSelect(s) {
    const sel = $('#sessSelect');
    if (!sel) return;
    const list = (s.sessions || []).slice(0, 12);
    if (sessChoice !== 'auto' && !list.some((x) => x.id === sessChoice)) sessChoice = 'auto';
    const sig = list.map((x) => x.id + '|' + (x.title || '')).join('~') + '@' + (s.session?.id || '');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.textContent = '';
      const auto = document.createElement('option');
      auto.value = 'auto';
      auto.textContent = 'AUTO · 跟随最新';
      sel.appendChild(auto);
      for (const x of list) {
        const o = document.createElement('option');
        o.value = x.id;
        const label = (x.title || x.id.replace('session-', '').slice(0, 8)).slice(0, 42);
        o.textContent = (x.id === s.session?.id ? '● ' : '') + label;
        sel.appendChild(o);
      }
    }
    if (sel.value !== sessChoice) sel.value = sessChoice;
  }

  function bindSessionSelect() {
    const sel = $('#sessSelect');
    if (!sel) return;
    sel.addEventListener('change', () => {
      sessChoice = sel.value || 'auto';
      fetch('/api/select?id=' + encodeURIComponent(sessChoice)).catch(() => { /* offline */ });
    });
  }

  function renderGoal(se) {
    const g = se.goal || {};
    const text = g.objective || '未设置目标';
    const el = $('#goalText');
    if (!el) return;
    el.textContent = text;
    el.title = text;
    $('#goalRounds').textContent = g.maxRounds ? `ROUND ${g.rounds} / ${g.maxRounds}` : '';
  }

  /* ============================================================
     TIMELINE
     ============================================================ */
  const tlRows = new Map();
  let tlStick = true;
  let tlSession = null;

  function tlRowFor(e) {
    const row = document.createElement('div');
    row.className = 'tl-row k-' + e.kind;
    row.dataset.id = e.id;
    row.innerHTML = `
      <div class="tl-time"></div>
      <div class="tl-tag"></div>
      <div class="tl-body">
        <div class="tl-text"></div>
        <div class="tl-sub"></div>
      </div>
      <div class="tl-meta"></div>`;
    row.__parts = {
      time: $('.tl-time', row),
      tag: $('.tl-tag', row),
      text: $('.tl-text', row),
      sub: $('.tl-sub', row),
      meta: $('.tl-meta', row),
    };
    row.__parts.time.textContent = hhmmss(e.t);
    row.__parts.tag.textContent = e.tag || e.kind;
    return row;
  }

  function updateTlRow(row, e) {
    const p = row.__parts;
    if (p.text.dataset.v !== String(e.text)) {
      p.text.dataset.v = String(e.text);
      if (e.kind === 'tool') {
        p.text.textContent = '';
        const tn = document.createElement('span');
        tn.className = 'tool-name';
        tn.textContent = e.tool || 'tool';
        const tx = document.createElement('span');
        tx.textContent = e.text || '';
        p.text.append(tn, tx);
        p.text.title = (e.tool || '') + ' ' + (e.text || '');
      } else {
        p.text.textContent = e.text || '';
        p.text.title = e.text || '';
      }
    }
    let sub = '';
    if (e.kind === 'tool') {
      if (e.result) sub = '↳ ' + e.result;
      else if (e.status === 'running') sub = `STEP ${e.step ?? '—'} · 执行中`;
      else sub = `STEP ${e.step ?? '—'}`;
    } else if (e.kind === 'assistant') {
      sub = `STEP ${e.step ?? '—'} · ${e.reason ? '思考' : '回复'}`;
    } else if (e.kind === 'user') {
      sub = `TURN ${e.turn ?? '—'}`;
    }
    if (p.sub.textContent !== sub) {
      p.sub.textContent = sub;
      p.sub.classList.toggle('res-err', e.status === 'error');
    }
    row.classList.toggle('running', e.status === 'running');
    row.classList.toggle('ok', e.status === 'ok');
    row.classList.toggle('error', e.status === 'error');
    row.dataset.t = e.t;
    if (e.status === 'running') {
      p.meta.innerHTML = `<span class="run"><i class="spin"></i>${((Date.now() - e.t) / 1000).toFixed(1)}s</span>`;
    } else if (e.status === 'error') {
      p.meta.innerHTML = `<span class="err">✕ ${(Number(e.ms || 0) / 1000).toFixed(1)}s</span>`;
    } else if (e.status === 'ok') {
      p.meta.innerHTML = `<span class="ok">✓ ${(Number(e.ms || 0) / 1000).toFixed(1)}s</span>`;
    }
  }

  function renderTimeline(se) {
    const box = $('#timeline');
    if (se.id !== tlSession) {
      box.innerHTML = '';
      tlRows.clear();
      box.__empty = null;
      tlSession = se.id;
    }
    const list = se.timeline || [];
    const seen = new Set();
    let added = false;
    for (const e of list) {
      seen.add(e.id);
      let row = tlRows.get(e.id);
      if (!row) {
        row = tlRowFor(e);
        tlRows.set(e.id, row);
        box.appendChild(row);
        row.classList.add('is-new');
        setTimeout(() => row.classList.remove('is-new'), 500);
        added = true;
      }
      updateTlRow(row, e);
    }
    for (const [id, row] of tlRows) {
      if (!seen.has(id)) { row.remove(); tlRows.delete(id); }
    }
    if (!list.length) {
      if (!box.__empty) {
        box.__empty = document.createElement('div');
        box.__empty.className = 'tl-empty';
        box.__empty.textContent = '等待 DSH 事件流…';
        box.appendChild(box.__empty);
      }
    } else if (box.__empty) {
      box.__empty.remove();
      box.__empty = null;
    }
    if (tlStick && added) box.scrollTop = box.scrollHeight;
    else if (tlStick) box.scrollTop = box.scrollHeight;
  }

  function initTimelineScroll() {
    const box = $('#timeline');
    box.addEventListener('scroll', () => {
      tlStick = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    }, { passive: true });
  }

  function tickTimelineClocks() {
    const now = Date.now();
    for (const row of tlRows.values()) {
      const t = Number(row.dataset.t);
      if (!t) continue;
      if (row.classList.contains('running')) {
        row.__parts.meta.innerHTML = `<span class="run"><i class="spin"></i>${((now - t) / 1000).toFixed(1)}s</span>`;
      }
    }
    for (const el of document.querySelectorAll('.feed-time[data-t]')) {
      el.textContent = ago(Number(el.dataset.t));
    }
  }

  /* ============================================================
     RADAR + AREAS + FEED + GIT
     ============================================================ */
  let RADAR_COLORS = [C.cinnabar, C.ochre, C.blue, C.ochre2, C.blue2, C.cinnabar2, C.ink2, C.ink4];
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function addBlip(item) {
    const h = hash(item.area || item.rel || 'x');
    state.blips.push({
      angle: (h % 360) / 180 * PI,
      r: 0.30 + ((h >> 9) % 62) / 100,
      color: item.color || RADAR_COLORS[h % RADAR_COLORS.length],
      born: performance.now(),
    });
    if (state.blips.length > 26) state.blips.shift();
  }

  function drawRadar(t) {
    const cv = $('#radarCanvas');
    if (!cv) return;
    const { ctx, w, h } = prep(cv);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
    ctx.clearRect(0, 0, w, h);

    // backdrop
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
    bg.addColorStop(0, rgba(C.blue, .14));
    bg.addColorStop(0.72, rgba(C.blue, .06));
    bg.addColorStop(1, rgba(C.blue, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, TAU);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.02, 0, TAU);
    ctx.fillStyle = rgba(C.panel, .22);
    ctx.fill();

    // rings
    ctx.save();
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * i) / 3, 0, TAU);
      ctx.strokeStyle = rgba(C.blue, 0.55 - i * 0.06);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // crosshair
    ctx.strokeStyle = rgba(C.blue, .30);
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    // outer ticks
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const r1 = R + 2, r2 = R + (i % 6 === 0 ? 8 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = rgba(C.blue, i % 6 === 0 ? 0.70 : 0.32);
      ctx.lineWidth = i % 6 === 0 ? 1.1 : 0.8;
      ctx.stroke();
    }
    // rotating dashed outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, t / 9000, t / 9000 + TAU * 0.72);
    ctx.strokeStyle = rgba(C.cinnabar, .42);
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // sweep
    const ang = (t / 5200) * TAU;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 34; i++) {
      const a = ang - i * 0.032;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = rgba(C.cinnabar, (1 - i / 34) * 0.32);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.strokeStyle = rgba(C.cinnabar, .9);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // area anchors
    const areas = state.workspace?.areas || [];
    areas.slice(0, 6).forEach((a, i) => {
      const hh = hash(a.name);
      const ar = (hh % 360) / 180 * PI;
      const rr = 0.35 + ((hh >> 7) % 55) / 100;
      const x = cx + Math.cos(ar) * R * rr, y = cy + Math.sin(ar) * R * rr;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fillStyle = a.color || RADAR_COLORS[i % RADAR_COLORS.length];
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // blips
    const now = performance.now();
    state.blips = state.blips.filter((b) => now - b.born < 4200);
    for (const b of state.blips) {
      const age = (now - b.born) / 4200;
      const alpha = 1 - age;
      const x = cx + Math.cos(b.angle) * R * b.r, y = cy + Math.sin(b.angle) * R * b.r;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 + age * 7, 0, TAU);
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, TAU);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function renderAreas(s) {
    const box = $('#areaList');
    const areas = (s.workspace?.areas || []).slice(0, 5);
    if (!areas.length) {
      box.innerHTML = '<div class="area-empty">暂无热区</div>';
      return;
    }
    const max = Math.max(...areas.map((a) => a.count || 1));
    box.innerHTML = areas.map((a) => `
      <div class="area-row" style="--c:${a.color}">
        <div class="area-name" title="${a.name.replace(/"/g, '')}">${a.name}</div>
        <div class="area-count">${a.count}</div>
        <div class="area-bar"><i style="width:${clamp((a.count / max) * 100, 4, 100)}%"></i></div>
      </div>`).join('');
  }

  const feedRows = new Map();
  function renderFeed(s) {
    const box = $('#feed');
    const feed = (s.workspace?.feed || []).slice(0, 14);
    const seen = new Set();
    const frag = document.createDocumentFragment();
    for (const item of feed) {
      const key = item.rel + '|' + item.t + '|' + item.count;
      seen.add(key);
      let row = feedRows.get(key);
      if (!row) {
        row = document.createElement('div');
        row.className = 'feed-row is-new';
        row.style.setProperty('--c', item.color || C.blue);
        const kind = document.createElement('span');
        kind.className = 'feed-kind';
        kind.textContent = item.kind === 'add' ? '+' : item.kind === 'del' ? '−' : '~';
        const pathEl = document.createElement('span');
        pathEl.className = 'feed-path';
        const parts = item.rel.split('\\');
        const name = parts.pop();
        if (parts.length) {
          const dir = document.createElement('span');
          dir.textContent = parts.join('\\') + '\\';
          dir.style.color = C.ink4;
          pathEl.appendChild(dir);
        }
        const nm = document.createElement('b');
        nm.textContent = name;
        pathEl.appendChild(nm);
        pathEl.title = item.rel;
        const timeEl = document.createElement('span');
        timeEl.className = 'feed-time';
        timeEl.dataset.t = item.t;
        timeEl.textContent = ago(item.t);
        row.append(kind, pathEl, timeEl);
        row.__key = key;
        row.title = item.rel + '\n点击复制绝对路径';
        row.addEventListener('click', () => {
          const full = (state.root || '').replace(/\\+$/, '') + '\\' + item.rel;
          navigator.clipboard?.writeText(full).catch(() => { /* clipboard denied */ });
          row.classList.add('copied');
          setTimeout(() => row.classList.remove('copied'), 650);
        });
        feedRows.set(key, row);
        setTimeout(() => row.classList.remove('is-new'), 520);
      }
      frag.appendChild(row);
    }
    // remove stale
    for (const [key, row] of feedRows) {
      if (!seen.has(key)) { row.remove(); feedRows.delete(key); }
    }
    box.appendChild(frag);
    if (!feed.length && !box.__empty) {
      box.__empty = document.createElement('div');
      box.__empty.className = 'feed-empty';
      box.__empty.textContent = '等待文件变更…';
      box.appendChild(box.__empty);
    } else if (feed.length && box.__empty) {
      box.__empty.remove();
      box.__empty = null;
    }
  }

  function drawRateSpark(l) {
    const cv = $('#rateSpark');
    if (!cv) return;
    const { ctx, w, h } = prep(cv);
    ctx.clearRect(0, 0, w, h);
    const data = (l.rate || []).slice(-60);
    if (!data.length) return;
    const max = Math.max(4, ...data);
    const bw = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      const bh = Math.max(1, (v / max) * (h - 5));
      const t = i / data.length;
      ctx.fillStyle = rgba(C.cinnabar, 0.12 + t * 0.45);
      ctx.fillRect(i * bw + 0.4, h - bh - 1, Math.max(1, bw - 1), bh);
    }
    ctx.fillStyle = rgba(C.cinnabar, .12);
    ctx.fillRect(0, h - 1, w, 1);
    ctx.beginPath();
    const last = data[data.length - 1];
    ctx.arc(w - bw / 2, h - Math.max(1, (last / max) * (h - 5)) - 1, 1.6, 0, TAU);
    ctx.fillStyle = C.cinnabar;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function renderWorkspace(s) {
    const l = s.workspace || {};
    renderRootLabels();
    $('#feedRate').textContent = `${l.perMin ?? 0} / MIN`;
    $('#totalChanges').textContent = `${fmtNum(l.total ?? 0)} EVENTS`;
    $('#watchDot').classList.toggle('off', l.watching === false);
    $('#rateBig').textContent = String(l.perMin ?? 0);
    $('#totalEvents').textContent = fmtNum(l.total ?? 0);
    $('#watchState').textContent = l.watching === false ? 'OFFLINE' : 'RECURSIVE';
    if (l.hot) {
      $('#hotZone').textContent = l.hot.name;
      $('#hotZone').title = l.hot.name;
    } else {
      $('#hotZone').textContent = '—';
    }
    drawRateSpark(l);
    const g = l.git;
    if (g) {
      $('#gitBranch').textContent = g.branch || 'main';
      $('#gitDirty').textContent = `M${g.modified} A${g.added} D${g.deleted} ?${g.untracked > 999 ? (g.untracked / 1000).toFixed(1) + 'k' : g.untracked}`;
      $('#gitHead').textContent = g.head ? `${g.head.hash} · ${g.head.subject}` : '';
      $('#gitHead').title = g.head ? g.head.subject : '';
    }
    const fe = $('#footEvents');
    if (fe) fe.innerHTML = `<b>${l.perMin ?? 0}</b> EVT/MIN`;
  }

  /* ============================================================
     HARDWARE MATRIX
     ============================================================ */
  const HW_DEFS = [
    { key: 'cpu', dev: 'CPU', color: C.cinnabar },
    { key: 'gpu', dev: 'GPU', color: C.blue },
    { key: 'vram', dev: 'VRAM', color: C.ochre },
    { key: 'ram', dev: 'RAM', color: C.ink2 },
  ];
  const hwRefs = {};

  function addHwRow(key, dev, color) {
    if (hwRefs[key]) return;
    const body = $('#hwBody');
    const tr = document.createElement('tr');
    tr.dataset.key = key;
    tr.innerHTML = `
      <td><div class="hw-dev" style="--c:${color}"><i></i>${dev}</div></td>
      <td class="hw-model">—</td>
      <td><div class="hw-load"><div class="hw-bar" style="--c:${color}"><i></i></div><span class="hw-pct">0%</span></div></td>
      <td><span class="hw-val">—</span></td>
      <td><span class="hw-temp">—</span></td>
      <td><span class="hw-power">—</span></td>
      <td><span class="hw-state" style="--c:${C.blue2}">NOMINAL</span></td>`;
    body.appendChild(tr);
    hwRefs[key] = {
      model: $('.hw-model', tr), fill: $('.hw-bar i', tr), pct: $('.hw-pct', tr),
      val: $('.hw-val', tr), temp: $('.hw-temp', tr), power: $('.hw-power', tr), state: $('.hw-state', tr),
    };
  }

  function buildHwTable() {
    const body = $('#hwBody');
    const colgroup = document.createElement('colgroup');
    [64, 0, 108, 132, 56, 58, 70].forEach((w) => {
      const c = document.createElement('col');
      if (w) c.style.width = w + 'px';
      colgroup.appendChild(c);
    });
    body.parentElement.insertBefore(colgroup, body.parentElement.firstChild);

    for (const d of HW_DEFS) addHwRow(d.key, d.dev, d.color);
  }

  function hwState(pct) {
    if (pct >= 88) return ['HOT', C.cinnabar];
    if (pct >= 62) return ['BUSY', C.ochre];
    return ['NOMINAL', C.blue2];
  }

  function updateHwRow(key, model, load, val, temp, power, stateOverride) {
    const r = hwRefs[key];
    if (!r) return;
    r.model.textContent = model || '—';
    r.model.title = model || '';
    const p = clamp(Number(load) || 0, 0, 100);
    r.fill.style.width = p + '%';
    r.pct.textContent = p.toFixed(0) + '%';
    r.val.textContent = val || '—';
    r.val.title = val || '';
    r.temp.textContent = temp || '—';
    r.temp.className = 'hw-temp' + (Number(String(temp).replace(/[^\d.]/g, '')) >= 80 ? ' hot' : Number(String(temp).replace(/[^\d.]/g, '')) >= 68 ? ' warm' : '');
    r.power.textContent = power || '—';
    const [txt, col] = stateOverride || hwState(p);
    r.state.textContent = txt;
    r.state.style.setProperty('--c', col);
  }

  function renderPaper(s) {
    const g = s.system?.gpu;
    const setBar = (id, pct, color) => {
      const el = $('#' + id);
      if (!el) return;
      el.style.width = clamp(pct, 0, 100) + '%';
      el.style.background = color;
      el.style.boxShadow = `0 0 7px ${color}`;
    };
    if (!g) {
      for (const id of ['pbClock', 'pbPower', 'pbTemp', 'pbVram']) setBar(id, 0, C.ink4);
      $('#pbClockTxt').textContent = '—';
      $('#pbPowerTxt').textContent = '—';
      $('#pbTempTxt').textContent = '—';
      $('#pbVramTxt').textContent = '—';
      return;
    }
    setBar('pbClock', (g.clock / PAPER.clock) * 100, C.blue);
    setBar('pbPower', (g.power / PAPER.power) * 100, C.ochre);
    setBar('pbTemp', (g.temp / PAPER.temp) * 100, g.temp >= 80 ? C.cinnabar : C.ochre2);
    setBar('pbVram', (g.memUsed / (PAPER.vramMiB * 1024 * 1024)) * 100, C.blue2);
    $('#pbClockTxt').textContent = `${Math.round(g.clock)} / ${PAPER.clock} MHz`;
    $('#pbPowerTxt').textContent = `${g.power.toFixed(1)} / ${PAPER.power} W`;
    $('#pbTempTxt').textContent = `${g.temp} / ${PAPER.temp} °C`;
    $('#pbVramTxt').textContent = `${(g.memUsed / 2 ** 30).toFixed(1)} / 11.9 GB`;
  }

  function bindHwTabs() {
    const btns = [...document.querySelectorAll('#hwTabs button')];
    for (const b of btns) {
      b.addEventListener('click', () => {
        for (const x of btns) x.classList.toggle('on', x === b);
        const paper = b.dataset.hw === 'paper';
        $('#hwLive').classList.toggle('hidden', paper);
        $('#hwPaper').classList.toggle('hidden', !paper);
      });
    }
  }

  function renderHw(s) {
    const sy = s.system || {};
    const g = sy.gpu;
    const cpu = sy.cpu || {};
    const mem = sy.mem || {};
    const disks = sy.disks || {};
    const gb = (n) => (n / 2 ** 30).toFixed(1);
    const na = (title) => ({ text: 'N/A', title });

    const cpuTemp = Number.isFinite(Number(cpu.temp)) ? `${cpu.temp}°C` : 'N/A';
    const cpuPower = Number.isFinite(Number(cpu.power)) ? `${Math.round(cpu.power)} W` : 'N/A';
    updateHwRow('cpu', cpu.model || '—', cpu.pct, `${cpu.cores || '—'}C · ${((cpu.speed || 0) / 1000).toFixed(2)} GHz`, cpuTemp, cpuPower);
    hwRefs.cpu.temp.title = cpuTemp === 'N/A' ? '本机未暴露 CPU 温度传感器（WMI 拒绝访问）' : 'CPU package temperature';
    hwRefs.cpu.power.title = cpuPower === 'N/A' ? '本机未暴露 CPU 功率传感器（无 Power Meter）' : 'CPU package power';

    if (g) {
      updateHwRow('gpu', g.name, g.util, `${gb(g.memUsed)} / ${gb(g.memTotal)} GB`, `${g.temp}°C`, `${Math.round(g.power)} W`);
      updateHwRow('vram', 'GDDR7 · VRAM', g.memPct, `${gb(g.memUsed)} / ${gb(g.memTotal)} GB`, `${g.temp}°C*`, `${Math.round(g.power)} W*`);
      hwRefs.vram.temp.title = 'GPU package temperature; dedicated VRAM temperature is N/A on this driver';
      hwRefs.vram.power.title = 'GPU package power; dedicated VRAM power is N/A on this driver';
    } else {
      updateHwRow('gpu', 'GPU 不可用', 0, '—', '—', '—', ['OFFLINE', C.ink4]);
      updateHwRow('vram', '—', 0, '—', '—', '—', ['OFFLINE', C.ink4]);
    }
    updateHwRow('ram', 'System Memory', mem.pct, `${gb(mem.used)} / ${gb(mem.total)} GB`, 'N/A', 'N/A');
    hwRefs.ram.temp.title = 'System RAM temperature sensor N/A';
    hwRefs.ram.power.title = 'System RAM power sensor N/A';

    const driveKeys = Object.keys(disks).sort((a, b) => a.localeCompare(b));
    for (const drive of driveKeys) {
      const key = `disk:${drive}`;
      addHwRow(key, `DISK ${drive}`, C.ochre2);
      const dd = disks[drive];
      updateHwRow(key, 'NVMe SSD · ' + drive, dd.pct, `${fmtBytes(dd.free)} free / ${fmtBytes(dd.total)}`,
        'N/A', 'N/A', dd.pct > 92 ? ['LOW', C.cinnabar] : dd.pct > 80 ? ['FULL', C.ochre] : ['OK', C.blue2]);
      hwRefs[key].temp.title = '本机磁盘未暴露温度传感器（StorageReliabilityCounter 不可访问）';
      hwRefs[key].power.title = '本机磁盘未暴露功率传感器';
      if (drive === 'E:') {
        const fd = $('#footDisk');
        if (fd) fd.innerHTML = `<b>${fmtBytes(dd.free)}</b> E: FREE`;
      }
    }
    const note = $('#hwNote');
    if (note) note.textContent = `已枚举 ${driveKeys.length} 个固定磁盘 · GPU/VRAM 温度、功率为 nvidia-smi 包级读数（*）；CPU/磁盘传感器不可用时显示 N/A，不伪造。`;
    $('#hwTime').textContent = hhmmss(Date.now());
    renderPaper(s);
  }

  /* ============================================================
     TELEMETRY CHART
     ============================================================ */
  let TOOL_COLORS = {
    pwsh: C.cinnabar, edit: C.ochre, write: C.ochre, read: C.blue,
    glob: C.blue, grep: C.blue, present: C.ochre2,
    job_kill: C.cinnabar, job_output: C.cinnabar, ask_user_question: C.cinnabar,
  };
  function refreshToolColors() {
    TOOL_COLORS = {
      pwsh: C.cinnabar, edit: C.ochre, write: C.ochre, read: C.blue,
      glob: C.blue, grep: C.blue, present: C.ochre2,
      job_kill: C.cinnabar, job_output: C.cinnabar, ask_user_question: C.cinnabar,
    };
  }
  const toolColor = (name) => TOOL_COLORS[name] || C.ink3;

  function drawChart(s) {
    const cv = $('#mainChart');
    if (!cv) return;
    const { ctx, w, h } = prep(cv);
    ctx.clearRect(0, 0, w, h);
    const padL = 24, padR = 8, padT = 20, padB = 15;
    const W = w - padL - padR, H = h - padT - padB;
    const series = s.series || {};
    const gpu = (series.gpu || []).slice(-185);
    const cpu = (series.cpu || []).slice(-185);
    const mem = (series.mem || []).slice(-185);
    const n = Math.max(gpu.length, cpu.length, mem.length);
    if (n < 2) return;
    const now = s.now || Date.now();
    const stepMs = s.sampleMs || 2000;
    const span = (n - 1) * stepMs;
    const tStart = now - span;
    const X = (i) => padL + (i / (n - 1)) * W;
    const XT = (t) => padL + clamp((t - tStart) / Math.max(1, span), 0, 1) * W;
    const Y = (v) => padT + H - (clamp(v, 0, 100) / 100) * H;

    // trace lane
    ctx.fillStyle = rgba(C.blue, .05);
    ctx.fillRect(padL, 1, W, padT - 4);
    ctx.beginPath();
    ctx.moveTo(padL, padT - 3);
    ctx.lineTo(w - padR, padT - 3);
    ctx.strokeStyle = rgba(C.ink, .12);
    ctx.lineWidth = 1;
    ctx.stroke();

    // grid
    ctx.font = '7.5px "Cascadia Mono",Consolas,monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = i * 25;
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.strokeStyle = i === 0 ? rgba(C.ink, .20) : rgba(C.ink, .08);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = rgba(C.ink, .65);
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padL - 5, y);
    }
    // x labels
    const spanSec = Math.round(span / 1000);
    const lab = (sec) => (sec >= 60 ? `-${Math.floor(sec / 60)}:${pad2(sec % 60)}` : `-${sec}s`);
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(C.ink, .55);
    ctx.fillText(lab(spanSec), padL, h - 6);
    ctx.textAlign = 'center';
    ctx.fillText(lab(Math.round(spanSec / 2)), padL + W / 2, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText('NOW', w - padR, h - 6);

    // tool call blocks (two lanes)
    const blocks = [];
    const tools = (s.session?.timeline || []).filter((e) => e.kind === 'tool' && e.t >= tStart);
    const lanes = [0, 0];
    tools.sort((a, b) => a.t - b.t);
    for (const e of tools) {
      const dur = e.ms != null ? e.ms : (e.status === 'running' ? Math.max(0, now - e.t) : 400);
      const end = Math.min(now, e.t + dur);
      let lane = lanes.findIndex((v) => v <= e.t);
      if (lane < 0) lane = 0;
      lanes[lane] = e.t + Math.max(dur, 300);
      const x0 = XT(e.t), x1 = Math.max(x0 + 1.5, XT(end));
      const y = 3 + lane * 5;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = toolColor(e.tool);
      ctx.fillRect(x0, y, Math.max(1.5, x1 - x0), 3.4);
      ctx.globalAlpha = 1;
      blocks.push({
        x0, x1, y0: y, y1: y + 4,
        label: `${e.tool} · ${(dur / 1000).toFixed(dur < 10000 ? 1 : 0)}s`,
        sub: hhmmss(e.t),
      });
    }
    // file change ticks
    const files = (s.workspace?.feed || []).filter((f) => f.t >= tStart);
    const fileMarks = [];
    for (const f of files) {
      const x = XT(f.t);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = f.color || C.blue;
      ctx.fillRect(x, padT - 6, 1, 4);
      ctx.globalAlpha = 1;
      fileMarks.push({
        x, y0: padT - 7, y1: padT,
        label: (f.kind === 'add' ? '新增 ' : f.kind === 'del' ? '删除 ' : '修改 ') + f.rel,
      });
    }
    state.chartBlocks = blocks;
    state.chartFiles = fileMarks;

    // lane label
    ctx.font = '6.5px "Cascadia Mono",Consolas,monospace';
    ctx.fillStyle = rgba(C.ink, .60);
    ctx.textAlign = 'right';
    ctx.fillText('TRACE', padL - 4, 9);

    // series
    const drawArea = (arr, color, alpha) => {
      if (arr.length < 2) return;
      const off = n - arr.length;
      const grad = ctx.createLinearGradient(0, padT, 0, padT + H);
      grad.addColorStop(0, color + alpha);
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(X(off), padT + H);
      arr.forEach((v, i) => ctx.lineTo(X(off + i), Y(v)));
      ctx.lineTo(X(n - 1), padT + H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      arr.forEach((v, i) => (i ? ctx.lineTo(X(off + i), Y(v)) : ctx.moveTo(X(off + i), Y(v))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    };
    drawArea(gpu, C.blue, '5a');
    const drawLine = (arr, color, dash) => {
      if (arr.length < 2) return;
      const off = n - arr.length;
      ctx.beginPath();
      arr.forEach((v, i) => (i ? ctx.lineTo(X(off + i), Y(v)) : ctx.moveTo(X(off + i), Y(v))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawLine(cpu, rgba(C.cinnabar, .9));
    drawLine(mem, rgba(C.ochre, .85), [3, 3]);

    // endpoint
    const last = gpu[gpu.length - 1] ?? 0;
    ctx.beginPath();
    ctx.arc(X(n - 1), Y(last), 2.4, 0, TAU);
    ctx.fillStyle = C.blue;
    ctx.fill();

    // legend values
    const leg = document.querySelectorAll('.legend span');
    if (leg[0]) leg[0].lastChild.textContent = 'GPU ' + (gpu[gpu.length - 1] ?? 0).toFixed(0) + '%';
    if (leg[1]) leg[1].lastChild.textContent = 'CPU ' + (cpu[cpu.length - 1] ?? 0).toFixed(0) + '%';
    if (leg[2]) leg[2].lastChild.textContent = 'RAM ' + (mem[mem.length - 1] ?? 0).toFixed(0) + '%';
  }

  function initChartTip() {
    const cv = $('#mainChart');
    const tip = $('#chartTip');
    if (!cv || !tip) return;
    cv.addEventListener('mousemove', (ev) => {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const b = (state.chartBlocks || []).find((o) => x >= o.x0 - 2 && x <= o.x1 + 2 && y >= o.y0 - 3 && y <= o.y1 + 3);
      const f = (state.chartFiles || []).find((o) => Math.abs(x - o.x) <= 3 && y >= o.y0 - 2 && y <= o.y1 + 2);
      const hit = b || f;
      if (!hit) { tip.classList.remove('show'); return; }
      tip.textContent = '';
      const t = document.createElement('b');
      t.textContent = hit.label;
      tip.appendChild(t);
      if (hit.sub) {
        const sp = document.createElement('span');
        sp.textContent = hit.sub;
        tip.appendChild(sp);
      }
      const ox = cv.offsetLeft || 0, oy = cv.offsetTop || 0;
      tip.classList.add('show');
      const tw = tip.offsetWidth || 220;
      tip.style.left = clamp(ox + x + 10, 4, Math.max(4, cv.clientWidth - tw - 6)) + 'px';
      tip.style.top = clamp(oy + y + 8, 2, Math.max(2, cv.clientHeight - 38)) + 'px';
    });
    cv.addEventListener('mouseleave', () => tip.classList.remove('show'));
  }

  /* ============================================================
     TRACE EXPORT (Perfetto / Chrome trace JSON)
     ============================================================ */
  function buildTrace() {
    const s = state;
    const se = s.session || {};
    const tEnd = s.now || Date.now();
    const gpu = s.series?.gpu || [];
    const cpu = s.series?.cpu || [];
    const mem = s.series?.mem || [];
    const n = Math.max(gpu.length, cpu.length, mem.length);
    const stepMs = state.sampleMs || 2000;
    const span = n > 1 ? (n - 1) * stepMs : 180000;
    const tStart = tEnd - span;
    const events = [];
    events.push({ name: 'process_name', ph: 'M', pid: 1, args: { name: 'Mission Control' } });
    events.push({ name: 'thread_name', ph: 'M', pid: 1, tid: 1, args: { name: 'DSH tools' } });
    events.push({ name: 'thread_name', ph: 'M', pid: 1, tid: 2, args: { name: (state.root || '') + ' files' } });
    events.push({ name: 'thread_name', ph: 'M', pid: 1, tid: 3, args: { name: 'hardware' } });
    events.push({
      name: 'session', cat: 'meta', ph: 'i', s: 'g', ts: tStart * 1000, pid: 1, tid: 0,
      args: { id: se.id, title: se.title, model: se.model?.model, windowMs: span },
    });

    for (const e of se.timeline || []) {
      if (e.kind !== 'tool' || !e.t || e.t < tStart - 1000) continue;
      const dur = e.ms != null ? Math.max(1, e.ms) : (e.status === 'running' ? Math.max(1, tEnd - e.t) : 1);
      events.push({
        name: e.tool || 'tool', cat: 'dsh.tool', ph: 'X',
        ts: Math.round(e.t * 1000), dur: Math.round(dur * 1000), pid: 1, tid: 1,
        args: { step: e.step, status: e.status, text: e.text, session: se.id },
      });
    }
    for (const f of s.workspace?.feed || []) {
      if (!f.t || f.t < tStart) continue;
      events.push({
        name: f.kind, cat: 'mission.file', ph: 'X',
        ts: Math.round(f.t * 1000), dur: 1000, pid: 1, tid: 2,
        args: { path: f.rel, area: f.area },
      });
    }
    const counters = [['GPU util %', gpu], ['CPU total %', cpu], ['RAM used %', mem]];
    for (const [name, arr] of counters) {
      const off = n - arr.length;
      arr.forEach((v, i) => {
        events.push({
          name, cat: 'hw', ph: 'C',
          ts: Math.round((tStart + (off + i) * stepMs) * 1000),
          pid: 1, tid: 3, args: { value: Number(v) },
        });
      });
    }
    return {
      displayTimeUnit: 'ms',
      traceEvents: events,
      metadata: {
        generator: 'Mission Control',
        generatedAt: new Date(tEnd).toISOString(),
        session: se.id,
        windowMs: span,
        paperBaseline: PAPER,
      },
    };
  }

  function exportTrace() {
    const data = buildTrace();
    const json = JSON.stringify(data);
    window.__traceStats = { events: data.traceEvents.length, bytes: json.length };
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission-control-trace-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ============================================================
     FOOTER / CLOCK / CONNECTION
     ============================================================ */
  function updateFooter(_s) {
    /* footer intentionally only shows time */
  }

  function clock() {
    const d = new Date();
    const hms = hhmmss(d.getTime());
    const ds = `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
    const c = $('#clock'), dt = $('#date');
    if (c) c.textContent = hms;
    if (dt) dt.textContent = ds;
    const fc = $('#footClock'), fd = $('#footDate');
    if (fc) fc.textContent = hms;
    if (fd) fd.textContent = ds;
  }

  function setConn(ok) {
    state.connected = ok;
    const el = $('#conn');
    el.classList.toggle('dead', !ok);
    el.querySelector('span').textContent = ok ? 'LINK' : 'LOST';
  }

  function showUiError(msg) {
    let el = document.getElementById('uiError');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiError';
      el.className = 'ui-error';
      document.body.appendChild(el);
    }
    el.textContent = 'UI ERROR · ' + msg;
    el.style.display = 'block';
    clearTimeout(showUiError._t);
    showUiError._t = setTimeout(() => { el.style.display = 'none'; }, 8000);
  }

  /* ============================================================
     APPLY STATE
     ============================================================ */
  function apply(s) {
    if (!s || s.type !== 'state') return;
    state.system = s.system;
    state.series = s.series || state.series;
    state.session = s.session;
    state.workspace = s.workspace;
    state.now = s.now || Date.now();
    state.lastAt = Date.now();
    state.sampleMs = s.sampleMs || 2000;
    state.controlToken = s.controlToken || state.controlToken;
    state.readonly = !!s.readonly;
    state.root = s.root || state.root;
    if (!state.pinnedInit) {
      state.pinnedInit = true;
      sessChoice = s.pinned || 'auto';
    }
    updateGauges(s);
    renderWorkers(s);
    renderSession(s);
    renderTimeline(s.session || {});
    renderAreas(s);
    renderFeed(s);
    renderWorkspace(s);
    renderHw(s);
    renderIoStrip(s);
    drawChart(s);
    updateFooter(s);
    setConn(true);

    if (Date.now() - docTitleAt > 5000) {
      docTitleAt = Date.now();
      const g = Math.round(s.system?.gpu?.util ?? 0);
      const title = (s.session?.title || 'MISSION CONTROL').slice(0, 34);
      document.title = `DSH ${g}% · ${title}`;
    }

    // radar blips for new events
    const top = s.workspace?.feed?.[0];
    if (top && top.t > state.lastFeedT) {
      const fresh = (s.workspace.feed || []).filter((f) => f.t > state.lastFeedT).slice(0, 8);
      for (const f of fresh) addBlip(f);
      state.lastFeedT = top.t;
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */
  /* ============================================================
     PROCESS CONTROL
     ============================================================ */
  let toastTimer = 0;
  function toast(msg, bad) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function renderProcList() {
    const box = $('#procList');
    if (!box) return;
    const all = state.system?.procs || [];
    const readonly = !!state.readonly;
    const q = ($('#procFilter')?.value || '').trim().toLowerCase();
    const list = all.filter((p) => {
      const hay = `${p.name} ${p.pid} ${p.cmd || ''} ${p.exe || ''}`.toLowerCase();
      return !q || hay.includes(q);
    });
    const count = $('#procCount');
    if (count) count.textContent = `${list.length} / ${all.length} PROCESS`;
    if (!list.length) {
      box.innerHTML = '<div class="pm-empty">无匹配进程</div>';
      return;
    }
    box.innerHTML = list.map((p) => {
      const name = esc(`${p.name}.exe`);
      const locked = p.self || p.parent || readonly;
      const tag = p.self ? '<span class="pm-tag self">SELF · 仪表盘</span>'
        : p.parent ? '<span class="pm-tag self">PARENT</span>'
          : readonly ? '<span class="pm-tag">READONLY</span>' : '';
      const exe = p.exe ? `<div class="pm-path" title="${esc(p.exe)}">${esc(p.exe)}</div>` : '';
      const cmd = p.cmd ? `<div class="pm-cmd" title="${esc(p.cmd)}">${esc(p.cmd)}</div>` : '';
      const action = locked
        ? `<div class="pm-lock">${readonly ? 'READONLY' : 'PROTECTED'}</div>`
        : `<button class="pm-kill" data-pid="${p.pid}" data-name="${esc(p.name)}">终止</button>`;
      return `<div class="pm-row" data-pid="${p.pid}">
        <div class="pm-main">
          <div class="pm-name">${name} <b>#${p.pid}</b> ${tag}</div>
          ${exe}${cmd}
        </div>
        <div class="pm-stats"><b>${(Number(p.pct) || 0).toFixed(1)}%</b><span>${fmtBytes(p.mem)}</span></div>
        ${action}
      </div>`;
    }).join('');
  }

  function openProcModal() {
    const modal = $('#procModal');
    if (!modal) return;
    $('#procFilter').value = '';
    const hint = document.querySelector('.pm-hint');
    if (hint) {
      hint.textContent = state.readonly
        ? '只读模式（MC_READONLY=1）：可查看进程，终止已禁用。'
        : '仅列出 python / node / pwsh / powershell。终止会结束整个进程树，未保存的训练进度会丢失。';
    }
    modal.classList.remove('hidden');
    renderProcList();
    setTimeout(() => $('#procFilter')?.focus(), 60);
  }
  function closeProcModal() {
    $('#procModal')?.classList.add('hidden');
  }

  async function killProc(btn) {
    if (state.readonly) { toast('只读模式：终止已禁用', true); return; }
    const pid = Number(btn.dataset.pid);
    const name = btn.dataset.name || 'process';
    btn.disabled = true;
    btn.textContent = '终止中…';
    try {
      const r = await fetch('/api/proc/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Control-Token': state.controlToken },
        body: JSON.stringify({ pid }),
      });
      const j = await r.json();
      if (j.ok) {
        btn.closest('.pm-row')?.remove();
        toast(`已终止 ${name}.exe #${pid}`);
        setTimeout(renderProcList, 1200);
      } else {
        toast(`终止失败：${j.error || 'unknown'}`, true);
        btn.disabled = false;
        btn.textContent = '终止';
        btn.dataset.armed = '0';
        btn.classList.remove('armed');
      }
    } catch (err) {
      toast(`请求失败：${err.message}`, true);
      btn.disabled = false;
      btn.textContent = '终止';
      btn.dataset.armed = '0';
      btn.classList.remove('armed');
    }
  }

  function bindProcControl() {
    const open = $('#procOpen');
    const modal = $('#procModal');
    if (!open || !modal) return;
    open.addEventListener('click', openProcModal);
    $('#procClose')?.addEventListener('click', closeProcModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProcModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeProcModal();
    });
    $('#procFilter')?.addEventListener('input', renderProcList);
    $('#procRefresh')?.addEventListener('click', async () => {
      try {
        const s = await (await fetch('/api/state', { cache: 'no-store' })).json();
        apply(s);
        renderProcList();
        toast('进程列表已刷新');
      } catch (err) {
        toast(`刷新失败：${err.message}`, true);
      }
    });
    $('#procList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pm-kill');
      if (!btn) return;
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.classList.add('armed');
        btn.textContent = '确认终止';
        setTimeout(() => {
          if (btn.isConnected) {
            btn.dataset.armed = '0';
            btn.classList.remove('armed');
            btn.textContent = '终止';
          }
        }, 3000);
        return;
      }
      killProc(btn);
    });
  }

  /* ============================================================
     FULLSCREEN / DESKTOP SHELL
     ============================================================ */
  function appAction(action) {
    location.href = '/__app__/' + action;
  }
  async function toggleFullscreen() {
    if (APP_MODE) { appAction('fullscreen'); return; }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) {
      toast(`全屏不可用：${err.message}`, true);
    }
  }
  function bindAppControls() {
    const fs = $('#fsBtn');
    const quit = $('#quitBtn');
    if (APP_MODE) {
      document.body.classList.add('app-mode');
      if (quit) quit.hidden = false;
      setTimeout(() => toast('F11 全屏 · Ctrl+Q 退出'), 1400);
    }
    fs?.addEventListener('click', toggleFullscreen);
    quit?.addEventListener('click', () => { if (APP_MODE) appAction('quit'); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (APP_MODE && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        appAction('quit');
      }
    }, true);
    // Escape: leave the process modal alone, otherwise exit native fullscreen.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !APP_MODE) return;
      const modal = $('#procModal');
      if (modal && !modal.classList.contains('hidden')) return;
      appAction('normal');
    }, true);
  }

  /* ============================================================
     SETTINGS — root folder + palettes
     ============================================================ */
  function renderRootLabels() {
    const root = state.root || '';
    const a = $('#radarRoot');
    const b = $('#radarCenterRoot');
    if (a) {
      const leaf = String(root).split(/[\\/]/).filter(Boolean).pop() || '';
      a.textContent = leaf;
      a.title = root;
    }
    if (b) {
      const m = root.match(/^[A-Za-z]:\\/);
      b.textContent = m ? m[0] : '';
    }
    const input = $('#setRoot');
    if (input && document.querySelector('#setModal')?.classList.contains('hidden') === false && document.activeElement !== input) {
      input.value = root;
    }
  }

  function renderThemeGroups() {
    const box = $('#themeGroups');
    if (!box) return;
    box.innerHTML = THEME_GROUPS.map((g) => `
      <div class="theme-group">
        <div class="theme-group-title">${esc(g.name)} <span>${g.themes.length}</span></div>
        <div class="theme-cards">
          ${g.themes.map((t) => `
            <button class="theme-card" data-theme="${t.id}" title="${esc(t.name)}">
              <div class="theme-name">${esc(t.name)}<b>${t.mode === 'dark' ? 'DARK' : 'LIGHT'}</b></div>
              <div class="theme-sw">
                ${[t.paper, t.panel, t.accent, t.blue, t.ochre].map((c) => `<i style="background:${c}"></i>`).join('')}
              </div>
            </button>`).join('')}
        </div>
      </div>`).join('');
    applyTheme(activeTheme);
  }

  function openSettings() {
    const modal = $('#setModal');
    if (!modal) return;
    $('#setMsg').textContent = '';
    $('#setRoot').value = state.root || '';
    $('#setRootNote').textContent = `当前监视：${state.root || ''} · 应用后文件雷达与 journal 重置`;
    renderThemeGroups();
    modal.classList.remove('hidden');
    setTimeout(() => $('#setRoot')?.focus(), 60);
  }
  function closeSettings() {
    $('#setModal')?.classList.add('hidden');
  }
  async function applyRootSettings() {
    const input = $('#setRoot');
    const btn = $('#setRootApply');
    const root = (input?.value || '').trim();
    if (!root) { toast('请输入工程目录', true); return; }
    if (btn) { btn.disabled = true; btn.textContent = '应用中…'; }
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Control-Token': state.controlToken },
        body: JSON.stringify({ root }),
      });
      const j = await r.json();
      if (j.ok) {
        state.root = j.root;
        renderRootLabels();
        $('#setMsg').textContent = j.watching ? '目录已切换' : '目录已切换，但 watcher 未启动';
        $('#setRootNote').textContent = `当前监视：${j.root}${j.watching ? '' : ' · watcher 未启动'}`;
        toast(j.watching ? `监视目录：${j.root}` : `目录已切换，watcher 未启动`, !j.watching);
        if (state.workspace) renderWorkspace({ workspace: { ...state.workspace, feed: [], areas: [] } });
      } else {
        toast(`目录切换失败：${j.error || 'unknown'}`, true);
      }
    } catch (err) {
      toast(`目录切换失败：${err.message}`, true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '应用目录'; }
    }
  }

  function bindSettings() {
    $('#setOpen')?.addEventListener('click', openSettings);
    $('#setClose')?.addEventListener('click', closeSettings);
    $('#setModal')?.addEventListener('click', (e) => { if (e.target.id === 'setModal') closeSettings(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#setModal')?.classList.contains('hidden')) closeSettings();
    });
    $('#themeGroups')?.addEventListener('click', (e) => {
      const card = e.target.closest('.theme-card');
      if (!card) return;
      applyTheme(card.dataset.theme);
      $('#setMsg').textContent = `配色：${card.querySelector('.theme-name')?.firstChild?.textContent || card.dataset.theme}`;
    });
    $('#setRootApply')?.addEventListener('click', applyRootSettings);
    $('#setRoot')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyRootSettings(); });
  }

  function bindFolderWindow() {
    const list = $('#folderList');
    if (!list) return;
    let rel = '';
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const relFor = (name) => (rel ? `${rel}/${name}` : name);
    async function openFolder(targetRel) {
      try {
        const r = await fetch('/api/open-folder', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetRel || '' }),
        });
        const j = await r.json();
        $('#folderMsg').textContent = j.ok ? '已在资源管理器中打开' : (j.error || '打开失败');
      } catch (e) {
        $('#folderMsg').textContent = '打开失败';
      }
    }
    async function openFile(targetRel, mode = 'open') {
      try {
        const r = await fetch('/api/open-file', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetRel, mode }),
        });
        const j = await r.json();
        if (!j.ok) {
          $('#folderMsg').textContent = j.error || '打开失败';
        } else {
          $('#folderMsg').textContent = mode === 'reveal' ? '已在资源管理器中定位文件' : '已用默认程序打开文件';
        }
      } catch (e) {
        $('#folderMsg').textContent = '打开失败';
      }
    }
    async function load(targetRel) {
      $('#folderMsg').textContent = '读取中…';
      try {
        const r = await fetch(`/api/folders?path=${encodeURIComponent(targetRel || '')}`, { cache: 'no-store' });
        const j = await r.json();
        if (!j.ok) { $('#folderMsg').textContent = j.error || '读取失败'; return; }
        rel = j.rel || '';
        $('#folderRoot').textContent = j.root || '—';
        $('#folderRoot').title = j.root || '';
        $('#folderPath').textContent = j.path || j.root || '/';
        $('#folderPath').title = j.path || '';
        list.innerHTML = '';
        const dirs = Array.isArray(j.dirs) ? j.dirs : [];
        const files = Array.isArray(j.files) ? j.files : [];
        if (!dirs.length && !files.length) {
          list.innerHTML = '<div class="folder-empty">此目录为空</div>';
        } else {
          for (const name of dirs) {
            const row = document.createElement('button');
            row.className = 'folder-row';
            row.type = 'button';
            row.innerHTML = `<span class="fi">▸</span><span class="fn">${esc(name)}</span><span class="fo" title="在资源管理器中打开">↗</span>`;
            row.addEventListener('click', () => load(relFor(name)));
            row.querySelector('.fo').addEventListener('click', (e) => { e.stopPropagation(); openFolder(relFor(name)); });
            list.appendChild(row);
          }
          for (const file of files) {
            const row = document.createElement('button');
            row.className = 'folder-row file';
            row.type = 'button';
            const size = Number.isFinite(Number(file.size)) ? fmtBytes(Number(file.size)) : '—';
            row.innerHTML = `<span class="fi">·</span><span class="fn">${esc(file.name)}</span><span class="fm">${size}</span><span class="fo" title="在资源管理器中定位">↗</span>`;
            row.addEventListener('click', () => openFile(relFor(file.name), 'open'));
            row.querySelector('.fo').addEventListener('click', (e) => { e.stopPropagation(); openFile(relFor(file.name), 'reveal'); });
            list.appendChild(row);
          }
        }
        $('#folderMsg').textContent = `${dirs.length} 个文件夹 · ${files.length} 个文件`;
      } catch (e) {
        $('#folderMsg').textContent = '读取失败';
      }
    }
    $('#folderOpen')?.addEventListener('click', () => openFolder(rel));
    $('#folderRefresh')?.addEventListener('click', () => load(rel));
    $('#folderUp')?.addEventListener('click', () => {
      if (!rel) return;
      load(rel.split('/').slice(0, -1).join('/'));
    });
    load('');
  }

  function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || DEFAULT_THEME);
    buildGauges();
    buildHwTable();
    bindHwTabs();
    bindSessionSelect();
    bindProcControl();
    bindAppControls();
    bindSettings();
    bindFolderWindow();
    loadBench();
    renderThemeGroups();
    renderRootLabels();
    initTimelineScroll();
    initChartTip();
    $('#traceExport')?.addEventListener('click', exportTrace);
    clock();
    setInterval(clock, 1000);
    setInterval(tickTimelineClocks, 500);
    let lastFrame = 0;

    const loop = (t) => {
      if (!document.hidden && t - lastFrame > 32) {
        animateGauges();
        drawRadar(t);
        lastFrame = t;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const es = new EventSource('/api/stream');
    es.onopen = () => setConn(true);
    es.onerror = () => setConn(false);
    es.onmessage = (ev) => {
      try { apply(JSON.parse(ev.data)); } catch (err) { console.error(err); showUiError(err.message || String(err)); }
    };
    window.addEventListener('error', (ev) => showUiError(ev.message || 'script error'));
    window.addEventListener('unhandledrejection', (ev) => showUiError(String((ev.reason && ev.reason.message) || ev.reason || 'promise rejection')));
    setInterval(() => {
      if (state.connected && state.lastAt && Date.now() - state.lastAt > 6000) setConn(false);
    }, 2000);

    // keep chart/radar crisp on resize
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (state.system) drawChart(state);
      }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
