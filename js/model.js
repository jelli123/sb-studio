/* ============================================================
   Gerätemodell und Resolver
   Der Resolver ist die einzige Stelle, die KO-Nummern und Parameter-
   Offsets festlegt — Firmware- und knxprod-Generator lesen nur sein
   Ergebnis.
   ============================================================ */
SBS.model = (function () {
'use strict';
const B = SBS.blocks;
const t = (SBS.i18n && SBS.i18n.t) || ((s, ...a) => String(s).replace(/\{(\d+)\}/g, (m, i) => a[+i]));
/* Name eines Knotens für Meldungen, in der Sprache der Oberfläche */
const shown = n => n.label || `${B.get(n.type) ? t(B.get(n.type).name) : n.type} (${n.id})`;

const FORMAT = 'sb-studio/1';

function create() {
  return {
    format: FORMAT,
    device: {
      name: 'Neues Gerät',
      orderNumber: 'SBS-0001',
      manufacturer: 0x00FA,
      appNumber: 0xA300,
      appVersion: 0x10,
      hwSerial: '0001',
      hwVersion: 0,
      busCurrent: 10,
      platform: '4te-lpc1115',
      sblibPath: '../../software-arm-incubation/software-arm-lib'
    },
    platforms: [],
    macros: [],
    nodes: [],
    links: []
  };
}

/* ---------- Makros ----------
   Ein Makro ist ein eigener Graph im Projekt (model.macros); seine Ports
   sind die Blöcke Makro-Eingang/-Ausgang darin. Eine Instanz (Block
   „macro“) speichert je innerem Block, was sie anders hat: Pins, Parameter,
   ETS-Freigabe und die KO-Nummern (inst.inner[id], bei verschachtelten
   Makros weiter in .inner). Der Resolver löst Instanzen in gewöhnliche
   Knoten auf – Firmware und knxprod sehen keine Makros. */

const macroOf = (model, id) => (model.macros || []).find(m => m.id === id) || null;

/* Instanz → Definition, nicht gespeichert (ohne Kreis im JSON) */
function bind(model, n) {
  Object.defineProperty(n, '_m', { value: macroOf(model, n.props && n.props.macro), writable: true, configurable: true, enumerable: false });
}

/* Ablage einer Instanz an die Definition anpassen */
function syncStore(model, def, store, stack) {
  const ids = new Set(def.nodes.map(x => x.id));
  Object.keys(store).forEach(k => { if (!ids.has(k)) delete store[k]; });
  def.nodes.forEach(x => {
    const e = store[x.id] = store[x.id] || {};
    ['props', 'params', 'fixed', 'kos'].forEach(k => { e[k] = e[k] || {}; });
    if (x.type !== 'macro') { delete e.inner; return; }
    const m = macroOf(model, x.props.macro);
    e.inner = e.inner || {};
    if (m && !stack.includes(m.id)) syncStore(model, m, e.inner, stack.concat(m.id));
  });
}

/* Ansicht zum Bearbeiten eines Makros: Knoten und Verbindungen des Makros,
   alles andere vom Projekt */
function macroView(model, id) {
  const m = macroOf(model, id);
  if (!m) return model;
  const v = { _macro: m };
  /* Schieberegister liegen im Gerät, ihre Pins gibt es auch im Makro */
  Object.defineProperty(v, '_root', { value: model });
  ['format', 'device', 'platforms', 'macros'].forEach(k =>
    Object.defineProperty(v, k, { get: () => model[k], set: x => { model[k] = x; }, enumerable: true }));
  ['nodes', 'links'].forEach(k =>
    Object.defineProperty(v, k, { get: () => m[k], set: x => { m[k] = x; }, enumerable: true }));
  return v;
}

function createMacro(model, name) {
  let n = 1;
  while (macroOf(model, 'm' + n)) n++;
  const m = { id: 'm' + n, name: name || t('Makro {0}', n), nodes: [], links: [] };
  model.macros.push(m);
  const view = macroView(model, m.id);
  addNode(view, 'macro_in', 40, 60);
  addNode(view, 'macro_out', 420, 60);
  normalize(model);
  return m;
}

/* Löscht die Definition und alle Instanzen (auch in anderen Makros) */
function deleteMacro(model, id) {
  model.macros = model.macros.filter(m => m.id !== id);
  [model, ...model.macros].forEach(g => g.nodes.filter(n => n.type === 'macro' && n.props.macro === id)
    .forEach(n => removeNode(g, n.id)));
  normalize(model);
}

/* Port-Name als deutscher Text (Bezeichnungen können [Vorlage, Teile] oder
   { raw } sein) */
const plain = l => l && typeof l === 'object' && !Array.isArray(l) ? String(l.raw)
  : Array.isArray(l) ? String(l[0]).replace(/\{(\d+)\}/g, (m, i) => plain(l[+i + 1])) : String(l == null ? '' : l);

/* Gewählte Blöcke als neues Makro übernehmen: sie wandern samt Verbindungen
   untereinander hinein; jede Quelle draußen, die hineinführt, wird ein
   Makro-Eingang, jeder Ausgang drinnen, der hinausführt, ein Makro-Ausgang.
   Eine Instanz ersetzt die Blöcke und behält ihre KO-Nummern (Gruppenadressen
   bleiben gültig). Makro-Ein-/Ausgänge bleiben, wo sie sind. */
function collapse(model, ids) {
  const set = new Set(model.nodes.filter(n => ids.includes(n.id) && n.type !== 'macro_in' && n.type !== 'macro_out').map(n => n.id));
  const moved = model.nodes.filter(n => set.has(n.id));
  if (!moved.length) return null;
  const copy = x => JSON.parse(JSON.stringify(x));
  const node = id => model.nodes.find(n => n.id === id);
  const port = (n, dir, pid) => {
    const def = B.get(n.type);
    return def && (dir === 'in' ? B.inputs(def, n) : B.outputs(def, n)).find(p => p.id === pid);
  };
  let k = 1;
  while (macroOf(model, 'm' + k)) k++;
  const m = { id: 'm' + k, name: t('Makro {0}', k), nodes: moved.map(copy), links: [] };
  model.macros.push(m);
  const inner = { nodes: m.nodes };
  const x0 = Math.min(...moved.map(n => n.x)), x1 = Math.max(...moved.map(n => n.x));
  const y0 = Math.min(...moved.map(n => n.y)), y1 = Math.max(...moved.map(n => n.y));

  const into = l => !set.has(l.from[0]) && set.has(l.to[0]);
  const out = l => set.has(l.from[0]) && !set.has(l.to[0]);
  model.links.filter(l => set.has(l.from[0]) && set.has(l.to[0])).forEach(l => m.links.push(copy(l)));
  const group = (list, key) => {
    const g = new Map();
    list.forEach(l => { const kk = key(l).join('\u0000'); if (!g.has(kk)) g.set(kk, []); g.get(kk).push(l); });
    return [...g.values()];
  };
  /* Namen der Ports eindeutig (Wert, Wert 2 …) */
  const names = new Set();
  const unique = s => { let n = s || '?', i = 2; while (names.has(n)) n = `${s} ${i++}`; names.add(n); return n; };
  const outer = [];
  const ins = group(model.links.filter(into), l => l.from).map(ls => {
    const p = port(node(ls[0].to[0]), 'in', ls[0].to[1]), src = port(node(ls[0].from[0]), 'out', ls[0].from[1]);
    const y = ls.reduce((a, l) => a + node(l.to[0]).y, 0) / ls.length;
    return { ls, name: p ? plain(p.label) : '?', vtype: src ? src.type : 'bool', y };
  }).sort((a, b) => a.y - b.y);
  names.clear();
  ins.forEach(g => {
    const mi = { id: nextId(inner), type: 'macro_in', x: x0 - 260, y: Math.round(g.y / 10) * 10, label: '',
                 props: { name: unique(g.name), vtype: g.vtype, optional: false }, params: {}, fixed: {}, kos: {} };
    m.nodes.push(mi);
    g.ls.forEach(l => m.links.push({ from: [mi.id, 'out'], to: copy(l.to) }));
    outer.push(inst => ({ from: copy(g.ls[0].from), to: [inst, mi.id] }));
  });
  const outs = group(model.links.filter(out), l => l.from).map(ls => {
    const p = port(node(ls[0].from[0]), 'out', ls[0].from[1]);
    return { ls, name: p ? plain(p.label) : '?', vtype: p ? p.type : 'bool', y: node(ls[0].from[0]).y };
  }).sort((a, b) => a.y - b.y);
  names.clear();
  outs.forEach(g => {
    const mo = { id: nextId(inner), type: 'macro_out', x: x1 + 260, y: g.y, label: '',
                 props: { name: unique(g.name), vtype: g.vtype }, params: {}, fixed: {}, kos: {} };
    m.nodes.push(mo);
    m.links.push({ from: copy(g.ls[0].from), to: [mo.id, 'in'] });
    g.ls.forEach(l => outer.push(inst => ({ from: [inst, mo.id], to: copy(l.to) })));
  });

  model.nodes = model.nodes.filter(n => !set.has(n.id));
  model.links = model.links.filter(l => !set.has(l.from[0]) && !set.has(l.to[0]));
  const inst = addNode(model, 'macro', Math.round((x0 + x1) / 20) * 10, Math.round((y0 + y1) / 20) * 10);
  inst.props.macro = m.id;
  inst.inner = {};
  moved.forEach(n => {
    inst.inner[n.id] = { props: {}, params: {}, fixed: {}, kos: copy(n.kos || {}) };
    if (n.type === 'macro') inst.inner[n.id].inner = copy(n.inner || {});
  });
  outer.forEach(f => model.links.push(f(inst.id)));
  bind(model, inst);
  return { macro: m, inst };
}

/* Instanz zurück in einzelne Blöcke: die Blöcke des Makros mit den
   Einstellungen der Instanz (Pins, Parameter, KO-Nummern), Verbindungen über
   die Makro-Ein-/Ausgänge direkt. Die Definition bleibt. */
function explode(model, id) {
  const inst = model.nodes.find(n => n.id === id && n.type === 'macro');
  const m = inst && macroOf(model, inst.props.macro);
  if (!m) return null;
  const copy = x => JSON.parse(JSON.stringify(x));
  const store = inst.inner || {};
  const body = m.nodes.filter(n => n.type !== 'macro_in' && n.type !== 'macro_out');
  const cx = body.length ? (Math.min(...body.map(n => n.x)) + Math.max(...body.map(n => n.x))) / 2 : 0;
  const cy = body.length ? (Math.min(...body.map(n => n.y)) + Math.max(...body.map(n => n.y))) / 2 : 0;
  const ids = new Map();
  const added = body.map(x => {
    const e = store[x.id] || {};
    const n = copy(x);
    n.id = nextId(model);
    n.x = Math.round(inst.x + x.x - cx); n.y = Math.round(inst.y + x.y - cy);
    ['props', 'params', 'fixed'].forEach(k => { n[k] = Object.assign(n[k] || {}, copy(e[k] || {})); });
    n.kos = copy(e.kos || {});
    if (x.type === 'macro') n.inner = copy(e.inner || {});
    model.nodes.push(n);
    ids.set(x.id, n.id);
    return n;
  });
  /* Sichtbarkeit: Verweise auf die neuen Kennungen; ohne eigene übernehmen
     die Blöcke die der Instanz */
  added.forEach(n => {
    if (n.when && ids.has(n.when.on)) n.when.on = ids.get(n.when.on);
    else if (inst.when) n.when = copy(inst.when);
    else delete n.when;
  });
  const kind = new Map(m.nodes.map(x => [x.id, x.type]));
  /* Quellen eines inneren Endes: am Makro-Eingang die Quellen draußen */
  const sources = ref => kind.get(ref[0]) === 'macro_in'
    ? model.links.filter(l => l.to[0] === id && l.to[1] === ref[0]).map(l => copy(l.from))
    : [[ids.get(ref[0]), ref[1]]];
  const links = [];
  m.links.forEach(l => {
    const to = kind.get(l.to[0]) === 'macro_out'
      ? model.links.filter(o => o.from[0] === id && o.from[1] === l.to[0]).map(o => copy(o.to))
      : [[ids.get(l.to[0]), l.to[1]]];
    sources(l.from).forEach(f => to.forEach(x => links.push({ from: copy(f), to: x })));
  });
  removeNode(model, id);
  model.links.push(...links);
  return added;
}

/* ---------- Makro-Bibliothek ----------
   Ein Eintrag ist ein Makro samt der Makros, die es enthält (macros[0] ist
   es selbst), mit ihren Kennungen aus dem Projekt. lib kennzeichnet ein
   Makro über Projekte hinweg: liegt es schon im Projekt, wird es genommen
   statt noch einmal angelegt. */
const MACRO_FORMAT = 'sb-studio-macro/1';
const libId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function macroDeps(model, id) {
  const out = [];
  const walk = mid => {
    const m = macroOf(model, mid);
    if (!m || out.includes(m)) return;
    out.push(m);
    m.nodes.filter(n => n.type === 'macro').forEach(n => walk(n.props.macro));
  };
  walk(id);
  return out;
}

/* Vergibt fehlende lib-Kennungen im Projekt */
function packMacro(model, id) {
  const list = macroDeps(model, id);
  if (!list.length) return null;
  list.forEach(m => { if (!m.lib) m.lib = libId(); });
  const macros = JSON.parse(JSON.stringify(list));
  return { format: MACRO_FORMAT, lib: macros[0].lib, name: macros[0].name, help: macros[0].help || '', macros };
}

/* Eintrag ins Projekt holen; replace überschreibt das Makro selbst, wenn es
   schon da ist (Stand der Bibliothek laden). Gibt das Makro zurück. */
function unpackMacro(model, entry, replace) {
  if (!entry || entry.format !== MACRO_FORMAT || !Array.isArray(entry.macros) || !entry.macros.length ||
      !entry.macros.every(d => d && Array.isArray(d.nodes) && Array.isArray(d.links)))
    throw new Error(t('Keine Makro-Datei von SB-Studio.'));
  const map = new Map(), fresh = [];
  entry.macros.forEach((d, i) => {
    let m = d.lib ? model.macros.find(x => x.lib === d.lib) : null;
    if (m && !(i === 0 && replace)) { map.set(d.id, m.id); return; }
    if (!m) {
      let k = 1;
      while (macroOf(model, 'm' + k)) k++;
      m = { id: 'm' + k, nodes: [], links: [] };
      model.macros.push(m);
    }
    map.set(d.id, m.id);
    fresh.push([m, d]);
  });
  fresh.forEach(([m, d]) => {
    const c = JSON.parse(JSON.stringify(d));
    c.nodes.forEach(n => { if (n.type === 'macro' && n.props) n.props.macro = map.get(n.props.macro) || n.props.macro; });
    Object.assign(m, { name: String(c.name || t('Makro')), help: String(c.help || ''), lib: c.lib || libId(), nodes: c.nodes, links: c.links });
    if (c.channel === false) m.channel = false; else delete m.channel;
  });
  normalize(model);
  return macroOf(model, map.get(entry.macros[0].id));
}

/* Inhalt eines Makros zum Vergleichen, Verweise auf andere Makros über lib */
function macroKey(defs, m) {
  const ref = id => { const d = defs.find(x => x.id === id); return d ? d.lib || d.id : id; };
  return JSON.stringify({ name: m.name, help: m.help || '', channel: m.channel !== false, links: m.links,
    nodes: m.nodes.map(n => n.type === 'macro' ? Object.assign({}, n, { props: Object.assign({}, n.props, { macro: ref(n.props.macro) }) }) : n) });
}
/* Gleicht das Makro im Projekt dem Eintrag? */
function sameMacro(model, id, entry) {
  const m = macroOf(model, id);
  return !!m && !!entry && macroKey(model.macros, m) === macroKey(entry.macros, entry.macros[0]);
}

/* Makros, die das Makro id enthalten (direkt oder tiefer) – die dürfen
   nicht in id hinein, sonst enthielte es sich selbst */
function macroUsers(model, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    model.macros.forEach(m => {
      if (!out.has(m.id) && m.nodes.some(n => n.type === 'macro' && out.has(n.props.macro))) { out.add(m.id); grew = true; }
    });
  }
  return out;
}

function addMacro(model, id, x, y) {
  const n = addNode(model, 'macro', x, y);
  n.props.macro = id;
  n.inner = {};
  normalize(model);
  freeInstancePins(model, n);
  return n;
}

/* Freie Pins für die inneren Blöcke einer neuen Instanz */
function freeInstancePins(model, inst) {
  const flat = expand(model).nodes;
  const fake = { device: model.device, platforms: model.platforms, nodes: flat };
  flat.filter(f => f._owner === inst.id && f._store).forEach(f => {
    freePins(fake, f);
    B.activeProps(B.get(f.type), f.props).filter(p => p.kind === 'pin' || p.kind === 'bus')
      .forEach(p => { f._store.props[p.id] = f.props[p.id]; });
  });
}

/* Instanzen in gewöhnliche Knoten auflösen. Ein innerer Knoten heißt
   <Instanz>_<Knoten> (n5_n2), Verbindungen an eine Instanz gehen an deren
   Makro-Ein-/Ausgang, der den Wert weiterreicht. _owner ist die Instanz im
   gezeigten Graphen (für Meldungen und Inspektor), _prefix ihr Name. */
function expand(model) {
  const nodes = [], links = [], errors = [];
  const top = model._macro ? [model._macro.id] : [];
  function graph(g, idp, prefix, owner, store, stack, conds, chan, page, path) {
    const kind = new Map(g.nodes.map(x => [x.id, x.type]));
    g.nodes.forEach(x => {
      const id = idp + x.id;
      const e = store ? store[x.id] : null;
      /* Sichtbarkeit in der ETS: eigene Bedingung und die der Instanzen darüber */
      const own = x.when && x.when.on ? [{ on: idp + x.when.on, values: (x.when.values || []).slice() }] : [];
      const when = conds.concat(own);
      if (x.type === 'macro') {
        bind(model, x);
        const m = x._m;
        const name = x.label || (m ? m.name : t('Makro'));
        const at = owner || id;
        if (!m) errors.push([t('{0}: Makro „{1}“ gibt es nicht.', prefix + name, x.props.macro), at]);
        else if (stack.includes(m.id)) errors.push([t('Makro „{0}“ enthält sich selbst.', m.name), at]);
        else {
          /* ETS: ein Makro ist ein Kanal (oben) bzw. eine Seite darin, außer es
             ist abgeschaltet – dann landen seine Blöcke auf der Seite darüber */
          const isCh = m.channel !== false;
          const pg = isCh ? { id, name, prefix: prefix + name } : page;
          const c = chan || (isCh ? pg : null);
          graph(m, id + '_', prefix + name + ': ', at, store ? (e && e.inner) || {} : x.inner || {}, stack.concat(m.id), when, c, pg, path.concat({ id, macro: m.id }));
        }
        return;
      }
      if (!idp) { nodes.push(x); return; }
      const def = B.get(x.type);
      const port = x.type === 'macro_in' || x.type === 'macro_out';
      const flat = Object.assign({}, x, {
        id, label: port ? prefix.slice(0, -2) : prefix + (x.label || (def ? def.name : x.type)),
        props: Object.assign({}, x.props, e && e.props), params: Object.assign({}, x.params, e && e.params),
        fixed: Object.assign({}, x.fixed, e && e.fixed), kos: e ? e.kos : {},
        _flat: true, _owner: owner, _prefix: prefix.slice(0, -2), _store: e || null,
        _when: when, _chan: chan, _page: page,
        /* Instanzen von außen nach innen, für gemeinsamen Code je Makro */
        _path: path
      });
      nodes.push(flat);
    });
    const end = ([nid, port], dir) => kind.get(nid) === 'macro' ? [`${idp}${nid}_${port}`, dir] : [idp + nid, port];
    g.links.forEach(l => links.push({ from: end(l.from, 'out'), to: end(l.to, 'in') }));
  }
  graph(model, '', '', null, null, top, [], null, null, []);
  return { nodes, links, errors };
}

/* ---------- Hardware-Plattform ---------- */

/* Vordefiniert (blocks.js) oder eigene aus dem Modell */
function platformOf(model) {
  const id = model.device.platform;
  const p = B.PLATFORMS[id] || (model.platforms || []).find(x => x.id === id);
  return p ? Object.assign({ id }, p) : null;
}
const chipOf = platform => platform ? B.CHIP[platform.chip] || null : null;

/* Pins der Schieberegister-Blöcke im Gerät (oberste Ebene): Name.Q0 …,
   ext verweist auf den Block und das Bit */
function extPins(model) {
  const root = model._root || model;
  return root.nodes.flatMap(n => {
    const def = B.get(n.type);
    const x = def && def.expander && def.expander(n);
    if (!x || !Number.isInteger(x.count)) return [];
    return Array.from({ length: x.count }, (_, bit) => {
      const name = `${n.props.name}.Q${bit}`;
      return { name, gpio: name, fn: [x.dir], ext: { id: n.id, bit, where: B.srWhere(x.chip, bit) } };
    });
  });
}
/* Plattform samt Schieberegister-Pins – für alles, was Pins von Blöcken
   auswählt oder prüft (nicht für den Plattform-Dialog) */
function pinPlatform(model) {
  const p = platformOf(model);
  return p ? Object.assign({}, p, { pins: p.pins.concat(extPins(model)) }) : null;
}

/* Name des Schieberegisters ändern: Pins, die es nutzen, mitnehmen (auch in
   Makros und in den Einstellungen der Instanzen) */
function renameExpander(model, from, to) {
  const root = model._root || model;
  const map = v => typeof v === 'string' && v.startsWith(from + '.Q') ? to + v.slice(from.length) : v;
  const fix = props => Object.keys(props || {}).forEach(k => { props[k] = map(props[k]); });
  const store = st => Object.values(st || {}).forEach(e => { fix(e.props); store(e.inner); });
  root.nodes.forEach(n => { fix(n.props); store(n.inner); });
  root.macros.forEach(m => m.nodes.forEach(n => { fix(n.props); store(n.inner); }));
}

/* Pins der Plattform, an denen eine Pin-Eigenschaft eines Blocks gehen kann */
const pinOptions = (model, p) => B.pinsFor(pinPlatform(model), p);

/* Signal eines Busses → GPIO, nur für angeschlossene Busse. always: belegt
   immer (KNX, SB-Debug), sonst erst, wenn ein Block den Bus nutzt;
   shared: mitbenutzbar (ISP_TXD/RXD werden nur beim Flashen gebraucht). */
function busPins(platform) {
  const out = [];
  Object.entries((platform && platform.buses) || {}).forEach(([bus, sig]) => {
    const info = B.BUS_INFO[bus] || {};
    if (sig) Object.entries(sig).forEach(([s, gpio]) => out.push({
      bus, signal: s, gpio, label: `${B.BUS_NAMES[bus] || bus} ${s.toUpperCase()}`,
      always: !!info.always, shared: (info.shared || []).includes(s)
    }));
  });
  return out;
}
/* GPIOs, die fest belegt sind, mit dem Bussignal */
const fixedPins = platform => new Map(busPins(platform).filter(b => b.always && !b.shared).map(b => [b.gpio, b.label]));

/* Eigene Plattform prüfen: Pins eindeutig, GPIO vorhanden und frei,
   Funktionen vom Chip unterstützt, Buspins aus der Liste des Chips */
function checkPlatform(platform) {
  const out = [];
  const chip = chipOf(platform);
  if (!platform) return out;
  if (!chip) { out.push(t('Plattform {0}: unbekannter Chip „{1}“.', platform.name, platform.chip)); return out; }
  const names = new Set(), gpios = new Map();
  const fixed = fixedPins(platform);
  const gpioOk = (g, what) => {
    if (!chip.gpio[g]) out.push(t('{0}: {1} gibt es beim {2} nicht.', what, g, chip.name));
    else if (fixed.has(g)) out.push(t('{0}: {1} ist vergeben ({2}).', what, g, fixed.get(g)));
    else return true;
    return false;
  };
  (platform.pins || []).forEach(p => {
    const name = String(p.name || '').trim();
    const what = t('Pin {0}', name || '?');
    if (!name) out.push(t('Pin ohne Namen ({0}).', p.gpio));
    else if (names.has(name)) out.push(t('Pinname {0} doppelt.', name));
    names.add(name);
    if (!gpioOk(p.gpio, what)) return;
    if (gpios.has(p.gpio)) out.push(t('{0} ist zweimal zugeordnet: {1} und {2}.', p.gpio, gpios.get(p.gpio), name));
    gpios.set(p.gpio, name);
    const can = B.pinFns(chip, p.gpio);
    (p.fn || []).filter(f => !can.includes(f)).forEach(f =>
      out.push(t('{0}: {1} kann {2} nicht.', what, p.gpio, t(B.PIN_FN[f] || f))));
    if (platform.prog && p.gpio === platform.prog) out.push(t('{0}: {1} ist die Programmiertaste.', what, p.gpio));
  });
  if (platform.prog) gpioOk(platform.prog, t('Programmiertaste'));
  const seen = new Map();
  busPins(platform).forEach(b => {
    const allowed = (chip.buses[b.bus] || {})[b.signal];
    if (!allowed) out.push(t('{0} gibt es beim {1} nicht.', b.label, chip.name));
    else if (!allowed.includes(b.gpio)) out.push(t('{0} geht nicht an {1} (möglich: {2}).', b.label, b.gpio, allowed.join(', ')));
    /* fest belegte Signale dürfen sich keinen Pin teilen */
    if (b.always && !b.shared) {
      if (seen.has(b.gpio)) out.push(t('{0} ist zweimal zugeordnet: {1} und {2}.', b.gpio, seen.get(b.gpio), b.label));
      seen.set(b.gpio, b.label);
    }
  });
  Object.keys(chip.buses).filter(b => (B.BUS_INFO[b] || {}).required && !(platform.buses || {})[b])
    .forEach(b => out.push(t('Der {0}-Bus fehlt.', B.BUS_NAMES[b])));
  /* KNX: Capture-Eingang und Match-Ausgang desselben Timers; die sblib legt
     den Bus derzeit fest auf timer16_1 */
  const knx = (platform.buses || {}).knx;
  if (knx && chip.gpio[knx.rx] && chip.gpio[knx.tx]) {
    const rx = (chip.gpio[knx.rx].cap || [])[0], tx = (chip.gpio[knx.tx].mat || [])[0];
    if (rx && tx && rx[0] !== tx[0])
      out.push(t('KNX-Bus: RX ({0}) und TX ({1}) müssen am selben Timer liegen.', B.timerFn(rx, 'CAP'), B.timerFn(tx, 'MAT')));
    else if (knx.rx !== chip.knx.rx || knx.tx !== chip.knx.tx)
      out.push(t('KNX-Bus: die sblib unterstützt nur RX an {0} und TX an {1}.',
        `${chip.knx.rx} (${B.timerFn(chip.gpio[chip.knx.rx].cap[0], 'CAP')})`, `${chip.knx.tx} (${B.timerFn(chip.gpio[chip.knx.tx].mat[0], 'MAT')})`));
  }
  return out;
}

/* Was einem Block auf der Plattform fehlt, als Text; leer = verfügbar */
function unavailable(def, platform, node) {
  return B.missing(def, platform, node).map(m => m.bus
    ? t('kein {0}-Bus', [].concat(m.bus).map(b => B.BUS_NAMES[b] || b).join('/'))
    : t('kein Pin mit {0}', m.fn.map(f => t(B.PIN_FN[f] || f)).join(' + '))).join(', ');
}

/* Beschreibung eines Makros setzen: in seiner Beschreibungs-Notiz, die bei
   Bedarf über den Blöcken angelegt wird */
function helpNote(m, text) {
  let n = m.nodes.find(x => x.type === 'note' && x.props && x.props.desc);
  if (!n) {
    const xs = m.nodes.map(x => x.x), ys = m.nodes.map(x => x.y);
    n = { id: nextId(m), type: 'note', x: xs.length ? Math.min(...xs) : 40, y: (ys.length ? Math.min(...ys) : 200) - 200,
          label: '', props: { text: '', width: 400, desc: true }, params: {}, fixed: {}, kos: {} };
    m.nodes.push(n);
  }
  n.props.text = String(text);
  m.help = n.props.text;
  m.helpNote = true;
  return n;
}

function nextId(model) {
  let n = 0;
  model.nodes.forEach(x => { const m = /^n(\d+)$/.exec(x.id); if (m) n = Math.max(n, +m[1]); });
  return 'n' + (n + 1);
}

function addNode(model, type, x, y) {
  const def = B.get(type);
  const d = B.defaults(def);
  const node = { id: nextId(model), type, x: Math.round(x), y: Math.round(y), label: '',
                 props: d.props, params: d.params, fixed: {}, kos: {} };
  model.nodes.push(node);
  freePins(model, node);
  assignKos(model);
  return node;
}

/* Freien, passenden Pin vorschlagen, damit zwei Blöcke nicht kollidieren:
   der Vorgabewert, wenn er geht, sonst der erste freie */
function freePins(model, node) {
  const def = B.get(node.type);
  if (def.expander) {
    const root = model._root || model;
    const names = new Set(root.nodes.filter(o => o !== node && B.get(o.type) && B.get(o.type).expander).map(o => o.props.name));
    let k = 1;
    while (names.has(node.props.name)) node.props.name = 'SR' + k++;
  }
  /* Ansteuerung umschalten, wenn die gewählte hier nicht geht (NeoPixel: SPI ↔ Timer) */
  const sw = B.feasible(def, platformOf(model), node.props);
  if (sw) node.props[sw[0]] = sw[1];
  /* belegt sind auch die Pins der Busse, die andere Blöcke nutzen (NeoPixel: MOSI, I²C-Sensor) */
  const platform = platformOf(model);
  const busGpios = new Set(model.nodes.filter(o => o !== node).flatMap(o => {
    const d = B.get(o.type);
    if (!d || !platform) return [];
    const sig = (b, s) => platform.buses && platform.buses[b] ? s.map(x => platform.buses[b][x]) : [];
    return B.activeProps(d, o.props).filter(q => q.kind === 'bus').flatMap(q => sig(o.props[q.id], q.signals))
      .concat([].concat(d.bus || []).flatMap(b => sig(b, Object.keys((platform.buses || {})[b] || {}))));
  }));
  const busPinNames = platform ? platform.pins.filter(x => busGpios.has(x.gpio)).map(x => x.name) : [];
  B.activeProps(def, node.props).filter(p => p.kind === 'pin').forEach(p => {
    const used = new Set(model.nodes.filter(o => o !== node).flatMap(pinsOf).concat(busPinNames));
    const names = pinOptions(model, p).map(x => x.name);
    const ok = x => names.includes(x) && !used.has(x);
    if (!ok(node.props[p.id])) node.props[p.id] = [p.def].concat(names).find(ok) || names[0] || node.props[p.id];
  });
  /* Bus-Eigenschaft: angeschlossener Bus, möglichst einer, den noch kein Block nutzt */
  B.activeProps(def, node.props).filter(p => p.kind === 'bus').forEach(p => {
    const ok = B.busesFor(platformOf(model), p);
    /* geteilte Busse (Schieberegister) stören sich nicht untereinander */
    const used = new Set(model.nodes.filter(o => o !== node).flatMap(o =>
      B.activeProps(B.get(o.type), o.props).filter(q => q.kind === 'bus' && !(q.share && p.share)).map(q => o.props[q.id])));
    if (!ok.includes(node.props[p.id]) || used.has(node.props[p.id]))
      node.props[p.id] = ok.find(b => !used.has(b)) || ok[0] || node.props[p.id];
  });
}

function removeNode(model, id) {
  model.nodes = model.nodes.filter(n => n.id !== id);
  model.links = model.links.filter(l => l.from[0] !== id && l.to[0] !== id);
}

function pinsOf(node) {
  const def = B.get(node.type);
  return def ? B.activeProps(def, node.props).filter(p => p.kind === 'pin').map(p => node.props[p.id]) : [];
}

/* Nach einer Änderung von Eigenschaften: Werte neuer Parameter ergänzen,
   Verbindungen zu verschwundenen Ports entfernen. */
function normalize(model) {
  migrate(model);
  /* Projekt und Makros; eine Ansicht (Makro bearbeiten) normalisiert das Projekt */
  const root = model._macro ? null : model;
  const graphs = root ? [root, ...root.macros] : [model];
  graphs.forEach(g => g.nodes.forEach(n => {
    n.props = n.props || {};
    if (n.type === 'macro') bind(model, n);
  }));
  graphs.forEach(g => {
    g.nodes.forEach(n => {
      const def = B.get(n.type);
      if (!def) return;
      n.props = n.props || {}; n.params = n.params || {}; n.fixed = n.fixed || {}; n.kos = n.kos || {};
      (def.props || []).forEach(p => { if (!(p.id in n.props)) n.props[p.id] = p.def; });
      B.params(def, n).forEach(p => { if (!(p.id in n.params)) n.params[p.id] = p.def; });
      if (n.type === 'macro') {
        n.inner = n.inner || {};
        if (n._m) syncStore(model, n._m, n.inner, [n._m.id]);
      }
    });
    const byId = new Map(g.nodes.map(n => [n.id, n]));
    const has = (ref, dir) => {
      const n = byId.get(ref[0]); const def = n && B.get(n.type);
      return def && (dir === 'out' ? B.outputs(def, n) : B.inputs(def, n)).some(p => p.id === ref[1]);
    };
    g.links = g.links.filter(l => has(l.from, 'out') && has(l.to, 'in'));
    /* Sichtbarkeit nur an eine ETS-Auswahl im selben Graphen */
    g.nodes.forEach(n => {
      const o = n.when && byId.get(n.when.on);
      if (n.when && (!o || o === n || o.type !== 'option')) delete n.when;
      else if (n.when) n.when.values = (Array.isArray(n.when.values) ? n.when.values : []).map(Number).filter(Number.isInteger);
    });
  });
  /* KO-Nummern im Projekt; in Makros nur, damit die Ansicht keine Fehler zeigt */
  if (root) root.macros.forEach(m => assignKos(macroView(root, m.id)));
  assignKos(model);
}

/* Bussignale, die der Chip nicht (mehr) kennt, entfernen: früher stand
   SSEL am SPI-Bus, heute wählt jeder Block sein Chip-Select selbst */
function cleanBuses(platform) {
  const chip = chipOf(platform);
  if (!chip || !platform.buses) return platform;
  Object.entries(platform.buses).forEach(([b, sig]) => {
    const known = chip.buses[b];
    if (known && sig) Object.keys(sig).filter(s => !known[s]).forEach(s => delete sig[s]);
  });
  return platform;
}

/* Ältere Modelle: device.mcu statt Plattform, Pins als sblib-Makro
   (PIN_IO1 statt IO1) */
function migrate(model) {
  const dev = model.device;
  if (!Array.isArray(model.platforms)) model.platforms = [];
  if (!Array.isArray(model.macros)) model.macros = [];
  model.macros.forEach(m => {
    m.nodes = Array.isArray(m.nodes) ? m.nodes : [];
    m.links = Array.isArray(m.links) ? m.links : [];
  });
  if (!dev.platform && dev.mcu) dev.platform = B.PLATFORM_OF_MCU[dev.mcu] || dev.mcu;
  delete dev.mcu;
  /* eigene Plattformen von vor dem KNX-Bus als Busangabe */
  model.platforms.forEach(p => {
    const chip = B.CHIP[p.chip];
    p.buses = p.buses || {};
    if (chip && !p.buses.knx) p.buses.knx = Object.assign({}, chip.knx);
    cleanBuses(p);
  });
  /* Makro-Beschreibung: steht in einer Notiz im Makro (frei positionierbar);
     m.help ist ihr Abbild für Blockliste, Instanz und Bibliothek. Ältere
     Makros mit Beschreibung bekommen die Notiz einmal angelegt. */
  model.macros.forEach(m => {
    const notes = m.nodes.filter(n => n.type === 'note' && n.props && n.props.desc);
    notes.slice(1).forEach(n => { n.props.desc = false; });
    if (notes.length) { m.help = String(notes[0].props.text || ''); m.helpNote = true; }
    else if (!m.helpNote && m.help) helpNote(m, m.help);
  });
  /* Relais bistabil: Freigabe war ein optionaler Eingang, jetzt zuschaltbar */
  [model].concat(model.macros).forEach(g => (g.nodes || []).forEach(n => {
    if (n.type === 'bistable' && n.props && n.props.useEn === undefined &&
        (g.links || []).some(l => l.to[0] === n.id && l.to[1] === 'en')) n.props.useEn = true;
  }));
  /* 74HC595: /OE war ein Schalter, jetzt keins / Pin / PWM */
  model.nodes.concat(...model.macros.map(m => m.nodes)).forEach(n => {
    if (n.type === 'sr595' && n.props && typeof n.props.oe === 'boolean') n.props.oe = n.props.oe ? 'pin' : 'none';
  });
  const platform = platformOf(model);
  if (!platform) return;
  const names = new Set(platform.pins.map(p => p.name));
  model.nodes.forEach(n => {
    const def = B.get(n.type);
    (def && def.props || []).filter(p => p.kind === 'pin').forEach(p => {
      const v = n.props && n.props[p.id];
      if (typeof v === 'string' && !names.has(v) && /^PIN_/.test(v) && names.has(v.slice(4))) n.props[p.id] = v.slice(4);
    });
  });
}

/* KO-Nummern sind stabil: einmal vergeben, bleiben sie am Knoten, damit
   Gruppenadressen in bestehenden Projekten stimmen. Neue bekommen die
   nächste freie Nummer ab der ersten der Maske (BIM112: 0). */
function maskOf(model) {
  const chip = chipOf(platformOf(model));
  return chip ? B.MASK[chip.mask] : null;
}

function assignKos(model) {
  const mask = maskOf(model);
  const base = mask ? mask.koBase : 0;
  const used = new Set();
  const todo = [];
  /* aufgelöst: KOs in Makro-Instanzen landen in deren Ablage */
  expand(model).nodes.forEach(n => {
    const def = B.get(n.type);
    if (!def) return;
    const ids = new Set(B.kos(def, n).map(k => k.id));
    Object.keys(n.kos || {}).forEach(k => { if (!ids.has(k)) delete n.kos[k]; });
    ids.forEach(k => {
      const nr = n.kos[k];
      if (Number.isInteger(nr) && nr >= base && !used.has(nr)) used.add(nr); else todo.push([n, k]);
    });
  });
  let next = base;
  todo.forEach(([n, k]) => {
    while (used.has(next)) next++;
    n.kos[k] = next; used.add(next);
  });
}

/* ---------- Resolver ---------- */

function resolve(model) {
  const errors = [], warnings = [];
  const dev = model.device;
  const platform = pinPlatform(model);
  const mcu = chipOf(platform);
  const mask = maskOf(model);
  /* Meldungen zeigen auf den sichtbaren Block (bei Makros die Instanz) */
  const at = node => node && (node._owner || node.id);
  const err = (msg, node) => errors.push({ msg, node: at(node) });
  const warn = (msg, node) => warnings.push({ msg, node: at(node) });
  const flat = expand(model);
  flat.errors.forEach(([msg, id]) => errors.push({ msg, node: id }));
  const title = n => n.label || `${B.get(n.type) ? B.get(n.type).name : n.type} (${n.id})`;
  /* title bleibt deutsch, es steht auch in den Kommentaren des erzeugten
     Codes; Meldungen nennen den Knoten mit shown() */
  const rt = r => shown(r.node);

  if (!platform) err(t('Unbekannte Hardware-Plattform „{0}“.', dev.platform));
  else if (!mcu) err(t('Plattform {0}: unbekannter Chip „{1}“.', platform.name, platform.chip));
  else if (!mask) err(t('Unbekannte Maske „{0}“.', mcu.mask));
  if (platform && mcu && !platform.builtin) checkPlatform(platformOf(model)).forEach(m => err(m));
  if (!(dev.manufacturer >= 0 && dev.manufacturer <= 0xFFFF)) err(t('Herstellernummer muss zwischen 0x0000 und 0xFFFF liegen.'));
  if (!(dev.appNumber >= 0 && dev.appNumber <= 0xFFFF)) err(t('Applikationsnummer muss zwischen 0x0000 und 0xFFFF liegen.'));
  if (!(dev.appVersion >= 0 && dev.appVersion <= 0xFF)) err(t('Applikationsversion muss zwischen 0x00 und 0xFF liegen.'));
  if (!/^[0-9A-Fa-f]{1,4}$/.test(String(dev.hwSerial))) err(t('Hardware-Seriennummer: 1–4 Hex-Ziffern.'));
  if (!String(dev.orderNumber || '').trim()) err(t('Bestellnummer fehlt.'));

  const nodes = [];
  /* GPIOs gehören genau einem Block; ein Bus belegt seine Pins, sobald ein
     Block ihn nutzt (I²C-Sensor gegen Digitaleingang an PIO0_4) */
  const gpioOwner = new Map(), resOwner = new Map(), swUsers = new Map(), pins = [], busUses = [];
  const claim = (gpio, what, owner, n) => {
    const prev = gpioOwner.get(gpio);
    if (!prev) { gpioOwner.set(gpio, { what, owner, node: n }); return; }
    if (prev.owner !== owner)
      err(t('Pin {0} doppelt belegt: {1} und {2}.', `${what} (${gpio})`, prev.owner, owner), n);
  };
  const usedBuses = new Set();
  busPins(platform).filter(b => b.always && !b.shared).forEach(b => {
    if (!gpioOwner.has(b.gpio)) gpioOwner.set(b.gpio, { what: b.label, owner: t('{0}-Bus', B.BUS_NAMES[b.bus]) + ` (${b.label})` });
  });
  /* Schieberegister: Name eindeutig und als Pinname brauchbar, nur im Gerät */
  const srNames = new Map();
  flat.nodes.filter(n => B.get(n.type) && B.get(n.type).expander).forEach(n => {
    const name = n.props.name;
    if (n._flat) err(t('{0}: Schieberegister gehen nur außerhalb von Makros.', shown(n)), n);
    else if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(name)) err(t('{0}: Name „{1}“: Buchstabe, dann Buchstaben, Ziffern, _ oder - (höchstens 16 Zeichen).', shown(n), name), n);
    else if (srNames.has(name)) err(t('{0}: Name „{1}“ hat schon {2}.', shown(n), name, shown(srNames.get(name))), n);
    else if (platform && platform.pins.some(x => !x.ext && x.name.startsWith(name + '.'))) err(t('{0}: Name „{1}“ kollidiert mit einem Pin der Plattform.', shown(n), name), n);
    srNames.set(name, n);
  });
  flat.nodes.forEach(n => {
    const def = B.get(n.type);
    if (!def) { err(t('Unbekannter Blocktyp „{0}“.', n.type), n); return; }
    const lack = platform ? unavailable(def, platform, n) : '';
    const active = B.activeProps(def, n.props);
    if (lack) err(t('{0}: nicht verfügbar auf {1} ({2}).', shown(n), platform.name, lack), n);
    else [].concat(def.bus || []).forEach(b => usedBuses.add(b));
    active.filter(p => p.kind === 'pin').forEach(p => {
      const name = n.props[p.id];
      const pin = platform && platform.pins.find(x => x.name === name);
      if (!platform || lack) return;
      if (!pin) { err(t('{0}: Pin {1} gibt es auf {2} nicht.', shown(n), name, platform.name), n); return; }
      const ok = pinOptions(model, p);
      if (!ok.some(x => x.name === pin.name))
        err(t('{0}: {1} {2} geht hier nicht (möglich: {3}).', shown(n), t(p.label), name, ok.map(x => x.name).join(', ')), n);
      claim(pin.gpio, name, shown(n), n);
      const info = { adc: mcu && mcu.gpio[pin.gpio] ? mcu.gpio[pin.gpio].adc : undefined, pwm: B.pwmOf(mcu, pin.gpio) };
      /* Ein Match-Kanal kann auf zwei Pins liegen (XL: CT16B0_MAT0 an PIO0_8 und PIO3_0) */
      if (B.fnsOf(p).includes('pwm') && info.pwm) {
        const key = 'pwm:' + info.pwm.join('.');
        if (resOwner.has(key))
          err(t('{0} doppelt belegt: {1} und {2}.', t('PWM-Kanal {0}', `${info.pwm[0]} ${info.pwm[1].slice(-4)}`), shown(resOwner.get(key)), shown(n)), n);
        else resOwner.set(key, n);
        /* Timer für sich (NeoPixel): kein anderer Block darf ihn nutzen, auch nicht für PWM */
        const tm = info.pwm[0], own = resOwner.get('timer!' + tm), other = resOwner.get('timer:' + tm);
        if (own && own !== n || p.timer === 'exclusive' && other && other !== n)
          err(t('{0} doppelt belegt: {1} und {2}.', t('Timer {0}', tm), shown(own && own !== n ? own : other), shown(n)), n);
        if (p.timer === 'exclusive') resOwner.set('timer!' + tm, n);
        else if (!other) resOwner.set('timer:' + tm, n);
      }
      pins.push({ node: n, prop: p.id, name, gpio: pin.gpio, info, ext: pin.ext || null,
                  macro: `PIN_${n.id.toUpperCase()}_${p.id.toUpperCase()}` });
    });
    /* Timer ohne Pin (Software-PWM der Relais): teilen sich alle Blöcke mit
       swTimer, für PWM-Pins und NeoPixel ist er belegt */
    const sw = !lack && def.swTimer && def.swTimer(n);
    if (sw) {
      const own = resOwner.get('timer!' + sw), other = resOwner.get('timer:' + sw);
      const users = swUsers.get(sw) || [];
      const clash = own && !users.includes(own) ? own : other;
      if (clash) err(t('{0} doppelt belegt: {1} und {2}.', t('Timer {0}', sw), shown(clash), shown(n)), n);
      else if (users.length >= B.SW_PWM_MAX) err(t('{0}: höchstens {1} Blöcke mit Software-PWM je Timer ({2}).', shown(n), B.SW_PWM_MAX, sw), n);
      if (!own) resOwner.set('timer!' + sw, n);
      swUsers.set(sw, users.concat(n));
    }
    /* Bus-Eigenschaft: der Block hat den Bus für sich, belegt aber nur die
       verlangten Signale (NeoPixel: MOSI, SCK/MISO bleiben frei) */
    active.filter(p => p.kind === 'bus' && platform && !lack).forEach(p => {
      const b = n.props[p.id];
      const sig = platform.buses && platform.buses[b];
      if (!B.busesFor(platform, p).includes(b)) {
        err(t('{0}: {1} {2} ist auf {3} nicht angeschlossen.', shown(n), t(p.label), B.BUS_NAMES[b] || b, platform.name), n);
        return;
      }
      /* share: mehrere Schieberegister an einem SPI (eigener Latch je
         Baustein); wer den Bus für sich braucht (NeoPixel), duldet keinen */
      const excl = resOwner.get('bus:' + b), shared = resOwner.get('bus~' + b);
      const clash = excl || (!p.share && shared);
      if (clash) err(t('{0} doppelt belegt: {1} und {2}.', B.BUS_NAMES[b], shown(clash), shown(n)), n);
      else if (!p.share) resOwner.set('bus:' + b, n);
      else if (!shared) resOwner.set('bus~' + b, n);
      const use = { node: n, prop: p.id, bus: b, pins: {} };
      p.signals.forEach(x => {
        const label = `${B.BUS_NAMES[b]} ${x.toUpperCase()}`;
        const pin = platform.pins.find(q => q.gpio === sig[x]);
        /* SCK und MOSI teilen sich die Schieberegister, MISO treibt nur einer */
        const owner = p.share && x !== 'miso' ? t('{0}-Bus', B.BUS_NAMES[b]) : shown(n);
        claim(sig[x], pin ? `${pin.name}, ${label}` : label, owner, n);
        use.pins[x] = sig[x];
      });
      busUses.push(use);
    });
    /* Ganzzahl-Eigenschaft */
    active.filter(p => p.kind === 'int').forEach(p => {
      const v = Number(n.props[p.id]), max = B.maxOf(p, n);
      if (!Number.isInteger(v) || v < p.min || v > max)
        err(t('{0}: „{1}“ muss zwischen {2} und {3} liegen.', shown(n), t(p.label), p.min, max), n);
    });
    /* Weitere Betriebsmittel, die nur ein Block nutzen kann (z. B. I²C-Adresse) */
    /* Eigene Prüfungen des Blocks: [Meldung, [Teile …]] */
    (def.check ? def.check(n) : []).forEach(([msg, args]) =>
      err(`${shown(n)}: ${t(msg, ...(args || []).map(a => typeof a === 'number' ? a : t(a)))}`, n));
    B.resources(def, n).forEach(([key, text]) => {
      if (resOwner.has(key)) err(t('{0} doppelt belegt: {1} und {2}.', t(text), shown(resOwner.get(key)), shown(n)), n);
      else resOwner.set(key, n);
    });
    nodes.push({ node: n, def, title: title(n),
                 inputs: B.inputs(def, n), outputs: B.outputs(def, n),
                 params: B.params(def, n), kos: B.kos(def, n) });
  });
  busPins(platform).filter(b => !b.always && usedBuses.has(b.bus)).forEach(b => {
    const what = b.label;
    const owner = t('{0}-Bus', B.BUS_NAMES[b.bus]);
    const pin = platform.pins.find(x => x.gpio === b.gpio);
    const prev = gpioOwner.get(b.gpio);
    if (prev) err(t('Pin {0} doppelt belegt: {1} und {2}.', `${pin ? pin.name : what} (${b.gpio})`, prev.owner, `${owner} (${what})`), prev.node);
    else gpioOwner.set(b.gpio, { what, owner });
  });
  const byId = new Map(nodes.map(r => [r.node.id, r]));

  /* Verbindungen */
  const links = [];
  flat.links.forEach(l => {
    const a = byId.get(l.from[0]), b = byId.get(l.to[0]);
    const op = a && a.outputs.find(p => p.id === l.from[1]);
    const ip = b && b.inputs.find(p => p.id === l.to[1]);
    if (!op || !ip) { warn(t('Verbindung zu einem nicht vorhandenen Port wurde übergangen.')); return; }
    if (op.type !== ip.type)
      warn(op.type === 'num' ? t('{0} → {1}: Zahl wird als bool gelesen (≠ 0 = 1).', rt(a), rt(b)) : t('{0} → {1}: bool wird als Zahl 0/1 gelesen.', rt(a), rt(b)), b.node);
    links.push({ from: a, out: op, to: b, in: ip });
  });
  nodes.forEach(r => r.inputs.forEach(p => {
    if (!p.optional && !links.some(l => l.to === r && l.in.id === p.id)) warn(t('{0}: Eingang „{1}“ ist nicht verbunden.', rt(r), t(p.label)), r.node);
  }));

  /* Zyklen: Ausgänge rufen Eingänge direkt auf, ein Kreis liefe endlos. */
  const state = new Map();
  const succ = r => links.filter(l => l.from === r).map(l => l.to);
  const visit = r => {
    state.set(r, 1);
    for (const s of succ(r)) {
      if (state.get(s) === 1) { err(t('Zyklus im Graphen über {0}.', rt(s)), s.node); return true; }
      if (!state.has(s) && visit(s)) return true;
    }
    state.set(r, 2);
    return false;
  };
  for (const r of nodes) if (!state.has(r) && visit(r)) break;

  /* Parameter-Layout im Parametersegment, in Knotenreihenfolge */
  const params = [];
  let offset = 0;
  nodes.forEach(r => r.params.forEach(p => {
    const pt = B.PTYPE[p.type];
    let value = Number(r.node.params[p.id]);
    if (!Number.isFinite(value)) { err(t('{0}: „{1}“ ist keine Zahl.', rt(r), t(p.label)), r.node); value = p.def; }
    const min = p.min !== undefined ? p.min : pt.min, max = p.max !== undefined ? p.max : pt.max;
    if (p.type === 'enum') {
      if (!p.options.some(o => o[0] === value)) err(t('{0}: „{1}“ hat keinen gültigen Wert.', rt(r), t(p.label)), r.node);
    } else if (value < min || value > max) err(t('{0}: „{1}“ muss zwischen {2} und {3} liegen.', rt(r), t(p.label), min, max), r.node);
    const fixed = !!(r.node.fixed && r.node.fixed[p.id]);
    const entry = { r, def: p, value, fixed, size: pt.size, offset: -1,
                    name: `${r.node.id}_${p.id}` };
    if (!fixed) {
      if (pt.size >= 2 && offset % 2) offset++;   // 16- und 32-Bit-Werte gerade ausrichten
      entry.offset = offset; offset += pt.size;
    }
    params.push(entry);
  }));

  /* Sichtbarkeit in der ETS: Bedingungen auf ETS-Auswahlen (eigene und die
     der Makro-Instanzen darüber). Ist eine Auswahl fest in der Firmware,
     entscheidet ihr Wert schon hier: passt er nicht, fehlt der Block in der
     ETS ganz, sonst entfällt die Bedingung. */
  const optParam = new Map(params.filter(p => p.r.def.type === 'option').map(p => [p.r.node.id, p]));
  nodes.forEach(r => {
    const n = r.node;
    const list = n._when || (n.when && n.when.on ? [{ on: n.when.on, values: n.when.values || [] }] : []);
    r.cond = [];
    r.etsHidden = false;
    list.forEach(c => {
      const p = optParam.get(c.on);
      if (!p || p.r === r) { warn(t('{0}: Die Parameterauswahl für die Sichtbarkeit fehlt.', rt(r)), n); return; }
      if (!c.values.length) warn(t('{0}: Parameter nie sichtbar – kein Eintrag gewählt.', rt(r)), n);
      if (p.fixed) { if (!c.values.includes(p.value)) r.etsHidden = true; return; }
      r.cond.push({ param: p, values: c.values });
    });
  });
  /* Auswahlen, die über Bedingungen an sich selbst hängen */
  const condState = new Map();
  const condLoop = r => {
    condState.set(r, 1);
    for (const c of r.cond) {
      const o = c.param.r;
      if (condState.get(o) === 1) return o;
      if (!condState.has(o)) { const hit = condLoop(o); if (hit) return hit; }
    }
    condState.set(r, 2);
    return null;
  };
  for (const r of nodes) {
    if (condState.has(r)) continue;
    const hit = condLoop(r);
    if (hit) { err(t('{0}: Die Sichtbarkeit hängt im Kreis an sich selbst.', rt(hit)), hit.node); nodes.forEach(x => { x.cond = []; }); break; }
  }
  /* Statisch verborgen erbt sich: hängt ein Block an einer Auswahl, die in
     der ETS fehlt, fehlt auch er (ihr Wert bleibt der Vorgabewert) */
  let grew = true;
  while (grew) {
    grew = false;
    nodes.forEach(r => {
      if (!r.etsHidden && r.cond.some(c => c.param.r.etsHidden)) {
        const keep = r.cond.every(c => !c.param.r.etsHidden || c.values.includes(c.param.value));
        r.etsHidden = !keep ? true : r.etsHidden;
        r.cond = r.cond.filter(c => !c.param.r.etsHidden);
        grew = true;
      }
    });
  }

  /* KOs */
  const kos = [];
  nodes.forEach(r => r.kos.forEach(k => {
    const dpt = B.DPT[k.dpt];
    if (!dpt) { err(t('{0}: unbekannter DPT {1}.', rt(r), k.dpt), r.node); return; }
    const number = r.node.kos && r.node.kos[k.id];
    if (!Number.isInteger(number)) { err(t('{0}: KO ohne Nummer — Modell neu laden.', rt(r)), r.node); return; }
    if (!String(k.text || '').trim()) warn(t('{0}: KO ohne Namen.', rt(r)), r.node);
    /* In einer Makro-Instanz: deren Name vor dem KO-Namen (Kanal 1: Schalten) */
    if (r.node._prefix) k = Object.assign({}, k, { text: `${r.node._prefix}: ${k.text}` });
    kos.push({ r, def: k, dpt, number, macro: `KO_${r.node.id.toUpperCase()}_${k.id.toUpperCase()}` });
  }));
  const seen = new Map();
  kos.forEach(k => {
    if (seen.has(k.number)) err(t('KO-Nummer {0} doppelt vergeben.', k.number), k.r.node);
    seen.set(k.number, k);
  });
  kos.sort((a, b) => a.number - b.number);
  if (!nodes.length) warn(t('Der Graph ist leer.'));
  if (!kos.length && nodes.length) warn(t('Das Gerät hat kein Kommunikationsobjekt.'));

  const layout = mask ? memoryLayout(mask, kos, Math.max(offset, 1), err) : null;
  /* Gezeigter Graph: Blöcke wie im Modell, Makro-Instanzen als ein Block */
  const macroDef = B.get('macro');
  const shownNodes = model.nodes.map(n => byId.get(n.id) || (n.type === 'macro' ? {
    node: n, def: macroDef, title: title(n), macro: n._m || null,
    inputs: B.inputs(macroDef, n), outputs: B.outputs(macroDef, n), params: [], kos: []
  } : null)).filter(Boolean);
  const view = { nodes: shownNodes, byId: new Map(shownNodes.map(r => [r.node.id, r])) };
  return { model, device: dev, platform, mcu, mask, layout, nodes, byId, links, params, kos, pins, busUses,
           segmentSize: Math.max(offset, 1), errors, warnings, view };
}

