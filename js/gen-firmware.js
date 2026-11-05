/* ============================================================
   Firmware-Generator: sblib-Applikation für LPC1115 / BIM112
   Ergebnis ist ein CMake-Projekt mit build.sh und build.cmd.
   ============================================================ */
SBS.firmware = (function () {
'use strict';

const indent = (code, n = 1) => code.split('\n').map(l => l ? '    '.repeat(n) + l : l).join('\n');
const hex = (v, w) => '0x' + Number(v).toString(16).toUpperCase().padStart(w, '0');
const cstr = s => '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?') + '"';
/* Zusammengesetzte Texte ([Vorlage, Teile …], siehe i18n) deutsch ausschreiben;
   { raw } ist Text des Nutzers (Port eines Makros) */
const text = s => Array.isArray(s) ? String(s[0]).replace(/\{(\d+)\}/g, (m, i) => text(s[+i + 1]))
  : s && typeof s === 'object' && 'raw' in s ? String(s.raw) : String(s);
const comment = s => text(s).replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');

/* Projektname für Dateien und CMake: nur ASCII, keine Leerzeichen */
function slug(name) {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'sb-studio-device';
}

/* Zusatzinfos der Blöcke (c.trace): ein Debug-Block mit „Zusatzinfos“
   nimmt sie auf (der erste, wenn es mehrere gibt). Ohne ihn erzeugt
   c.trace nichts; mit Filter nur für Blöcke, deren Name passt. */
const asciiTitle = s => comment(s).replace(/[^\x20-\x7e]/g, c => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' })[c] || '?');
function traceSink(res) {
  if (!('_traceSink' in res))
    res._traceSink = res.nodes.find(r => r.def.type === 'debug' && r.node.props.trace && r.node.props.trace !== 'off') || null;
  return res._traceSink;
}
function traced(res, r) {
  const t = traceSink(res);
  if (!t || r === t) return false;
  if (t.node.props.trace !== 'filter') return true;
  const words = String(t.node.props.traceFilter || '').split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const title = String(r.title).toLowerCase();
  return !words.length || words.some(w => title.includes(w));
}
/* Bedingung als C-Ausdruck: jede Auswahl hat einen der Werte (pe: Parameter → Ausdruck) */
const guardExpr = (list, pe) => (list || []).map(c => `(${c.values.map(v => `${pe(c.param)} == ${v}`).join(' || ')})`).join(' && ');
const traceLine = (who, what, expr) => `#ifdef SBS_TRACE\nsbsTrace(${who}, ${cstr(asciiTitle(what))}, (int32_t) (${expr}));\n#endif`;

/* Kontext, über den ein Block seinen Code erzeugt (siehe blocks.js) */
/* ---------- Werte schmal speichern ----------
   Ein bool-Ausgang liefert nur 0/1 – außer bei durchreichenden Blöcken
   (Eigenschaft vtype: Tor, Auswahl, Speicher, Makro-Ports …), an deren
   bool-Eingängen eine Zahl oder ein solcher unsicherer Ausgang hängt (das
   Modell erlaubt Zahl → bool mit Hinweis). Liefern alle Quellen eines
   Eingangs nur 0/1, darf ein Block den Wert als bool speichern.
   Über alle Instanzen eines Makros gleich entschieden, sonst wiche der
   gemeinsame Code ab. */
function boolSources(res) {
  if (res._boolSources) return res._boolSources;
  const into = new Map();
  res.links.forEach(l => { if (!into.has(l.to)) into.set(l.to, []); into.get(l.to).push(l); });
  const dirty = new Set();
  const clean = l => l.out.type === 'bool' && !dirty.has(l.from);
  for (let changed = true; changed; ) {
    changed = false;
    res.nodes.forEach(r => {
      if (dirty.has(r) || r.node.props.vtype === undefined) return;
      if ((into.get(r) || []).some(l => l.in.type === 'bool' && !clean(l))) { dirty.add(r); changed = true; }
    });
  }
  /* gleicher Knoten in allen Instanzen derselben Makros */
  const key = r => {
    const p = r.node._path;
    return p && p.length ? p.map(x => x.macro).join('/') + ':' + r.node.id.slice(p[p.length - 1].id.length + 1) : r.node.id;
  };
  const local = (r, port) => (into.get(r) || []).filter(l => l.in.id === port).every(clean);
  const byKey = new Map();
  res.nodes.forEach(r => { const k = key(r); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); });
  const boolIn = (r, ports) => byKey.get(key(r)).every(x => ports.every(p => local(x, p)));
  return (res._boolSources = { boolIn });
}

/* C-Typ für den letzten Wert eines KO nach seinem DPT (Vergleich mit
   (Typ) v – so, wie der Wert auf dem Bus steht) */
function dptStore(dpt) {
  if (!dpt || dpt.float || dpt.float4 || dpt.text) return 'int32_t';
  if (dpt.type === 'bool') return null;          // je nach Quellen bool
  if (/Bit$/.test(dpt.size)) return 'uint8_t';
  if (dpt.size === '1 Byte') return dpt.signed ? 'int8_t' : 'uint8_t';
  if (dpt.size === '2 Bytes') return dpt.signed ? 'int16_t' : 'uint16_t';
  return 'int32_t';
}

function context(res, r) {
  const id = r.node.id;
  const ko = koId => {
    const k = res.kos.find(x => x.r === r && x.def.id === koId);
    if (!k) throw new Error(`${r.title}: KO ${koId} fehlt.`);
    return k;
  };
  return {
    id,
    /* Name des Blocks, wie im Editor (für Texte im Code, z. B. Debug) */
    title: asciiTitle(r.title),
    /* Zusatzinfo „Zeit Block: was = Wert“ (nur im Debug-Build) */
    trace: (what, expr) => traced(res, r) ? traceLine(cstr(asciiTitle(r.title)), what, expr) : '',
    /* Blockname als C-Ausdruck für sbsTrace(), null ohne Zusatzinfos */
    traceWho: () => traced(res, r) ? cstr(asciiTitle(r.title)) : null,
    /* ein Debug-Block nimmt Zusatzinfos auf (für Hilfsfunktionen aller Blöcke) */
    traceOn: !!traceSink(res),
    /* dieser Debug-Block nimmt die Zusatzinfos auf */
    traceSink: traceSink(res) === r,
    v: name => `${id}_${name}`,
    prop: pid => r.node.props[pid],
    /* C-Typ, um Werte der Eingänge zu speichern: bool, wenn alle Quellen
       nur 0/1 liefern (siehe boolSources), sonst int32_t */
    store: (...ports) => ports.every(p => (r.inputs.find(x => x.id === p) || {}).type === 'bool') &&
      boolSources(res).boolIn(r, ports) ? 'bool' : 'int32_t',
    /* C-Typ für den letzten Wert eines KO (DPT-Breite) */
    koStore: (koId, port) => {
      const k = res.kos.find(x => x.r === r && x.def.id === koId);
      const t = dptStore(k && k.dpt);
      return t || (boolSources(res).boolIn(r, [port]) ? 'bool' : 'int32_t');
    },
    /* Teilt sich der Block einen Pin mit Blöcken, die eine Parameterauswahl
       ausschließt: Bedingung (C), unter der er arbeitet; sonst '' */
    pinGuard: () => r.pinShared ? activeFlat(r) : '',
    /* Pin-Eigenschaft: Makro aus app_config.h und was der GPIO kann. Nur für
       Pins des Chips (native); allgemein gehen output/input/write/read, die
       auch Pins eines Schieberegisters bedienen. */
    pin: pid => {
      const p = pinOf(res, r, pid);
      if (p.ext) throw new Error(`${r.title}: ${p.name} ist ein Schieberegister-Pin.`);
      return p.macro;
    },
    gpio: pid => pinOf(res, r, pid).info,
    output: (pid, level) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_write(${p.ext.bit}, ${level}); // ${p.name}`
        : `pinMode(${p.macro}, OUTPUT);\ndigitalWrite(${p.macro}, ${level});`;
    },
    input: (pid, pullup) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `// ${p.name}: liest der Schieberegister-Block` : `pinMode(${p.macro}, INPUT${pullup ? ' | PULL_UP' : ''});`;
    },
    write: (pid, expr) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_write(${p.ext.bit}, ${expr});` : `digitalWrite(${p.macro}, ${expr});`;
    },
    read: pid => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_read(${p.ext.bit})` : `digitalRead(${p.macro})`;
    },
    /* Bus-Eigenschaft: GPIO eines Signals (z. B. MOSI des gewählten SPI) */
    busPin: (pid, signal) => {
      const u = res.busUses.find(x => x.node === r.node && x.prop === pid);
      if (!u || !u.pins[signal]) throw new Error(`${r.title}: ${pid} ${signal} fehlt.`);
      return u.pins[signal];
    },
    param: pid => {
      const p = res.params.find(x => x.r === r && x.def.id === pid);
      if (!p) throw new Error(`${r.title}: Parameter ${pid} fehlt.`);
      return p.fixed ? String(p.value) : `${id}_p_${pid}`;
    },
    ko: koId => ko(koId).macro,
    persist: () => String(persistSlot(res, r)),
    koRead: koId => {
      const k = ko(koId), raw = `bcu.comObjects->objectRead(${k.macro})`;
      if (k.dpt.float) return `dpt9ToFloat(${raw})`;
      if (k.dpt.float4) return `dpt14ToHundredths(${raw})`;
      return `(int32_t) ${k.dpt.signed ? `(${SIGNED[k.dpt.signed]}) ` : ''}${raw}`;
    },
    koWrite: (koId, expr) => {
      const k = ko(koId);
      return onlyActive(res, k, activeFlat(r),
        k.dpt.float ? `bcu.comObjects->objectWriteFloat(${k.macro}, ${expr});`
        : k.dpt.float4 ? `bcu.comObjects->objectWrite(${k.macro}, dpt14FromHundredths(${expr}));`
        : `bcu.comObjects->objectWrite(${k.macro}, (unsigned int) (${expr}));`);
    },
    /* Unverbundener Ausgang: Wert verwerfen, damit keine unbenutzte
       Variable übrig bleibt */
    linked: port => res.links.some(l => l.to === r && l.in.id === port),
    emit: (port, expr) => res.links
      .filter(l => l.from === r && l.out.id === port)
      .map(l => `${inputFn(l.to, l.in.id)}(${expr});`).join(' ') || `(void) (${expr});`
  };
}

