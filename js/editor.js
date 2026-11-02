/* ============================================================
   Graph-Editor (SVG): Knoten, Ports, Verbindungen
   Verschieben, Verbinden (Ausgang → Eingang), Pannen, Zoomen.
   Der Editor ändert nur x/y und links; alles andere macht app.js.
   ============================================================ */
SBS.editor = (function () {
'use strict';
const B = SBS.blocks;
const NS = 'http://www.w3.org/2000/svg';

const W = 184, HEAD = 26, INFO = 18, ROW = 20, PAD = 8;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function create(svg, opts) {
  const view = { x: 40, y: 40, k: 1 };
  const root = el('g', { class: 'viewport' }, svg);
  const gLinks = el('g', { class: 'links' }, root);
  const gNodes = el('g', { class: 'nodes' }, root);
  const temp = el('path', { class: 'link temp', d: '' }, root);
  let res = null;
  let selection = null;            // { kind: 'node' | 'link', id }
  let drag = null;

  const model = () => opts.getModel();
  const apply = () => root.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  apply();

  /* Bildschirm → Modellkoordinaten */
  function toModel(evt) {
    const r = svg.getBoundingClientRect();
    return { x: (evt.clientX - r.left - view.x) / view.k, y: (evt.clientY - r.top - view.y) / view.k };
  }

  function geometry(r) {
    const rows = Math.max(r.inputs.length, r.outputs.length, 1);
    const top = HEAD + INFO;
    return {
      h: top + rows * ROW + PAD,
      inY: i => top + i * ROW + ROW / 2,
      outY: i => top + i * ROW + ROW / 2
    };
  }

  function info(r) {
    const n = r.node;
    const parts = [];
    (r.def.props || []).filter(p => p.kind === 'pin').forEach(p => parts.push(n.props[p.id]));
    const kos = res.kos.filter(k => k.r === r);
    kos.forEach(k => parts.push(`KO ${k.number} · ${k.def.dpt}`));
    if (!parts.length) {
      const ps = res.params.filter(p => p.r === r);
      if (ps.length) parts.push(ps.map(p => `${p.def.label}: ${p.value}${p.def.unit && !/,/.test(p.def.unit) ? ' ' + p.def.unit : ''}`).join(', '));
    }
    return parts.join(' · ');
  }

  function portPos(r, dir, portId) {
    const g = geometry(r);
    const list = dir === 'in' ? r.inputs : r.outputs;
    const i = list.findIndex(p => p.id === portId);
    return { x: r.node.x + (dir === 'in' ? 0 : W), y: r.node.y + (dir === 'in' ? g.inY(i) : g.outY(i)) };
  }

  const curve = (a, b) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  function render(resolved) {
    res = resolved;
    gNodes.textContent = '';
    gLinks.textContent = '';
    const problems = new Map();
    res.errors.forEach(e => e.node && problems.set(e.node, 'error'));
    res.warnings.forEach(w => w.node && !problems.has(w.node) && problems.set(w.node, 'warn'));

    model().links.forEach((l, idx) => {
      const a = res.byId.get(l.from[0]), b = res.byId.get(l.to[0]);
      if (!a || !b) return;
      const op = a.outputs.find(p => p.id === l.from[1]);
      if (!op || !b.inputs.some(p => p.id === l.to[1])) return;
      const d = curve(portPos(a, 'out', l.from[1]), portPos(b, 'in', l.to[1]));
      const sel = selection && selection.kind === 'link' && selection.id === idx;
      const g = el('g', { class: `link-wrap${sel ? ' selected' : ''}`, 'data-link': idx }, gLinks);
      el('path', { class: 'link-hit', d }, g);
      el('path', { class: `link type-${op.type}`, d }, g);
    });

    res.nodes.forEach(r => {
      const n = r.node, g0 = geometry(r);
      const sel = selection && selection.kind === 'node' && selection.id === n.id;
      const g = el('g', {
        class: `node cat-${r.def.cat}${sel ? ' selected' : ''}${problems.has(n.id) ? ' has-' + problems.get(n.id) : ''}`,
        transform: `translate(${n.x},${n.y})`, 'data-node': n.id
      }, gNodes);
      el('rect', { class: 'body', width: W, height: g0.h, rx: 6 }, g);
      el('path', { class: 'head', d: `M0,${HEAD} V6 a6,6 0 0 1 6,-6 H${W - 6} a6,6 0 0 1 6,6 V${HEAD} Z` }, g);
      /* Kopf: Typ bzw. Id rechts höchstens halb so breit, Name links im Rest */
      const id = el('text', { class: 'nid', x: W - 8, y: 17, 'text-anchor': 'end' }, g);
      const idWidth = fitText(id, n.label ? r.def.name : n.id, W / 2 - 12);
      fitText(el('text', { class: 'title', x: 10, y: 17 }, g), n.label || r.def.name, W - 10 - 8 - idWidth - 8);
      fitText(el('text', { class: 'info', x: 10, y: HEAD + 13 }, g), info(r), W - 20);

      r.inputs.forEach((p, i) => {
        const y = g0.inY(i);
        el('circle', { class: `port in type-${p.type}`, cx: 0, cy: y, r: 5, 'data-port': p.id, 'data-dir': 'in' }, g);
        fitText(el('text', { class: 'plabel', x: 10, y: y + 4 }, g), p.label, labelWidth(r, i));
      });
      r.outputs.forEach((p, i) => {
        const y = g0.outY(i);
        el('circle', { class: `port out type-${p.type}`, cx: W, cy: y, r: 5, 'data-port': p.id, 'data-dir': 'out' }, g);
        fitText(el('text', { class: 'plabel', x: W - 10, y: y + 4, 'text-anchor': 'end' }, g), p.label, labelWidth(r, i));
      });
    });
  }

  /* Text auf die verfügbare Breite kürzen (gemessen, nicht nach Zeichen –
     die Schrift ist proportional). Gekürzt steht der volle Text im Tooltip.
     Gibt die belegte Breite zurück. Ergebnisse werden zwischengespeichert,
     weil beim Ziehen jedes Bild neu gezeichnet wird. */
  const fitCache = new Map();
  function fitText(t, text, max) {
    text = String(text);
    t.textContent = text;
    if (typeof t.getComputedTextLength !== 'function') return 0;
    const key = `${t.getAttribute('class')}|${max}|${text}`;
    let hit = fitCache.get(key);
    if (!hit) {
      const width = s => { t.textContent = s; return t.getComputedTextLength(); };
      let s = text, w = width(text);
      if (w > max) {
        let lo = 0, hi = text.length - 1;          // längster Anfang, der mit … passt
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (width(text.slice(0, mid).trimEnd() + '…') <= max) lo = mid; else hi = mid - 1;
        }
        s = text.slice(0, lo).trimEnd() + '…';
        w = width(s);
      }
      hit = { s, w };
      if (w > 0) fitCache.set(key, hit);           // 0 = nicht sichtbar, nicht merken
    }
    t.textContent = hit.s;
    if (hit.s !== text) el('title', {}, t).textContent = text;
    return hit.w;
  }

  /* Ein- und Ausgang in derselben Zeile teilen sich die Breite */
  const labelWidth = (r, i) => (r.inputs[i] && r.outputs[i] ? W / 2 : W) - 10 - 8;

  function select(sel) {
    selection = sel;
    opts.onSelect(sel);
  }

  /* ---------- Zeiger ---------- */

  svg.addEventListener('pointerdown', evt => {
    if (evt.button !== 0) return;
    const port = evt.target.closest('.port');
    const nodeEl = evt.target.closest('.node');
    const linkEl = evt.target.closest('.link-wrap');
    const p = toModel(evt);
    svg.setPointerCapture(evt.pointerId);

    if (port && port.dataset.dir === 'out') {
      const id = nodeEl.dataset.node;
      drag = { kind: 'link', from: [id, port.dataset.port], start: portPos(res.byId.get(id), 'out', port.dataset.port) };
      return;
    }
    if (port && port.dataset.dir === 'in') {
      /* Vom Eingang ziehen: bestehende Verbindung lösen und neu führen */
      const id = nodeEl.dataset.node, pid = port.dataset.port;
      const m = model();
      const idx = m.links.findIndex(l => l.to[0] === id && l.to[1] === pid);
      if (idx >= 0) {
        const l = m.links.splice(idx, 1)[0];
        drag = { kind: 'link', from: l.from, start: portPos(res.byId.get(l.from[0]), 'out', l.from[1]) };
        opts.onChange();
      }
      return;
    }
    if (nodeEl) {
      const n = model().nodes.find(x => x.id === nodeEl.dataset.node);
      drag = { kind: 'node', node: n, dx: p.x - n.x, dy: p.y - n.y, moved: false };
      select({ kind: 'node', id: n.id });
      render(res);
      return;
    }
    if (linkEl) {
      select({ kind: 'link', id: +linkEl.dataset.link });
      render(res);
      return;
    }
    drag = { kind: 'pan', sx: evt.clientX, sy: evt.clientY, vx: view.x, vy: view.y, moved: false };
  });

  /* Block zurück in die Palette gezogen = löschen */
  function overTrash(evt) {
    const t = opts.trash && opts.trash();
    if (!t) return false;
    const b = t.getBoundingClientRect();
    return b.width > 0 && evt.clientX >= b.left && evt.clientX <= b.right && evt.clientY >= b.top && evt.clientY <= b.bottom;
  }

  svg.addEventListener('pointermove', evt => {
    if (!drag) return;
    const p = toModel(evt);
    if (drag.kind === 'node') {
      drag.node.x = Math.round((p.x - drag.dx) / 10) * 10;
      drag.node.y = Math.round((p.y - drag.dy) / 10) * 10;
      drag.moved = true;
      drag.trash = overTrash(evt);
      if (opts.trash) opts.trash().classList.toggle('drop-delete', drag.trash);
      render(res);
    } else if (drag.kind === 'link') {
      temp.setAttribute('d', curve(drag.start, p));
      const port = document.elementFromPoint(evt.clientX, evt.clientY);
      svg.querySelectorAll('.port.target').forEach(x => x.classList.remove('target'));
      if (port && port.classList.contains('port') && port.dataset.dir === 'in') port.classList.add('target');
    } else if (drag.kind === 'pan') {
      view.x = drag.vx + evt.clientX - drag.sx;
      view.y = drag.vy + evt.clientY - drag.sy;
      drag.moved = drag.moved || Math.abs(evt.clientX - drag.sx) + Math.abs(evt.clientY - drag.sy) > 3;
      apply();
    }
  });

  svg.addEventListener('pointerup', evt => {
    if (!drag) return;
    const d = drag;
    drag = null;
    temp.setAttribute('d', '');
    if (d.kind === 'node' && d.trash) {
      opts.trash().classList.remove('drop-delete');
      opts.onRemove(d.node.id);
    } else if (d.kind === 'node' && d.moved) opts.onChange({ layoutOnly: true });
    if (d.kind === 'pan' && !d.moved) { select(null); render(res); }
    if (d.kind === 'link') {
      const target = document.elementFromPoint(evt.clientX, evt.clientY);
      svg.querySelectorAll('.port.target').forEach(x => x.classList.remove('target'));
      if (target && target.classList.contains('port') && target.dataset.dir === 'in') {
        const to = [target.closest('.node').dataset.node, target.dataset.port];
        const m = model();
        if (to[0] !== d.from[0] && !m.links.some(l => l.from[0] === d.from[0] && l.from[1] === d.from[1] && l.to[0] === to[0] && l.to[1] === to[1])) {
          /* Ein Eingang hat genau eine Quelle: eine neue ersetzt die alte */
          m.links = m.links.filter(l => !(l.to[0] === to[0] && l.to[1] === to[1]));
          m.links.push({ from: d.from, to });
          opts.onChange();
        }
      }
    }
  });

  svg.addEventListener('wheel', evt => {
    evt.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = evt.clientX - r.left, my = evt.clientY - r.top;
    const k = Math.min(2.5, Math.max(0.3, view.k * Math.exp(-evt.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * k / view.k;
    view.y = my - (my - view.y) * k / view.k;
    view.k = k;
    apply();
  }, { passive: false });

  /* Blöcke aus der Palette ablegen */
  svg.addEventListener('dragover', evt => {
    if (evt.dataTransfer.types.includes('application/x-sbs-block')) evt.preventDefault();
  });
  svg.addEventListener('drop', evt => {
    const type = evt.dataTransfer.getData('application/x-sbs-block');
    if (!type) return;
    evt.preventDefault();
    const p = toModel(evt);
    opts.onAdd(type, p.x - W / 2, p.y - HEAD / 2);
  });

  /* Mitte des sichtbaren Bereichs, für Klick in der Palette */
  function center() {
    const r = svg.getBoundingClientRect();
    return { x: (r.width / 2 - view.x) / view.k - W / 2, y: (r.height / 2 - view.y) / view.k - 40 };
  }

  /* Alles einpassen */
  function fit() {
    const m = model();
    if (!m.nodes.length || !res) return;
    const r = svg.getBoundingClientRect();
    const xs = m.nodes.map(n => n.x), ys = m.nodes.map(n => n.y);
    const x0 = Math.min(...xs) - 30, y0 = Math.min(...ys) - 30;
    const x1 = Math.max(...xs) + W + 30, y1 = Math.max(...ys) + 160;
    view.k = Math.min(1.2, Math.max(0.3, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    view.x = -x0 * view.k + (r.width - (x1 - x0) * view.k) / 2;
    view.y = -y0 * view.k + 10;
    apply();
  }

  return {
    render, center, fit,
    get selection() { return selection; },
    select(sel) { selection = sel; if (res) render(res); }
  };
}

return { create };
})();
