/* ============================================================
   Gerätemodell und Resolver
   Der Resolver ist die einzige Stelle, die KO-Nummern und Parameter-
   Offsets festlegt — Firmware- und knxprod-Generator lesen nur sein
   Ergebnis.
   ============================================================ */
SBS.model = (function () {
'use strict';
const B = SBS.blocks;

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
      mcu: 'lpc1115',
      sblibPath: '../../software-arm-incubation/software-arm-lib'
    },
    nodes: [],
    links: []
  };
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
  /* Freien Pin vorschlagen, damit zwei neue Blöcke nicht kollidieren */
  (def.props || []).filter(p => p.kind === 'pin').forEach(p => {
    const used = new Set(model.nodes.flatMap(pinsOf));
    const pins = B.MCU[model.device.mcu].pins;
    if (used.has(node.props[p.id])) node.props[p.id] = pins.find(x => !used.has(x)) || node.props[p.id];
  });
  model.nodes.push(node);
  assignKos(model);
  return node;
}

function removeNode(model, id) {
  model.nodes = model.nodes.filter(n => n.id !== id);
  model.links = model.links.filter(l => l.from[0] !== id && l.to[0] !== id);
}

function pinsOf(node) {
  const def = B.get(node.type);
  return def ? (def.props || []).filter(p => p.kind === 'pin').map(p => node.props[p.id]) : [];
}

/* Nach einer Änderung von Eigenschaften: Werte neuer Parameter ergänzen,
   Verbindungen zu verschwundenen Ports entfernen. */
function normalize(model) {
  model.nodes.forEach(n => {
    const def = B.get(n.type);
    if (!def) return;
    n.props = n.props || {}; n.params = n.params || {}; n.fixed = n.fixed || {}; n.kos = n.kos || {};
    (def.props || []).forEach(p => { if (!(p.id in n.props)) n.props[p.id] = p.def; });
    B.params(def, n).forEach(p => { if (!(p.id in n.params)) n.params[p.id] = p.def; });
  });
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const has = (ref, dir) => {
    const n = byId.get(ref[0]); const def = n && B.get(n.type);
    return def && (dir === 'out' ? B.outputs(def, n) : B.inputs(def, n)).some(p => p.id === ref[1]);
  };
  model.links = model.links.filter(l => has(l.from, 'out') && has(l.to, 'in'));
  assignKos(model);
}

/* KO-Nummern sind stabil: einmal vergeben, bleiben sie am Knoten, damit
   Gruppenadressen in bestehenden Projekten stimmen. Neue bekommen die
   nächste freie Nummer ab der ersten der Maske (BIM112: 0). */
function maskOf(model) {
  const mcu = B.MCU[model.device.mcu];
  return mcu ? B.MASK[mcu.mask] : null;
}