/* Bedingung, unter der ein Block gilt (Parameterauswahlen), als C-Ausdruck */
const activeFlat = r => guardExpr(r.guard, p => p.fixed ? String(p.value) : `${p.r.node.id}_p_${p.def.id}`);
/* Teilen sich KOs eine Nummer (Varianten je Parameterauswahl), schreibt nur
   das, dessen Auswahl gilt – sonst sendeten abgewählte Funktionen mit */
const onlyActive = (res, k, cond, code) =>
  cond && res.kos.some(o => o !== k && o.number === k.number) ? `if (${cond}) ${code}` : code;

function pinOf(res, r, pid) {
  const p = res.pins.find(x => x.node === r.node && x.prop === pid);
  if (!p) throw new Error(`${r.title}: Pin ${pid} fehlt.`);
  return p;
}

const SIGNED = { 1: 'int8_t', 2: 'int16_t', 4: 'int32_t' };

/* Dauerhafter Speicher: Platz je Block in Reihenfolge der Knoten; die vier
   Flash-Seiten (1 KB) gehen dem Code ab */
const persistNodes = res => res.nodes.filter(r => r.def.persist);
const persistSlot = (res, r) => persistNodes(res).indexOf(r);
const PERSIST_BYTES = 0x400;
const codeEnd = res => res.mcu.flashEnd - (persistNodes(res).length ? PERSIST_BYTES : 0);
/* DPT 14 (IEEE 754, 4 Byte) ↔ Hundertstel wie bei DPT 9 */
const DPT14_LIB =
  '/* DPT 14: 4-Byte-Gleitkomma ↔ Hundertstel (wie dpt9ToFloat() der sblib) */\n' +
  'static unsigned int dpt14FromHundredths(int32_t v)\n' +
  '{\n' +
  '    float f = v / 100.0f;\n' +
  '    uint32_t u;\n' +
  '    memcpy(&u, &f, sizeof(u));\n' +
  '    return u;\n' +
  '}\n\n' +
  'static int32_t dpt14ToHundredths(uint32_t u)\n' +
  '{\n' +
  '    float f;\n' +
  '    memcpy(&f, &u, sizeof(f));\n' +
  '    f *= 100.0f;\n' +
  '    if (f > 2147483520.0f) return INT32_MAX;\n' +
  '    if (f < -2147483520.0f) return INT32_MIN;\n' +
  '    return (int32_t) (f < 0 ? f - 0.5f : f + 0.5f);\n' +
  '}';
const inputFn = (r, port) => `${r.node.id}_in_${port}`;

/* ---------- Gemeinsamer Code je Makro ----------
   Hat ein Makro mehrere Instanzen, steht sein Code nur einmal im Flash: eine
   Struktur S_<Makro> mit dem Zustand aller Blöcke als Felder und ihren
   Funktionen als Methoden, dazu ein Feld S_<Makro>_i[] mit einem Eintrag je
   Instanz. Was je Instanz anders ist (KO-Nummer, Pin, fester Parameterwert),
   steht in Tabellen, die über idx gelesen werden; KNX-Parameter lädt jede
   Instanz in eigene Felder. Verbindungen nach außen laufen über _out_-Methoden
   (switch auf idx), von außen hinein über kleine Funktionen mit dem Namen,
   den der Eingang ohne Teilen hätte.
   Weicht der erzeugte Code zweier Instanzen trotzdem ab (z. B. GPIO und
   Schieberegister gemischt) oder passt der Zustand nicht in eine Struktur
   (Namensraum, Konstruktor mit Argumenten), bleibt das Makro flach. */

/* Zustand als Felder: oberste Ebene ohne static; null, wenn es nicht geht */
function members(code) {
  let depth = 0;
  const out = [];
  for (const line of code.split('\n')) {
    let l = line;
    if (depth === 0 && l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)) {
      if (/^\s*(namespace|extern|using|typedef|#)\b/.test(l)) return null;
      l = l.replace(/^(\s*(?:\[\[maybe_unused\]\]\s*)?)static\s+/, '$1');
      if (/^\s*(const|constexpr|static)\b/.test(l)) return null;
      /* Objekt mit Konstruktor-Argumenten (oder Prototyp): als Feld so nicht möglich */
      if (/^\s*[\w:<>]+\s+\w+\s*\([^)]*\)\s*;/.test(l)) return null;
    }
    const bare = l.replace(/\/\/.*$/, '').replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, '');
    for (const ch of bare) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    out.push(l);
  }
  return depth === 0 ? out.join('\n') : null;
}

function cName(s) { return String(s).replace(/[^A-Za-z0-9_]/g, '_'); }