/* Speicher im Gerät: KO-Tabelle und Parameter im EEPROM, RAM-Flags (ein
   Halbbyte je Objekt) und Objektwerte im RAM. Die Tabelle reicht bis zur
   höchsten Nummer; Lücken bekommen eigenen Platz, damit kein Zeiger ins
   Leere geht. */
function memoryLayout(mask, kos, paramSize, err) {
  const count = kos.length ? kos[kos.length - 1].number + 1 : 0;
  const comSize = 3 + 4 * count;
  if (count > 255) err(t('KO-Nummer {0}: höchstens 254 bei {1}.', count - 1, mask.name));
  if (mask.comTab.addr + comSize > mask.comTab.end)
    err(t('{0} Kommunikationsobjekte passen nicht in die KO-Tabelle.', count));
  if (mask.params.addr + paramSize > mask.params.end)
    err(t('Parameter belegen {0} Byte, Platz ist für {1}.', paramSize, mask.params.end - mask.params.addr));

  const flags = mask.ram.addr;
  let ram = flags + Math.max(1, Math.ceil(count / 2));
  const byNumber = new Map(kos.map(k => [k.number, k]));
  const objects = [];
  for (let n = 0; n < count; n++) {
    const k = byNumber.get(n);
    const size = k && B.OBJ_SIZE[k.dpt.size];
    if (k && !size) err(t('{0}: Objektgröße {1} nicht unterstützt.', shown(k.r.node), k.dpt.size), k.r.node);
    const o = { number: n, ko: k || null, ram, type: size ? size.type : 0 };
    ram += size ? size.bytes : 1;
    objects.push(o);
    if (k) k.ram = o.ram;
  }
  if (ram > mask.ram.end) err(t('Objektwerte belegen {0} Byte RAM, Platz ist für {1}.', ram - mask.ram.addr, mask.ram.end - mask.ram.addr));

  return {
    flags, objects,
    comTab: { addr: mask.comTab.addr, size: comSize, count },
    params: { addr: mask.params.addr, size: paramSize },
    ram: { addr: mask.ram.addr, size: ram - mask.ram.addr }
  };
}

