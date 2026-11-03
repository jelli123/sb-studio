/* ============================================================
   Blockbibliothek: Datenpunkttypen, Chips, Hardware-Plattformen, Blöcke
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
  '9.007': { name: 'Luftfeuchte (%)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-7', float: true },
  '17.001': { name: 'Szenennummer (0…63 = 1…64)', type: 'num', size: '1 Byte', dpst: 'DPST-17-1' },
  '18.001': { name: 'Szenensteuerung',  type: 'num',  size: '1 Byte',  dpst: 'DPST-18-1' }
};
/* Porttyp als Text (Tooltip, Inspektor), mit Wertebereich, wenn der Port einen nennt */
const portType = p => p.type === 'bool' ? 'bool (0/1)' : p.range ? ['Zahl {0}', p.range] : 'Zahl';
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

/* ---------- Chips ----------
   Was jeder GPIO kann, nach UM10398 (Tab. 160 LPC1100L, Tab. 170
   LPC1100XL, LQFP48): A/D-Kanal, Timer-Match-Ausgänge (mat) und
   Capture-Eingänge (cap) als [Timer, Kanal]. */
const T16_0 = 'timer16_0', T16_1 = 'timer16_1', T32_0 = 'timer32_0', T32_1 = 'timer32_1';
const GPIO_LPC11L = {
  PIO0_0: { note: 'RESET' }, PIO0_1: { mat: [[T32_0, 2]], note: 'ISP_EN' }, PIO0_2: { cap: [[T16_0, 0]] }, PIO0_3: {},
  PIO0_4: { note: 'I²C, open drain' }, PIO0_5: { note: 'I²C, open drain' }, PIO0_6: {}, PIO0_7: { note: 'High-Current' },
  PIO0_8: { mat: [[T16_0, 0]] }, PIO0_9: { mat: [[T16_0, 1]] }, PIO0_10: { mat: [[T16_0, 2]], note: 'SWCLK' },
  PIO0_11: { adc: 'AD0', mat: [[T32_0, 3]] },
  PIO1_0: { adc: 'AD1', cap: [[T32_1, 0]] }, PIO1_1: { adc: 'AD2', mat: [[T32_1, 0]] }, PIO1_2: { adc: 'AD3', mat: [[T32_1, 1]] },
  PIO1_3: { adc: 'AD4', mat: [[T32_1, 2]], note: 'SWDIO' }, PIO1_4: { adc: 'AD5', mat: [[T32_1, 3]] },
  PIO1_5: { cap: [[T32_0, 0]] }, PIO1_6: { mat: [[T32_0, 0]] }, PIO1_7: { mat: [[T32_0, 1]] },
  PIO1_8: { cap: [[T16_1, 0]] }, PIO1_9: { mat: [[T16_1, 0]] }, PIO1_10: { adc: 'AD6', mat: [[T16_1, 1]] }, PIO1_11: { adc: 'AD7' },
  PIO2_0: {}, PIO2_1: {}, PIO2_2: {}, PIO2_3: {}, PIO2_4: {}, PIO2_5: {}, PIO2_6: {}, PIO2_7: {},
  PIO2_8: {}, PIO2_9: {}, PIO2_10: {}, PIO2_11: {},
  PIO3_0: {}, PIO3_1: {}, PIO3_2: {}, PIO3_3: {}, PIO3_4: {}, PIO3_5: {}
};
/* Die XL-Reihe (LPC1115/303) hat zusätzlich Timer an Port 2 und 3 */
const GPIO_LPC11XL = Object.assign({}, GPIO_LPC11L, {
  PIO1_11: { adc: 'AD7', cap: [[T32_1, 1]] },
  PIO2_4: { mat: [[T16_1, 1]] }, PIO2_5: { mat: [[T32_0, 0]] }, PIO2_6: { mat: [[T32_0, 1]] },
  PIO2_7: { mat: [[T32_0, 2]] }, PIO2_8: { mat: [[T32_0, 3]] }, PIO2_9: { cap: [[T32_0, 0]] }, PIO2_11: { cap: [[T32_0, 1]] },
  PIO3_0: { mat: [[T16_0, 0]] }, PIO3_1: { mat: [[T16_0, 1]] }, PIO3_2: { mat: [[T16_0, 2]] },
  PIO3_3: { cap: [[T16_0, 0]] }, PIO3_4: { cap: [[T16_0, 1]] }, PIO3_5: { cap: [[T16_1, 1]] }
});
/* Timerfunktion als Name aus dem Handbuch: CT16B1_CAP0 */
const timerFn = ([tm, ch], kind) => `CT${tm.slice(5).replace('_', 'B')}_${kind}${ch}`;
const withTimer = (gpio, kind) => Object.keys(gpio).filter(g => (gpio[g][kind] || []).length);

/* Busse: mögliche Pins je Signal. KNX braucht einen Capture-Eingang (RX)
   und einen Match-Ausgang (TX) desselben Timers. SB-Debug: RESET, SWD und
   ISP_EN sind fest belegt, ISP_TXD/RXD nur beim Flashen (mitbenutzbar). */
const BUS_NAMES = { knx: 'KNX', debug: 'SB-Debug', i2c: 'I²C', uart: 'UART', spi0: 'SPI0', spi1: 'SPI1' };
const BUS_INFO = {
  knx:   { required: true, always: true },
  debug: { always: true, shared: ['isp_txd', 'isp_rxd'] }
};
function buses(gpio, xl) {
  return {
    knx:   { rx: withTimer(gpio, 'cap'), tx: withTimer(gpio, 'mat') },
    debug: { reset: ['PIO0_0'], swdio: ['PIO1_3'], swclk: ['PIO0_10'], isp_en: ['PIO0_1'], isp_txd: ['PIO1_7'], isp_rxd: ['PIO1_6'] },
    i2c:   { scl: ['PIO0_4'], sda: ['PIO0_5'] },
    uart:  xl ? { rxd: ['PIO1_6', 'PIO2_7', 'PIO3_1', 'PIO3_4'], txd: ['PIO1_7', 'PIO2_8', 'PIO3_0', 'PIO3_5'] }
              : { rxd: ['PIO1_6'], txd: ['PIO1_7'] },
    spi0:  { sck: ['PIO0_6', 'PIO0_10', 'PIO2_11'], miso: ['PIO0_8'], mosi: ['PIO0_9'], ssel: ['PIO0_2'] },
    spi1:  xl ? { sck: ['PIO2_1', 'PIO3_2'], miso: ['PIO2_2', 'PIO1_10'], mosi: ['PIO2_3', 'PIO1_9'], ssel: ['PIO2_0', 'PIO2_4'] }
              : { sck: ['PIO2_1'], miso: ['PIO2_2'], mosi: ['PIO2_3'], ssel: ['PIO2_0'] }
  };
}

/* flashEnd: Ende des Codes = Beginn des letzten 4-KB-Sektors, den die sblib
   als UserEeprom nutzt (sie ermittelt die Flash-Größe zur Laufzeit).
   progDefault: PIN_PROG der sblib, abweichend setzt die Firmware setProgPin().
   knx: was die sblib kann – sie legt den Bus fest auf timer16_1 (BcuBase). */
const KNX_LPC11 = { rx: 'PIO1_8', tx: 'PIO1_9' };
const CHIP = {
  lpc1115: {
    name: 'LPC1115FBD48/303', family: 'lpc11xx', mask: 'MV-0701',
    flashEnd: 0xF000,   // 64 KB
    ram: 0x2000, gpio: GPIO_LPC11XL, buses: buses(GPIO_LPC11XL, true), progDefault: 'PIO2_0', knx: KNX_LPC11
  },
  lpc1114: {
    name: 'LPC1114FBD48/302', family: 'lpc11xx', mask: 'MV-0701',
    flashEnd: 0x7000,   // 32 KB; Firmware läuft auch auf dem LPC1115
    ram: 0x2000, gpio: GPIO_LPC11L, buses: buses(GPIO_LPC11L, false), progDefault: 'PIO2_0', knx: KNX_LPC11
  }
};