function shareMacros(res, genFlat) {
  const B = SBS.blocks;
  const assigned = new Map();       // r → { g, j, local }
  const groups = [];
  const linksFrom = new Map();
  res.links.forEach(l => { if (!linksFrom.has(l.from)) linksFrom.set(l.from, []); linksFrom.get(l.from).push(l); });

  for (let depth = 0; ; depth++) {
    const level = res.nodes.filter(r => !assigned.has(r) && r.node._path && r.node._path.length > depth);
    if (!level.length) break;
    const byMacro = new Map();
    level.forEach(r => {
      const p = r.node._path[depth];
      if (!byMacro.has(p.macro)) byMacro.set(p.macro, new Map());
      const insts = byMacro.get(p.macro);
      if (!insts.has(p.id)) insts.set(p.id, []);
      insts.get(p.id).push(r);
    });
    byMacro.forEach((insts, macro) => {
      if (insts.size < 2) return;
      const g = tryGroup(res, macro, [...insts], assigned, linksFrom, genFlat, groups.length);
      if (g) groups.push(g);
    });
  }
  return { groups, assigned };

  function tryGroup(res, macro, insts, assigned, linksFrom, genFlat, n) {
    const m = (res.model.macros || []).find(x => x.id === macro);
    const G = `S${n}_${cName(m ? m.name : macro).slice(0, 24)}`;
    const N = insts.length;
    const local = r => 'm_' + r.node.id.slice(r.node._path.find(p => insts.some(([id]) => id === p.id)).id.length + 1);
    /* gleiche Knoten in jeder Instanz */
    const rows = insts.map(([id, rs]) => new Map(rs.map(r => [r.node.id.slice(id.length + 1), r])));
    const keys = [...rows[0].keys()];
    if (rows.some(row => row.size !== keys.length || keys.some(k => !row.has(k) || row.get(k).def !== rows[0].get(k).def))) return null;
    const inst = new Map();       // r → j
    rows.forEach((row, j) => row.forEach(r => inst.set(r, j)));
    const mine = r => inst.has(r);

    /* Tabellen: Name → { type, values[] } */
    const tables = new Map();
    const table = (name, type, j, value) => {
      const tn = `${G}_${name}`;
      if (!tables.has(tn)) tables.set(tn, { type, values: [] });
      tables.get(tn).values[j] = value;
      return `${tn}[idx]`;
    };
    /* KNX-Parameter: je Knoten und Parameter über alle Instanzen entscheiden */
    const pinfo = new Map();
    res.params.forEach(p => {
      if (!mine(p.r)) return;
      const key = `${local(p.r)}_p_${p.def.id}`;
      if (!pinfo.has(key)) pinfo.set(key, []);
      pinfo.get(key)[inst.get(p.r)] = p;
    });
    const paramMode = new Map();
    for (const [key, ps] of pinfo) {
      if (ps.length !== N || ps.includes(undefined)) return null;
      if (ps.every(p => p.fixed)) paramMode.set(key, ps.every(p => p.value === ps[0].value) ? 'literal' : 'table');
      else if (ps.every(p => !p.fixed)) paramMode.set(key, 'member');
      else return null;
    }
    /* Ausgänge mit Zielen außerhalb der eigenen Instanz */
    const outs = new Map();       // `${local}_out_${port}` → [targets je Instanz]
    const trampolines = new Map(); // Name → Aufruf
    res.nodes.forEach(r => {
      if (!mine(r)) return;
      (linksFrom.get(r) || []).forEach(l => {
        if (mine(l.to) && inst.get(l.to) === inst.get(r)) return;
        const key = `${local(r)}_out_${l.out.id}`;
        if (!outs.has(key)) outs.set(key, insts.map(() => []));
        outs.get(key)[inst.get(r)].push(inputFn(l.to, l.in.id));
      });
    });

    const ctxOf = (r, j) => {
      const id = local(r);
      /* Bedingung, unter der der Block gilt: Auswahlen derselben Instanz oder
         außerhalb (über eine Zeigertabelle je Instanz); sonst bleibt das
         Makro flach */
      const active = () => guardExpr(r.guard, p => {
        if (p.fixed) return String(p.value);
        if (mine(p.r)) {
          if (inst.get(p.r) !== j) throw new Error('guard');
          return paramOf(local(p.r), p.def.id);
        }
        if (assigned.has(p.r)) throw new Error('guard');
        const k = r.guard.findIndex(c => c.param === p);
        return `(*${table(`gp_${id}_${k}`, `${B.PTYPE[p.def.type].ctype}* const`, j, `&${p.r.node.id}_p_${p.def.id}`)})`;
      });
      const paramOf = (lid, pid) => {
        const key = `${lid}_p_${pid}`;
        const p = (pinfo.get(key) || [])[j];
        if (!p) throw new Error(`${r.title}: Parameter ${pid} fehlt.`);
        const mode = paramMode.get(key);
        /* KNX-Parameter: bei jedem Gebrauch aus dem UserEeprom (Offset je
           Instanz aus einer Tabelle) – eine Kopie im RAM je Instanz wäre
           teurer als der Aufruf; geändert werden sie nur beim Download */
        const t = B.PTYPE[p.def.type];
        return mode === 'literal' ? String(p.value) : mode === 'table'
          ? table(`pv_${lid}_${cName(pid)}`, t.ctype, j, p.value)
          : `${p.def.type === 'i16' ? '(int16_t) ' : `(${t.ctype}) `}${t.read}(${G}_po_${key}[idx])`;
      };
      const flat = context(res, r);
      const ko = koId => {
        const k = res.kos.find(x => x.r === r && x.def.id === koId);
        if (!k) throw new Error(`${r.title}: KO ${koId} fehlt.`);
        return [k, table(`ko_${id}_${cName(koId)}`, 'uint16_t', j, k.macro)];
      };
      const pin = pid => {
        const p = pinOf(res, r, pid);
        return p.ext ? [p, table(`bit_${id}_${cName(pid)}`, 'uint8_t', j, p.ext.bit)]
          : [p, table(`pin_${id}_${cName(pid)}`, 'uint32_t', j, p.macro)];
      };
      return Object.assign({}, flat, {
        id,
        v: name => `${id}_${name}`,
        pin: pid => {
          const [p, x] = pin(pid);
          if (p.ext) throw new Error('ext');
          return x;
        },
        output: (pid, level) => {
          const [p, x] = pin(pid);
          return p.ext ? `${p.ext.id}_write(${x}, ${level});` : `pinMode(${x}, OUTPUT);\ndigitalWrite(${x}, ${level});`;
        },
        input: (pid, pullup) => {
          const [p, x] = pin(pid);
          return p.ext ? `// ${pid}: liest der Schieberegister-Block` : `pinMode(${x}, INPUT${pullup ? ' | PULL_UP' : ''});`;
        },
        write: (pid, expr) => {
          const [p, x] = pin(pid);
          return p.ext ? `${p.ext.id}_write(${x}, ${expr});` : `digitalWrite(${x}, ${expr});`;
        },
        read: pid => {
          const [p, x] = pin(pid);
          return p.ext ? `${p.ext.id}_read(${x})` : `digitalRead(${x})`;
        },
        param: pid => paramOf(id, pid),
        /* Bedingungen auf Auswahlen derselben Instanz oder auf Auswahlen
           außerhalb (über eine Zeigertabelle je Instanz); sonst bleibt das
           Makro flach */
        pinGuard: () => r.pinShared ? active() : '',
        ko: koId => ko(koId)[1],
        /* Name je Instanz aus einer Tabelle (nullptr: Filter passt nicht) */
        trace: (what, expr) => traceSink(res)
          ? traceLine(table(`tr_${id}`, 'char* const', j, traced(res, r) ? cstr(asciiTitle(r.title)) : 'nullptr'), what, expr) : '',
        traceWho: () => traceSink(res) ? table(`tr_${id}`, 'char* const', j, traced(res, r) ? cstr(asciiTitle(r.title)) : 'nullptr') : null,
        persist: () => table(`ps_${id}`, 'uint8_t', j, persistSlot(res, r)),
        koRead: koId => {
          const [k, x] = ko(koId), raw = `bcu.comObjects->objectRead(${x})`;
          if (k.dpt.float) return `dpt9ToFloat(${raw})`;
          if (k.dpt.float4) return `dpt14ToHundredths(${raw})`;
          return `(int32_t) ${k.dpt.signed ? `(${SIGNED[k.dpt.signed]}) ` : ''}${raw}`;
        },
        koWrite: (koId, expr) => {
          const [k, x] = ko(koId);
          return onlyActive(res, k, active(),
            k.dpt.float ? `bcu.comObjects->objectWriteFloat(${x}, ${expr});`
            : k.dpt.float4 ? `bcu.comObjects->objectWrite(${x}, dpt14FromHundredths(${expr}));`
            : `bcu.comObjects->objectWrite(${x}, (unsigned int) (${expr}));`);
        },
        emit: (port, expr) => {
          const calls = (linksFrom.get(r) || [])
            .filter(l => l.out.id === port && mine(l.to) && inst.get(l.to) === j)
            .map(l => `${local(l.to)}_in_${l.in.id}(${expr});`);
          if (outs.has(`${id}_out_${port}`)) calls.push(`${id}_out_${port}(${expr});`);
          return calls.join(' ') || `(void) (${expr});`;
        }
      });
    };

    /* Code je Instanz erzeugen; muss überall gleich sein */
    const order = keys.map(k => rows[0].get(k));
    const texts = [];
    let tpl = null;
    try {
      rows.forEach((row, j) => {
        const g = (r, key, ...args) => genFlat(r, key, ctxOf(row.get(local(r).slice(2)), j), ...args);
        const parts = { state: [], ins: [], kos: [], setup: [], init: [], loop: [] };
        order.forEach(r0 => {
          const r = row.get(local(r0).slice(2)), id = local(r0);
          const head = `// ${comment(r0.def.name)} (${id})`;
          const st = g(r0, 'state');
          if (st) {
            const mem = members(st);
            if (mem === null) throw new Error('state');
            parts.state.push(`${head}\n${mem}`);
          }
          r.inputs.forEach(p => parts.ins.push([`${id}_in_${p.id}`, g(r0, 'in', p.id)]));
          res.kos.filter(k => k.r === r).forEach(k => parts.kos.push([`${id}_ko_${cName(k.def.id)}`, g(r0, 'ko', k.def.id), k]));
          ['setup', 'init', 'loop'].forEach(s => { const c = g(r0, s); if (c) parts[s].push(`${head}\n${c}`); });
        });
        texts.push(JSON.stringify([parts.state, parts.ins, parts.kos.map(x => x.slice(0, 2)), parts.setup, parts.init, parts.loop]));
        if (!tpl) tpl = parts;
      });
    } catch (e) {
      return null;
    }
    if (texts.some(x => x !== texts[0])) return null;

    order.forEach(r0 => rows.forEach(row => { const r = row.get(local(r0).slice(2)); assigned.set(r, { G, j: inst.get(r), local: local(r) }); }));
    /* Eingänge, die von außen aufgerufen werden */
    res.links.forEach(l => {
      if (!mine(l.to) || (mine(l.from) && inst.get(l.from) === inst.get(l.to))) return;
      trampolines.set(inputFn(l.to, l.in.id), `${G}_i[${inst.get(l.to)}].${local(l.to)}_in_${l.in.id}(v);`);
    });
    return { G, N, name: m ? m.name : macro, tpl, tables, outs, trampolines, pinfo, paramMode, local };
  }
}