function assignKos(model) {
  const mask = maskOf(model);
  const base = mask ? mask.koBase : 0;
  const used = new Set();
  const todo = [];
  model.nodes.forEach(n => {
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
  const mcu = B.MCU[dev.mcu];
  const mask = maskOf(model);
  const err = (msg, node) => errors.push({ msg, node: node && node.id });
  const warn = (msg, node) => warnings.push({ msg, node: node && node.id });
  const title = n => n.label || `${B.get(n.type) ? B.get(n.type).name : n.type} (${n.id})`;

  if (!mcu) err(`Unbekannte MCU „${dev.mcu}“.`);
  else if (!mask) err(`Unbekannte Maske „${mcu.mask}“.`);
  if (!(dev.manufacturer >= 0 && dev.manufacturer <= 0xFFFF)) err('Herstellernummer muss zwischen 0x0000 und 0xFFFF liegen.');
  if (!(dev.appNumber >= 0 && dev.appNumber <= 0xFFFF)) err('Applikationsnummer muss zwischen 0x0000 und 0xFFFF liegen.');
  if (!(dev.appVersion >= 0 && dev.appVersion <= 0xFF)) err('Applikationsversion muss zwischen 0x00 und 0xFF liegen.');
  if (!/^[0-9A-Fa-f]{1,4}$/.test(String(dev.hwSerial))) err('Hardware-Seriennummer: 1–4 Hex-Ziffern.');
  if (!String(dev.orderNumber || '').trim()) err('Bestellnummer fehlt.');

  const nodes = [];
  const pinOwner = new Map();
  model.nodes.forEach(n => {
    const def = B.get(n.type);
    if (!def) { err(`Unbekannter Blocktyp „${n.type}“.`, n); return; }
    if (def.mcu && mcu && !def.mcu.includes(dev.mcu)) err(`${title(n)}: nicht verfügbar für ${mcu.name}.`, n);
    pinsOf(n).forEach(pin => {
      if (mcu && !mcu.pins.includes(pin)) err(`${title(n)}: Pin ${pin} gibt es auf ${mcu.name} nicht.`, n);
      if (pinOwner.has(pin)) err(`Pin ${pin} doppelt belegt: ${title(pinOwner.get(pin))} und ${title(n)}.`, n);
      else pinOwner.set(pin, n);
    });
    nodes.push({ node: n, def, title: title(n),
                 inputs: B.inputs(def, n), outputs: B.outputs(def, n),
                 params: B.params(def, n), kos: B.kos(def, n) });
  });
  const byId = new Map(nodes.map(r => [r.node.id, r]));

  /* Verbindungen */
  const links = [];
  model.links.forEach(l => {
    const a = byId.get(l.from[0]), b = byId.get(l.to[0]);
    const op = a && a.outputs.find(p => p.id === l.from[1]);
    const ip = b && b.inputs.find(p => p.id === l.to[1]);
    if (!op || !ip) { warn('Verbindung zu einem nicht vorhandenen Port wurde übergangen.'); return; }
    if (op.type !== ip.type)
      warn(`${a.title} → ${b.title}: ${op.type === 'num' ? 'Zahl wird als bool gelesen (≠ 0 = 1)' : 'bool wird als Zahl 0/1 gelesen'}.`, b.node);
    links.push({ from: a, out: op, to: b, in: ip });
  });
  nodes.forEach(r => r.inputs.forEach(p => {
    if (!links.some(l => l.to === r && l.in.id === p.id)) warn(`${r.title}: Eingang „${p.label}“ ist nicht verbunden.`, r.node);
  }));

  /* Zyklen: Ausgänge rufen Eingänge direkt auf, ein Kreis liefe endlos. */
  const state = new Map();
  const succ = r => links.filter(l => l.from === r).map(l => l.to);
  const visit = r => {
    state.set(r, 1);
    for (const s of succ(r)) {
      if (state.get(s) === 1) { err(`Zyklus im Graphen über ${s.title}.`, s.node); return true; }
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
    const t = B.PTYPE[p.type];
    let value = Number(r.node.params[p.id]);
    if (!Number.isFinite(value)) { err(`${r.title}: „${p.label}“ ist keine Zahl.`, r.node); value = p.def; }
    const min = p.min !== undefined ? p.min : t.min, max = p.max !== undefined ? p.max : t.max;
    if (p.type === 'enum') {
      if (!p.options.some(o => o[0] === value)) err(`${r.title}: „${p.label}“ hat keinen gültigen Wert.`, r.node);
    } else if (value < min || value > max) err(`${r.title}: „${p.label}“ muss zwischen ${min} und ${max} liegen.`, r.node);
    const fixed = !!(r.node.fixed && r.node.fixed[p.id]);
    const entry = { r, def: p, value, fixed, size: t.size, offset: -1,
                    name: `${r.node.id}_${p.id}` };
    if (!fixed) {
      if (t.size === 2 && offset % 2) offset++;   // 16-Bit-Werte gerade ausrichten
      entry.offset = offset; offset += t.size;
    }
    params.push(entry);
  }));

  /* KOs */
  const kos = [];
  nodes.forEach(r => r.kos.forEach(k => {
    const dpt = B.DPT[k.dpt];
    if (!dpt) { err(`${r.title}: unbekannter DPT ${k.dpt}.`, r.node); return; }
    const number = r.node.kos && r.node.kos[k.id];
    if (!Number.isInteger(number)) { err(`${r.title}: KO ohne Nummer — Modell neu laden.`, r.node); return; }
    if (!String(k.text || '').trim()) warn(`${r.title}: KO ohne Namen.`, r.node);
    kos.push({ r, def: k, dpt, number, macro: `KO_${r.node.id.toUpperCase()}_${k.id.toUpperCase()}` });
  }));
  const seen = new Map();
  kos.forEach(k => {
    if (seen.has(k.number)) err(`KO-Nummer ${k.number} doppelt vergeben.`, k.r.node);
    seen.set(k.number, k);
  });
  kos.sort((a, b) => a.number - b.number);
  if (!nodes.length) warn('Der Graph ist leer.');
  if (!kos.length && nodes.length) warn('Das Gerät hat kein Kommunikationsobjekt.');

  const layout = mask ? memoryLayout(mask, kos, Math.max(offset, 1), err) : null;
  return { model, device: dev, mcu, mask, layout, nodes, byId, links, params, kos,
           segmentSize: Math.max(offset, 1), errors, warnings };
}

/* Speicher im Gerät: KO-Tabelle und Parameter im EEPROM, RAM-Flags (ein
   Halbbyte je Objekt) und Objektwerte im RAM. Die Tabelle reicht bis zur
   höchsten Nummer; Lücken bekommen eigenen Platz, damit kein Zeiger ins
   Leere geht. */
function memoryLayout(mask, kos, paramSize, err) {
  const count = kos.length ? kos[kos.length - 1].number + 1 : 0;
  const comSize = 3 + 4 * count;
  if (count > 255) err(`KO-Nummer ${count - 1}: höchstens 254 bei ${mask.name}.`);
  if (mask.comTab.addr + comSize > mask.comTab.end)
    err(`${count} Kommunikationsobjekte passen nicht in die KO-Tabelle.`);
  if (mask.params.addr + paramSize > mask.params.end)
    err(`Parameter belegen ${paramSize} Byte, Platz ist für ${mask.params.end - mask.params.addr}.`);

  const flags = mask.ram.addr;
  let ram = flags + Math.max(1, Math.ceil(count / 2));
  const byNumber = new Map(kos.map(k => [k.number, k]));
  const objects = [];
  for (let n = 0; n < count; n++) {
    const k = byNumber.get(n);
    const size = k && B.OBJ_SIZE[k.dpt.size];
    if (k && !size) err(`${k.r.title}: Objektgröße ${k.dpt.size} nicht unterstützt.`, k.r.node);
    const o = { number: n, ko: k || null, ram, type: size ? size.type : 0 };
    ram += size ? size.bytes : 1;
    objects.push(o);
    if (k) k.ram = o.ram;
  }
  if (ram > mask.ram.end) err(`Objektwerte belegen ${ram - mask.ram.addr} Byte RAM, Platz ist für ${mask.ram.end - mask.ram.addr}.`);

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
  m.device = Object.assign(base.device, m.device || {});
  m.nodes = Array.isArray(m.nodes) ? m.nodes : [];
  m.links = Array.isArray(m.links) ? m.links : [];
  normalize(m);
  return m;
}

const serialize = model => JSON.stringify(model, null, 2);

return { FORMAT, create, addNode, removeNode, normalize, assignKos, resolve, parse, serialize, pinsOf };
})();