/* ---------- Laden / Speichern ---------- */

function parse(text) {
  const m = JSON.parse(text);
  if (!m || m.format !== FORMAT) throw new Error('Keine SB-Studio-Datei (format fehlt).');
  const base = create();
  /* vor dem Auffüllen, sonst stünde schon die Vorgabe-Plattform da */
  if (m.device && m.device.mcu && !m.device.platform) m.device.platform = B.PLATFORM_OF_MCU[m.device.mcu] || m.device.mcu;
  m.device = Object.assign(base.device, m.device || {});
  m.nodes = Array.isArray(m.nodes) ? m.nodes : [];
  m.links = Array.isArray(m.links) ? m.links : [];
  m.platforms = Array.isArray(m.platforms) ? m.platforms : [];
  m.macros = Array.isArray(m.macros) ? m.macros : [];
  normalize(m);
  return m;
}

const serialize = model => JSON.stringify(model, null, 2);

return { FORMAT, create, addNode, removeNode, normalize, assignKos, resolve, parse, serialize, pinsOf,
         macroOf, macroView, createMacro, deleteMacro, macroUsers, addMacro, freeInstancePins, expand, collapse, explode,
         MACRO_FORMAT, packMacro, unpackMacro, sameMacro, helpNote,
         platformOf, pinPlatform, renameExpander, chipOf, pinOptions, busPins, fixedPins, checkPlatform, cleanBuses, unavailable, freePins };
})();