/* Einzelne bool-Felder der Struktur als Bitfeld: acht teilen sich ein Byte.
   Das Feld der Instanzen ist statisch und beginnt daher mit 0; ohne C++20
   gibt es für Bitfelder keinen Initialisierer, „= false“ fällt weg. Felder
   mit „= true“, volatile (Interrupt: Lesen-Ändern-Schreiben des ganzen
   Bytes) und Arrays bleiben, wie sie sind. */
const packBools = l => l.replace(/^(\s*)bool (\w+)(?: = false)?;/, '$1bool $2 : 1;');

/* Felder der Struktur nach Ausrichtung ordnen (4, 2, 1 Byte, dann die
   Bitfelder), damit keine Füllbytes entstehen und die Bitfelder aller Blöcke
   sich Bytes teilen. Die Reihenfolge der Felder ist für den Code ohne
   Belang; mehrzeilige oder unbekannte Konstrukte bleiben vorn, wie sie sind. */
const ALIGN1 = /^(bool|char|int8_t|uint8_t|byte)$/, ALIGN2 = /^(int16_t|uint16_t|short)$/;
function orderMembers(parts) {
  const head = [], by = [[], [], [], []];   // 4, 2, 1, Bitfeld
  parts.forEach(part => {
    const lines = part.split('\n');
    let label = '', depth = 0;
    lines.forEach(line => {
      /* in Funktionsrümpfen und Initialisierern: unverändert vorn */
      const d0 = depth;
      for (const ch of line.replace(/\/\/.*$/, '').replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, '')) {
        if (ch === '{') depth++; else if (ch === '}') depth--;
      }
      if (d0 || depth) { head.push(line); return; }
      if (/^\s*\/\/ /.test(line) && !label) { label = line.trim().replace(/^\/\/ /, ''); return; }
      const m = line.match(/^\s*(?:\[\[maybe_unused\]\]\s*)?(volatile\s+)?(\w+)\s+\w+(\[[^\]]*\])*(\s*:\s*\d+)?(\s*=\s*[^;{}]*)?;\s*(\/\/.*)?$/);
      if (!m) { head.push(line); return; }
      const l = packBools(line).trim() + (m[6] || !label ? '' : ` // ${label}`);
      const bits = / : 1;/.test(l);
      by[bits ? 3 : ALIGN1.test(m[2]) ? 2 : ALIGN2.test(m[2]) ? 1 : 0].push(l);
    });
  });
  return [...head, ...by.flat()];
}

/* Struktur, Feld der Instanzen, Tabellen und Einsprünge einer Gruppe */
function groupCode(res, g) {
  const B = SBS.blocks;
  const out = [];
  out.push(`// Makro „${comment(g.name)}“: ${g.N} Instanzen, Code gemeinsam`);
  g.tables.forEach((t, name) => out.push(`static const ${t.type} ${name}[${g.N}] = { ${t.values.join(', ')} };`));
  out.push(`struct ${g.G}`, '{');
  const body = orderMembers(['uint8_t idx;', ...g.tpl.state]);
  const fn = (name, code, args = 'void') => {
    body.push('', `void ${name}(${args})`, '{');
    if (code) body.push(indent(code));
    body.push('}');
  };
  g.tpl.ins.forEach(([name, code]) => fn(name, code, `${code ? '' : '[[maybe_unused]] '}int32_t v`));
  g.tpl.kos.forEach(([name, code]) => { if (code) fn(name, code); });
  g.outs.forEach((targets, name) => {
    const same = targets.every(t => t.join() === targets[0].join());
    const call = t => t.map(f => `${f}(v);`).join(' ');
    fn(name, same ? call(targets[0]) : `switch (idx)\n{\n${targets.map((t, j) => t.length ? `case ${j}: ${call(t)} break;` : '').filter(Boolean).join('\n')}\ndefault: break;\n}`,
       'int32_t v');
  });
  ['setup', 'init', 'loop'].forEach(s => { if (g.tpl[s].length) fn('m_' + s, g.tpl[s].join('\n')); });
  out.push(indent(body.join('\n')), '};');
  out.push(`static ${g.G} ${g.G}_i[${g.N}];`);
  g.trampolines.forEach((call, name) => out.push(`static void ${name}(int32_t v) { ${call} }`));
  return out.join('\n');
}

/* Offsets der KNX-Parameter je Instanz (vor der Struktur) */
function groupOffsets(g) {
  return [...g.paramMode].filter(([, mode]) => mode === 'member').map(([key]) =>
    `static const uint16_t ${g.G}_po_${key}[${g.N}] = { ${g.pinfo.get(key).map(p => `PARAM_${p.name.toUpperCase()}`).join(', ')} };`);
}

function appConfig(res) {
  const d = res.device;
  const out = [];
  out.push('/* Erzeugt von SB-Studio — nicht von Hand ändern. */');
  out.push('#ifndef APP_CONFIG_H_', '#define APP_CONFIG_H_', '');
  out.push(`#define MANUFACTURER ${hex(d.manufacturer, 4)} //!< Herstellernummer`);
  out.push(`#define DEVICETYPE   ${hex(d.appNumber, 4)} //!< Applikationsnummer`);
  out.push(`#define APPVERSION   ${hex(d.appVersion, 2)}   //!< Applikationsversion`);
  out.push('', '// Kommunikationsobjekte');
  res.kos.forEach(k => out.push(`#define ${k.macro.padEnd(20)} ${String(k.number).padStart(3)} //!< ${comment(k.def.text)} (${k.def.dpt}, ${k.r.title})`));
  if (res.pins.some(p => !p.ext)) {
    out.push('', `// Pins (Plattform ${comment(res.platform.name)}, ${res.mcu.name})`);
    res.pins.filter(p => !p.ext).forEach(p => {
      const r = res.byId.get(p.node.id);
      out.push(`#define ${p.macro.padEnd(20)} ${p.gpio.padEnd(7)} //!< ${comment(p.name)} (${r.title})`);
    });
  }
  out.push('', `// Parameter: Offset ab PARAM_BASE (${hex(res.layout.params.addr, 4)}, Segment der Applikation)`);
  res.params.filter(p => !p.fixed).forEach(p =>
    out.push(`#define PARAM_${p.name.toUpperCase().padEnd(20)} ${hex(p.offset, 4)} //!< ${p.size} Byte, ${comment(p.def.label)} (${p.r.title})`));
  out.push(`#define PARAM_BASE         ${hex(res.layout.params.addr, 4)}`);
  if (persistNodes(res).length)
    out.push('', `// Dauerhafter Speicher: ein Wert je Block, ${PERSIST_BYTES / 256} Flash-Seiten unter dem UserEeprom`,
             `#define SBS_PERSIST_SLOTS ${persistNodes(res).length}`);
  out.push(`#define PARAM_SEGMENT_SIZE ${hex(res.segmentSize, 4)}`);
  out.push('', '#endif /* APP_CONFIG_H_ */', '');
  return out.join('\n');
}