/* PWM: ein Match-Kanal, nicht MAT2 (Periode) und nicht am Timer des Busses */
function pwmOf(chip, gpio) {
  const g = chip && chip.gpio[gpio];
  const busTimer = chip && (chip.gpio[chip.knx.tx].mat || [])[0][0];
  const m = g && (g.mat || []).find(([tm, ch]) => ch !== 2 && tm !== busTimer);
  return m ? [m[0], `TIMER_MATCH_MAT${m[1]}`] : null;
}

/* Pin-Funktionen, die ein Block verlangen kann */
const PIN_FN = { in: 'Eingang', out: 'Ausgang', adc: 'Analog', pwm: 'PWM' };
const pinFns = (chip, gpio) => {
  const g = chip && chip.gpio[gpio];
  return g ? ['in', 'out'].concat(g.adc ? ['adc'] : [], pwmOf(chip, gpio) ? ['pwm'] : []) : [];
};

/* ---------- Hardware-Plattformen ----------
   Eine Plattform ist die Platine: Chip, Pins (Name → GPIO, erlaubte
   Funktionen), angeschlossene Busse, Programmiertaste. Eigene Plattformen
   stehen im Gerätemodell (model.platforms). */
const PINS_4TE = [
  ['IO1', 'PIO2_2'], ['IO2', 'PIO0_7'], ['IO3', 'PIO2_10'], ['IO4', 'PIO2_9'], ['IO5', 'PIO0_2'],
  ['IO6', 'PIO0_8'], ['IO7', 'PIO0_9'], ['IO8', 'PIO2_11'], ['IO9', 'PIO1_0'], ['IO10', 'PIO1_1'],
  ['IO11', 'PIO1_2'], ['IO12', 'PIO1_4'], ['IO13', 'PIO1_5'], ['IO14', 'PIO1_7'], ['IO15', 'PIO1_6'],
  ['APRG', 'PIO0_6'], ['PWM', 'PIO3_2'], ['TX', 'PIO3_0'], ['RX', 'PIO3_1'], ['INFO', 'PIO2_6'], ['RUN', 'PIO3_3']
];
/* Belegung nach sblib/hardware/gpio_lpc11xx.h. PIN_TX/PIN_RX sind nur beim
   LPC1115 der UART; beim LPC1114/302 liegt er auf IO15 (RXD) und IO14 (TXD). */
function platform4te(chip, uart) {
  return {
    name: `4TE-Controller (${chip === 'lpc1115' ? 'LPC1115' : 'LPC1114/302'})`, chip, prog: 'PIO2_0', builtin: true,
    pins: PINS_4TE.map(([name, gpio]) => ({ name, gpio, fn: pinFns(CHIP[chip], gpio) })),
    buses: {
      knx: { rx: 'PIO1_8', tx: 'PIO1_9' },
      debug: { reset: 'PIO0_0', swdio: 'PIO1_3', swclk: 'PIO0_10', isp_en: 'PIO0_1', isp_txd: 'PIO1_7', isp_rxd: 'PIO1_6' },
      i2c: { scl: 'PIO0_4', sda: 'PIO0_5' },
      uart,
      spi0: { sck: 'PIO0_6', miso: 'PIO0_8', mosi: 'PIO0_9', ssel: 'PIO0_2' }
    }
  };
}
const PLATFORMS = {
  '4te-lpc1115': platform4te('lpc1115', { rxd: 'PIO3_1', txd: 'PIO3_0' }),
  '4te-lpc1114': platform4te('lpc1114', { rxd: 'PIO1_6', txd: 'PIO1_7' })
};
/* Frühere Modelle nannten nur die MCU */
const PLATFORM_OF_MCU = { lpc1115: '4te-lpc1115', lpc1114: '4te-lpc1114' };

/* Was ein Block an Hardware braucht und ob die Plattform es bietet:
   Pin-Eigenschaften mit Funktion (fn, eine oder mehrere) und Busse (bus). */
const fnsOf = p => [].concat(p.fn || ['in', 'out']);
const pinsFor = (platform, p) => (platform ? platform.pins : []).filter(x => fnsOf(p).every(f => (x.fn || []).includes(f)));
/* Bus-Eigenschaft (kind: 'bus'): angeschlossene Busse aus p.buses, die alle
   verlangten Signale haben; der Block belegt nur diese Signale */
const busesFor = (platform, p) => p.buses.filter(b => {
  const sig = platform && platform.buses && platform.buses[b];
  return sig && (p.signals || []).every(x => sig[x]);
});
/* Eigenschaften mit when gelten nur bei passender Auswahl (NeoPixel: Port
   bei SPI, Pin bei Timer) */
/* Obergrenze einer Ganzzahl, auch abhängig von anderen Eigenschaften */
const maxOf = (p, n) => typeof p.max === 'function' ? p.max(n) : p.max;
const activeProps = (def, props) => (def.props || []).filter(p =>
  !p.when || Object.entries(p.when).every(([k, v]) => props && props[k] === v));
function missingFor(def, platform, props) {
  const out = [];
  activeProps(def, props).filter(p => p.kind === 'pin' && !pinsFor(platform, p).length)
    .forEach(p => out.push({ fn: fnsOf(p) }));
  activeProps(def, props).filter(p => p.kind === 'bus' && !busesFor(platform, p).length)
    .forEach(p => out.push({ bus: p.buses }));
  [].concat(def.bus || []).filter(b => !(platform && platform.buses && platform.buses[b])).forEach(b => out.push({ bus: b }));
  return out;
}
/* Ohne Knoten: verfügbar, wenn eine Auswahl der umschaltenden Eigenschaft
   (switches) geht; mit Knoten: für seine Auswahl */
function missing(def, platform, node) {
  if (node) return missingFor(def, platform, node.props);
  const sw = (def.props || []).find(p => p.switches);
  if (!sw) return missingFor(def, platform, {});
  const all = sw.options.map(([v]) => missingFor(def, platform, { [sw.id]: v }));
  return all.find(m => !m.length) || [].concat(...all);
}
/* Erste Auswahl der umschaltenden Eigenschaft, die auf der Plattform geht */
function feasible(def, platform, props) {
  const sw = (def.props || []).find(p => p.switches);
  if (!sw || !missingFor(def, platform, props).length) return null;
  const ok = sw.options.find(([v]) => !missingFor(def, platform, { ...props, [sw.id]: v }).length);
  return ok ? [sw.id, ok[0]] : null;
}

/* Parametertypen: Größe in Byte, C-Typ, Lesefunktion der Firmware */
const PTYPE = {
  u8:   { size: 1, ctype: 'uint8_t',  read: 'paramU8',  min: 0,      max: 255 },
  u16:  { size: 2, ctype: 'uint16_t', read: 'paramU16', min: 0,      max: 65535 },
  i16:  { size: 2, ctype: 'int16_t',  read: 'paramU16', min: -32768, max: 32767 },
  enum: { size: 1, ctype: 'uint8_t',  read: 'paramU8' }
};

const YES_NO = [[0, 'Nein'], [1, 'Ja']];
/* Werttyp der durchgereichten Ports (Tor, Auswahl) */
const VTYPE = { id: 'vtype', label: 'Datentyp', kind: 'enum', options: [['bool', 'bool (0/1)'], ['num', 'Zahl']], def: 'bool' };
const SEND_MODE = [[0, 'nur bei Änderung'], [1, 'bei jedem Eingangsereignis']];
const range = n => Array.from({ length: n }, (_, i) => i);
const bool = (v, invert) => invert ? `(${v}) ? 0 : 1` : `(${v}) ? 1 : 0`;
const indent = (code, n = 1) => code.split('\n').map(l => l ? '    '.repeat(n) + l : l).join('\n');
const hex2 = v => '0x' + Number(v).toString(16).toUpperCase().padStart(2, '0');

/* Float-Variable (°C, %, lx) → Hundertstel, gerundet, ohne libm */
const hundredths = f => `(int32_t) (${f} * 100.0f + (${f} < 0 ? -0.5f : 0.5f))`;
/* Messwert nur ausgeben, wenn er sich um mindestens den Parameter geändert hat
   (der erste Wert immer) */
const changedState = (c, s = '') => `static int32_t ${c.v('last' + s)};\nstatic bool ${c.v('valid' + s)};`;
function onChange(c, val, delta, port, s = '') {
  const last = c.v('last' + s), valid = c.v('valid' + s);
  return `if (!${valid} || ${val} - ${last} >= (int32_t) ${c.param(delta)} || ${last} - ${val} >= (int32_t) ${c.param(delta)})\n` +
    `{\n` +
    `    ${valid} = true;\n` +
    `    ${last} = ${val};\n` +
    `    ${c.emit(port, val)}\n` +
    `}`;
}

