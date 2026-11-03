/* ============================================================
   Graph-Editor (SVG): Knoten, Ports, Verbindungen
   Verschieben, Verbinden (Ausgang → Eingang), Pannen, Zoomen.
   Der Editor ändert nur x/y und links; alles andere macht app.js.
   ============================================================ */
SBS.editor = (function () {
'use strict';
const B = SBS.blocks;
const t = (SBS.i18n && SBS.i18n.t) || (s => s);
const NS = 'http://www.w3.org/2000/svg';

const W = 184, HEAD = 26, INFO = 18, ROW = 20, PAD = 8;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/* Tooltip am Port: Name und Datentyp */
function portTip(hit, p) {
  el('title', {}, hit).textContent = `${t(p.label)} · ${t(B.portType(p))}`;
}

function create(svg, opts) {
  const view = { x: 40, y: 40, k: 1 };
  const root = el('g', { class: 'viewport' }, svg);
  const gLinks = el('g', { class: 'links' }, root);
  const gNodes = el('g', { class: 'nodes' }, root);
  const temp = el('path', { class: 'link temp', d: '' }, root);
  /* Ein gezogener Block liegt in einer eigenen Ebene über der ganzen Seite,
     sonst wäre er über der Blockliste (Ablage zum Löschen) abgeschnitten */
  let dragLayer = null;
  function layer() {
    if (!dragLayer) {
      const s = el('svg', { class: 'drag-layer', 'aria-hidden': 'true' });
      document.body.appendChild(s);
      dragLayer = el('g', {}, s);
    }
    return dragLayer;
  }
  const clearLayer = () => { if (dragLayer) dragLayer.textContent = ''; };
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
    /* Makro-Instanz: Name des Makros, Pins und KOs der Blöcke darin */
    if (r.macro !== undefined) {
      parts.push(r.macro ? r.macro.name : t('Makro fehlt'));
      res.pins.filter(p => p.node._owner === n.id).forEach(p => parts.push(p.name));
      res.kos.filter(k => k.r.node._owner === n.id).forEach(k => parts.push(`KO ${k.number}`));
      return parts.join(' · ');
    }
    B.activeProps(r.def, n.props).forEach(p => {
      if (p.kind === 'pin') parts.push(n.props[p.id]);
      if (p.kind === 'bus') parts.push(B.BUS_NAMES[n.props[p.id]] || n.props[p.id]);
    });
    const kos = res.kos.filter(k => k.r === r);
    kos.forEach(k => parts.push(`KO ${k.number} · ${k.def.dpt}`));
    if (!parts.length) {
      const ps = res.params.filter(p => p.r === r);
      if (ps.length) parts.push(ps.map(p => `${t(p.def.label)}: ${p.value}${p.def.unit && !/,/.test(p.def.unit) ? ' ' + t(p.def.unit) : ''}`).join(', '));
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
    clearLayer();
    const lifted = drag && drag.kind === 'node' && drag.moved ? drag.node.id : null;
    if (lifted) {
      const r = svg.getBoundingClientRect();
      layer().setAttribute('transform', `translate(${r.left + view.x},${r.top + view.y}) scale(${view.k})`);
    }
    const problems = new Map();
    res.errors.forEach(e => e.node && problems.set(e.node, 'error'));
    res.warnings.forEach(w => w.node && !problems.has(w.node) && problems.set(w.node, 'warn'));

    model().links.forEach((l, idx) => {
      const a = res.view.byId.get(l.from[0]), b = res.view.byId.get(l.to[0]);
      if (!a || !b) return;
      const op = a.outputs.find(p => p.id === l.from[1]);
      if (!op || !b.inputs.some(p => p.id === l.to[1])) return;
      const d = curve(portPos(a, 'out', l.from[1]), portPos(b, 'in', l.to[1]));
      const sel = selection && selection.kind === 'link' && selection.id === idx;
      const g = el('g', { class: `link-wrap${sel ? ' selected' : ''}`, 'data-link': idx }, gLinks);
      el('path', { class: 'link-hit', d }, g);
      el('path', { class: `link type-${op.type}`, d }, g);
    });

    res.view.nodes.forEach(r => {
      const n = r.node, g0 = geometry(r);
      const sel = selection && selection.kind === 'node' && selection.id === n.id;
      const g = el('g', {
        class: `node cat-${r.def.cat}${sel ? ' selected' : ''}${problems.has(n.id) ? ' has-' + problems.get(n.id) : ''}${n.id === lifted ? ' lifted' + (drag.trash ? ' trash' : '') : ''}`,
        transform: `translate(${n.x},${n.y})`, 'data-node': n.id
      }, n.id === lifted ? layer() : gNodes);
      el('rect', { class: 'body', width: W, height: g0.h, rx: 6 }, g);
      el('path', { class: 'head', d: `M0,${HEAD} V6 a6,6 0 0 1 6,-6 H${W - 6} a6,6 0 0 1 6,6 V${HEAD} Z` }, g);
      /* Kopf: eigener Name links, rechts klein der Blocktyp (höchstens halb
         so breit). Ohne eigenen Namen steht der Typ links und rechts nichts. */
      const typeName = t(r.def.name);
      const typeWidth = n.label
        ? fitText(el('text', { class: 'nid', x: W - 8, y: 17, 'text-anchor': 'end' }, g), typeName, W / 2 - 12)
        : -8;
      fitText(el('text', { class: 'title', x: 10, y: 17 }, g), n.label || typeName, W - 10 - 8 - typeWidth - 8);
      fitText(el('text', { class: 'info', x: 10, y: HEAD + 13 }, g), info(r), W - 20);

      r.inputs.forEach((p, i) => {
        const y = g0.inY(i);
        portTip(el('circle', { class: 'port-hit', cx: 0, cy: y, r: 11, 'data-port': p.id, 'data-dir': 'in' }, g), p);
        portTip(el('circle', { class: `port in type-${p.type}`, cx: 0, cy: y, r: 5, 'data-port': p.id, 'data-dir': 'in' }, g), p);
        fitText(el('text', { class: 'plabel', x: 10, y: y + 4 }, g), t(p.label), labelWidth(r, i));
      });
      r.outputs.forEach((p, i) => {
        const y = g0.outY(i);
        portTip(el('circle', { class: 'port-hit', cx: W, cy: y, r: 11, 'data-port': p.id, 'data-dir': 'out' }, g), p);
        portTip(el('circle', { class: `port out type-${p.type}`, cx: W, cy: y, r: 5, 'data-port': p.id, 'data-dir': 'out' }, g), p);
        fitText(el('text', { class: 'plabel', x: W - 10, y: y + 4, 'text-anchor': 'end' }, g), t(p.label), labelWidth(r, i));
      });
      if (n.id === lifted && drag.trash) trashOverlay(g, g0.h);
    });
  }

  /* Über der Ablage: Block rot, darüber eine Mülltonne */
  function trashOverlay(g, h) {
    el('path', { class: 'trash-veil', d: `M0,${HEAD} H${W} V${h - 6} a6,6 0 0 1 -6,6 H6 a6,6 0 0 1 -6,-6 Z` }, g);
    const c = HEAD + (h - HEAD) / 2;
    const icon = el('g', { class: 'trash-icon', transform: `translate(${W / 2 - 12},${c - 22}) scale(1.5)` }, g);
    el('path', { d: 'M2.5 4h11M6 4V2.5h4V4M4 4l.8 9.5h6.4L12 4M6.8 6.5v4.5M9.2 6.5v4.5' }, icon);
    el('text', { class: 'trash-text', x: W / 2, y: c + 16, 'text-anchor': 'middle' }, g).textContent = t('Loslassen zum Löschen');
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

  /* ---------- Zeiger ----------
     Maus, Stift und Finger laufen über dieselben Pointer-Ereignisse. Zwei
     Finger auf der freien Fläche zoomen, langes Antippen öffnet das
     Kontextmenü wie ein Rechtsklick. */

  const portOf = target => target && target.closest && target.closest('[data-port]');
  const pointers = new Map();          // aktive Finger auf der Fläche
  let pinch = null, longPress = null, longPressAt = 0;

  /* Was liegt unter dem Zeiger – für Kontextmenü und Ablegen */
  function hit(evt) {
    const port = portOf(evt.target);
    const nodeEl = evt.target.closest && evt.target.closest('.node');
    const linkEl = evt.target.closest && evt.target.closest('.link-wrap');
    const at = toModel(evt);
    const base = { clientX: evt.clientX, clientY: evt.clientY, x: at.x, y: at.y };
    if (port) return { ...base, kind: 'port', id: nodeEl.dataset.node, port: port.dataset.port, dir: port.dataset.dir };
    if (nodeEl) return { ...base, kind: 'node', id: nodeEl.dataset.node };
    if (linkEl) return { ...base, kind: 'link', id: +linkEl.dataset.link };
    return { ...base, kind: 'canvas' };
  }

  function context(evt) {
    const h = hit(evt);
    if (h.kind === 'node' || h.kind === 'port') select({ kind: 'node', id: h.id });
    else if (h.kind === 'link') select({ kind: 'link', id: h.id });
    if (res) render(res);
    if (opts.onContext) opts.onContext(h);
  }

  svg.addEventListener('contextmenu', evt => {
    evt.preventDefault();
    if (Date.now() - longPressAt < 800) return;    // schon per langem Antippen geöffnet
    drag = null;
    context(evt);
  });

  svg.addEventListener('pointerdown', evt => {
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;
    pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    svg.setPointerCapture(evt.pointerId);

    /* Zweiter Finger: was der erste begonnen hat, wird zum Zoomen */
    if (pointers.size === 2) {
      clearTimeout(longPress);
      if (drag && drag.kind === 'link') temp.setAttribute('d', '');
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, vx: view.x, vy: view.y,
                mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
      return;
    }
    if (pointers.size > 2) return;

    if (evt.pointerType !== 'mouse') {
      const start = { x: evt.clientX, y: evt.clientY };
      const target = evt.target;
      clearTimeout(longPress);
      longPress = setTimeout(() => {
        if (!drag || drag.moved) return;
        if (drag.kind === 'link' && drag.restore) model().links.push(drag.restore);
        drag = null;
        longPressAt = Date.now();
        context({ target, clientX: start.x, clientY: start.y });
      }, 550);
    }

    const port = portOf(evt.target);
    const nodeEl = evt.target.closest('.node');
    const linkEl = evt.target.closest('.link-wrap');
    const p = toModel(evt);

    if (port && port.dataset.dir === 'out') {
      const id = nodeEl.dataset.node;
      drag = { kind: 'link', from: [id, port.dataset.port], start: portPos(res.view.byId.get(id), 'out', port.dataset.port), sx: evt.clientX, sy: evt.clientY };
      return;
    }
    if (port && port.dataset.dir === 'in') {
      /* Vom Eingang ziehen: bestehende Verbindung lösen und neu führen. Gelöst
         wird erst beim Ziehen, damit Antippen nichts verändert. */
      const id = nodeEl.dataset.node, pid = port.dataset.port;
      const l = model().links.find(x => x.to[0] === id && x.to[1] === pid);
      if (l) drag = { kind: 'link', from: l.from, start: portPos(res.view.byId.get(l.from[0]), 'out', l.from[1]), detach: l, sx: evt.clientX, sy: evt.clientY };
      return;
    }
    if (nodeEl) {
      const n = model().nodes.find(x => x.id === nodeEl.dataset.node);
      drag = { kind: 'node', node: n, dx: p.x - n.x, dy: p.y - n.y, sx: evt.clientX, sy: evt.clientY, moved: false };
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
    return b.width > 0 && b.right > 0 && evt.clientX >= b.left && evt.clientX <= b.right && evt.clientY >= b.top && evt.clientY <= b.bottom;
  }

  const inPortAt = evt => {
    const e = document.elementFromPoint(evt.clientX, evt.clientY);
    const port = portOf(e);
    return port && port.dataset.dir === 'in' ? port : null;
  };

  svg.addEventListener('pointermove', evt => {
    if (pointers.has(evt.pointerId)) pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = svg.getBoundingClientRect();
      const k = Math.min(2.5, Math.max(0.3, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist));
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const ox = pinch.mx - r.left, oy = pinch.my - r.top;
      view.k = k;
      view.x = mx - (ox - pinch.vx) * k / pinch.k;
      view.y = my - (oy - pinch.vy) * k / pinch.k;
      apply();
      return;
    }
    if (!drag) return;
    const far = Math.abs(evt.clientX - drag.sx) + Math.abs(evt.clientY - drag.sy) > 6;
    if (far) clearTimeout(longPress);
    const p = toModel(evt);
    if (drag.kind === 'node') {
      if (!drag.moved && !far) return;
      drag.node.x = Math.round((p.x - drag.dx) / 10) * 10;
      drag.node.y = Math.round((p.y - drag.dy) / 10) * 10;
      drag.moved = true;
      drag.trash = overTrash(evt);
      render(res);
    } else if (drag.kind === 'link') {
      if (drag.detach && far) {
        const m = model();
        m.links = m.links.filter(l => l !== drag.detach);
        drag.restore = drag.detach;
        drag.detach = null;
        drag.gesture = 'drag:' + Date.now();
        opts.onChange({ merge: drag.gesture });
      }
      if (drag.detach) return;
      drag.moved = drag.moved || far;
      temp.setAttribute('d', curve(drag.start, p));
      svg.querySelectorAll('.port.target').forEach(x => x.classList.remove('target'));
      const port = inPortAt(evt);
      if (port) (port.classList.contains('port') ? port : port.nextSibling).classList.add('target');
    } else if (drag.kind === 'pan') {
      view.x = drag.vx + evt.clientX - drag.sx;
      view.y = drag.vy + evt.clientY - drag.sy;
      drag.moved = drag.moved || far;
      apply();
    }
  });

  function endPointer(evt, cancelled) {
    pointers.delete(evt.pointerId);
    clearTimeout(longPress);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!drag) return;
    const d = drag;
    drag = null;
    temp.setAttribute('d', '');
    clearLayer();
    if (d.kind === 'node' && d.moved) render(res);
    if (cancelled) {
      if (d.restore) { model().links.push(d.restore); opts.onChange({ merge: d.gesture }); }
      return;
    }
    if (d.kind === 'node' && d.trash) opts.onRemove(d.node.id);
    else if (d.kind === 'node' && d.moved) opts.onChange({ layoutOnly: true });
    if (d.kind === 'pan' && !d.moved) { select(null); render(res); }
    if (d.kind === 'link' && !d.detach) {
      svg.querySelectorAll('.port.target').forEach(x => x.classList.remove('target'));
      const target = inPortAt(evt);
      if (target) {
        const to = [target.closest('.node').dataset.node, target.dataset.port];
        const m = model();
        if (to[0] !== d.from[0] && !m.links.some(l => l.from[0] === d.from[0] && l.from[1] === d.from[1] && l.to[0] === to[0] && l.to[1] === to[1])) {
          /* Ein Eingang hat genau eine Quelle: eine neue ersetzt die alte */
          m.links = m.links.filter(l => !(l.to[0] === to[0] && l.to[1] === to[1]));
          m.links.push({ from: d.from, to });
          opts.onChange({ merge: d.gesture });
        }
      }
    }
  }
  svg.addEventListener('pointerup', evt => endPointer(evt, false));
  svg.addEventListener('pointercancel', evt => endPointer(evt, true));

  function zoomAt(mx, my, k) {
    k = Math.min(2.5, Math.max(0.3, k));
    view.x = mx - (mx - view.x) * k / view.k;
    view.y = my - (my - view.y) * k / view.k;
    view.k = k;
    apply();
  }

  svg.addEventListener('wheel', evt => {
    evt.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(evt.clientX - r.left, evt.clientY - r.top, view.k * Math.exp(-evt.deltaY * 0.0015));
  }, { passive: false });

  /* Doppelklick bzw. Doppeltipp auf einen Block: Eigenschaften zeigen */
  svg.addEventListener('dblclick', evt => {
    const nodeEl = evt.target.closest('.node');
    if (nodeEl && opts.onOpen) opts.onOpen(nodeEl.dataset.node);
  });

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

  /* Zoomen um die Mitte (Menü, Tastatur) */
  function zoom(f) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, view.k * f);
  }

  return {
    render, center, fit, zoom,
    get selection() { return selection; },
    select(sel) { selection = sel; if (res) render(res); }
  };
}

return { create };
})();