function appMain(res) {
  const d = res.device;
  const B = SBS.blocks;
  const ctx = new Map(res.nodes.map(r => [r, context(res, r)]));
  const genWith = (r, key, c, ...args) => {
    const f = r.def.gen && r.def.gen[key];
    return f ? (f(c, ...args) || '').trim() : '';
  };
  const gen = (r, key, ...args) => genWith(r, key, ctx.get(r), ...args);
  /* Makros mit mehreren Instanzen: Code einmal (shareMacros) */
  const { groups, assigned } = res.shareCode === false ? { groups: [], assigned: new Map() } : shareMacros(res, genWith);
  const groupOf = new Map(groups.map(g => [g.G, g]));
  const firstOf = new Map();
  res.nodes.forEach(r => { const a = assigned.get(r); if (a && !firstOf.has(a.G)) firstOf.set(a.G, r); });
  const flatNodes = res.nodes.filter(r => !assigned.has(r));
  /* DPT 14 braucht die Umrechnung und memcpy() */
  const float4 = res.kos.some(k => k.dpt.float4);
  /* Was mehrere Blöcke brauchen (Header, gemeinsame Initialisierung eines
     Timers …), steht nur einmal im Code */
  const once = key => [...new Set(res.nodes.flatMap(r => {
    const f = r.def.gen && r.def.gen[key];
    const v = typeof f === 'function' ? f(ctx.get(r)) : f;
    return (Array.isArray(v) ? v : [v]).filter(Boolean).map(x => x.trim());
  }))];
  const section = key => res.nodes
    .map(r => {
      const a = assigned.get(r);
      if (a) {
        const g = groupOf.get(a.G);
        return firstOf.get(a.G) === r && g.tpl[key].length
          ? `// Makro „${comment(g.name)}“, alle Instanzen\nfor (auto& x : ${g.G}_i) x.m_${key}();` : '';
      }
      const c = gen(r, key);
      return c ? `// ${comment(r.title)}\n${c}` : '';
    })
    .filter(Boolean).join('\n');

  const name8 = slug(d.name).toUpperCase().replace(/-/g, '').slice(0, 8).padEnd(8, ' ');
  const out = [];
  out.push(
    '/*',
    ` * ${comment(d.name)} — Firmware für ${comment(res.platform.name)} (${res.mcu.name}), Maske ${res.mask.name}`,
    ' *',
    ' * Erzeugt von SB-Studio. Änderungen am Gerät bitte im Editor vornehmen',
    ' * und neu erzeugen, sonst gehen sie beim nächsten Export verloren.',
    ' *',
    ' * This program is free software; you can redistribute it and/or modify',
    ' * it under the terms of the GNU General Public License version 3 as',
    ' * published by the Free Software Foundation.',
    ' */',
    '',
    `#include <${res.mask.header}>`,
    '#include <sblib/eib/datapoint_types.h>',
    '#include <sblib/debounce.h>',
    '#include <sblib/digital_pin.h>',
    '#include <sblib/io_pin_names.h>',
    '#include <sblib/timeout.h>',
    '#include <sblib/timer.h>',
    '#include <sblib/version.h>',
    ...once('include').concat(float4 ? ['cstring'] : [], persistNodes(res).some(r => r.node.props.auto !== false) ? ['sblib/usr_callback.h'] : []).map(h => `#include <${h}>`),
    '#include "app_config.h"',
    '',
    `APP_VERSION(${cstr(name8)}, ${cstr(d.appVersion >> 4)}, ${cstr(d.appVersion & 0x0F)});`,
    '',
    `${res.mask.sblib} bcu = ${res.mask.sblib}();`,
    '',
    'static const uint8_t hardwareVersion[6] = { 0, 0, 0, 0, 0, 0 };',
    '',
    '/* Parameter liegen in einem festen Segment des User-EEPROM, das die',
    '   Ladeprozedur der knxprod beschreibt. */',
    'static uint8_t paramU8(uint32_t offset) { return bcu.userEeprom->getUInt8(PARAM_BASE + offset); }',
    'static uint16_t paramU16(uint32_t offset) { return bcu.userEeprom->getUInt16(PARAM_BASE + offset); }',
    ...(res.params.some(p => !p.fixed && p.def.type === 'i32')
      ? ['static int32_t paramI32(uint32_t offset) { return (int32_t) ((uint32_t) paramU16(offset) << 16 | paramU16(offset + 2)); }'] : []),
    ''
  );

  const etsParams = res.params.filter(p => !p.fixed && !assigned.has(p.r));
  if (etsParams.length) {
    out.push('// KNX-Parameter');
    etsParams.forEach(p => out.push(`static ${B.PTYPE[p.def.type].ctype} ${p.r.node.id}_p_${p.def.id}; //!< ${comment(p.def.label)} (${comment(p.r.title)})`));
    out.push('');
  }

  const inputs = flatNodes.flatMap(r => r.inputs.map(p => [r, p]));
  const entries = groups.flatMap(g => [...g.trampolines.keys()]);
  if (inputs.length || entries.length) {
    out.push('// Eingänge der Blöcke');
    inputs.forEach(([r, p]) => out.push(`static void ${inputFn(r, p.id)}(int32_t v);`));
    entries.forEach(name => out.push(`static void ${name}(int32_t v);`));
    out.push('');
  }

  /* Hilfsfunktionen, die mehrere Blöcke teilen (einmal im Code) */
  /* Zusatzinfos der Blöcke: Ausgabe steht beim Debug-Block, benutzt wird sie
     schon in Hilfsfunktionen davor */
  if (traceSink(res)) out.push(
    '// Zusatzinfos der Blöcke (Debug-Build): Ausgabe über den Debug-Block',
    '#ifdef SBS_DEBUG', '#define SBS_TRACE', 'static void sbsTrace(const char* who, const char* what, int32_t v);', '#endif', '');
  const lib = (float4 ? [DPT14_LIB] : []).concat(once('lib'));
  if (lib.length) out.push('// Hilfsfunktionen der Blöcke', lib.join('\n\n'), '');

  /* Dauerhafter Speicher vor Reset/Download: Rückruf der sblib */
  const autoSave = persistNodes(res).some(r => r.node.props.auto !== false);
  if (autoSave) out.push(
    '/* Vor Reset und vor dem Schreiben des User-EEPROM (Download) sichern */',
    'class SbsUsrCallback : public UsrCallback',
    '{',
    'public:',
    '    void Notify(UsrCallbackType type) override',
    '    {',
    '        if (type == UsrCallbackType::reset || type == UsrCallbackType::flash || type == UsrCallbackType::bcu_end)',
    '            sbsPersistSave();',
    '    }',
    '};',
    'static SbsUsrCallback sbsUsrCallback;',
    '');
  const state = flatNodes
    .map(r => { const c = gen(r, 'state'); return c ? `// ${comment(r.title)}\n${c}` : ''; })
    .filter(Boolean).join('\n');
  if (state) out.push('// Zustand der Blöcke', state, '');
  groups.forEach(g => out.push(...groupOffsets(g), groupCode(res, g), ''));

  inputs.forEach(([r, p]) => {
    const body = gen(r, 'in', p.id);
    out.push(`// ${comment(r.title)}: ${comment(p.label)}`);
    out.push(`static void ${inputFn(r, p.id)}(${body ? '' : '[[maybe_unused]] '}int32_t v)`, '{');
    if (body) out.push(indent(body));
    out.push('}', '');
  });

  out.push('static void loadParams()', '{');
  etsParams.forEach(p => {
    const t = B.PTYPE[p.def.type];
    const cast = p.def.type === 'i16' ? '(int16_t) ' : '';
    out.push(`    ${p.r.node.id}_p_${p.def.id} = ${cast}${t.read}(PARAM_${p.name.toUpperCase()});`);
  });
  out.push('}', '');

  const fn = (name, body, args = 'void') => {
    out.push(`static void ${name}(${args})`, '{');
    if (body) out.push(indent(body));
    out.push('}', '');
  };
  fn('setupHardware', [
    ...groups.map(g => `for (uint8_t j = 0; j < ${g.N}; j++) ${g.G}_i[j].idx = j;`),
    once('shared').join('\n'), section('setup')].filter(Boolean).join('\n'));
  fn('initApplication', section('init'));

  /* Wert eines KNX-Parameters im Code (auch in einer Makro-Struktur) */
  const paramExpr = p => {
    if (p.fixed) return String(p.value);
    if (!assigned.has(p.r)) return `${p.r.node.id}_p_${p.def.id}`;
    /* in einer Makro-Struktur: ohne Kopie, direkt aus dem UserEeprom */
    const t = B.PTYPE[p.def.type];
    return `${p.def.type === 'i16' ? '(int16_t) ' : `(${t.ctype}) `}${t.read}(PARAM_${p.name.toUpperCase()})`;
  };
  const koBody = k => {
    const a = assigned.get(k.r);
    if (a) {
      const name = `${a.local}_ko_${cName(k.def.id)}`;
      return groupOf.get(a.G).tpl.kos.some(([n, code]) => n === name && code) ? `${a.G}_i[${a.j}].${name}();` : '';
    }
    return gen(k.r, 'ko', k.def.id);
  };
  /* Zusatzinfo beim Empfang: Wert wie ihn der Block liest */
  const koTrace = k => {
    if (!traced(res, k.r)) return '';
    const raw = `bcu.comObjects->objectRead(${k.macro})`;
    const val = k.dpt.float ? `dpt9ToFloat(${raw})` : k.dpt.float4 ? `dpt14ToHundredths(${raw})`
      : `${k.dpt.signed ? `(${SIGNED[k.dpt.signed]}) ` : ''}${raw}`;
    return traceLine(cstr(asciiTitle(k.r.title)), `KO ${k.number} ${asciiTitle(k.def.text)}`, val);
  };
  const withTrace = (k, body) => [koTrace(k), body].filter(Boolean).join('\n');
  /* Varianten einer Nummer: nur die, deren Parameterauswahl gerade gilt */
  const numbers = [...new Set(res.kos.map(k => k.number))];
  const cases = numbers.map(nr => {
    const alts = res.kos.filter(k => k.number === nr);
    if (alts.length === 1) {
      const body = withTrace(alts[0], koBody(alts[0]));
      return body ? `case ${alts[0].macro}:\n${indent(body)}\n    break;` : '';
    }
    const parts = alts.map(k => {
      const body = withTrace(k, koBody(k));
      if (!body) return '';
      const cond = (k.r.guard || k.r.cond || []).map(c => `(${c.values.map(v => `${paramExpr(c.param)} == ${v}`).join(' || ')})`).join(' && ');
      return cond ? `if (${cond})\n{\n${indent(body)}\n}` : body;
    }).filter(Boolean);
    return parts.length ? `case ${alts[0].macro}:\n${indent(parts.join('\n'))}\n    break;` : '';
  }).filter(Boolean);
  fn('objectUpdated', cases.length ? `switch (objno)\n{\n${indent(cases.concat('default:\n    break;').join('\n'))}\n}` : '',
     cases.length ? 'int objno' : '[[maybe_unused]] int objno');
  fn('checkPeriodic', section('loop'));

  out.push(
    '/**',
    ' * Wird von der sblib beim Start aufgerufen.',
    ' */',
    'BcuBase* setup()',
    '{',
    /* Programmiertaste/-LED: die sblib nimmt sonst PIN_PROG (PIO2_0) */
    ...(res.platform.prog === res.mcu.progDefault ? [] : res.platform.prog
      ? [`    bcu.setProgPin(${res.platform.prog});`]
      : ['    bcu.setProgPin(0); // keine Programmiertaste']),
    '    bcu.begin(MANUFACTURER, DEVICETYPE, APPVERSION);',
    ...(autoSave ? ['    bcu.setUsrCallback(&sbsUsrCallback);'] : []),
    '    bcu.setHardwareType(hardwareVersion, sizeof(hardwareVersion));',
    '    setupHardware();',
    '    return (&bcu);',
    '}',
    '',
    '/**',
    ' * Hauptschleife, solange eine Applikation geladen ist.',
    ' */',
    'void loop()',
    '{',
    '    static bool initialized = false;',
    '    if (!initialized)',
    '    {',
    '        loadParams();',
    '        initApplication();',
    '        initialized = true;',
    '    }',
    '',
    '    int objno;',
    '    while ((objno = bcu.comObjects->nextUpdatedObject()) >= 0)',
    '        objectUpdated(objno);',
    '',
    '    checkPeriodic();',
    '',
    '    // Bis zu 1 ms schlafen, wenn nichts zu tun ist',
    '    waitForInterrupt();',
    '}',
    '',
    '/**',
    ' * Hauptschleife, solange keine Applikation geladen ist.',
    ' */',
    'void loop_noapp()',
    '{',
    '}',
    ''
  );
  return out.join('\n');
}