/* PWM: ein Timer je Pinpaar, Periode auf MAT2 (Kanal aus der Chip-Tabelle) */
const PWM_PERIOD = 1000;
/* Logarithmische Kennlinie wie DALI: Stufe 1…255 → 0,1…100 % in gleichen
   Verhältnisschritten (je Stufe ≈ 2,8 % heller), passt zum Seheindruck */
const PWM_LOG = range(256).map(x => x ? Math.round(PWM_PERIOD * Math.pow(10, 3 * (x - 255) / 254)) : 0);
const PWM_LOG_LIB =
  `/* PWM-Kennlinie logarithmisch: Stufe 0…255 → Pulsweite 0…${PWM_PERIOD} (0,1…100 %) */\n` +
  `static const uint16_t pwmLog[256] = {\n` +
  range(16).map(i => '    ' + PWM_LOG.slice(i * 16, i * 16 + 16).join(', ')).join(',\n') + '\n};';
const pwmMatch = (c, expr) => `${c.gpio('pin').pwm[0]}.match(${c.gpio('pin').pwm[1]}, ${expr});`;

/* WS2812/SK6812 über den SSP: je LED-Bit 3 SPI-Bits bei 2,4 MHz (100 = 0,
   110 = 1, High 0,42 bzw. 0,83 µs), ein 12-Bit-Rahmen trägt 4 LED-Bits. */
const WS_NIBBLE = range(16).map(n => [3, 2, 1, 0].reduce((v, b) => (v << 3) | ((n >> b) & 1 ? 6 : 4), 0));
const WS_ORDER = { GRB: [1, 0, 2], RGB: [0, 1, 2], GRBW: [1, 0, 2, 3] };
const SSP = { spi0: ['SPI_PORT_0', 'LPC_SSP0'], spi1: ['SPI_PORT_1', 'LPC_SSP1'] };
const clampByte = () => 'v < 0 ? 0 : v > 255 ? 255 : v';
/* Einzeln: Zahl der Eingänge und des Puffers (1…8), sonst eine LED wiederholt */
const wsLeds = n => n.props.mode === 'single' ? Math.max(1, Math.min(8, Number(n.props.count) || 1)) : 1;
const wsLedsC = c => c.prop('mode') === 'single' ? Math.max(1, Math.min(8, Number(c.prop('count')) || 1)) : 1;
const wsBpl = c => c.prop('order') === 'GRBW' ? 4 : 3;
const wsChannels = n => (n.props.color === 'hsv'
  ? [['h', 'Farbton'], ['s', 'Sättigung'], ['v', 'Hellwert']]
  : [['r', 'Rot'], ['g', 'Grün'], ['b', 'Blau']]).concat(n.props.order === 'GRBW' ? [['w', 'Weiß']] : []);
/* HSV → RGB, alles 0…255 (Farbton 0…255 = 0…360°, wie DPT 5.003) */
const WS_HSV_LIB =
  `/* HSV → RGB, je 0…255; Farbton 0…255 = 0…360° in sechs Sektoren */\n` +
  `static void hsvToRgb(uint32_t h, uint32_t s, uint32_t v, uint8_t* rgb)\n` +
  `{\n` +
  `    uint32_t hh = h * 6;               // 0…1530\n` +
  `    uint32_t f = hh & 0xFF;            // Anteil im Sektor\n` +
  `    uint8_t p = (uint8_t) (v * (255 - s) / 255);\n` +
  `    uint8_t q = (uint8_t) (v * (255 - s * f / 255) / 255);\n` +
  `    uint8_t t = (uint8_t) (v * (255 - s * (255 - f) / 255) / 255);\n` +
  `    uint8_t w = (uint8_t) v;\n` +
  `    switch (hh >> 8)\n` +
  `    {\n` +
  `    case 0:  rgb[0] = w; rgb[1] = t; rgb[2] = p; break;\n` +
  `    case 1:  rgb[0] = q; rgb[1] = w; rgb[2] = p; break;\n` +
  `    case 2:  rgb[0] = p; rgb[1] = w; rgb[2] = t; break;\n` +
  `    case 3:  rgb[0] = p; rgb[1] = q; rgb[2] = w; break;\n` +
  `    case 4:  rgb[0] = t; rgb[1] = p; rgb[2] = w; break;\n` +
  `    default: rgb[0] = w; rgb[1] = p; rgb[2] = q; break;\n` +
  `    }\n` +
  `}`;
const TIMER_HW = {
  timer16_0: ['LPC_TMR16B0', 'TIMER16_0_IRQHandler', 'TIMER_16_0_IRQn'],
  timer16_1: ['LPC_TMR16B1', 'TIMER16_1_IRQHandler', 'TIMER_16_1_IRQn'],
  timer32_0: ['LPC_TMR32B0', 'TIMER32_0_IRQHandler', 'TIMER_32_0_IRQn'],
  timer32_1: ['LPC_TMR32B1', 'TIMER32_1_IRQHandler', 'TIMER_32_1_IRQn']
};
/* SPI: 12-Bit-Rahmen über den SSP; Interrupts bleiben an (KNX-Empfang), der
   Sende-FIFO (8 Rahmen = 40 µs) überbrückt sie. Bei CPHA = 1 folgen die
   Rahmen lückenlos, danach ruht die Leitung low (jedes Muster endet mit 0). */
const WS_SPI_LIB =
  `/* WS2812/SK6812 über den SSP, 2,4 MHz (48 MHz Systemtakt): ein 12-Bit-Rahmen\n` +
  `   = 4 LED-Bits, 100 = 0, 110 = 1 */\n` +
  `static const uint16_t ws2812Nibble[16] = {\n    ${WS_NIBBLE.map(v => '0x' + v.toString(16).toUpperCase().padStart(3, '0')).join(', ')}\n};\n\n` +
  `static void ws2812Send(LPC_SSP_TypeDef* ssp, const uint8_t* led, int bytes, int repeat)\n` +
  `{\n` +
  `    for (int n = 0; n < repeat; n++)\n` +
  `    {\n` +
  `        for (int i = 0; i < bytes; i++)\n` +
  `        {\n` +
  `            while (!(ssp->SR & 0x02)) {} // TNF: Platz im Sende-FIFO\n` +
  `            ssp->DR = ws2812Nibble[led[i] >> 4];\n` +
  `            while (!(ssp->SR & 0x02)) {}\n` +
  `            ssp->DR = ws2812Nibble[led[i] & 0x0F];\n` +
  `        }\n` +
  `    }\n` +
  `    while (ssp->SR & 0x10) {}          // BSY: letzter Rahmen gesendet\n` +
  `    while (ssp->SR & 0x04) (void) ssp->DR; // RNE: Empfangenes verwerfen\n` +
  `    ssp->ICR = 0x03;                    // Überlauf-Flags löschen\n` +
  `}`;

