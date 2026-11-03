window.__ModuleLoader__.load({
  id: 'dsh-mission-control',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useState } = React;

    const ID = 'dsh-mission-control';
    const KIND = 'mission-control';
    const DEFAULT_API = 'http://127.0.0.1:7799';
    const DEFAULT_FULL = 'http://127.0.0.1:7800/';
    const SUMMON_ID = 'dsh-mission-control-summon';
    const ICON_HTML = `<img class="mc-summon-ico" src="data:image/png;base64,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" alt="Mission Control cat" draggable="false">`;

    function apiBase() {
      try {
        return localStorage.getItem('dsh-mission-control-api') || DEFAULT_API;
      } catch {
        return DEFAULT_API;
      }
    }

    function fullBase() {
      try {
        return localStorage.getItem('dsh-mission-control-full') || DEFAULT_FULL;
      } catch {
        return DEFAULT_FULL;
      }
    }

    async function openFullWindow() {
      if (typeof window === 'undefined') return false;
      // Preferred path: the Host launches Chrome/Edge in app mode, a separate
      // OS window, not another DSH tab.
      try {
        const response = await fetch(`${apiBase()}/api/open-full`, { method: 'POST' });
        const result = await response.json();
        if (result?.ok && result.launched) return true;
      } catch { /* fall through to a popup */ }
      const width = (typeof screen !== 'undefined' && screen.availWidth) || 1600;
      const height = (typeof screen !== 'undefined' && screen.availHeight) || 1000;
      const features = `popup=yes,width=${width},height=${height},left=0,top=0`;
      const base = fullBase();
      const url = `${base}${base.includes('?') ? '&' : '?'}fullscreen=1`;
      try {
        const win = window.open(url, 'dsh-mission-control-full', features);
        if (win) {
          try { win.focus(); } catch { /* ignore */ }
          return true;
        }
      } catch (err) {
        console.warn('[mission-control] full window blocked', err);
      }
      return false;
    }

    function mountSummon(context) {
      if (typeof document === 'undefined') return () => {};
      if (!document.body) {
        let dispose = () => {};
        const onReady = () => { dispose = mountSummon(context); };
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
        return () => {
          document.removeEventListener('DOMContentLoaded', onReady);
          dispose();
        };
      }
      const old = document.getElementById(SUMMON_ID);
      if (old) old.remove();
      const host = document.createElement('div');
      host.id = SUMMON_ID;
      host.innerHTML = `
        <style>
          #${SUMMON_ID}{position:fixed;right:18px;bottom:76px;z-index:900;font-family:var(--dsh-font-family-sans,system-ui,-apple-system,"Segoe UI",sans-serif)}
          #${SUMMON_ID} .mc-summon-btn{display:flex;align-items:center;gap:9px;height:42px;padding:0 13px 0 5px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:13px;background:var(--dsw-alias-bg-layer-2,rgba(18,22,28,.9));color:var(--dsw-alias-label-primary,#f4f1ea);box-shadow:0 14px 34px -16px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(12px);cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;text-align:left}
          #${SUMMON_ID} .mc-summon-btn:hover{transform:translateY(-1px);border-color:var(--dsw-alias-state-business-primary,#C3272B);box-shadow:0 18px 38px -16px rgba(0,0,0,.78),inset 0 1px 0 rgba(255,255,255,.08)}
          #${SUMMON_ID} .mc-summon-btn:active{transform:translateY(0)}
          #${SUMMON_ID} .mc-summon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#C3272B);outline-offset:2px}
          #${SUMMON_ID} .mc-summon-ico{width:32px;height:32px;border-radius:9px;flex:none;display:block}
          #${SUMMON_ID} .mc-summon-label{display:flex;flex-direction:column;gap:2px;line-height:1}
          #${SUMMON_ID} .mc-summon-label b{font:650 9.5px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;color:var(--dsw-alias-label-primary,#f4f1ea);white-space:nowrap}
          #${SUMMON_ID} .mc-summon-label small{font:500 8px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.04em;color:var(--dsw-alias-label-caption,#9aa4b2);white-space:nowrap}
          #${SUMMON_ID} .mc-summon-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#6E8B74);box-shadow:0 0 8px var(--dsw-alias-state-success-primary,#6E8B74);margin-left:2px}
          @media(max-width:680px){#${SUMMON_ID} .mc-summon-label,#${SUMMON_ID} .mc-summon-dot{display:none}#${SUMMON_ID} .mc-summon-btn{height:38px;padding:0 4px}}
        </style>
        <button type="button" class="mc-summon-btn" title="打开 Mission Control 全屏仪表盘（Ctrl+Shift+M）" aria-label="打开 Mission Control 全屏仪表盘">
          ${ICON_HTML}
          <span class="mc-summon-label"><b>MISSION CONTROL</b><small>一键呼出 · FULL HUD</small></span>
          <span class="mc-summon-dot" aria-hidden="true"></span>
        </button>`;
      const button = host.querySelector('button');
      const open = async () => {
        if (!(await openFullWindow())) {
          try { context?.sidebarRight?.openTab?.(KIND); } catch (err) { console.warn('[mission-control] openTab failed', err); }
        }
      };
      const onKey = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && String(event.key).toLowerCase() === 'm') {
          event.preventDefault();
          open();
        }
      };
      button.addEventListener('click', open);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(host);
      return () => {
        button.removeEventListener('click', open);
        document.removeEventListener('keydown', onKey);
        host.remove();
      };
    }

    const CSS = `
      .mc-root {
        height: 100%;
        min-height: 0;
        overflow: auto;
        box-sizing: border-box;
        padding: 14px 16px 24px;
        background: var(--dsw-alias-bg-layer-1, transparent);
        color: var(--dsw-alias-label-primary, #111);
        font-family: var(--dsh-font-family-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
        font-size: 12px;
        line-height: 1.4;
      }
      .mc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:12px; }
      .mc-kicker { font:600 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing:.14em; color:var(--dsw-alias-label-caption,#777); }
      .mc-title { margin:3px 0 0; font-size:15px; font-weight:650; letter-spacing:.02em; }
      .mc-sub { margin-top:4px; color:var(--dsw-alias-label-secondary,#666); font-size:11px; }
      .mc-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 7px; border-radius:999px; border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25)); color:var(--dsw-alias-label-secondary,#666); font:500 9px/1 ui-monospace,Consolas,monospace; letter-spacing:.08em; white-space:nowrap; }
      .mc-badge i { width:6px; height:6px; border-radius:50%; background:var(--dsw-alias-state-success-primary,#2fa36b); }
      .mc-badge.demo i { background:var(--dsw-alias-state-warn-primary,#c98a2b); }
      .mc-badge.bad i { background:var(--dsw-alias-state-error-primary,#c0392b); }
      .mc-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      .mc-metric { border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22)); border-radius:10px; padding:10px; background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.05)); min-width:0; }
      .mc-metric-top { display:flex; align-items:center; justify-content:space-between; gap:6px; color:var(--dsw-alias-label-caption,#777); font:600 9px/1 ui-monospace,Consolas,monospace; letter-spacing:.1em; }
      .mc-ring-wrap { position:relative; width:58px; height:58px; margin:7px 0 4px; }
      .mc-ring { width:58px; height:58px; transform:rotate(-90deg); }
      .mc-ring circle { fill:none; stroke-width:5; }
      .mc-ring .track { stroke:var(--dsw-alias-border-l2,rgba(127,127,127,.22)); }
      .mc-ring .value { stroke-linecap:round; transition:stroke-dashoffset .5s ease; }
      .mc-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font:650 15px/1 ui-monospace,Consolas,monospace; color:var(--dsw-alias-label-primary,#111); }
      .mc-num small { font-size:8px; margin-left:1px; color:var(--dsw-alias-label-caption,#777); }
      .mc-metric-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary,#666); font-size:10px; }
      .mc-spark { display:block; width:100%; height:26px; margin-top:6px; overflow:visible; }
      .mc-spark path { fill:none; stroke-width:1.6; vector-effect:non-scaling-stroke; }
      .mc-section { margin-top:14px; border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18)); padding-top:12px; }
      .mc-section-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:7px; }
      .mc-section-title { font:600 10px/1 ui-monospace,Consolas,monospace; letter-spacing:.12em; color:var(--dsw-alias-label-caption,#777); }
      .mc-section-meta { color:var(--dsw-alias-label-caption,#777); font:9px/1 ui-monospace,Consolas,monospace; }
      .mc-events { display:flex; flex-direction:column; gap:2px; }
      .mc-event { display:grid; grid-template-columns:52px 14px minmax(0,1fr); align-items:baseline; gap:6px; padding:4px 2px; border-radius:5px; }
      .mc-event:hover { background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06)); }
      .mc-event time { color:var(--dsw-alias-label-caption,#777); font:9px/1.2 ui-monospace,Consolas,monospace; }
      .mc-event b { color:var(--dsw-alias-state-warn-primary,#c98a2b); font:600 10px/1.2 ui-monospace,Consolas,monospace; text-align:center; }
      .mc-event span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary,#666); font:10px/1.3 ui-monospace,Consolas,monospace; direction:rtl; text-align:left; }
      .mc-empty { padding:10px 0; color:var(--dsw-alias-label-caption,#777); font-size:10px; }
      .mc-error { margin:10px 0; padding:8px 9px; border:1px solid var(--dsw-alias-state-error-secondary,rgba(192,57,43,.3)); border-radius:7px; color:var(--dsw-alias-state-error-primary,#c0392b); background:var(--dsw-alias-bg-layer-2,rgba(192,57,43,.05)); font-size:10px; word-break:break-word; }
      .mc-foot { margin-top:12px; display:flex; justify-content:space-between; gap:8px; color:var(--dsw-alias-label-caption,#777); font:9px/1.4 ui-monospace,Consolas,monospace; }
      .mc-launcher { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 8px; border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25)); border-radius:6px; background:transparent; color:var(--dsw-alias-label-secondary,#666); font:600 9px/1 ui-monospace,Consolas,monospace; letter-spacing:.08em; cursor:pointer; }
      .mc-launcher:hover { color:var(--dsw-alias-label-primary,#111); border-color:var(--dsw-alias-state-business-primary,#4176e6); }
      .mc-launcher i { width:6px; height:6px; border-radius:50%; background:var(--dsw-alias-state-business-primary,#4176e6); }
      .mc-launcher.full { border-color:var(--dsw-alias-state-business-tertiary,#7a5cff); }
      .mc-launcher.full i { background:var(--dsw-alias-state-business-tertiary,#7a5cff); }
      .mc-dock { display:flex; align-items:center; gap:5px; }
      @media (max-width: 340px) { .mc-grid { grid-template-columns:1fr; } }
    `;

    function Style() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } });
    }

    function fmtBytes(n) {
      n = Number(n);
      if (!Number.isFinite(n) || n <= 0) return '—';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[i]}`;
    }

    function fmtTime(ts) {
      const d = new Date(ts || Date.now());
      return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
    }

    function Ring({ value, color }) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      const r = 25;
      const c = 2 * Math.PI * r;
      return h('div', { className: 'mc-ring-wrap' }, [
        h('svg', { className: 'mc-ring', viewBox: '0 0 64 64', 'aria-hidden': true }, [
          h('circle', { className: 'track', cx: 32, cy: 32, r }),
          h('circle', {
            className: 'value', cx: 32, cy: 32, r,
            style: {
              stroke: color,
              strokeDasharray: `${c}`,
              strokeDashoffset: `${c * (1 - pct / 100)}`,
            },
          }),
        ]),
        h('div', { className: 'mc-num' }, [Math.round(pct), h('small', { key: 'p' }, '%')]),
      ]);
    }

    function Spark({ values, color }) {
      const vals = Array.isArray(values) ? values.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
      if (vals.length < 2) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = Math.max(1, max - min);
      const points = vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * 100;
        const y = 24 - ((v - min) / span) * 22;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ');
      return h('svg', { className: 'mc-spark', viewBox: '0 0 100 26', preserveAspectRatio: 'none', 'aria-hidden': true }, [
        h('path', { key: 'line', d: `M ${points.replace(/ /g, ' L ')}`, style: { stroke: color } }),
      ]);
    }

    function useSnapshot() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      useEffect(() => {
        let alive = true;
        let timer = null;
        const base = apiBase();
        async function tick() {
          try {
            const res = await fetch(`${base}/api/snapshot`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const next = await res.json();
            if (alive) { setData(next); setError(''); }
          } catch (err) {
            if (alive) setError(String(err?.message || err));
          }
        }
        tick();
        timer = setInterval(tick, 2000);
        return () => { alive = false; if (timer) clearInterval(timer); };
      }, []);
      return { data, error };
    }

    function Metric({ label, value, detail, color, series, name }) {
      return h('div', { className: 'mc-metric' }, [
        h('div', { className: 'mc-metric-top' }, [h('span', { key: 'l' }, label), h('span', { key: 'v' }, value === null || value === undefined ? '—' : `${Math.round(value)}%`)]),
        h(Ring, { key: 'r', value, color }),
        h('div', { key: 'n', className: 'mc-metric-name', title: name || '' }, name || detail || '—'),
        h(Spark, { key: 's', values: series, color }),
      ]);
    }

    function Panel() {
      const { data, error } = useSnapshot();
      const status = error ? 'OFFLINE' : data?.demo ? 'DEMO' : 'LIVE';
      const gpu = data?.gpu;
      const disk = data?.disk;
      const files = Array.isArray(data?.files) ? data.files : [];
      const series = data?.series || {};
      const metrics = useMemo(() => ([
        {
          key: 'cpu', label: 'CPU', color: 'var(--dsw-alias-state-success-primary,#2fa36b)',
          value: data?.cpu?.pct, name: data?.cpu?.model || 'CPU',
          series: series.cpu,
        },
        {
          key: 'mem', label: 'MEMORY', color: 'var(--dsw-alias-state-business-primary,#4176e6)',
          value: data?.mem?.pct, name: data?.mem ? `${fmtBytes(data.mem.used)} / ${fmtBytes(data.mem.total)}` : 'Memory',
          series: series.mem,
        },
        {
          key: 'gpu', label: 'GPU', color: 'var(--dsw-alias-state-business-tertiary,#7a5cff)',
          value: gpu?.pct ?? null, name: gpu ? `${gpu.name}${gpu.temp != null ? ` · ${gpu.temp}°C` : ''}` : 'GPU unavailable',
          series: series.gpu,
        },
        {
          key: 'disk', label: 'DISK', color: 'var(--dsw-alias-state-warn-primary,#c98a2b)',
          value: disk?.pct ?? null, name: disk ? `${fmtBytes(disk.free)} free` : 'Disk unavailable',
          series: null,
        },
      ]), [data, gpu, disk, series.cpu, series.mem, series.gpu]);

      return h('div', { className: 'mc-root' }, [
        h(Style, { key: 'style' }),
        h('div', { key: 'head', className: 'mc-head' }, [
          h('div', { key: 't' }, [
            h('div', { className: 'mc-kicker' }, 'DSH / MISSION CONTROL'),
            h('h1', { className: 'mc-title' }, 'Local telemetry'),
            h('div', { className: 'mc-sub' }, data?.watch?.enabled ? `Watching ${data.watch.label}` : 'File watch disabled'),
          ]),
          h('span', { key: 'b', className: `mc-badge${error ? ' bad' : data?.demo ? ' demo' : ''}`, role: 'status' }, [h('i'), status]),
        ]),
        error ? h('div', { key: 'err', className: 'mc-error', role: 'alert' }, `Cannot reach the local collector at ${apiBase()}. ${error}`) : null,
        h('div', { key: 'grid', className: 'mc-grid' }, metrics.map((m) => h(Metric, { key: m.key, ...m }))),
        h('div', { key: 'files', className: 'mc-section' }, [
          h('div', { key: 'h', className: 'mc-section-head' }, [
            h('div', { key: 't', className: 'mc-section-title' }, 'WORKSPACE CHANGES'),
            h('div', { key: 'm', className: 'mc-section-meta' }, `${files.length} recent`),
          ]),
          files.length
            ? h('div', { key: 'l', className: 'mc-events' }, files.slice(0, 12).map((f) => h('div', { key: f.id, className: 'mc-event' }, [
              h('time', { key: 't' }, fmtTime(f.t)),
              h('b', { key: 'k' }, f.kind === 'rename' ? '±' : '~'),
              h('span', { key: 'p', title: f.rel }, f.rel),
            ])))
            : h('div', { key: 'e', className: 'mc-empty' }, 'No file changes yet.'),
        ]),
        h('div', { key: 'foot', className: 'mc-foot' }, [
          h('span', { key: 'l' }, `loopback · ${data?.host?.platform || '—'}/${data?.host?.arch || '—'}`),
          h('span', { key: 'r' }, data?.ts ? `updated ${fmtTime(data.ts)}` : 'waiting for collector'),
        ]),
      ]);
    }

    function Launcher() {
      const openFull = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await openFullWindow();
      };
      return h(React.Fragment, null, [
        h(Style, { key: 'style' }),
        h('span', { key: 'dock', className: 'mc-dock' }, [
          h('button', {
            key: 'btn',
            type: 'button',
            className: 'mc-launcher',
            title: 'Open Mission Control mini panel',
            onClick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              try {
                ctx?.sidebarRight?.openTab?.(KIND);
              } catch (err) {
                console.warn('[mission-control] openTab failed', err);
              }
            },
          }, [h('i', { key: 'dot' }), 'MC']),
          h('button', {
            key: 'full',
            type: 'button',
            className: 'mc-launcher full',
            title: 'Open the full Mission Control dashboard in a separate window',
            onClick: openFull,
          }, [h('i', { key: 'dot' }), 'FULL']),
        ]),
      ]);
    }

    let ctx;

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(context) {
        ctx = context;
        context.effect(
          () => context.slots.inject('conversation.composer.dock', () => context.slots.register({
            name: 'conversation.composer.dock',
            id: `${ID}-launcher`,
            order: 5,
          }, Launcher)),
          'mission-control: composer launcher',
        );
        context.effect(
          () => context.sidebarRightTabs.register({
            id: ID,
            kind: KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => 'Mission Control',
          }),
          'mission-control: right sidebar tab type',
        );
        context.effect(
          () => context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({
            name: 'sidebar.right.pane.tab',
            key: ID,
          }, Panel)),
          'mission-control: right sidebar panel',
        );
      },
    };
  },
});