function cmake(res) {
  const name = slug(res.device.name);
  const ver = `${res.device.appVersion >> 4}.${res.device.appVersion & 0x0F}`;
  return `# Erzeugt von SB-Studio — nicht von Hand ändern.
cmake_minimum_required(VERSION 3.28)
project(${name} LANGUAGES C CXX VERSION ${ver})

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(SB_PATH_TO_SBLIB_REPO "${res.device.sblibPath}" CACHE STRING "Pfad zum software-arm-lib-Repository, absolut oder relativ zu diesem Projekt")
cmake_path(ABSOLUTE_PATH SB_PATH_TO_SBLIB_REPO BASE_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}" NORMALIZE OUTPUT_VARIABLE SBLIB_REPO_DIR)

set(SBLPC_DIR "\${SBLIB_REPO_DIR}/vendor/CMSIS_CORE_LPC11xx")
set(SBLIB_PATH "\${SBLIB_REPO_DIR}/sblib")

if(NOT CMAKE_CROSSCOMPILING)
    message(FATAL_ERROR "Nur für ARM: mit -DCMAKE_TOOLCHAIN_FILE=<sblib>/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake konfigurieren (siehe build.sh / build.cmd).")
endif()
foreach(dir SBLPC_DIR SBLIB_PATH)
    if(NOT EXISTS "\${\${dir}}")
        message(FATAL_ERROR "\${dir} nicht gefunden: \${\${dir}} — SB_PATH_TO_SBLIB_REPO prüfen.")
    endif()
endforeach()

add_compile_definitions(
    __LPC11XX__
    $<$<CONFIG:Release>:NDEBUG>
    $<$<CONFIG:Debug>:DEBUG>
)${res.nodes.some(r => r.def.type === 'debug') ? `

# Debug-Ausgaben (Block Debug-Ausgabe): im Debug-Build, im Release mit -DSBS_DEBUG=ON
option(SBS_DEBUG "Debug-Ausgaben auch im Release" OFF)
add_compile_definitions($<$<OR:$<CONFIG:Debug>,$<BOOL:\${SBS_DEBUG}>>:SBS_DEBUG>)` : ''}

set(TARGET_ARM \${PROJECT_NAME}_arm)

# Speicher ${res.mcu.name}: Flash bis zum letzten Sektor (dort liegt das UserEeprom der sblib)${persistNodes(res).length ? ',\n# davor 1 KB für den dauerhaften Speicher' : ''}.
# Ohne Bootloader – die Variante für den Selfbus-Bootloader folgt später.
set(SBS_FLASH_ORIGIN "0x0")
set(SBS_FLASH_LENGTH "${hex(codeEnd(res), 4)}")
set(SBS_RAM_ORIGIN "0x10000000")
set(SBS_RAM_LENGTH "${hex(res.mcu.ram, 4)}")
set(SBS_LD_VARIANT "\${TARGET_ARM}")
set(LINKER_SCRIPT "\${CMAKE_CURRENT_BINARY_DIR}/linkscripts/\${TARGET_ARM}.ld")
configure_file(linkscripts/lpc1115.ld.in "\${LINKER_SCRIPT}" @ONLY)

# Start-up-Code und C-Bibliotheks-Stubs ohne NXP-Dateien (newlib-nano statt libcr)
add_executable(\${TARGET_ARM}
    src/app_main.cpp
    src/app_config.h
    src/startup_lpc11xx.cpp
    src/libc_stubs.cpp
)
set_target_properties(\${TARGET_ARM} PROPERTIES SUFFIX ".axf" LINK_DEPENDS "\${LINKER_SCRIPT}")

add_subdirectory(\${SBLIB_PATH} sblib)
add_subdirectory(\${SBLPC_DIR} CMSIS_CORE_LPC11xx)
target_include_directories(\${TARGET_ARM} PRIVATE \${SBLPC_DIR}/inc \${SBLIB_PATH}/inc)
target_compile_definitions(\${TARGET_ARM} PRIVATE __USE_CMSIS=CMSIS_CORE_LPC11xx __NEWLIB__ CORE_M0 CPP_USE_HEAP)
target_link_libraries(\${TARGET_ARM} PUBLIC sblib_arm CMSIS_CORE_LPC11xx_arm)

target_link_options(\${TARGET_ARM} PRIVATE
    # Mit LTO (Release) die Handler global halten, sonst ist DEFINED() im Linkerskript falsch
    # und die Prüfsumme für das Boot-ROM (__valid_user_code_checksum) stimmt nicht.
    -Wl,--undefined=NMI_Handler
    -Wl,--undefined=HardFault_Handler
    -T "\${LINKER_SCRIPT}"
    -Xlinker -Map=$<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.map
)

add_custom_command(TARGET \${TARGET_ARM} POST_BUILD
    COMMAND \${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:\${TARGET_ARM}> $<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.hex
    COMMAND \${CMAKE_OBJCOPY} -O binary $<TARGET_FILE:\${TARGET_ARM}> $<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.bin
    COMMAND \${CMAKE_SIZE} $<TARGET_FILE:\${TARGET_ARM}>
)
`;
}

function buildSh(res) {
  return `#!/bin/sh
# Baut die Firmware. Erzeugt von SB-Studio.
#
# Voraussetzungen: CMake >= 3.28, Ninja, MCUXpresso IDE >= 11.9 (arm-none-eabi)
#
#   MCUXPRESSO_TOOLCHAIN_PATH=/usr/local/mcuxpressoide-25.6.136/ide/tools ./build.sh [Release|Debug]
#
# SB_PATH_TO_SBLIB_REPO überschreibt den Pfad zum software-arm-lib-Repository.
set -e
cd "$(dirname "$0")"

: "\${SB_PATH_TO_SBLIB_REPO:=${res.device.sblibPath}}"
if [ -z "$MCUXPRESSO_TOOLCHAIN_PATH" ]; then
    echo "MCUXPRESSO_TOOLCHAIN_PATH ist nicht gesetzt, z. B. /usr/local/mcuxpressoide-25.6.136/ide/tools" >&2
    exit 1
fi
if [ ! -d "$SB_PATH_TO_SBLIB_REPO/sblib" ]; then
    echo "sblib nicht gefunden unter $SB_PATH_TO_SBLIB_REPO — SB_PATH_TO_SBLIB_REPO setzen." >&2
    exit 1
fi
SBLIB=$(cd "$SB_PATH_TO_SBLIB_REPO" && pwd)
BUILD_TYPE=\${1:-Release}

cmake -S . -B "build/$BUILD_TYPE" -G Ninja \\
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \\
    -DSB_PATH_TO_SBLIB_REPO="$SBLIB" \\
    -DCMAKE_TOOLCHAIN_FILE="$SBLIB/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake"
cmake --build "build/$BUILD_TYPE"

echo "Fertig: build/$BUILD_TYPE/${slug(res.device.name)}_arm.hex"
`;
}