const MATH = {
  add: { name: 'A + B', expr: (a, b) => `${a} + ${b}` },
  sub: { name: 'A − B', expr: (a, b) => `${a} - ${b}` },
  mul: { name: 'A × B', expr: (a, b) => `${a} * ${b}` },
  div: { name: 'A ÷ B', expr: (a, b) => `${a} / ${b}`, guard: (a, b) => `${b} == 0` },
  min: { name: 'Minimum', expr: (a, b) => `${a} < ${b} ? ${a} : ${b}` },
  max: { name: 'Maximum', expr: (a, b) => `${a} > ${b} ? ${a} : ${b}` },
  avg: { name: 'Mittelwert', expr: (a, b) => `(int32_t) (((int64_t) ${a} + ${b}) / 2)` }
};
const CMP = { eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' };

const DEFS = [
  /* ---------- Hardware ---------- */
  {
    type: 'di', cat: 'Hardware', name: 'Digitaleingang',
    help: 'Liest einen Pin entprellt und meldet jede Änderung.',
    outputs: [{ id: 'out', type: 'bool', label: 'Zustand' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'in', def: 'IO1' },
      { id: 'pullup', label: 'Pull-up', kind: 'bool', def: true },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false }
    ],
    params: [{ id: 'debounce', label: 'Entprellzeit', unit: 'ms', type: 'u16', def: 50, min: 0, max: 10000 }],
    gen: {
      state: c => `static Debouncer ${c.v('deb')};\nstatic int32_t ${c.v('last')};`,
      setup: c => `pinMode(${c.pin('pin')}, INPUT${c.prop('pullup') ? ' | PULL_UP' : ''});`,
      init: c =>
        `${c.v('last')} = ${bool(`digitalRead(${c.pin('pin')})`, c.prop('invert'))};\n` +
        `${c.v('deb')}.init(${c.v('last')});`,
      loop: c =>
        `{\n` +
        `    int32_t v = ${c.v('deb')}.debounce(${bool(`digitalRead(${c.pin('pin')})`, c.prop('invert'))}, ${c.param('debounce')});\n` +
        `    if (v != ${c.v('last')})\n` +
        `    {\n` +
        `        ${c.v('last')} = v;\n` +
        `        ${c.emit('out', 'v')}\n` +
        `    }\n` +
        `}`
    }
  },
  {
    type: 'do', cat: 'Hardware', name: 'Digitalausgang',
    help: 'Schaltet einen Pin (z. B. Relaistreiber oder LED).',
    inputs: [{ id: 'in', type: 'bool', label: 'Schalten' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'out', def: 'IO2' },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false },
      { id: 'initial', label: 'Zustand nach Start', kind: 'bool', def: false }
    ],
    gen: {
      setup: c =>
        `pinMode(${c.pin('pin')}, OUTPUT);\n` +
        `digitalWrite(${c.pin('pin')}, ${(c.prop('initial') ? 1 : 0) ^ (c.prop('invert') ? 1 : 0)});`,
      in: c => `digitalWrite(${c.pin('pin')}, ${bool('v != 0', c.prop('invert'))});`
    }
  },
  {
    type: 'ai', cat: 'Hardware', name: 'Analogeingang',
    help: 'Liest den A/D-Wandler (10 Bit, 0…1023 = 0…3,3 V) in festen Abständen und gibt Änderungen ab einer Mindestdifferenz aus.',
    outputs: [{ id: 'out', type: 'num', label: 'Rohwert' }],
    props: [{ id: 'pin', label: 'Pin', kind: 'pin', fn: 'adc', def: 'IO9' }],
    params: [
      { id: 'interval', label: 'Abfrageintervall', unit: 'ms', type: 'u16', def: 500, min: 10, max: 65535 },
      { id: 'delta', label: 'Ausgabe ab Änderung um', unit: 'Rohwert', type: 'u16', def: 4, min: 0, max: 1023 }
    ],
    gen: {
      include: 'sblib/analog_pin.h',
      shared: 'analogBegin();',
      state: c => `static Timeout ${c.v('t')};\n${changedState(c)}`,
      setup: c => `pinMode(${c.pin('pin')}, INPUT_ANALOG);`,
      init: c => `${c.v('t')}.start(1);`,
      loop: c =>
        `if (${c.v('t')}.expired())\n` +
        `{\n` +
        `    ${c.v('t')}.start(${c.param('interval')});\n` +
        `    int32_t v = analogRead(${c.gpio('pin').adc});\n` +
        indent(onChange(c, 'v', 'delta', 'out')) + `\n` +
        `}`
    }
  },
  {
    type: 'pwm', cat: 'Hardware', name: 'PWM-Ausgang',
    help: 'Pulsweite 0…255 (DPT 5.001 roh) mit 1 kHz, z. B. für LED-Treiber. Mit Dimmzeit läuft der Wert gleitend zum Ziel. Die logarithmische Kennlinie (0,1…100 %, wie DALI) wirkt für das Auge gleichmäßig, auch beim Dimmen.',
    inputs: [{ id: 'in', type: 'num', label: 'Helligkeit' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'pwm', def: 'IO6' },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false },
      { id: 'curve', label: 'Kennlinie', kind: 'enum', def: 'lin',
        options: [['lin', 'linear'], ['log', 'logarithmisch (Seheindruck)']] }
    ],
    params: [{ id: 'fade', label: 'Dimmzeit 0…100 %', unit: 'ms, 0 = sofort', type: 'u16', def: 0 }],
    gen: {
      lib: c => c.prop('curve') === 'log' ? PWM_LOG_LIB : null,
      /* Ein Timer je Pinpaar: Periode auf MAT2 (1 MHz Takt, 1000 Schritte),
         Ausgang high, sobald der Zähler den Vergleichswert erreicht */
      shared: c => {
        const t = c.gpio('pin').pwm[0];
        return `${t}.begin();\n` +
          `${t}.prescaler(SystemCoreClock / 1000000 - 1);\n` +
          `${t}.matchMode(TIMER_MATCH_MAT2, RESET);\n` +
          `${t}.match(TIMER_MATCH_MAT2, ${PWM_PERIOD - 1});\n` +
          `${t}.start();`;
      },
      state: c =>
        `static int32_t ${c.v('cur')};\nstatic int32_t ${c.v('target')};\nstatic Timeout ${c.v('step')};\n` +
        `static void ${c.v('apply')}()\n{\n` +
        `    int32_t d = ${c.prop('curve') === 'log' ? `pwmLog[${c.v('cur')}]` : `${c.v('cur')} * ${PWM_PERIOD} / 255`};\n` +
        (c.prop('invert') ? `    d = ${PWM_PERIOD} - d;\n` : '') +
        `    ${pwmMatch(c, `${PWM_PERIOD} - d`)}\n}`,
      setup: c =>
        `pinMode(${c.pin('pin')}, OUTPUT_MATCH);\n` +
        `${c.v('apply')}();\n` +
        `${c.gpio('pin').pwm[0]}.pwmEnable(${c.gpio('pin').pwm[1]});`,
      in: c =>
        `${c.v('target')} = v < 0 ? 0 : v > 255 ? 255 : v;\n` +
        `if (${c.param('fade')} == 0)\n` +
        `{\n` +
        `    ${c.v('cur')} = ${c.v('target')};\n` +
        `    ${c.v('apply')}();\n` +
        `}\n` +
        `else if (!${c.v('step')}.started()) ${c.v('step')}.start(1);`,
      loop: c =>
        `if (${c.v('step')}.expired() && ${c.v('cur')} != ${c.v('target')})\n` +
        `{\n` +
        `    ${c.v('cur')} += ${c.v('cur')} < ${c.v('target')} ? 1 : -1;\n` +
        `    ${c.v('apply')}();\n` +
        `    if (${c.v('cur')} != ${c.v('target')}) ${c.v('step')}.start(${c.param('fade')} / 255 + 1);\n` +
        `}`
    }
  },

  {
    type: 'neopixel', cat: 'Hardware', name: 'NeoPixel (WS2812/SK6812)',
    help: 'Adressierbare LEDs (WS2812B, WS2811, SK6812, auch RGBW). Ansteuerung über SPI (MOSI, sendet am Stück) oder über einen Timer-Match-Pin (Interrupt je Bit, sendet im Hintergrund aus einem Doppelpuffer) – je nachdem, was die Plattform bietet. Alle LEDs gleich oder 1…8 LEDs einzeln, Farbe als RGB oder HSV (Farbton 0…255 = 0…360°, wie DPT 5.003). 5-V-LEDs brauchen meist einen Pegelwandler an der Datenleitung.',
    inputs: n => [
      ...range(wsLeds(n)).flatMap(i => wsChannels(n).map(([id, label]) =>
        n.props.mode === 'single'
          ? { id: `l${i + 1}${id}`, type: 'num', range: '0…255', label: ['LED {0}: {1}', i + 1, label] }
          : { id, type: 'num', range: '0…255', label })),
      { id: 'bri', type: 'num', range: '0…255', label: 'Helligkeit' }, { id: 'on', type: 'bool', label: 'Ein/Aus' }
    ],
    props: [
      { id: 'method', label: 'Ansteuerung', kind: 'enum', switches: true, def: 'spi',
        options: [['spi', 'SPI (MOSI)'], ['timer', 'Timer-Interrupt (Match-Pin)']] },
      { id: 'port', label: 'SPI-Port (Daten an MOSI)', kind: 'bus', buses: ['spi0', 'spi1'], signals: ['mosi'], def: 'spi0', when: { method: 'spi' } },
      { id: 'pin', label: 'Pin (Timer-Match-Ausgang)', kind: 'pin', fn: 'pwm', timer: 'exclusive', def: 'IO6', when: { method: 'timer' } },
      { id: 'color', label: 'Farbmodell', kind: 'enum', def: 'rgb',
        options: [['rgb', 'RGB (Rot, Grün, Blau)'], ['hsv', 'HSV (Farbton, Sättigung, Hellwert)']] },
      { id: 'mode', label: 'LEDs', kind: 'enum', def: 'all', options: [['all', 'alle gleich'], ['single', 'einzeln (1…8)']] },
      { id: 'count', label: 'Anzahl LEDs', kind: 'int', min: 1, max: n => n.props.mode === 'single' ? 8 : 512, def: 8 },
      { id: 'order', label: 'Farbreihenfolge', kind: 'enum', def: 'GRB',
        options: [['GRB', 'GRB (WS2812B, SK6812)'], ['RGB', 'RGB (WS2811 u. a.)'], ['GRBW', 'GRBW (SK6812 RGBW)']] }
    ],
    params: [{ id: 'start', label: 'Helligkeit nach Start', unit: '0…255', type: 'u8', def: 255 }],
    gen: {
      include: c => c.prop('method') === 'spi' ? 'sblib/spi.h' : null,
      lib: c => [c.prop('method') === 'spi' && WS_SPI_LIB, c.prop('color') === 'hsv' && WS_HSV_LIB],
      /* SSPxCLKDIV 2 und CPSR 2 setzt der Konstruktor: 48 MHz / 2 / 2 / 5 = 2,4 MHz */
      shared: c => c.prop('method') !== 'spi' ? null :
        `{\n` +
        `    SPI spi(${SSP[c.prop('port')][0]}, SPI_FORMAT_SPI | SPI_CPOL_LOW | SPI_CPHASE_FALL);\n` +
        `    spi.setDataSize(SPI_DATA_12BIT);\n` +
        `    spi.setClockDivider(5);\n` +
        `    spi.begin();\n` +
        `}`,
      state: c => {
        const leds = wsLedsC(c), bpl = wsBpl(c), order = WS_ORDER[c.prop('order')] || WS_ORDER.GRB;
        const hsv = c.prop('color') === 'hsv';
        const src = ch => hsv && ch < 3 ? `rgb[${ch}]` : `${c.v('color')}[i][${ch}]`;
        let s =
          `static uint8_t ${c.v('color')}[${leds}][4]; // ${hsv ? 'H, S, V' : 'R, G, B'}, W je LED\n` +
          `static int32_t ${c.v('bri')};\n` +
          `static bool ${c.v('on')} = true;\n` +
          `static bool ${c.v('dirty')} = true;\n` +
          `static Timeout ${c.v('gap')};        // Pause ≥ 280 µs = Übernahme\n\n` +
          `/* Farben mit Helligkeit in Sendereihenfolge (${c.prop('order')}) */\n` +
          `static void ${c.v('build')}(uint8_t* out)\n` +
          `{\n` +
          `    int32_t k = ${c.v('on')} ? ${c.v('bri')} : 0;\n` +
          `    for (int i = 0; i < ${leds}; i++)\n` +
          `    {\n` +
          (hsv ? `        uint8_t rgb[3];\n        hsvToRgb(${c.v('color')}[i][0], ${c.v('color')}[i][1], ${c.v('color')}[i][2], rgb);\n` : '') +
          order.map((ch, j) => `        out[i * ${bpl} + ${j}] = (uint8_t) (${src(ch)} * k / 255);\n`).join('') +
          `    }\n` +
          `}`;
        if (c.prop('method') === 'timer') {
          const tm = c.gpio('pin').pwm[0], ch = +c.gpio('pin').pwm[1].slice(-1), [reg, handler] = TIMER_HW[tm];
          s += `\n\n` +
            `/* Senden per Timer-Interrupt: ${tm} MAT${ch} setzt den Pin per Software auf high und\n` +
            `   per Match nach T0H/T1H wieder low, stoppt und meldet das Bitende. Die Low-Zeit\n` +
            `   dauert bis zum nächsten Bit (LEDs dulden das bis zur Übernahmepause), der\n` +
            `   KNX-Bus mit höherer Priorität verlängert sie nur. Doppelpuffer: gesendet wird\n` +
            `   aus dem einen, die Eingänge schreiben in den anderen. */\n` +
            `static uint8_t ${c.v('buf')}[2][${leds * bpl}];\n` +
            `static uint8_t ${c.v('back')};\n` +
            `static bool ${c.v('ready')};\n` +
            `static bool ${c.v('sending')};\n` +
            `static const uint8_t* volatile ${c.v('tx')};\n` +
            `static volatile uint32_t ${c.v('rem')};    // noch zu sendende Bits\n` +
            `static volatile uint16_t ${c.v('idx')};\n` +
            `static volatile uint8_t ${c.v('mask')};\n` +
            `static volatile bool ${c.v('busy')};\n` +
            `static uint32_t ${c.v('t0h')}, ${c.v('t1h')};  // High-Zeiten in Timertakten\n\n` +
            `extern "C" __attribute__((section(".ramfunc"))) void ${handler}()\n` +
            `{\n` +
            `    ${reg}->IR = 1 << ${ch};\n` +
            `    uint32_t rem = ${c.v('rem')};\n` +
            `    if (!rem)\n` +
            `    {\n` +
            `        ${c.v('busy')} = false;\n` +
            `        return;\n` +
            `    }\n` +
            `    ${c.v('rem')} = rem - 1;\n` +
            `    uint8_t mask = ${c.v('mask')};\n` +
            `    uint16_t idx = ${c.v('idx')};\n` +
            `    ${reg}->MR${ch} = (${c.v('tx')}[idx] & mask) ? ${c.v('t1h')} : ${c.v('t0h')};\n` +
            `    mask >>= 1;\n` +
            `    if (!mask)\n` +
            `    {\n` +
            `        mask = 0x80;\n` +
            `        if (++idx == ${leds * bpl}) idx = 0; // alle gleich: Puffer wiederholen\n` +
            `    }\n` +
            `    ${c.v('mask')} = mask;\n` +
            `    ${c.v('idx')} = idx;\n` +
            `    __disable_irq();               // High-Zeit darf nichts verlängern\n` +
            `    ${reg}->EMR |= 1 << ${ch};          // Pin high\n` +
            `    ${reg}->TCR = 1;                // Zähler ab 0, Match: low, Stopp, Interrupt\n` +
            `    __enable_irq();\n` +
            `}`;
        }
        return s;
      },
      setup: c => {
        if (c.prop('method') === 'spi') return `pinMode(${c.busPin('port', 'mosi')}, OUTPUT | SPI_MOSI);`;
        const tm = c.gpio('pin').pwm[0], mat = c.gpio('pin').pwm[1];
        return `${c.v('t0h')} = SystemCoreClock / 3000000;  // 0,33 µs\n` +
          `${c.v('t1h')} = SystemCoreClock / 1500000;  // 0,67 µs\n` +
          `${tm}.begin();\n` +
          `${tm}.prescaler(0);\n` +
          `${tm}.matchMode(${mat}, INTERRUPT | RESET | STOP | CLEAR);\n` +
          `${tm}.setIRQPriority(InterruptPriority::high); // unter dem KNX-Bus (highest)\n` +
          `${tm}.interrupts();\n` +
          `pinMode(${c.pin('pin')}, OUTPUT_MATCH);`;
      },
      init: c => `${c.v('bri')} = ${c.param('start')};\n${c.v('dirty')} = true;`,
      in: (c, port) => {
        const m = /^(?:l(\d+))?([rgbhsvw])$/.exec(port);
        if (m) {
          const led = m[1] ? +m[1] - 1 : 0, ch = 'rgb'.includes(m[2]) ? 'rgb'.indexOf(m[2]) : 'hsvw'.indexOf(m[2]);
          return `${c.v('color')}[${led}][${ch}] = ${clampByte()};\n${c.v('dirty')} = true;`;
        }
        if (port === 'bri') return `${c.v('bri')} = ${clampByte()};\n${c.v('dirty')} = true;`;
        return `${c.v('on')} = v != 0;\n${c.v('dirty')} = true;`;
      },
      loop: c => {
        const leds = wsLedsC(c), bpl = wsBpl(c), count = Number(c.prop('count'));
        if (c.prop('method') === 'spi')
          return `${c.v('gap')}.expired();\n` +
            `if (${c.v('dirty')} && ${c.v('gap')}.stopped())\n` +
            `{\n` +
            `    uint8_t led[${leds * bpl}];\n` +
            `    ${c.v('build')}(led);\n` +
            `    ws2812Send(${SSP[c.prop('port')][1]}, led, ${leds * bpl}, ${count / leds});\n` +
            `    ${c.v('dirty')} = false;\n` +
            `    ${c.v('gap')}.start(2);\n` +
            `}`;
        const irqn = TIMER_HW[c.gpio('pin').pwm[0]][2];
        return `${c.v('gap')}.expired();\n` +
          `if (${c.v('dirty')})                 // in den hinteren Puffer, auch während gesendet wird\n` +
          `{\n` +
          `    ${c.v('build')}(${c.v('buf')}[${c.v('back')}]);\n` +
          `    ${c.v('dirty')} = false;\n` +
          `    ${c.v('ready')} = true;\n` +
          `}\n` +
          `if (${c.v('sending')} && !${c.v('busy')})\n` +
          `{\n` +
          `    ${c.v('sending')} = false;\n` +
          `    ${c.v('gap')}.start(2);\n` +
          `}\n` +
          `if (${c.v('ready')} && !${c.v('sending')} && ${c.v('gap')}.stopped())\n` +
          `{\n` +
          `    ${c.v('tx')} = ${c.v('buf')}[${c.v('back')}];   // Puffer tauschen\n` +
          `    ${c.v('back')} ^= 1;\n` +
          `    ${c.v('idx')} = 0;\n` +
          `    ${c.v('mask')} = 0x80;\n` +
          `    ${c.v('rem')} = ${count * bpl * 8};\n` +
          `    ${c.v('ready')} = false;\n` +
          `    ${c.v('sending')} = true;\n` +
          `    ${c.v('busy')} = true;\n` +
          `    NVIC_SetPendingIRQ(${irqn}); // erstes Bit aus dem Interrupt\n` +
          `}`;
      }
    }
  },

  /* ---------- Sensoren ---------- */
  {
    type: 'sht4x', cat: 'Sensoren', name: 'SHT4x Temperatur/Feuchte',
    help: 'I²C-Sensor (Adresse 44h) an SDA/SCL des Controllers. Werte in Hundertsteln, passend zu DPT 9.001/9.007.',
    outputs: [{ id: 'temp', type: 'num', label: 'Temperatur' }, { id: 'hum', type: 'num', label: 'Feuchte' }],
    bus: 'i2c',
    resources: [['i2c:44', 'I²C-Adresse 44h']],
    params: [
      { id: 'interval', label: 'Messintervall', unit: 's', type: 'u16', def: 30, min: 1, max: 65535 },
      { id: 'dTemp', label: 'Temperatur ausgeben ab Änderung um', unit: '°C × 100', type: 'u16', def: 20 },
      { id: 'dHum', label: 'Feuchte ausgeben ab Änderung um', unit: '% × 100', type: 'u16', def: 100 },
      { id: 'offset', label: 'Temperaturkorrektur', unit: '°C × 100', type: 'i16', def: 0, min: -1000, max: 1000 }
    ],
    gen: {
      include: 'sblib/i2c/SHT4x.h',
      state: c => `static SHT4xClass ${c.v('sensor')};\nstatic Timeout ${c.v('t')};\n${changedState(c, 'temp')}\n${changedState(c, 'hum')}`,
      setup: c => `${c.v('sensor')}.init();`,
      init: c => `${c.v('t')}.start(1000);`,
      loop: c =>
        `if (${c.v('t')}.expired())\n` +
        `{\n` +
        `    ${c.v('t')}.start(${c.param('interval')} * 1000UL);\n` +
        `    if (${c.v('sensor')}.measureHighPrecision())\n` +
        `    {\n` +
        `        float t = ${c.v('sensor')}.getTemperature(), h = ${c.v('sensor')}.getHumidity();\n` +
        `        int32_t temp = ${hundredths('t')} + ${c.param('offset')};\n` +
        `        int32_t hum = ${hundredths('h')};\n` +
        indent(onChange(c, 'temp', 'dTemp', 'temp', 'temp'), 2) + `\n` +
        indent(onChange(c, 'hum', 'dHum', 'hum', 'hum'), 2) + `\n` +
        `    }\n` +
        `}`
    }
  },
  {
    type: 'bh1750', cat: 'Sensoren', name: 'BH1750 Helligkeit',
    help: 'I²C-Lichtsensor an SDA/SCL des Controllers. Lux in Hundertsteln, passend zu DPT 9.004.',
    outputs: [{ id: 'lux', type: 'num', label: 'Helligkeit' }],
    props: [{ id: 'addr', label: 'I²C-Adresse', kind: 'enum', options: [[0x23, '23h (ADDR offen/low)'], [0x5C, '5Ch (ADDR high)']], def: 0x23 }],
    bus: 'i2c',
    resources: n => [[`i2c:${n.props.addr.toString(16)}`, `I²C-Adresse ${n.props.addr.toString(16).toUpperCase()}h`]],
    params: [
      { id: 'interval', label: 'Messintervall', unit: 's', type: 'u16', def: 10, min: 1, max: 65535 },
      { id: 'delta', label: 'Ausgabe ab Änderung um', unit: 'lx × 100', type: 'u16', def: 1000 }
    ],
    gen: {
      include: 'sblib/i2c/bh1750.h',
      state: c => `static BH1750 ${c.v('sensor')}(${hex2(c.prop('addr'))});\nstatic Timeout ${c.v('t')};\n${changedState(c)}`,
      setup: c => `${c.v('sensor')}.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, ${hex2(c.prop('addr'))});`,
      init: c => `${c.v('t')}.start(1000);`,
      loop: c =>
        `if (${c.v('t')}.expired())\n` +
        `{\n` +
        `    ${c.v('t')}.start(${c.param('interval')} * 1000UL);\n` +
        `    float lux = ${c.v('sensor')}.readLightLevel();\n` +
        `    if (lux >= 0)\n` +
        `    {\n` +
        `        int32_t v = ${hundredths('lux')};\n` +
        indent(onChange(c, 'v', 'delta', 'lux'), 2) + `\n` +
        `    }\n` +
        `}`
    }
  },
  {
    type: 'ds18x20', cat: 'Sensoren', name: 'DS18x20 Temperatur (1-Wire)',
    help: 'Erster gefundener DS18S20/DS18B20/DS1822 am Pin (4,7 kΩ Pull-up nach 3,3 V). Temperatur in Hundertsteln, passend zu DPT 9.001.',
    outputs: [{ id: 'temp', type: 'num', label: 'Temperatur' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: ['in', 'out'], def: 'IO3' },
      { id: 'parasite', label: 'Parasitäre Versorgung', kind: 'bool', def: false }
    ],
    params: [
      { id: 'interval', label: 'Messintervall', unit: 's', type: 'u16', def: 30, min: 2, max: 65535 },
      { id: 'delta', label: 'Ausgabe ab Änderung um', unit: '°C × 100', type: 'u16', def: 20 },
      { id: 'offset', label: 'Temperaturkorrektur', unit: '°C × 100', type: 'i16', def: 0, min: -1000, max: 1000 }
    ],
    gen: {
      include: 'sblib/sensors/ds18x20.h',
      state: c => `static DS18x20 ${c.v('ds')};\nstatic Timeout ${c.v('t')};\nstatic bool ${c.v('conv')};\n${changedState(c)}`,
      setup: c => `${c.v('ds')}.DS18x20Init(${c.pin('pin')}, ${c.prop('parasite') ? 'true' : 'false'});`,
      init: c => `${c.v('ds')}.Search();\n${c.v('t')}.start(1000);`,
      /* Messung anstoßen, Ergebnis nach der Wandlungszeit (800 ms) abholen;
         ohne Sensor wird bei jedem Intervall neu gesucht */
      loop: c =>
        `if (${c.v('t')}.expired())\n` +
        `{\n` +
        `    ${c.v('t')}.start(${c.param('interval')} * 1000UL);\n` +
        `    if (!${c.v('ds')}.m_foundDevices) ${c.v('ds')}.Search();\n` +
        `    ${c.v('conv')} = ${c.v('ds')}.startConversion(0);\n` +
        `}\n` +
        `if (${c.v('conv')} && ${c.v('ds')}.readResult(0))\n` +
        `{\n` +
        `    ${c.v('conv')} = false;\n` +
        `    if (${c.v('ds')}.lastReadOk(0))\n` +
        `    {\n` +
        `        float t = ${c.v('ds')}.temperature(0);\n` +
        `        int32_t v = ${hundredths('t')} + ${c.param('offset')};\n` +
        indent(onChange(c, 'v', 'delta', 'temp'), 2) + `\n` +
        `    }\n` +
        `}`
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

  {
    type: 'gate', cat: 'Logik', name: 'Tor/Sperre',
    help: 'Lässt den Wert nur durch, solange das Tor offen ist („wenn … dann“). Als Sperrobjekt: 1 am Steuereingang sperrt. Beim Öffnen kann der zuletzt gesperrte Wert nachgesendet werden.',
    inputs: n => [{ id: 'in', type: n.props.vtype, label: 'Wert' }, { id: 'ctl', type: 'bool', label: 'Freigabe/Sperre' }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE],
    params: [
      { id: 'lock', label: 'Steuereingang', type: 'enum', options: [[0, '1 = Freigabe'], [1, '1 = Sperre']], def: 0 },
      { id: 'init', label: 'Nach Start', type: 'enum', options: [[0, 'gesperrt'], [1, 'offen']], def: 1 },
      { id: 'resend', label: 'Beim Öffnen letzten Wert senden', type: 'enum', options: YES_NO, def: 1 }
    ],
    gen: {
      state: c => `static int32_t ${c.v('val')};\nstatic bool ${c.v('has')};\nstatic bool ${c.v('open')};`,
      init: c => `${c.v('open')} = ${c.param('init')};`,
      in: (c, port) => port === 'in'
        ? `${c.v('val')} = v;\n` +
          `${c.v('has')} = true;\n` +
          `if (!${c.v('open')}) return;\n` +
          `${c.emit('out', 'v')}`
        : `bool open = (v != 0) != (${c.param('lock')} != 0);\n` +
          `if (open == ${c.v('open')}) return;\n` +
          `${c.v('open')} = open;\n` +
          `if (open && ${c.v('has')} && ${c.param('resend')}) { ${c.emit('out', c.v('val'))} }`
    }
  },
  {
    type: 'select', cat: 'Logik', name: 'Auswahl',
    help: 'Wählt nach der Bedingung Wert A (1) oder Wert B (0) – „wenn … dann A, sonst B“. Gibt aus, wenn sich die Bedingung oder der gewählte Wert ändert.',
    inputs: n => [{ id: 'cond', type: 'bool', label: 'Bedingung' },
                  { id: 'a', type: n.props.vtype, label: 'A (bei 1)' }, { id: 'b', type: n.props.vtype, label: 'B (bei 0)' }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE],
    gen: {
      state: c => `static int32_t ${c.v('a')};\nstatic int32_t ${c.v('b')};\nstatic bool ${c.v('cond')};`,
      in: (c, port) => port === 'cond'
        ? `${c.v('cond')} = v != 0;\n` +
          `int32_t out = ${c.v('cond')} ? ${c.v('a')} : ${c.v('b')};\n` +
          `${c.emit('out', 'out')}`
        : `${c.v(port)} = v;\n` +
          `if (${port === 'a' ? '' : '!'}${c.v('cond')}) { ${c.emit('out', 'v')} }`
    }
  },
  {
    type: 'edge', cat: 'Logik', name: 'Flanke',
    help: 'Erkennt den Wechsel 0 → 1 (steigend) und 1 → 0 (fallend) und gibt dann eine 1 aus, z. B. als Auslöser. Gleiche Werte hintereinander lösen nichts aus.',
    inputs: [{ id: 'in', type: 'bool', label: 'Eingang' }],
    outputs: [{ id: 'rise', type: 'bool', label: 'steigend' }, { id: 'fall', type: 'bool', label: 'fallend' }],
    gen: {
      state: c => `static bool ${c.v('st')};`,
      in: c =>
        `bool st = v != 0;\n` +
        `if (st == ${c.v('st')}) return;\n` +
        `${c.v('st')} = st;\n` +
        `if (st) { ${c.emit('rise', '1')} }\n` +
        `else { ${c.emit('fall', '1')} }`
    }
  },
  {
    type: 'rs', cat: 'Logik', name: 'RS-Flipflop',
    help: '1 an „Setzen“ schaltet ein, 1 an „Rücksetzen“ aus; der Zustand bleibt bis zum nächsten Befehl. Liegen beide auf 1, gilt der Vorrang. Gibt nur bei Änderung aus.',
    inputs: [{ id: 's', type: 'bool', label: 'Setzen' }, { id: 'r', type: 'bool', label: 'Rücksetzen' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Zustand' }],
    params: [{ id: 'prio', label: 'Vorrang', type: 'enum', options: [[0, 'Rücksetzen'], [1, 'Setzen']], def: 0 }],
    gen: {
      state: c => `static bool ${c.v('s')};\nstatic bool ${c.v('r')};\nstatic bool ${c.v('st')};`,
      in: (c, port) =>
        `${c.v(port)} = v != 0;\n` +
        `bool st = ${c.v('st')};\n` +
        `if (${c.v('s')} && ${c.v('r')}) st = ${c.param('prio')} != 0;\n` +
        `else if (${c.v('s')}) st = true;\n` +
        `else if (${c.v('r')}) st = false;\n` +
        `if (st == ${c.v('st')}) return;\n` +
        `${c.v('st')} = st;\n` +
        `${c.emit('out', c.v('st'))}`
    }
  },
  {
    type: 'counter', cat: 'Logik', name: 'Zähler',
    help: 'Zählt jede 1 an „Aufwärts“ bzw. „Abwärts“ um die Schrittweite, „Rücksetzen“ setzt auf den Startwert. An den Grenzen bleibt er stehen oder springt um. „Grenze“ meldet 1, solange Minimum oder Maximum erreicht ist.',
    inputs: [{ id: 'up', type: 'bool', label: 'Aufwärts' }, { id: 'down', type: 'bool', label: 'Abwärts', optional: true },
             { id: 'reset', type: 'bool', label: 'Rücksetzen', optional: true }],
    outputs: [{ id: 'out', type: 'num', label: 'Zählerstand' }, { id: 'limit', type: 'bool', label: 'Grenze' }],
    params: [
      { id: 'step', label: 'Schrittweite', type: 'u16', def: 1, min: 1 },
      { id: 'min', label: 'Minimum', type: 'i16', def: 0 },
      { id: 'max', label: 'Maximum', type: 'i16', def: 100 },
      { id: 'start', label: 'Startwert', type: 'i16', def: 0 },
      { id: 'wrap', label: 'An der Grenze', type: 'enum', options: [[0, 'stehen bleiben'], [1, 'auf die andere Grenze springen']], def: 0 }
    ],
    gen: {
      state: c =>
        `static int32_t ${c.v('n')};\n` +
        `static int32_t ${c.v('lim')} = -1;\n\n` +
        `static void ${c.v('set')}(int32_t n)\n` +
        `{\n` +
        `    int32_t lo = (int16_t) ${c.param('min')}, hi = (int16_t) ${c.param('max')};\n` +
        `    if (n > hi) n = ${c.param('wrap')} ? lo : hi;\n` +
        `    if (n < lo) n = ${c.param('wrap')} ? hi : lo;\n` +
        `    int32_t lim = n == lo || n == hi;\n` +
        `    if (n != ${c.v('n')})\n` +
        `    {\n` +
        `        ${c.v('n')} = n;\n` +
        `        ${c.emit('out', 'n')}\n` +
        `    }\n` +
        `    if (lim != ${c.v('lim')})\n` +
        `    {\n` +
        `        ${c.v('lim')} = lim;\n` +
        `        ${c.emit('limit', 'lim')}\n` +
        `    }\n` +
        `}`,
      init: c => `${c.v('n')} = (int16_t) ${c.param('start')};`,
      in: (c, port) => `if (!v) return;\n` + ({
        up: `${c.v('set')}(${c.v('n')} + ${c.param('step')});`,
        down: `${c.v('set')}(${c.v('n')} - ${c.param('step')});`,
        reset: `${c.v('n')} = (int16_t) ${c.param('start')} - 1; // erzwingt die Ausgabe\n${c.v('set')}((int16_t) ${c.param('start')});`
      })[port]
    }
  },

  /* ---------- Rechnen ---------- */
  {
    type: 'math', cat: 'Rechnen', name: 'Rechnen',
    help: 'Verknüpft zwei Zahlen. Gibt bei jedem Eingangsereignis aus; ÷ durch 0 gibt nichts aus. Bei DPT 9 (Hundertstel) skalieren × und ÷ mit.',
    inputs: [{ id: 'a', type: 'num', label: 'A' }, { id: 'b', type: 'num', label: 'B' }],
    outputs: [{ id: 'out', type: 'num', label: 'Ergebnis' }],
    props: [{ id: 'op', label: 'Rechenart', kind: 'enum', options: Object.entries(MATH).map(([k, m]) => [k, m.name]), def: 'add' }],
    gen: {
      state: c => `static int32_t ${c.v('a')};\nstatic int32_t ${c.v('b')};`,
      in: (c, port) => {
        const op = MATH[c.prop('op')];
        return `${c.v(port)} = v;\n` +
          (op.guard ? `if (${op.guard(c.v('a'), c.v('b'))}) return;\n` : '') +
          `int32_t out = ${op.expr(c.v('a'), c.v('b'))};\n${c.emit('out', 'out')}`;
      }
    }
  },
  {
    type: 'compare', cat: 'Rechnen', name: 'Vergleichen',
    help: 'Vergleicht zwei Zahlen. Gibt bei jedem Eingangsereignis 0 oder 1 aus. Für einen festen Vergleichswert: Schwellwert.',
    inputs: [{ id: 'a', type: 'num', label: 'A' }, { id: 'b', type: 'num', label: 'B' }],
    outputs: [{ id: 'out', type: 'bool', label: 'erfüllt' }],
    props: [{ id: 'op', label: 'Bedingung', kind: 'enum', options: Object.entries(CMP).map(([k, o]) => [k, `A ${o} B`]), def: 'gt' }],
    gen: {
      state: c => `static int32_t ${c.v('a')};\nstatic int32_t ${c.v('b')};`,
      in: (c, port) => `${c.v(port)} = v;\nint32_t out = ${c.v('a')} ${CMP[c.prop('op')]} ${c.v('b')};\n${c.emit('out', 'out')}`
    }
  },
  {
    type: 'scale', cat: 'Rechnen', name: 'Skalieren',
    help: 'Rechnet linear um: Eingang von…bis → Ausgang von…bis (z. B. A/D-Rohwert 0…1023 → 0…255).',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }],
    outputs: [{ id: 'out', type: 'num', label: 'Wert' }],
    props: [{ id: 'clamp', label: 'Auf Ausgangsbereich begrenzen', kind: 'bool', def: true }],
    params: [
      { id: 'inMin', label: 'Eingang von', type: 'i16', def: 0 },
      { id: 'inMax', label: 'Eingang bis', type: 'i16', def: 1023 },
      { id: 'outMin', label: 'Ausgang von', type: 'i16', def: 0 },
      { id: 'outMax', label: 'Ausgang bis', type: 'i16', def: 255 }
    ],
    gen: {
      in: c => {
        const [a, b, x, y] = ['inMin', 'inMax', 'outMin', 'outMax'].map(p => `(int32_t) ${c.param(p)}`);
        return `if (${a} == ${b}) return;\n` +
          `int32_t out = ${x} + (int32_t) ((int64_t) (v - ${a}) * (${y} - ${x}) / (${b} - ${a}));\n` +
          (c.prop('clamp')
            ? `int32_t lo = ${x} < ${y} ? ${x} : ${y}, hi = ${x} < ${y} ? ${y} : ${x};\n` +
              `if (out < lo) out = lo;\nif (out > hi) out = hi;\n`
            : '') +
          c.emit('out', 'out');
      }
    }
  },
  {
    type: 'scene', cat: 'Rechnen', name: 'Szene',
    help: 'Wertet eine Szenennummer aus (DPT 17.001/18.001, Szene 1…64) und gibt den Wert der passenden Szene aus. Lernen (18.001 mit Bit 7) wird nicht unterstützt und übergangen.',
    inputs: [{ id: 'in', type: 'num', label: 'Szene' }],
    outputs: [{ id: 'out', type: 'num', label: 'Wert' }],
    props: [{ id: 'slots', label: 'Szenen', kind: 'enum', options: range(8).map(i => [i + 1, String(i + 1)]), def: 2 }],
    params: n => range(n.props.slots).flatMap(i => [
      { id: `nr${i}`, label: `Szene ${i + 1}: Nummer`, unit: '1…64, 0 = aus', type: 'u8', def: i + 1, min: 0, max: 64 },
      { id: `val${i}`, label: `Szene ${i + 1}: Wert`, type: 'i16', def: i ? 0 : 1 }
    ]),
    gen: {
      in: c =>
        `if (v & 0x80) return;\n` +
        `int32_t nr = (v & 0x3F) + 1;\n` +
        range(c.prop('slots')).map(i =>
          `if (nr == ${c.param(`nr${i}`)}) { int32_t out = ${c.param(`val${i}`)}; ${c.emit('out', 'out')} return; }`).join('\n')
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
    type: 'clock', cat: 'Zeit', name: 'Taktgeber',
    help: 'Blinkt mit einstellbarer Ein- und Auszeit, solange die Freigabe 1 ist (statt einer Schleife). Ohne Freigabe-Verbindung läuft er ab dem Start. Beim Sperren geht der Ausgang auf 0.',
    inputs: [{ id: 'en', type: 'bool', label: 'Freigabe', optional: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Takt' }],
    params: [
      { id: 'on', label: 'Ein-Zeit', unit: 'ms', type: 'u16', def: 500, min: 10 },
      { id: 'off', label: 'Aus-Zeit', unit: 'ms', type: 'u16', def: 500, min: 10 }
    ],
    gen: {
      state: c => `static Timeout ${c.v('t')};\nstatic bool ${c.v('st')};\nstatic bool ${c.v('run')};`,
      init: c => c.linked('en') ? '' : `${c.v('run')} = true;\n${c.v('t')}.start(1);`,
      in: c =>
        `bool run = v != 0;\n` +
        `if (run == ${c.v('run')}) return;\n` +
        `${c.v('run')} = run;\n` +
        `if (run) { ${c.v('t')}.start(1); return; }\n` +
        `${c.v('t')}.stop();\n` +
        `if (${c.v('st')})\n` +
        `{\n` +
        `    ${c.v('st')} = false;\n` +
        `    ${c.emit('out', '0')}\n` +
        `}`,
      loop: c =>
        `if (${c.v('t')}.expired() && ${c.v('run')})\n` +
        `{\n` +
        `    ${c.v('st')} = !${c.v('st')};\n` +
        `    ${c.v('t')}.start(${c.v('st')} ? ${c.param('on')} : ${c.param('off')});\n` +
        `    ${c.emit('out', c.v('st'))}\n` +
        `}`
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
  DPT, OBJ_SIZE, portType, MASK, CHIP, PLATFORMS, PLATFORM_OF_MCU, BUS_NAMES, BUS_INFO, PIN_FN, PTYPE, DEFS, CATS,
  pinFns, pwmOf, timerFn, busesFor, activeProps, feasible, maxOf, pinsFor, fnsOf, missing,
  get: type => byType.get(type),
  inputs: (def, node) => list(def.inputs, node),
  outputs: (def, node) => list(def.outputs, node),
  params: (def, node) => list(def.params, node),
  kos: (def, node) => list(def.kos, node),
  resources: (def, node) => list(def.resources, node),
  defaults
};
})();
