/* ============================================================
   Blockbibliothek: Datenpunkttypen, MCU-Profile, Blockdefinitionen
   Jeder Block liefert Ports, Eigenschaften, ETS-Parameter, KOs und
   den C++-Code für die sblib (siehe docs/KONZEPT.md).
   ============================================================ */
var SBS = (typeof globalThis !== 'undefined' ? globalThis : window).SBS || {};
(typeof globalThis !== 'undefined' ? globalThis : window).SBS = SBS;

SBS.blocks = (function () {
'use strict';

/* Porttyp im Graphen: bool (0/1) oder num (int32). DPT 9 wird in
   Hundertsteln geführt, wie dpt9ToFloat()/objectWriteFloat() der sblib. */
const DPT = {
  '1.001': { name: 'Schalten',          type: 'bool', size: '1 Bit',   dpst: 'DPST-1-1' },
  '1.008': { name: 'Auf/Ab',            type: 'bool', size: '1 Bit',   dpst: 'DPST-1-8' },
  '1.009': { name: 'Öffnen/Schließen',  type: 'bool', size: '1 Bit',   dpst: 'DPST-1-9' },
  '5.001': { name: 'Prozent (roh 0…255)', type: 'num', size: '1 Byte', dpst: 'DPST-5-1' },
  '5.010': { name: 'Zähler 0…255',      type: 'num',  size: '1 Byte',  dpst: 'DPST-5-10' },
  '7.001': { name: 'Zähler 0…65535',    type: 'num',  size: '2 Bytes', dpst: 'DPST-7-1' },
  '9.001': { name: 'Temperatur (°C)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-1', float: true },
  '9.004': { name: 'Helligkeit (lx)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-4', float: true },
  '9.007': { name: 'Luftfeuchte (%)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-7', float: true }
};
const DPT_OPTIONS = Object.keys(DPT).map(k => [k, `${k} ${DPT[k].name}`]);

/* Objektgröße → Typcode in der KO-Tabelle (sblib ComType) und belegte
   Bytes im RAM */
const OBJ_SIZE = {
  '1 Bit':   { type: 0, bytes: 1 },
  '1 Byte':  { type: 7, bytes: 1 },
  '2 Bytes': { type: 8, bytes: 2 }
};

/* Maskenprofile. BIM112 (0x0701) lädt mit eigener Ladeprozedur in feste
   Segmente; die Adressen folgen dem, was die sblib (MASK0701) bedient:
   User-EEPROM 3F00h–4AFFh, User-RAM 05FCh–08FFh, darin die eigenen
   Felder um 065Ch und 3 Byte Schatten am Ende. */
const MASK = {
  'MV-0701': {
    name: 'BIM112 (0x0701)',
    sblib: 'MASK0701',
    header: 'sblib/eibMASK0701.h',
    koBase: 0,
    addrTab:  { addr: 0x4000, size: 0x201, max: 255 },  // Anzahl, PA, 255 GA
    assocTab: { addr: 0x4201, size: 0x1FF, max: 255 },  // Anzahl, 255 Paare
    comTab:   { addr: 0x4400, end: 0x4800 },
    params:   { addr: 0x4800, end: 0x4B00 },
    ram:      { addr: 0x0700, end: 0x08FD }
  }
};

/* Pins des Selfbus 4TE-Controllers (sblib/hardware/gpio_lpc11xx.h).
   PIN_PROG, PIN_EIB_TX/RX und PIN_VBUS belegt die sblib selbst. */
const PINS_4TE = [
  'PIN_IO1', 'PIN_IO2', 'PIN_IO3', 'PIN_IO4', 'PIN_IO5', 'PIN_IO6', 'PIN_IO7', 'PIN_IO8',
  'PIN_IO9', 'PIN_IO10', 'PIN_IO11', 'PIN_IO12', 'PIN_IO13', 'PIN_IO14', 'PIN_IO15',
  'PIN_APRG', 'PIN_PWM', 'PIN_TX', 'PIN_RX', 'PIN_INFO', 'PIN_RUN'
];
/* flashEnd: Ende des Codes = Beginn des letzten 4-KB-Sektors, den die sblib
   als UserEeprom nutzt (sie ermittelt die Flash-Größe zur Laufzeit). */
const MCU = {
  lpc1115: {
    name: 'LPC1115 (4TE-Controller)',
    mask: 'MV-0701',
    flashEnd: 0xF000,   // 64 KB
    ram: 0x2000,
    pins: PINS_4TE
  },
  lpc1114: {
    name: 'LPC1114/302 (4TE-Controller)',
    mask: 'MV-0701',
    flashEnd: 0x7000,   // 32 KB; Firmware läuft auch auf dem LPC1115
    ram: 0x2000,
    pins: PINS_4TE
  }
};
const LPC11 = Object.keys(MCU);

/* Parametertypen: Größe in Byte, C-Typ, Lesefunktion der Firmware */
const PTYPE = {
  u8:   { size: 1, ctype: 'uint8_t',  read: 'paramU8',  min: 0,      max: 255 },
  u16:  { size: 2, ctype: 'uint16_t', read: 'paramU16', min: 0,      max: 65535 },
  i16:  { size: 2, ctype: 'int16_t',  read: 'paramU16', min: -32768, max: 32767 },
  enum: { size: 1, ctype: 'uint8_t',  read: 'paramU8' }
};

const YES_NO = [[0, 'Nein'], [1, 'Ja']];
const SEND_MODE = [[0, 'nur bei Änderung'], [1, 'bei jedem Eingangsereignis']];
const range = n => Array.from({ length: n }, (_, i) => i);
const bool = (v, invert) => invert ? `(${v}) ? 0 : 1` : `(${v}) ? 1 : 0`;

const DEFS = [
  /* ---------- Hardware ---------- */
  {
    type: 'di', cat: 'Hardware', name: 'Digitaleingang', mcu: LPC11,
    help: 'Liest einen Pin entprellt und meldet jede Änderung.',
    outputs: [{ id: 'out', type: 'bool', label: 'Zustand' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', def: 'PIN_IO1' },
      { id: 'pullup', label: 'Pull-up', kind: 'bool', def: true },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false }
    ],
    params: [{ id: 'debounce', label: 'Entprellzeit', unit: 'ms', type: 'u16', def: 50, min: 0, max: 10000 }],
    gen: {
      state: c => `static Debouncer ${c.v('deb')};\nstatic int32_t ${c.v('last')};`,
      setup: c => `pinMode(${c.prop('pin')}, INPUT${c.prop('pullup') ? ' | PULL_UP' : ''});`,
      init: c =>
        `${c.v('last')} = ${bool(`digitalRead(${c.prop('pin')})`, c.prop('invert'))};\n` +
        `${c.v('deb')}.init(${c.v('last')});`,
      loop: c =>
        `{\n` +
        `    int32_t v = ${c.v('deb')}.debounce(${bool(`digitalRead(${c.prop('pin')})`, c.prop('invert'))}, ${c.param('debounce')});\n` +
        `    if (v != ${c.v('last')})\n` +
        `    {\n` +
        `        ${c.v('last')} = v;\n` +
        `        ${c.emit('out', 'v')}\n` +
        `    }\n` +
        `}`
    }
  },
  {
    type: 'do', cat: 'Hardware', name: 'Digitalausgang', mcu: LPC11,
    help: 'Schaltet einen Pin (z. B. Relaistreiber oder LED).',
    inputs: [{ id: 'in', type: 'bool', label: 'Schalten' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', def: 'PIN_IO2' },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false },
      { id: 'initial', label: 'Zustand nach Start', kind: 'bool', def: false }
    ],
    gen: {
      setup: c =>
        `pinMode(${c.prop('pin')}, OUTPUT);\n` +
        `digitalWrite(${c.prop('pin')}, ${(c.prop('initial') ? 1 : 0) ^ (c.prop('invert') ? 1 : 0)});`,
      in: c => `digitalWrite(${c.prop('pin')}, ${bool('v != 0', c.prop('invert'))});`
    }
  },

  /* ---------- KNX ---------- */
  {
    type: 'ko_in', cat: 'KNX', name: 'KO empfangen',
    help: 'Kommunikationsobjekt, das der Bus beschreibt. Gibt den empfangenen Wert aus.',
    outputs: n => [{ id: 'out', type: DPT[n.props.dpt].type, label: 'Wert' }],
    props: [
      { id: 'name', label: 'Objektname', kind: 'text', def: 'Eingang' },
      { id: 'dpt', label: 'Datenpunkttyp', kind: 'enum', options: DPT_OPTIONS, def: '1.001' },
      { id: 'readInit', label: 'Wert beim Start lesen', kind: 'bool', def: false }
    ],
    kos: n => [{ id: 'obj', text: n.props.name, func: 'Empfangen', dpt: n.props.dpt,
                 flags: 'CWU' + (n.props.readInit ? 'I' : '') }],
    gen: {
      init: c => c.prop('readInit') ? `bcu.comObjects->requestObjectRead(${c.ko('obj')});` : '',
      ko: c => `{\n    int32_t v = ${c.koRead('obj')};\n    ${c.emit('out', 'v')}\n}`
    }
  },
  {
    type: 'ko_out', cat: 'KNX', name: 'KO senden',
    help: 'Kommunikationsobjekt, das auf den Bus sendet – bei Änderung, bei jedem Ereignis und/oder zyklisch.',
    inputs: n => [{ id: 'in', type: DPT[n.props.dpt].type, label: 'Wert' }],
    props: [
      { id: 'name', label: 'Objektname', kind: 'text', def: 'Ausgang' },
      { id: 'dpt', label: 'Datenpunkttyp', kind: 'enum', options: DPT_OPTIONS, def: '1.001' }
    ],
    params: [
      { id: 'mode', label: 'Senden', type: 'enum', options: SEND_MODE, def: 0 },
      { id: 'cycle', label: 'Zyklisch senden', unit: 's, 0 = aus', type: 'u16', def: 0, min: 0, max: 65535 }
    ],
    kos: n => [{ id: 'obj', text: n.props.name, func: 'Senden', dpt: n.props.dpt, flags: 'CRT' }],
    gen: {
      state: c => `static int32_t ${c.v('last')};\nstatic bool ${c.v('valid')};\nstatic Timeout ${c.v('cyc')};`,
      init: c => `if (${c.param('cycle')}) ${c.v('cyc')}.start(${c.param('cycle')} * 1000UL);`,
      in: c =>
        `if (${c.param('mode')} == 1 || !${c.v('valid')} || v != ${c.v('last')})\n` +
        `{\n` +
        `    ${c.v('valid')} = true;\n` +
        `    ${c.v('last')} = v;\n` +
        `    ${c.koWrite('obj', 'v')}\n` +
        `}`,
      loop: c =>
        `if (${c.v('cyc')}.expired())\n` +
        `{\n` +
        `    if (${c.v('valid')}) ${c.koWrite('obj', c.v('last'))}\n` +
        `    ${c.v('cyc')}.start(${c.param('cycle')} * 1000UL);\n` +
        `}`
    }
  },

  /* ---------- Logik ---------- */
  ...[['and', 'UND', '&&'], ['or', 'ODER', '||'], ['xor', 'XOR', '^']].map(([type, name, op]) => ({
    type, cat: 'Logik', name,
    help: `Verknüpft die Eingänge mit ${name}. Gibt bei jedem Eingangsereignis aus.`,
    inputs: n => range(n.props.count).map(i => ({ id: `i${i}`, type: 'bool', label: `E${i + 1}` })),
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    props: [
      { id: 'count', label: 'Eingänge', kind: 'enum', options: [[2, '2'], [3, '3'], [4, '4']], def: 2 },
      { id: 'invert', label: 'Ausgang invertieren', kind: 'bool', def: false }
    ],
    gen: {
      state: c => `static bool ${c.v('e')}[${c.prop('count')}];`,
      in: (c, port) => {
        const e = c.v('e'), n = c.prop('count');
        const expr = range(n).map(i => `${e}[${i}]`).join(` ${op} `);
        return `${e}[${port.slice(1)}] = v != 0;\n` +
          `int32_t out = ${c.prop('invert') ? '!' : ''}(${expr});\n` +
          `${c.emit('out', 'out')}`;
      }
    }
  })),
  {
    type: 'not', cat: 'Logik', name: 'NICHT',
    help: 'Invertiert den Eingang.',
    inputs: [{ id: 'in', type: 'bool', label: 'Eingang' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    gen: { in: c => `int32_t out = v ? 0 : 1;\n${c.emit('out', 'out')}` }
  },
  {
    type: 'toggle', cat: 'Logik', name: 'Umschalter',
    help: 'Jede 1 am Auslöser schaltet um. „Status“ setzt den Zustand ohne Ausgabe (Rückmeldung vom Aktor).',
    inputs: [{ id: 'trig', type: 'bool', label: 'Auslöser' }, { id: 'set', type: 'bool', label: 'Status' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Zustand' }],
    gen: {
      state: c => `static int32_t ${c.v('st')};`,
      in: (c, port) => port === 'set'
        ? `${c.v('st')} = v != 0;`
        : `if (!v) return;\n${c.v('st')} = !${c.v('st')};\n${c.emit('out', c.v('st'))}`
    }
  },
  {
    type: 'const', cat: 'Logik', name: 'Wert senden',
    help: 'Gibt bei jeder 1 am Auslöser einen festen Wert aus.',
    inputs: [{ id: 'trig', type: 'bool', label: 'Auslöser' }],
    outputs: [{ id: 'out', type: 'num', label: 'Wert' }],
    params: [{ id: 'value', label: 'Wert', type: 'i16', def: 1 }],
    gen: { in: c => `if (!v) return;\nint32_t out = ${c.param('value')};\n${c.emit('out', 'out')}` }
  },
  {
    type: 'threshold', cat: 'Logik', name: 'Schwellwert',
    help: 'Vergleicht einen Zahlenwert mit einer Schwelle (mit Hysterese). Gibt nur bei Änderung aus. DPT 9 in Hundertsteln.',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }],
    outputs: [{ id: 'out', type: 'bool', label: 'über Schwelle' }],
    params: [
      { id: 'thr', label: 'Schwelle', unit: 'Rohwert, DPT 9 × 100', type: 'i16', def: 2500 },
      { id: 'hyst', label: 'Hysterese', unit: 'Rohwert', type: 'u16', def: 50 }
    ],
    gen: {
      state: c => `static int32_t ${c.v('st')} = -1;`,
      in: c =>
        `int32_t out = ${c.v('st')};\n` +
        `if (v >= ${c.param('thr')}) out = 1;\n` +
        `else if (v < (int32_t) ${c.param('thr')} - (int32_t) ${c.param('hyst')} || out < 0) out = 0;\n` +
        `if (out == ${c.v('st')}) return;\n` +
        `${c.v('st')} = out;\n` +
        `${c.emit('out', 'out')}`
    }
  },

  /* ---------- Zeit ---------- */
  {
    type: 'staircase', cat: 'Zeit', name: 'Treppenlicht',
    help: '1 schaltet ein und startet die Laufzeit neu; nach Ablauf aus.',
    inputs: [{ id: 'trig', type: 'bool', label: 'Auslöser' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Licht' }],
    params: [
      { id: 'time', label: 'Laufzeit', unit: 's', type: 'u16', def: 120, min: 1, max: 65535 },
      { id: 'offEarly', label: '0 schaltet sofort aus', type: 'enum', options: YES_NO, def: 0 }
    ],
    gen: {
      state: c => `static Timeout ${c.v('t')};`,
      in: c =>
        `if (v)\n` +
        `{\n` +
        `    bool wasOn = ${c.v('t')}.started();\n` +
        `    ${c.v('t')}.start(${c.param('time')} * 1000UL);\n` +
        `    if (!wasOn) { ${c.emit('out', '1')} }\n` +
        `}\n` +
        `else if (${c.param('offEarly')} && ${c.v('t')}.started())\n` +
        `{\n` +
        `    ${c.v('t')}.stop();\n` +
        `    ${c.emit('out', '0')}\n` +
        `}`,
      loop: c => `if (${c.v('t')}.expired()) { ${c.emit('out', '0')} }`
    }
  },
  {
    type: 'delay', cat: 'Zeit', name: 'Verzögerung',
    help: 'Ein- und Ausschaltverzögerung. 0 s = ohne Verzögerung.',
    inputs: [{ id: 'in', type: 'bool', label: 'Eingang' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    params: [
      { id: 'on', label: 'Einschaltverzögerung', unit: 's', type: 'u16', def: 0 },
      { id: 'off', label: 'Ausschaltverzögerung', unit: 's', type: 'u16', def: 0 }
    ],
    gen: {
      state: c => `static Timeout ${c.v('t')};\nstatic int32_t ${c.v('next')};`,
      in: c =>
        `${c.v('next')} = v != 0;\n` +
        `uint32_t ms = (v ? ${c.param('on')} : ${c.param('off')}) * 1000UL;\n` +
        `if (ms) { ${c.v('t')}.start(ms); return; }\n` +
        `${c.v('t')}.stop();\n` +
        `${c.emit('out', c.v('next'))}`,
      loop: c => `if (${c.v('t')}.expired()) { ${c.emit('out', c.v('next'))} }`
    }
  },
  {
    type: 'start', cat: 'Zeit', name: 'Systemstart',
    help: 'Gibt nach dem Start (Busspannungswiederkehr, Download) einmal 1 aus.',
    outputs: [{ id: 'out', type: 'bool', label: 'Start' }],
    params: [{ id: 'delay', label: 'Verzögerung', unit: 's', type: 'u16', def: 2 }],
    gen: {
      state: c => `static Timeout ${c.v('t')};`,
      init: c => `${c.v('t')}.start(${c.param('delay')} * 1000UL + 1);`,
      loop: c => `if (${c.v('t')}.expired()) { ${c.emit('out', '1')} }`
    }
  }
];

const byType = new Map(DEFS.map(d => [d.type, d]));
const CATS = [...new Set(DEFS.map(d => d.cat))];

/* Ports, Parameter und KOs können von den Eigenschaften abhängen. */
const list = (v, node) => (typeof v === 'function' ? v(node) : v) || [];

function defaults(def) {
  const props = {}, params = {};
  (def.props || []).forEach(p => { props[p.id] = p.def; });
  const node = { props };
  list(def.params, node).forEach(p => { params[p.id] = p.def; });
  return { props, params };
}

return {
  DPT, OBJ_SIZE, MASK, MCU, PTYPE, DEFS, CATS,
  get: type => byType.get(type),
  inputs: (def, node) => list(def.inputs, node),
  outputs: (def, node) => list(def.outputs, node),
  params: (def, node) => list(def.params, node),
  kos: (def, node) => list(def.kos, node),
  defaults
};
})();