function buildCmd(res) {
  const p = String(res.device.sblibPath).replace(/\//g, '\\');
  return `@echo off
rem Baut die Firmware. Erzeugt von SB-Studio.
rem
rem Voraussetzungen: CMake >= 3.28, Ninja, MCUXpresso IDE >= 11.9 (arm-none-eabi)
rem
rem   set MCUXPRESSO_TOOLCHAIN_PATH=C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools
rem   build.cmd [Release^|Debug]
rem
rem SB_PATH_TO_SBLIB_REPO ueberschreibt den Pfad zum software-arm-lib-Repository.
setlocal
cd /d "%~dp0"

if "%SB_PATH_TO_SBLIB_REPO%"=="" set "SB_PATH_TO_SBLIB_REPO=${p}"
if "%MCUXPRESSO_TOOLCHAIN_PATH%"=="" (
    echo MCUXPRESSO_TOOLCHAIN_PATH ist nicht gesetzt, z. B. C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools 1>&2
    exit /b 1
)
if not exist "%SB_PATH_TO_SBLIB_REPO%\\sblib" (
    echo sblib nicht gefunden unter %SB_PATH_TO_SBLIB_REPO% - SB_PATH_TO_SBLIB_REPO setzen. 1>&2
    exit /b 1
)
for %%I in ("%SB_PATH_TO_SBLIB_REPO%") do set "SBLIB=%%~fI"
set "SBLIB=%SBLIB:\\=/%"
set "BUILD_TYPE=%~1"
if "%BUILD_TYPE%"=="" set "BUILD_TYPE=Release"

cmake -S . -B "build/%BUILD_TYPE%" -G Ninja "-DCMAKE_BUILD_TYPE=%BUILD_TYPE%" "-DSB_PATH_TO_SBLIB_REPO=%SBLIB%" "-DCMAKE_TOOLCHAIN_FILE=%SBLIB%/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake" || exit /b 1
cmake --build "build/%BUILD_TYPE%" || exit /b 1

echo Fertig: build\\%BUILD_TYPE%\\${slug(res.device.name)}_arm.hex
`;
}

function readme(res) {
  const d = res.device;
  const rows = res.kos.map(k => `| ${k.number} | ${k.def.text} | ${k.def.dpt} | ${k.def.flags} | ${k.r.title} |`);
  return `# ${d.name}

Firmware für ${res.mcu.name}, Maske ${res.mask.name}, erzeugt von SB-Studio.

| | |
|---|---|
| Hersteller | ${hex(d.manufacturer, 4)} |
| Applikation | ${hex(d.appNumber, 4)}, Version ${hex(d.appVersion, 2)} |
| Bestellnummer | ${d.orderNumber} |

## Bauen

Voraussetzungen: CMake ≥ 3.28, Ninja, MCUXpresso IDE ≥ 11.9 und das
Repository software-arm-lib (sblib). Der Pfad dazu ist auf
\`${d.sblibPath}\` voreingestellt und lässt sich mit
\`SB_PATH_TO_SBLIB_REPO\` überschreiben.

\`\`\`sh
MCUXPRESSO_TOOLCHAIN_PATH=/usr/local/mcuxpressoide-25.6.136/ide/tools ./build.sh
\`\`\`

\`\`\`bat
set MCUXPRESSO_TOOLCHAIN_PATH=C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools
build.cmd
\`\`\`

Ergebnis: \`build/Release/${slug(d.name)}_arm.hex\` (Flashen z. B. mit LinkServer
oder Flash Magic). Die Firmware wird ohne Bootloader gelinkt; der Code
reicht bis ${codeEnd(res).toString(16).toUpperCase()}h, der letzte Flash-Sektor gehört dem UserEeprom der sblib${persistNodes(res).length ? ', das Kilobyte davor dem dauerhaften Speicher' : ''}.

## Start-up-Code

Ohne NXP-Dateien: \`src/startup_lpc11xx.cpp\` (Vektortabelle, Reset-Handler,
Daten- und BSS-Initialisierung; Apache-2.0, auf Basis von CMSIS
\`startup_ARMCM0.c\`), \`src/libc_stubs.cpp\` (\`_sbrk\`, \`abort\` für
newlib-nano; GPL-3.0) und \`linkscripts/lpc1115.ld.in\` mit GNU-Symbolen.
Übernommen aus theportapps (out8-bcu1, Branch \`lpc/own-startup\`).

## Kommunikationsobjekte

| Nr. | Name | DPT | Flags | Block |
|---|---|---|---|---|
${rows.join('\n')}

Die zugehörige Produktdatenbank (\`.knxprod\`) liegt bei „Alles exportieren“
in diesem Ordner, sonst als eigene Datei.
`;
}

const GITIGNORE = `# Bauergebnisse von build.sh / build.cmd
build/

# Editoren und Betriebssysteme
.vscode/
.idea/
*.swp
*~
.DS_Store
Thumbs.db
`;

/* ---------- Größenschätzung für den Chip ----------
   Ohne ARM-Compiler im Browser: der RAM wird aus dem erzeugten Code
   gerechnet (statische Variablen und Instanz-Strukturen mit der Ausrichtung
   des ARM-EABI), dazu, was die sblib selbst statisch und auf dem Heap
   belegt (MASK.cost), und eine Reserve für den Stack. Den Flash schätzt ein
   linearer Ansatz über die Tokens des Release-Codes, ausgeglichen über fünf
   Builds (Treppenhaus-Taster, Tasterinterface 4f und Out8 Energy Storage, die
   beiden vor und nach dem RAM-Umbau), dazu die Flash-Routinen der sblib, wenn
   der dauerhafte Speicher genutzt wird – Abweichung dort −3 … +4 %. */
const FLASH_PER_TOKEN = 0.7496;
const PERSIST_FLASH = 3100;
const STACK_RESERVE = 512;
/* [Größe, Ausrichtung] auf dem Cortex-M0 */
const PRIM = {
  bool: [1, 1], char: [1, 1], int8_t: [1, 1], uint8_t: [1, 1], byte: [1, 1],
  int16_t: [2, 2], uint16_t: [2, 2], short: [2, 2],
  int: [4, 4], unsigned: [4, 4], long: [4, 4], int32_t: [4, 4], uint32_t: [4, 4],
  size_t: [4, 4], float: [4, 4], int64_t: [8, 8], uint64_t: [8, 8], double: [8, 8]
};
/* Klassen der sblib: Timeout und Debouncer aus den Debug-Infos eines Builds,
   die Sensoren aus ihren Headern (DS18x20: 10 Geräte à 44 B + OneWire) */
const LIBTYPE = { Timeout: [4, 4], Debouncer: [12, 4], SHT4xClass: [8, 4], DS18x20: [460, 4] };
const QUALIFIERS = new Set(['static', 'volatile', 'inline', 'mutable', 'constexpr', 'unsigned', 'signed', 'struct', 'class']);

/* Release-Fassung: Präprozessor nur so weit, wie der Generator ihn nutzt
   (#ifdef/#ifndef/#else/#endif, #define); SBS_DEBUG ist aus */
function preprocess(code) {
  const defs = new Map(), out = [], stack = [];
  const active = () => stack.every(s => s);
  code.split('\n').forEach(line => {
    const m = line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (!m) { if (active()) out.push(line); return; }
    const [, dir, rest] = m, name = rest.split(/\s+/)[0];
    if (dir === 'ifdef') stack.push(defs.has(name));
    else if (dir === 'ifndef') stack.push(!defs.has(name));
    else if (dir === 'if') stack.push(true);
    else if (dir === 'else') stack.push(!stack.pop());
    else if (dir === 'endif') stack.pop();
    else if (dir === 'define' && active()) defs.set(name, rest.slice(name.length).trim());
  });
  return { code: out.join('\n'), defs };
}

function lex(code) {
  return (code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
    .replace(/"(\\.|[^"\\])*"/g, '""').replace(/'(\\.|[^'\\])*'/g, '0')
    .match(/""|[A-Za-z_]\w*|\d[\w.]*|::|->|\+\+|--|<<|>>|[<>=!]=|&&|\|\||\S/g)) || [];
}

/* Statischer RAM des erzeugten Codes. Liefert die Summe und die Posten
   (globale Variablen, Instanz-Felder der Makros, statische lokale). */
