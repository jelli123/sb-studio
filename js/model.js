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
    nodes: [],
    links: []
  };
}

/* ---------- Hardware-Plattform ---------- */

/* Vordefiniert (blocks.js) oder eigene aus dem Modell */
function platformOf(model) {
  const id = model.device.platform;
  const p = B.PLATFORMS[id] || (model.platforms || []).find(x => x.id === id);
  return p ? Object.assign({ id }, p) : null;
}
const chipOf = platform => platform ? B.CHIP[platform.chip] || null : null;

/* Pins der Plattform, an denen eine Pin-Eigenschaft eines Blocks gehen kann */
const pinOptions = (model, p) => B.pinsFor(platformOf(model), p);

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
  /* Ansteuerung umschalten, wenn die gewählte hier nicht geht (NeoPixel: SPI ↔ Timer) */
  const sw = B.feasible(def, platformOf(model), node.props);
  if (sw) node.props[sw[0]] = sw[1];
  B.activeProps(def, node.props).filter(p => p.kind === 'pin').forEach(p => {
    const used = new Set(model.nodes.filter(o => o !== node).flatMap(pinsOf));
    const names = pinOptions(model, p).map(x => x.name);
    const ok = x => names.includes(x) && !used.has(x);
    if (!ok(node.props[p.id])) node.props[p.id] = [p.def].concat(names).find(ok) || names[0] || node.props[p.id];
  });
  /* Bus-Eigenschaft: angeschlossener Bus, möglichst einer, den noch kein Block nutzt */
  B.activeProps(def, node.props).filter(p => p.kind === 'bus').forEach(p => {
    const ok = B.busesFor(platformOf(model), p);
    const used = new Set(model.nodes.filter(o => o !== node).flatMap(o =>
      B.activeProps(B.get(o.type), o.props).filter(q => q.kind === 'bus').map(q => o.props[q.id])));
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

/* Ältere Modelle: device.mcu statt Plattform, Pins als sblib-Makro
   (PIN_IO1 statt IO1) */
function migrate(model) {
  const dev = model.device;
  if (!Array.isArray(model.platforms)) model.platforms = [];
  if (!dev.platform && dev.mcu) dev.platform = B.PLATFORM_OF_MCU[dev.mcu] || dev.mcu;
  delete dev.mcu;
  /* eigene Plattformen von vor dem KNX-Bus als Busangabe */
  model.platforms.forEach(p => {
    const chip = B.CHIP[p.chip];
    p.buses = p.buses || {};
    if (chip && !p.buses.knx) p.buses.knx = Object.assign({}, chip.knx);
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
  const platform = platformOf(model);
  const mcu = chipOf(platform);
  const mask = maskOf(model);
  const err = (msg, node) => errors.push({ msg, node: node && node.id });
  const warn = (msg, node) => warnings.push({ msg, node: node && node.id });
  const title = n => n.label || `${B.get(n.type) ? B.get(n.type).name : n.type} (${n.id})`;
  /* title bleibt deutsch, es steht auch in den Kommentaren des erzeugten
     Codes; Meldungen nennen den Knoten mit shown() */
  const rt = r => shown(r.node);

  if (!platform) err(t('Unbekannte Hardware-Plattform „{0}“.', dev.platform));
  else if (!mcu) err(t('Plattform {0}: unbekannter Chip „{1}“.', platform.name, platform.chip));
  else if (!mask) err(t('Unbekannte Maske „{0}“.', mcu.mask));
  if (platform && mcu && !platform.builtin) checkPlatform(platform).forEach(m => err(m));
  if (!(dev.manufacturer >= 0 && dev.manufacturer <= 0xFFFF)) err(t('Herstellernummer muss zwischen 0x0000 und 0xFFFF liegen.'));
  if (!(dev.appNumber >= 0 && dev.appNumber <= 0xFFFF)) err(t('Applikationsnummer muss zwischen 0x0000 und 0xFFFF liegen.'));
  if (!(dev.appVersion >= 0 && dev.appVersion <= 0xFF)) err(t('Applikationsversion muss zwischen 0x00 und 0xFF liegen.'));
  if (!/^[0-9A-Fa-f]{1,4}$/.test(String(dev.hwSerial))) err(t('Hardware-Seriennummer: 1–4 Hex-Ziffern.'));
  if (!String(dev.orderNumber || '').trim()) err(t('Bestellnummer fehlt.'));

  const nodes = [];
  /* GPIOs gehören genau einem Block; ein Bus belegt seine Pins, sobald ein
     Block ihn nutzt (I²C-Sensor gegen Digitaleingang an PIO0_4) */
  const gpioOwner = new Map(), resOwner = new Map(), pins = [], busUses = [];
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
  model.nodes.forEach(n => {
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
      if (!ok.includes(pin))
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
      pins.push({ node: n, prop: p.id, name, gpio: pin.gpio, info,
                  macro: `PIN_${n.id.toUpperCase()}_${p.id.toUpperCase()}` });
    });
    /* Bus-Eigenschaft: der Block hat den Bus für sich, belegt aber nur die
       verlangten Signale (NeoPixel: MOSI, SCK/MISO/SSEL bleiben frei) */
    active.filter(p => p.kind === 'bus' && platform && !lack).forEach(p => {
      const b = n.props[p.id];
      const sig = platform.buses && platform.buses[b];
      if (!B.busesFor(platform, p).includes(b)) {
        err(t('{0}: {1} {2} ist auf {3} nicht angeschlossen.', shown(n), t(p.label), B.BUS_NAMES[b] || b, platform.name), n);
        return;
      }
      if (resOwner.has('bus:' + b)) err(t('{0} doppelt belegt: {1} und {2}.', B.BUS_NAMES[b], shown(resOwner.get('bus:' + b)), shown(n)), n);
      else resOwner.set('bus:' + b, n);
      const use = { node: n, prop: p.id, bus: b, pins: {} };
      p.signals.forEach(x => {
        const label = `${B.BUS_NAMES[b]} ${x.toUpperCase()}`;
        const pin = platform.pins.find(q => q.gpio === sig[x]);
        claim(sig[x], pin ? `${pin.name}, ${label}` : label, shown(n), n);
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
  model.links.forEach(l => {
    const a = byId.get(l.from[0]), b = byId.get(l.to[0]);
    const op = a && a.outputs.find(p => p.id === l.from[1]);
    const ip = b && b.inputs.find(p => p.id === l.to[1]);
    if (!op || !ip) { warn(t('Verbindung zu einem nicht vorhandenen Port wurde übergangen.')); return; }
    if (op.type !== ip.type)
      warn(op.type === 'num' ? t('{0} → {1}: Zahl wird als bool gelesen (≠ 0 = 1).', rt(a), rt(b)) : t('{0} → {1}: bool wird als Zahl 0/1 gelesen.', rt(a), rt(b)), b.node);
    links.push({ from: a, out: op, to: b, in: ip });
  });
  nodes.forEach(r => r.inputs.forEach(p => {
    if (!links.some(l => l.to === r && l.in.id === p.id)) warn(t('{0}: Eingang „{1}“ ist nicht verbunden.', rt(r), t(p.label)), r.node);
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
    const t = B.PTYPE[p.type];
    let value = Number(r.node.params[p.id]);
    if (!Number.isFinite(value)) { err(t('{0}: „{1}“ ist keine Zahl.', rt(r), t(p.label)), r.node); value = p.def; }
    const min = p.min !== undefined ? p.min : t.min, max = p.max !== undefined ? p.max : t.max;
    if (p.type === 'enum') {
      if (!p.options.some(o => o[0] === value)) err(t('{0}: „{1}“ hat keinen gültigen Wert.', rt(r), t(p.label)), r.node);
    } else if (value < min || value > max) err(t('{0}: „{1}“ muss zwischen {2} und {3} liegen.', rt(r), t(p.label), min, max), r.node);
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
    if (!dpt) { err(t('{0}: unbekannter DPT {1}.', rt(r), k.dpt), r.node); return; }
    const number = r.node.kos && r.node.kos[k.id];
    if (!Number.isInteger(number)) { err(t('{0}: KO ohne Nummer — Modell neu laden.', rt(r)), r.node); return; }
    if (!String(k.text || '').trim()) warn(t('{0}: KO ohne Namen.', rt(r)), r.node);
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
  return { model, device: dev, platform, mcu, mask, layout, nodes, byId, links, params, kos, pins, busUses,
           segmentSize: Math.max(offset, 1), errors, warnings };
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
  normalize(m);
  return m;
}

const serialize = model => JSON.stringify(model, null, 2);

return { FORMAT, create, addNode, removeNode, normalize, assignKos, resolve, parse, serialize, pinsOf,
         platformOf, chipOf, pinOptions, busPins, fixedPins, checkPlatform, unavailable, freePins };
})();