function staticRam(code, ignoreTypes, defs) {
  const toks = lex(code);
  const types = Object.assign({}, PRIM, LIBTYPE), unknown = new Set(), items = [];
  const dim = expr => {
    const s = expr.join(' ').replace(/[A-Za-z_]\w*/g, n => defs.has(n) && /^[\d\s()+\-*/xa-fA-F]+$/.test(defs.get(n)) ? `(${defs.get(n)})` : 'NaN');
    // eslint-disable-next-line no-new-func
    const v = /^[\d\s()+\-*/xa-fA-FNa]+$/.test(s) ? Function(`return (${s});`)() : NaN;
    return Number.isFinite(v) ? v : 1;
  };
  /* Deklaration „[qual] Typ [*] Name [N]… [= …]“ → { name, type, bytes, align } */
  const decl = (st, inStruct) => {
    let i = 0, isConst = false, ptr = false, isStatic = false;
    const words = [];
    for (; i < st.length; i++) {
      const w = st[i];
      if (w === 'const') { if (ptr) return null; isConst = true; continue; }  // T* const → Flash
      if (w === 'static') { isStatic = true; continue; }
      if (QUALIFIERS.has(w)) continue;
      if (w === '*') { ptr = true; continue; }
      if (w === '::') { words.push(words.pop() + '::' + st[++i]); continue; }
      if (/^[A-Za-z_]\w*$/.test(w)) { words.push(w); continue; }
      break;
    }
    /* Funktion (Klammer vor einem „=“) oder keine Deklaration */
    const par = st.indexOf('('), eq = st.indexOf('=');
    if (words.length < 2 || par >= 0 && (eq < 0 || par < eq)) return null;
    if (isConst && !ptr) return null;                // Konstante: Flash
    if (inStruct && isStatic) return null;           // Klassenvariable: nicht je Instanz
    const name = words[words.length - 1], type = words[words.length - 2];
    if (ignoreTypes.has(type)) return null;
    let n = 1;
    for (let j = i; j < st.length && st[j] === '['; ) {
      const k = st.indexOf(']', j);
      n *= dim(st.slice(j + 1, k)); j = k + 1;
    }
    let sz = ptr ? [4, 4] : types[type];
    if (!sz) { unknown.add(type); sz = [4, 4]; }
    /* Bitfeld „bool x : 1“ */
    const width = st[i] === ':' && /^\d+$/.test(st[i + 1]) ? +st[i + 1] : 0;
    return { name, type: ptr ? type + '*' : type, bytes: sz[0] * n, align: sz[1], isStatic, width };
  };
  /* Bereiche: datei, struct (mit Feldern), code (Funktion), init (Initialisierer), anderes */
  const scopes = [{ kind: 'file' }];
  let st = [];
  const top = () => scopes[scopes.length - 1];
  /* Felder in Bit gezählt: ein Bitfeld bleibt in seinem Behälter (Größe
     des Typs) und beginnt sonst im nächsten (AAPCS) */
  const place = (s, d) => {
    if (d.width) {
      const unit = d.bytes * 8;
      let pos = s.bits;
      if (Math.floor(pos / unit) !== Math.floor((pos + d.width - 1) / unit)) pos = Math.ceil(pos / unit) * unit;
      s.bits = pos + d.width;
    } else {
      s.bits = (Math.ceil(Math.ceil(s.bits / 8) / d.align) * d.align + d.bytes) * 8;
    }
    s.align = Math.max(s.align, d.align);
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], sc = top();
    if (t === '{') {
      const prev = st[st.length - 1];
      let kind = 'other';
      if (sc.kind === 'init' || prev === '=' || prev === ',' && sc.kind === 'init' || sc.kind !== 'code' && st.includes('=')) kind = 'init';
      else if ((st.includes('struct') || st.includes('class')) && !st.includes('(')) kind = 'struct';
      else if (st.includes('(') || prev === 'else' || prev === 'do' || sc.kind === 'code') kind = 'code';
      else if (st[0] === 'namespace' || st[0] === 'extern') kind = 'file';
      else if (st.includes('enum')) kind = 'enum';
      const s = { kind, stmt: st, bits: 0, align: 1 };
      if (kind === 'struct') {
        s.name = st[st.indexOf(st.includes('struct') ? 'struct' : 'class') + 1];
        /* abgeleitet (sblib-Schnittstellen wie UsrCallback): vtable-Zeiger */
        if (st.includes(':')) { s.bits = 32; s.align = 4; }
      }
      scopes.push(s);
      if (kind !== 'init') st = [];
      else st.push(t);
      continue;
    }
    if (t === '}') {
      const s = scopes.pop();
      if (s.kind === 'struct' && s.name) {
        const size = Math.max(1, Math.ceil(Math.ceil(s.bits / 8) / s.align) * s.align);
        types[s.name] = [size, s.align];
        /* „struct X { … } x;“ – Variable direkt nach der Struktur */
        st = s.stmt.includes('typedef') ? [] : [s.name];
        continue;
      }
      if (s.kind === 'init') { st.push(t); continue; }
      st = [];
      continue;
    }
    if (t === ';' && sc.kind !== 'init') {
      if (st.length && sc.kind !== 'enum' && sc.kind !== 'other') {
        if (sc.kind === 'struct') {
          const d = decl(st, true);
          if (d) place(sc, d);
        } else if (sc.kind === 'file' || sc.kind === 'code' && st[0] === 'static') {
          const d = decl(st, false);
          if (d) items.push({ name: d.name, type: d.type, bytes: d.bytes, align: d.align, local: sc.kind === 'code' });
        }
      }
      st = [];
      continue;
    }
    if (sc.kind === 'init') continue;
    if (t === ':' && sc.kind === 'struct' && /^(public|private|protected)$/.test(st[st.length - 1])) { st = []; continue; }
    st.push(t);
  }
  /* Abschnitte des Linkers: jede Variable auf ihre Ausrichtung */
  let total = 0;
  items.forEach(it => { total = Math.ceil(total / it.align) * it.align + it.bytes; });
  return { total, items, unknown: [...unknown] };
}

/* Größenschätzung: { flash, ram, notes } mit used/size und Aufteilung */
function estimate(res, main, config = appConfig(res)) {
  const mask = res.mask || {}, cost = mask.cost || { flash: 0, data: 0, heap: 0 };
  /* Konstanten (Feldgrößen) stehen teils in app_config.h */
  const { defs } = preprocess(config);
  const { code, defs: own } = preprocess(main);
  own.forEach((v, k) => defs.set(k, v));
  const toks = lex(code.replace(/^\s*#.*$/gm, ' '));
  const ram = staticRam(code, new Set([mask.sblib].filter(Boolean)), defs);
  const app = Math.round(toks.length * FLASH_PER_TOKEN) + (/\bsbsPersist\b/.test(code) ? PERSIST_FLASH : 0);
  const flashSize = codeEnd(res);
  const ramSize = res.mcu ? res.mcu.ram : 0x2000;
  /* größte Posten zuerst: Makro-Instanzen, große Felder – mit Namen aus
     dem Editor (gemeinsamer Makro-Code: Kommentar vor der Struktur) */
  const macros = new Map();
  for (const m of main.matchAll(/^\/\/ Makro „([^“\n]*)“: (\d+) Instanzen[^\n]*\n(?:[^\n]*\n)*?struct (\w+)/gm))
    macros.set(m[3], { name: m[1], n: +m[2] });
  const ids = (res.nodes || []).map(r => r.node.id).sort((a, b) => b.length - a.length);
  const label = it => {
    const m = macros.get(it.type);
    if (m) return { name: m.name, count: m.n };
    const id = ids.find(i => it.name.startsWith(i + '_'));
    const r = id && res.byId && res.byId.get(id);
    return { name: r ? r.title : it.name, count: 1 };
  };
  const top = ram.items.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 6)
    .map(it => ({ ...label(it), bytes: it.bytes }));
  const notes = [];
  if (ram.unknown.length) notes.push(['Unbekannte Typen als 4 Byte gezählt: {0}', ram.unknown.join(', ')]);
  if (/\b(float|double)\b/.test(code)) notes.push(['Fließkomma bindet Routinen der C-Bibliothek ein; der Flash kann um 1–3 KB höher liegen.']);
  return {
    flash: { used: cost.flash + app, size: flashSize, base: cost.flash, app },
    ram: {
      used: cost.data + ram.total + cost.heap + STACK_RESERVE, size: ramSize,
      base: cost.data, app: ram.total, heap: cost.heap, stack: STACK_RESERVE, top
    },
    notes
  };
}

function files(res) {
  const runtime = SBS.runtime && SBS.runtime.lpc11xx;
  // ohne Start-up-Code ließe sich das Projekt nicht linken
  if (!runtime) throw new Error('js/runtime-lpc11xx.js nicht geladen — Seite neu laden (Strg+Umschalt+R)');
  return {
    ...runtime,
    'CMakeLists.txt': cmake(res),
    'build.sh': buildSh(res),
    'build.cmd': buildCmd(res).replace(/\n/g, '\r\n'),
    'README.md': readme(res),
    '.gitignore': GITIGNORE,
    'src/app_config.h': appConfig(res),
    'src/app_main.cpp': appMain(res)
  };
}

return { files, appMain, appConfig, cmake, slug, estimate, staticRam, preprocess };
})();
