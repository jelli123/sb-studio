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
/* signed: Bytes mit Vorzeichen (beim Lesen erweitert); float: DPT 9 (2 Byte),
   float4: DPT 14 (IEEE 754) – beide als Hundertstel. 3-/4-Byte-Werte roh. */
const DPT = {
  '1.001': { name: 'Schalten',          type: 'bool', size: '1 Bit',   dpst: 'DPST-1-1' },
  '1.002': { name: 'Boolesch',          type: 'bool', size: '1 Bit',   dpst: 'DPST-1-2' },
  '1.003': { name: 'Freigabe',          type: 'bool', size: '1 Bit',   dpst: 'DPST-1-3' },
  '1.007': { name: 'Schritt (Stopp/Lamelle)', type: 'bool', size: '1 Bit', dpst: 'DPST-1-7' },
  '1.008': { name: 'Auf/Ab',            type: 'bool', size: '1 Bit',   dpst: 'DPST-1-8' },
  '1.009': { name: 'Öffnen/Schließen',  type: 'bool', size: '1 Bit',   dpst: 'DPST-1-9' },
  '1.010': { name: 'Start/Stopp',       type: 'bool', size: '1 Bit',   dpst: 'DPST-1-10' },
  '1.018': { name: 'Belegung',          type: 'bool', size: '1 Bit',   dpst: 'DPST-1-18' },
  '1.019': { name: 'Fenster/Tür',       type: 'bool', size: '1 Bit',   dpst: 'DPST-1-19' },
  '2.001': { name: 'Zwangsführung (Bit 1 = aktiv, Bit 0 = Wert)', type: 'num', size: '2 Bit', dpst: 'DPST-2-1' },
  '3.007': { name: 'Dimmen (relativ)',  type: 'num',  size: '4 Bit',   dpst: 'DPST-3-7' },
  '3.008': { name: 'Jalousie (relativ)', type: 'num', size: '4 Bit',   dpst: 'DPST-3-8' },
  '5.001': { name: 'Prozent (roh 0…255)', type: 'num', size: '1 Byte', dpst: 'DPST-5-1' },
  '5.003': { name: 'Winkel (roh 0…255 = 0…360°)', type: 'num', size: '1 Byte', dpst: 'DPST-5-3' },
  '5.004': { name: 'Prozent 0…255 %',   type: 'num',  size: '1 Byte',  dpst: 'DPST-5-4' },
  '5.010': { name: 'Zähler 0…255',      type: 'num',  size: '1 Byte',  dpst: 'DPST-5-10' },
  '6.001': { name: 'Prozent −128…127 %', type: 'num', size: '1 Byte',  dpst: 'DPST-6-1', signed: 1 },
  '6.010': { name: 'Zähler −128…127',   type: 'num',  size: '1 Byte',  dpst: 'DPST-6-10', signed: 1 },
  '7.001': { name: 'Zähler 0…65535',    type: 'num',  size: '2 Bytes', dpst: 'DPST-7-1' },
  '7.005': { name: 'Zeit (s)',          type: 'num',  size: '2 Bytes', dpst: 'DPST-7-5' },
  '8.001': { name: 'Zähler −32768…32767', type: 'num', size: '2 Bytes', dpst: 'DPST-8-1', signed: 2 },
  '9.001': { name: 'Temperatur (°C)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-1', float: true },
  '9.004': { name: 'Helligkeit (lx)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-4', float: true },
  '9.005': { name: 'Windgeschwindigkeit (m/s)', type: 'num', size: '2 Bytes', dpst: 'DPST-9-5', float: true },
  '9.007': { name: 'Luftfeuchte (%)',   type: 'num',  size: '2 Bytes', dpst: 'DPST-9-7', float: true },
  '9.008': { name: 'Luftqualität (ppm)', type: 'num', size: '2 Bytes', dpst: 'DPST-9-8', float: true },
  '10.001': { name: 'Uhrzeit (roh: Tag/Stunde, Minute, Sekunde)', type: 'num', size: '3 Bytes', dpst: 'DPST-10-1' },
  '11.001': { name: 'Datum (roh: Tag, Monat, Jahr)', type: 'num', size: '3 Bytes', dpst: 'DPST-11-1' },
  '12.001': { name: 'Zähler 32 Bit',    type: 'num',  size: '4 Bytes', dpst: 'DPST-12-1' },
  '13.001': { name: 'Zähler 32 Bit mit Vorzeichen', type: 'num', size: '4 Bytes', dpst: 'DPST-13-1', signed: 4 },
  '13.010': { name: 'Wirkenergie (Wh)',  type: 'num',  size: '4 Bytes', dpst: 'DPST-13-10', signed: 4 },
  '14.019': { name: 'Strom (A, 4-Byte-Gleitkomma)', type: 'num', size: '4 Bytes', dpst: 'DPST-14-19', float4: true },
  '14.027': { name: 'Spannung (V, 4-Byte-Gleitkomma)', type: 'num', size: '4 Bytes', dpst: 'DPST-14-27', float4: true },
  '14.056': { name: 'Leistung (W, 4-Byte-Gleitkomma)', type: 'num', size: '4 Bytes', dpst: 'DPST-14-56', float4: true },
  '16.000': { name: 'Text (ASCII)',       type: 'text', size: '14 Bytes', dpst: 'DPST-16-0', text: true },
  '16.001': { name: 'Text (ISO 8859-1)',  type: 'text', size: '14 Bytes', dpst: 'DPST-16-1', text: true },
  '17.001': { name: 'Szenennummer (0…63 = 1…64)', type: 'num', size: '1 Byte', dpst: 'DPST-17-1' },
  '18.001': { name: 'Szenensteuerung',  type: 'num',  size: '1 Byte',  dpst: 'DPST-18-1' },
  '20.102': { name: 'HVAC-Betriebsart (0 Auto … 4 Frostschutz)', type: 'num', size: '1 Byte', dpst: 'DPST-20-102' },
  '232.600': { name: 'RGB-Farbe (0xRRGGBB)', type: 'num', size: '3 Bytes', dpst: 'DPST-232-600' }
};
/* Porttyp als Text (Tooltip, Inspektor), mit Wertebereich, wenn der Port einen nennt */
const portType = p => p.type === 'bool' ? 'bool (0/1)' : p.range ? ['Zahl {0}', p.range] : 'Zahl';
/* Text hat eigene Blöcke (Text senden/empfangen), Ports tragen nur Zahlen */
const DPT_OPTIONS = Object.keys(DPT).filter(k => !DPT[k].text).map(k => [k, `${k} ${DPT[k].name}`]);

/* Objektgröße → Typcode in der KO-Tabelle (sblib ComType) und belegte
   Bytes im RAM */
const OBJ_SIZE = {
  '1 Bit':   { type: 0, bytes: 1 },
  '2 Bit':   { type: 1, bytes: 1 },
  '4 Bit':   { type: 3, bytes: 1 },
  '1 Byte':  { type: 7, bytes: 1 },
  '2 Bytes': { type: 8, bytes: 2 },
  '3 Bytes': { type: 9, bytes: 3 },
  '4 Bytes': { type: 10, bytes: 4 },
  '14 Bytes': { type: 14, bytes: 14 }
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
    ram:      { addr: 0x0700, end: 0x08FD },
    /* Was sblib, newlib und Start-up-Code ohne Applikation belegen
       (Größenschätzung). Gemessen an Release-Builds (LTO, -Os) mit
       arm-none-eabi-gcc der MCUXpresso 25.6:
       flash  Code-Sockel; mit der Applikation linear ausgeglichen
       data   statischer RAM ohne Applikation (bcu, Timer, newlib); bei
              beiden Builds gleich: gemessen minus gerechnete Applikation
       heap   was die sblib beim Start mit new anlegt: UserEeprom 3104
              (3072 + Objekt), UserRam 803 (0x304 + 3 Schatten + Objekt),
              Properties 208, Bus 80, Telegrammpuffer 5 × 23, Rest 32,
              dazu je Block 8 B Verwaltung der newlib-nano */
    cost: { flash: 18139, data: 347, heap: 4430 }
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
const BUS_NAMES = { knx: 'KNX', debug: 'SB-Debug', i2c: 'I²C', uart: 'UART', spi0: 'SPI0', spi1: 'SPI1', vbus: 'Busspannung' };
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
    /* SPI ohne SSEL: hängen mehrere Geräte am Bus, braucht jedes ein eigenes
       Chip-Select. Das ist ein gewöhnlicher Ausgangspin am Block des Geräts. */
    spi0:  { sck: ['PIO0_6', 'PIO0_10', 'PIO2_11'], miso: ['PIO0_8'], mosi: ['PIO0_9'] },
    spi1:  xl ? { sck: ['PIO2_1', 'PIO3_2'], miso: ['PIO2_2', 'PIO1_10'], mosi: ['PIO2_3', 'PIO1_9'] }
              : { sck: ['PIO2_1'], miso: ['PIO2_2'], mosi: ['PIO2_3'] },
    /* Messeingang der Busspannung über einen Spannungsteiler */
    vbus:  { adc: Object.keys(gpio).filter(g => gpio[g].adc) }
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
      /* SCK0 an IO8 (PIO2_11) wie auf den App-Platinen (Energy Storage),
         nicht an APRG (PIO0_6) */
      spi0: { sck: 'PIO2_11', miso: 'PIO0_8', mosi: 'PIO0_9' },
      /* Busspannung an AD7 über 91 kΩ / 10 kΩ (wie common/bus_voltage der
         Selfbus-Firmware): 1023 ≙ 33,3 V */
      vbus: { adc: 'PIO1_11' }
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
/* native: nur Pins des Chips, keine eines Schieberegisters (ext) */
const pinsFor = (platform, p) => (platform ? platform.pins : []).filter(x =>
  !(x.ext && p.native) && fnsOf(p).every(f => (x.fn || []).includes(f)));
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
  !p.when || (typeof p.when === 'function' ? p.when(props || {}) : Object.entries(p.when).every(([k, v]) => props && props[k] === v)));
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
  i32:  { size: 4, ctype: 'int32_t',  read: 'paramI32', min: -2147483648, max: 2147483647 },
  enum: { size: 1, ctype: 'uint8_t',  read: 'paramU8' }
};

const YES_NO = [[0, 'Nein'], [1, 'Ja']];
const REACT = [[0, 'aus'], [1, 'ein'], [2, 'keine Reaktion']];

/* A/D-Kanal eines GPIO (gleich auf allen LPC11xx) */
const adcOf = gpio => Object.values(CHIP).map(ch => ch.gpio[gpio] && ch.gpio[gpio].adc).find(Boolean);

/* Dauerhafter Speicher: vier Flash-Seiten direkt unter dem Sektor des
   UserEeprom, beschrieben im Wechsel. Seite: Kennung (Version, Anzahl),
   Zähler, dann ein Wert je Block. SBS_PERSIST_SLOTS steht in app_config.h. */
/* Zusatzinfo in Hilfsfunktionen, die alle Blöcke teilen (gleicher Text
   für alle): nur, wenn ein Debug-Block Zusatzinfos aufnimmt (c.traceOn) */
const TRACE_ANY = (on, ind, who, what, expr) => on
  ? `#ifdef SBS_TRACE\n${ind}sbsTrace(${who}, ${what}, (int32_t) (${expr}));\n#endif\n` : '';
const persistLib = on =>
  '/* Dauerhafter Speicher: 4 Flash-Seiten unter dem UserEeprom im Wechsel */\n' +
  '#define SBS_PERSIST_PAGES 4\n' +
  'static int32_t sbsPersist[SBS_PERSIST_SLOTS];\n' +
  'static bool sbsPersistValid;\n' +
  'static bool sbsPersistPending;\n' +
  'static const uint32_t SBS_PERSIST_KEY = 0x53420000u | (APPVERSION << 8) | SBS_PERSIST_SLOTS;\n' +
  '\n' +
  'static uint8_t* sbsPersistPage(int i)\n' +
  '{\n' +
  '    return FLASH_BASE_ADDRESS + iapFlashSize() - FLASH_SECTOR_SIZE - (SBS_PERSIST_PAGES - i) * FLASH_PAGE_SIZE;\n' +
  '}\n' +
  '\n' +
  '/* Neueste gültige Seite, -1 wenn keine */\n' +
  'static int sbsPersistNewest()\n' +
  '{\n' +
  '    int best = -1;\n' +
  '    for (int i = 0; i < SBS_PERSIST_PAGES; i++)\n' +
  '    {\n' +
  '        const uint32_t* p = (const uint32_t*) sbsPersistPage(i);\n' +
  '        if (p[0] == SBS_PERSIST_KEY && (best < 0 || (int32_t) (p[1] - ((const uint32_t*) sbsPersistPage(best))[1]) > 0)) best = i;\n' +
  '    }\n' +
  '    return best;\n' +
  '}\n' +
  '\n' +
  'static void sbsPersistLoad()\n' +
  '{\n' +
  '    static bool loaded;\n' +
  '    if (loaded) return;\n' +
  '    loaded = true;\n' +
  '    int i = sbsPersistNewest();\n' +
  '    if (i < 0) return;\n' +
  '    memcpy(sbsPersist, sbsPersistPage(i) + 8, sizeof(sbsPersist));\n' +
  '    sbsPersistValid = true;\n' +
  TRACE_ANY(on, '    ', '"Dauerhaft speichern"', '"geladen aus Flash-Seite"', 'i') +
  '}\n' +
  '\n' +
  'static void sbsPersistSave()\n' +
  '{\n' +
  '    sbsPersistPending = false;\n' +
  '    int last = sbsPersistNewest();\n' +
  '    /* unverändert: Flash schonen */\n' +
  '    if (last >= 0 && !memcmp(sbsPersistPage(last) + 8, sbsPersist, sizeof(sbsPersist))) return;\n' +
  '    int next = last < 0 ? 0 : (last + 1) % SBS_PERSIST_PAGES;\n' +
  '    uint32_t buf[FLASH_PAGE_SIZE / 4];\n' +
  '    memset(buf, 0xFF, sizeof(buf));\n' +
  '    buf[0] = SBS_PERSIST_KEY;\n' +
  '    buf[1] = last < 0 ? 1 : ((const uint32_t*) sbsPersistPage(last))[1] + 1;\n' +
  '    memcpy(buf + 2, sbsPersist, sizeof(sbsPersist));\n' +
  '    uint8_t* page = sbsPersistPage(next);\n' +
  '    if (iapErasePage(iapPageOfAddress(page)) == IAP_SUCCESS)\n' +
  '        iapProgram(page, (const uint8_t*) buf, FLASH_PAGE_SIZE);\n' +
  TRACE_ANY(on, '    ', '"Dauerhaft speichern"', '"geschrieben in Flash-Seite"', 'next') +
  '}';
/* Zusatzinfo für die Fehlersuche (c.trace, nur im Debug-Build und mit
   „Zusatzinfos“ am Debug-Block): leer oder Zeilenvorschub und Code,
   eingerückt wie die Zeile davor */
const trace = (c, what, expr, ind = '') => {
  const t = c.trace ? c.trace(what, expr) : '';
  return t ? '\n' + t.split('\n').map(l => ind + l).join('\n') : '';
};
/* Einträge der ETS-Auswahl: je Zeile einer, leere Zeilen zählen nicht */
/* Name einer Prioritätsstufe: eigener Text oder „Stufe k“ */
const prioName = (n, i) => String(n.props['name' + i] || '').trim() ? { raw: String(n.props['name' + i]).trim() } : ['Stufe {0}', i + 1];
/* Debug-Ausgabe: Zeilen „Zeit Text = Wert“ über eine Ausgabefunktion je
   Kanal (UART über die sblib, RTT im RAM). Alles nur mit SBS_DEBUG. */
const DEBUG_LIB =
  '#ifdef SBS_DEBUG\n' +
  'static void sbsDbgStr(void (*put)(char), const char* s) { while (*s) put(*s++); }\n' +
  'static void sbsDbgNum(void (*put)(char), int32_t v)\n' +
  '{\n' +
  '    char b[11];\n' +
  '    int i = 0;\n' +
  '    uint32_t u = v < 0 ? 0u - (uint32_t) v : (uint32_t) v;\n' +
  '    if (v < 0) put(\'-\');\n' +
  '    do { b[i++] = (char) (\'0\' + u % 10); u /= 10; } while (u);\n' +
  '    while (i) put(b[--i]);\n' +
  '}\n' +
  'static void sbsDbgLine(void (*put)(char), const char* what, int32_t v)\n' +
  '{\n' +
  '    sbsDbgNum(put, (int32_t) (millis() & 0x7FFFFFFF));\n' +
  '    put(\' \');\n' +
  '    sbsDbgStr(put, what);\n' +
  '    sbsDbgStr(put, " = ");\n' +
  '    sbsDbgNum(put, v);\n' +
  '    sbsDbgStr(put, "\\r\\n");\n' +
  '}\n' +
  '#endif';
const DEBUG_UART_LIB =
  '#ifdef SBS_DEBUG\n' +
  'static void sbsDbgUart(char c) { serial.write((uint8_t) c); }\n' +
  '#endif';
/* RTT wie SEGGER RTT (Kanal 0, nur Ausgabe, Zeichen verwerfen, wenn voll):
   der Debugger (J-Link, pyOCD, OpenOCD, probe-rs) sucht die Kennung im RAM
   und liest den Ring über SWD, ohne das Programm anzuhalten. */
const DEBUG_RTT_LIB =
  '#ifdef SBS_DEBUG\n' +
  'struct SbsRttBuf { const char* name; char* buf; uint32_t size; volatile uint32_t wr; volatile uint32_t rd; uint32_t flags; };\n' +
  'struct SbsRtt { char id[16]; int32_t up; int32_t down; SbsRttBuf b[2]; };\n' +
  'static char sbsRttUp[256];\n' +
  'static char sbsRttDown[16];\n' +
  'static SbsRtt sbsRtt;\n' +
  'static void sbsRttBuf(SbsRttBuf& b, char* buf, uint32_t size)\n' +
  '{\n' +
  '    b.name = "Terminal"; b.buf = buf; b.size = size; b.wr = 0; b.rd = 0; b.flags = 0;\n' +
  '}\n' +
  'static void sbsRttInit()\n' +
  '{\n' +
  '    sbsRtt.up = 1;\n' +
  '    sbsRtt.down = 1;\n' +
  '    sbsRttBuf(sbsRtt.b[0], sbsRttUp, sizeof(sbsRttUp));\n' +
  '    sbsRttBuf(sbsRtt.b[1], sbsRttDown, sizeof(sbsRttDown));\n' +
  '    /* Kennung zuletzt: erst dann findet der Debugger den Block */\n' +
  '    const char id[] = "SEGGER RTT";\n' +
  '    for (unsigned i = 0; i < sizeof(id); i++) sbsRtt.id[i] = id[i];\n' +
  '}\n' +
  'static void sbsDbgRtt(char c)\n' +
  '{\n' +
  '    SbsRttBuf& b = sbsRtt.b[0];\n' +
  '    uint32_t n = (b.wr + 1) % b.size;\n' +
  '    if (n == b.rd) return;\n' +
  '    b.buf[b.wr] = c;\n' +
  '    b.wr = n;\n' +
  '}\n' +
  '#endif';
/* Zusatzinfos der Blöcke (c.trace): „Zeit Block: was = Wert“ über die
   Ausgabe des Debug-Blocks, erst wenn sie bereit ist */
const debugTraceLib = put =>
  '#ifdef SBS_DEBUG\n' +
  'static bool sbsTraceOn;\n' +
  'static void sbsTrace(const char* who, const char* what, int32_t v)\n' +
  '{\n' +
  '    if (!sbsTraceOn || !who) return;\n' +
  `    sbsDbgNum(${put}, (int32_t) (millis() & 0x7FFFFFFF));\n` +
  `    ${put}(' ');\n` +
  `    sbsDbgStr(${put}, who);\n` +
  `    sbsDbgStr(${put}, ": ");\n` +
  `    sbsDbgStr(${put}, what);\n` +
  `    sbsDbgStr(${put}, " = ");\n` +
  `    sbsDbgNum(${put}, v);\n` +
  `    sbsDbgStr(${put}, "\\r\\n");\n` +
  '}\n' +
  '#endif';
const debugNames = n => String(n.props.names || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
const optionChoices = n => String(n.props.choices || '').split('\n').map(s => s.trim()).filter(Boolean);
/* Tasten: kurz/lang. Je Taste ein Timeout bis „lang“; kurz und „lang
   losgelassen“ entscheidet das Loslassen. */
const KEYS = { id: 'keys', label: 'Bedienung', kind: 'enum', def: 'two',
  options: [['one', 'einflächig (eine Taste)'], ['two', 'zweiflächig (zwei Tasten)']] };
const KEY_LONG = { id: 'long', label: 'Langer Druck ab', unit: 'ms', type: 'u16', def: 500, min: 50, max: 5000 };
const keysOf = (n, a, b) => n.props.keys === 'one'
  ? [{ id: 'k', type: 'bool', label: 'Taste' }]
  : [{ id: 'k', type: 'bool', label: a }, { id: 'k2', type: 'bool', label: b }];
const keys = c => c.prop('keys') === 'one' ? ['k'] : ['k', 'k2'];
const keyState = (c, k) => `static Timeout ${c.v(k + 'T')};\nstatic bool ${c.v(k + 'Down')};\nstatic bool ${c.v(k + 'Long')};`;
const keyIn = (c, k, on) =>
  `bool down = v != 0;\n` +
  `if (down == ${c.v(k + 'Down')}) return;\n` +
  `${c.v(k + 'Down')} = down;\n` +
  `if (down)\n{\n` +
  `    ${c.v(k + 'Long')} = false;\n` +
  `    ${c.v(k + 'T')}.start(${c.param('long')});\n` +
  (on.press ? indent(on.press) + '\n' : '') +
  `    return;\n}\n` +
  `${c.v(k + 'T')}.stop();\n` +
  `if (${c.v(k + 'Long')})\n{\n${indent(on.end)}\n}\nelse\n{\n${indent(on.short)}\n}`;
const keyLoop = (c, k, code) =>
  `if (${c.v(k + 'T')}.expired() && ${c.v(k + 'Down')})\n{\n    ${c.v(k + 'Long')} = true;\n${indent(code)}\n}`;
/* Integrator, Differentiator: Abtastzeit, Zeitbasis und Ausgabeschwelle */
const SAMPLE = { id: 'sample', label: 'Abtastzeit', unit: 'ms', type: 'u16', def: 1000, min: 10 };
const TIMEBASE = { id: 'base', label: 'Zeitbasis', type: 'enum', options: [[0, 'je Sekunde'], [1, 'je Minute'], [2, 'je Stunde']], def: 0 };
const timebase = c => `(${c.param('base')} == 2 ? 3600000 : ${c.param('base')} == 1 ? 60000 : 1000)`;
const DELTA = { id: 'delta', label: 'Ausgabe ab Änderung um', unit: 'Rohwert, 0 = jede', type: 'u16', def: 0 };
/* Zeitschaltuhr: Tage als Bitmaske, Bit 0 = Montag (Wochentag 1 in DPT 10.001) */
const DAYS = [[0, 'aus'], [127, 'täglich'], [31, 'Mo–Fr'], [96, 'Sa, So'], [1, 'Mo'], [2, 'Di'], [4, 'Mi'],
  [8, 'Do'], [16, 'Fr'], [32, 'Sa'], [64, 'So']];
/* Regionale Feiertage (Bit in sbsHoliday), die bundesweiten gelten immer */
const HOLIDAYS = [['h6jan', 'Heilige Drei Könige (6.1.)'], ['h8mar', 'Frauentag (8.3.)'], ['hCorpus', 'Fronleichnam'],
  ['h15aug', 'Mariä Himmelfahrt (15.8.)'], ['h20sep', 'Weltkindertag (20.9.)'], ['h31oct', 'Reformationstag (31.10.)'],
  ['h1nov', 'Allerheiligen (1.11.)'], ['hRepent', 'Buß- und Bettag']];
const DATE_LIB =
  `/* Kalender: Tage seit 1.1.2000 (gregorianisch), nach H. Hinnant */\n` +
  `static int32_t sbsDays(int32_t y, int32_t m, int32_t d)\n` +
  `{\n` +
  `    y -= m <= 2;\n` +
  `    const int32_t era = (y >= 0 ? y : y - 399) / 400, yoe = y - era * 400;\n` +
  `    const int32_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;\n` +
  `    return era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 730425;\n` +
  `}\n\n` +
  `static void sbsCivil(int32_t days, int32_t* y, int32_t* m, int32_t* d)\n` +
  `{\n` +
  `    days += 730425;\n` +
  `    const int32_t era = (days >= 0 ? days : days - 146096) / 146097, doe = days - era * 146097;\n` +
  `    const int32_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;\n` +
  `    const int32_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100), mp = (5 * doy + 2) / 153;\n` +
  `    *d = doy - (153 * mp + 2) / 5 + 1;\n` +
  `    *m = mp < 10 ? mp + 3 : mp - 9;\n` +
  `    *y = yoe + era * 400 + (*m <= 2);\n` +
  `}\n\n` +
  `/* 0 = Montag; der 1.1.2000 war ein Samstag */\n` +
  `static int32_t sbsWeekday(int32_t days) { return ((days + 5) % 7 + 7) % 7; }\n\n` +
  `/* Sommerzeit EU: letzter Sonntag im März bis letzter Sonntag im Oktober, je 1:00 UTC */\n` +
  `static bool sbsEuDst(int32_t day, int32_t sec)\n` +
  `{\n` +
  `    int32_t y, m, d;\n` +
  `    sbsCivil(day, &y, &m, &d);\n` +
  `    const int32_t mar = sbsDays(y, 3, 31), oct = sbsDays(y, 10, 31);\n` +
  `    const int32_t start = mar - (sbsWeekday(mar) + 1) % 7, end = oct - (sbsWeekday(oct) + 1) % 7;\n` +
  `    const int64_t t = (int64_t) day * 86400 + sec;\n` +
  `    return t >= (int64_t) start * 86400 + 3600 && t < (int64_t) end * 86400 + 3600;\n` +
  `}`;
const HOLIDAY_LIB =
  `/* Feiertage: bundesweite immer, regionale nach Bitmaske (Reihenfolge wie die Parameter) */\n` +
  `static bool sbsHoliday(int32_t days, uint32_t extra)\n` +
  `{\n` +
  `    int32_t y, m, d;\n` +
  `    sbsCivil(days, &y, &m, &d);\n` +
  `    /* Ostersonntag nach der Gaußschen Osterformel (anonymer gregorianischer Algorithmus) */\n` +
  `    const int32_t a = y % 19, b = y / 100, c = y % 100, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;\n` +
  `    const int32_t h = (19 * a + b - b / 4 - g + 15) % 30, l = (32 + 2 * e + 2 * (c / 4) - h - c % 4) % 7;\n` +
  `    const int32_t k = (a + 11 * h + 22 * l) / 451, em = (h + l - 7 * k + 114) / 31, ed = (h + l - 7 * k + 114) % 31 + 1;\n` +
  `    const int32_t rel = days - sbsDays(y, em, ed);\n` +
  `    if ((m == 1 && d == 1) || (m == 5 && d == 1) || (m == 10 && d == 3) || (m == 12 && (d == 25 || d == 26)))\n` +
  `        return true;\n` +
  `    if (rel == -2 || rel == 1 || rel == 39 || rel == 50) return true; // Karfreitag, Ostermontag, Himmelfahrt, Pfingstmontag\n` +
  `    return ((extra & 1) && m == 1 && d == 6) || ((extra & 2) && m == 3 && d == 8) || ((extra & 4) && rel == 60) ||\n` +
  `           ((extra & 8) && m == 8 && d == 15) || ((extra & 16) && m == 9 && d == 20) || ((extra & 32) && m == 10 && d == 31) ||\n` +
  `           ((extra & 64) && m == 11 && d == 1) ||\n` +
  `           ((extra & 128) && m == 11 && d >= 16 && d <= 22 && sbsWeekday(days) == 2); // Mittwoch vor dem 23.11.\n` +
  `}`;
const SUN_LIB =
  `/* Sonnenauf-/-untergang (NOAA, Zenit 90,833°) in Minuten UTC; -1 bei Polartag/-nacht. Genauigkeit ±2 min */\n` +
  `static void sbsSun(int32_t doy, float lat, float lng, int32_t* rise, int32_t* set)\n` +
  `{\n` +
  `    const float g = 6.2831853f / 365.0f * (float) (doy - 1);\n` +
  `    const float eq = 229.18f * (0.000075f + 0.001868f * cosf(g) - 0.032077f * sinf(g) - 0.014615f * cosf(2 * g) - 0.040849f * sinf(2 * g));\n` +
  `    const float dec = 0.006918f - 0.399912f * cosf(g) + 0.070257f * sinf(g) - 0.006758f * cosf(2 * g) + 0.000907f * sinf(2 * g)\n` +
  `                      - 0.002697f * cosf(3 * g) + 0.00148f * sinf(3 * g);\n` +
  `    const float phi = lat * 0.01745329f;\n` +
  `    const float c = cosf(1.5853349f) / (cosf(phi) * cosf(dec)) - tanf(phi) * tanf(dec);\n` +
  `    if (c > 1 || c < -1) { *rise = *set = -1; return; }\n` +
  `    const float ha = acosf(c) * 57.29578f;\n` +
  `    *rise = (int32_t) (720 - 4 * (lng + ha) - eq + 0.5f);\n` +
  `    *set = (int32_t) (720 - 4 * (lng - ha) - eq + 0.5f);\n` +
  `}`;
/* Text (DPT 16): 14 Zeichen, mit 0 aufgefüllt. Die sblib legt Objektwerte
   byteweise gespiegelt ab (reverseCopy beim Senden und Empfangen). */
const TEXT_DPT = { id: 'dpt', label: 'Zeichensatz', kind: 'enum', def: '16.000', options: [['16.000', '16.000 ASCII'], ['16.001', '16.001 ISO 8859-1 (Umlaute)']] };
/* Textliste: Anzahl, dann so viele Textfelder; mode = nur bei „Text aus Liste“ */
const textList = mode => [{ id: 'count', label: 'Anzahl Texte', kind: 'enum', def: 2, options: range(8).map(i => [i + 1, String(i + 1)]),
  when: mode ? { mode: 'list' } : undefined }].concat(range(8).map(i => ({
  id: 't' + i, label: ['Text {0}', i + 1], kind: 'text', def: ['Aus', 'Ein'][i] || '', max: 14,
  when: p => (!mode || p.mode === 'list') && Number(p.count) > i
})));
/* Zeichen, die der Zeichensatz nicht kennt, und Texte über 14 Zeichen */
const textBad = (s, dpt) => [...String(s)].filter(ch => { const k = ch.codePointAt(0); return k < 0x20 || k > (dpt === '16.001' ? 0xFF : 0x7E) || (k > 0x7E && k < 0xA0); });
function textCheck(n) {
  const out = [];
  activeProps(byType.get(n.type), n.props).filter(p => p.kind === 'text' && p.max).forEach(p => {
    const v = String(n.props[p.id] || '');
    if (v.length > p.max) out.push(['„{0}“ ist länger als {1} Zeichen.', [p.label, p.max]]);
    const bad = textBad(v, n.props.dpt);
    if (bad.length) out.push(['„{0}“: {1} gibt es in {2} nicht.', [p.label, [...new Set(bad)].join(' '), n.props.dpt]]);
  });
  return out;
}
/* Skript: Klammern ohne Kommentare und Zeichenketten zählen, Nummern in
   emit/input/param gegen die Zahl der Ports und Parameter prüfen */
/* Ports einer Makro-Instanz: die Makro-Ein-/Ausgänge der Definition (n._m,
   vom Modell gesetzt), von oben nach unten */
const macroPorts = (n, type) => n._m ? n._m.nodes.filter(x => x.type === type)
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .map(x => ({ id: x.id, type: x.props.vtype || 'bool', label: { raw: x.props.name || '?' } })) : [];
const SCRIPT_RANGE = { emit: '{0}: emit({1}) – Ausgang 1…{2} erwartet.', input: '{0}: input({1}) – Eingang 1…{2} erwartet.',
  param: '{0}: param({1}) – Parameter 1…{2} erwartet.' };
const SCRIPT_NONE = { input: '{0}: input({1}) – der Block hat keine Eingänge.', param: '{0}: param({1}) – der Block hat keine Parameter.' };
function scriptCheck(n) {
  const out = [];
  const lim = { emit: Number(n.props.outs), input: Number(n.props.ins), param: Number(n.props.nparams) };
  ['state', 'init', 'in', 'loop'].forEach(id => {
    const label = byType.get('script').props.find(p => p.id === id).label;
    const src = String(n.props[id] || '');
    const code = src.replace(/\/\*[\s\S]*?(\*\/|$)|\/\/[^\n]*|"(\\.|[^"\\\n])*"|'(\\.|[^'\\\n])*'/g, ' ');
    const stack = [];
    let bad = false;
    for (const ch of code) {
      if ('({['.includes(ch)) stack.push(')}]'['({['.indexOf(ch)]);
      else if (')}]'.includes(ch) && stack.pop() !== ch) { bad = true; break; }
    }
    if (bad || stack.length) out.push(['{0}: Klammern ( ) { } [ ] passen nicht zusammen.', [label]]);
    for (const m of code.matchAll(/\b(emit|input|param)\s*\(\s*(\d+)\s*[,)]/g)) {
      const k = Number(m[2]);
      if (k >= 1 && k <= lim[m[1]]) continue;
      out.push(lim[m[1]] ? [SCRIPT_RANGE[m[1]], [label, k, lim[m[1]]]] : [SCRIPT_NONE[m[1]], [label, k]]);
    }
  });
  return out;
}
/* Als C-Zeichenkette; Zeichen über 0x7E als \xNN (abgeschlossen, damit kein Hex-Ziffer folgt) */
const cText = (s, dpt) => '"' + [...String(s)].slice(0, 14).map(ch => {
  const k = ch.codePointAt(0);
  if (ch === '"' || ch === '\\') return '\\' + ch;
  if (k >= 0x20 && k <= 0x7E) return ch;
  return dpt === '16.001' && k >= 0xA0 && k <= 0xFF ? `\\x${k.toString(16).toUpperCase()}""` : '?';
}).join('') + '"';
const TEXT_WRITE_LIB =
  `/* Text (DPT 16, 14 Zeichen): die sblib hält Objektwerte gespiegelt */\n` +
  `static void sbsTextWrite(int ko, const char* s)\n` +
  `{\n` +
  `    uint8_t b[14];\n` +
  `    int i = 0;\n` +
  `    for (; i < 14 && s[i]; i++) b[13 - i] = (uint8_t) s[i];\n` +
  `    for (; i < 14; i++) b[13 - i] = 0;\n` +
  `    bcu.comObjects->objectWrite(ko, b);\n` +
  `}`;
const TEXT_READ_LIB =
  `static void sbsTextRead(int ko, char* s)\n` +
  `{\n` +
  `    const uint8_t* b = bcu.comObjects->objectValuePtr(ko);\n` +
  `    for (int i = 0; i < 14; i++) s[i] = (char) b[13 - i];\n` +
  `    s[14] = 0;\n` +
  `}`;
const TEXT_ICASE_LIB =
  `static int sbsTextCaseCmp(const char* a, const char* b)\n` +
  `{\n` +
  `    for (;; a++, b++)\n` +
  `    {\n` +
  `        char x = *a >= 'a' && *a <= 'z' ? *a - 32 : *a, y = *b >= 'a' && *b <= 'z' ? *b - 32 : *b;\n` +
  `        if (x != y || !x) return x - y;\n` +
  `    }\n` +
  `}`;
const TEXT_FORMAT_LIB =
  `/* Zahl als Text: Vortext, Wert / 10^dec mit Komma, Nachtext; auf 14 Zeichen gekürzt */\n` +
  `static void sbsTextFormat(char* s, const char* pre, int32_t v, int dec, const char* post)\n` +
  `{\n` +
  `    char d[12];\n` +
  `    int n = 0, len = 0;\n` +
  `    uint32_t u = v < 0 ? 0u - (uint32_t) v : (uint32_t) v;\n` +
  `    do\n` +
  `    {\n` +
  `        if (n == dec && dec) d[n++] = \x27,\x27;\n` +
  `        d[n++] = (char) (\x270\x27 + u % 10);\n` +
  `        u /= 10;\n` +
  `    } while (u || n <= dec);\n` +
  `    if (v < 0) d[n++] = \x27-\x27;\n` +
  `    while (*pre && len < 14) s[len++] = *pre++;\n` +
  `    while (n && len < 14) s[len++] = d[--n];\n` +
  `    while (*post && len < 14) s[len++] = *post++;\n` +
  `    s[len] = 0;\n` +
  `}`;
/* Werttyp der durchgereichten Ports (Tor, Auswahl) */
const VTYPE = { id: 'vtype', label: 'Datentyp', kind: 'enum', options: [['bool', 'bool (0/1)'], ['num', 'Zahl']], def: 'bool' };
const SEND_MODE = [[0, 'nur bei Änderung'], [1, 'bei jedem Eingangsereignis']];
const range = n => Array.from({ length: n }, (_, i) => i);
/* Auswahl nach Nummer: die verbundenen Werteingänge (Nummern) */
const selSlots = c => range(Number(c.prop('count'))).filter(i => c.linked('i' + i));
/* Name des Eingangs i eines Logik-Blocks (Eigenschaft „Namen“), sonst '' */
const logicName = (n, i) => (String(n.props.names || '').split('\n')[i] || '').trim();
const bool = (v, invert) => invert ? `(${v}) ? 0 : 1` : `(${v}) ? 1 : 0`;
const indent = (code, n = 1) => code.split('\n').map(l => l ? '    '.repeat(n) + l : l).join('\n');
/* Code nur, wenn die Bedingung gilt (leer: immer; block: sonst in { }) */
const guarded = (cond, code, block) => cond ? `if (${cond})\n{\n${indent(code)}\n}` : block ? `{\n${indent(code)}\n}` : code;
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
/* Dimmer/Rampe logarithmisch: Stufe 1…255 → 1…100 % in gleichen Verhältnisschritten (8 Bit) */
const RAMP_LOG = range(256).map(x => x ? Math.max(1, Math.round(255 * Math.pow(10, 2 * (x - 255) / 254))) : 0);
const RAMP_LOG_LIB =
  `/* Dimmer-Kennlinie logarithmisch: Stufe 0…255 → Wert 0…255 (1…100 %) */\n` +
  `static const uint8_t rampLog[256] = {\n` +
  range(16).map(i => '    ' + RAMP_LOG.slice(i * 16, i * 16 + 16).join(', ')).join(',\n') + '\n};';
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
/* Software-PWM (Relais-Haltestrom): ein Timer ohne Pin, nicht der des
   KNX-Busses (timer16_1), den sich alle Relais teilen. Im Interrupt je Kanal
   Pulsdichte: der Rest des Tastverhältnisses läuft weiter, so stimmt der
   Mittelwert auf 1 % genau und die Spule sieht 20 kHz statt einer langen
   Aus-Phase. */
const SW_PWM_HZ = 20000, SW_PWM_MAX = 8;
const SW_TIMER = { id: 'timer', label: 'Timer für Software-PWM', kind: 'enum', def: 'timer32_1',
  options: [['timer16_0', 'timer16_0'], ['timer32_0', 'timer32_0'], ['timer32_1', 'timer32_1']] };
const SW_PWM_LIB =
  `/* Software-PWM-Kanal: Pin per MASKED_ACCESS (nur dieses Bit), Pegel für „an“ */\n` +
  `struct SwPwm\n` +
  `{\n` +
  `    LPC_GPIO_TypeDef* port;\n` +
  `    uint32_t mask;\n` +
  `    uint32_t on;\n` +
  `    volatile uint8_t duty;    // 0…100 %\n` +
  `    uint8_t acc;\n` +
  `    volatile bool active;\n` +
  `};`;
const swPwmLib = tm => {
  const [reg, handler] = TIMER_HW[tm];
  return `/* Software-PWM auf ${tm}: ${SW_PWM_HZ} Interrupts je Sekunde, bis ${SW_PWM_MAX} Kanäle */\n` +
    `static SwPwm* swPwm_${tm}[${SW_PWM_MAX}];\n` +
    `static uint8_t swPwmCount_${tm};\n\n` +
    `static void swPwmAdd_${tm}(SwPwm* p)\n` +
    `{\n` +
    `    if (swPwmCount_${tm} < ${SW_PWM_MAX}) swPwm_${tm}[swPwmCount_${tm}++] = p;\n` +
    `}\n\n` +
    `extern "C" void ${handler}()\n` +
    `{\n` +
    `    ${reg}->IR = 1;          // MR0\n` +
    `    for (uint8_t i = 0; i < swPwmCount_${tm}; i++)\n` +
    `    {\n` +
    `        SwPwm* p = swPwm_${tm}[i];\n` +
    `        if (!p->active) continue;\n` +
    `        uint32_t a = p->acc + p->duty;\n` +
    `        bool hi = a >= 100;\n` +
    `        p->acc = (uint8_t) (hi ? a - 100 : a);\n` +
    `        p->port->MASKED_ACCESS[p->mask] = hi ? p->on : p->on ^ p->mask;\n` +
    `    }\n` +
    `}`;
};
const swPwmSetup = tm =>
  `${tm}.begin();\n` +
  `${tm}.prescaler(0);\n` +
  `${tm}.matchMode(TIMER_MATCH_MAT0, INTERRUPT | RESET);\n` +
  `${tm}.match(TIMER_MATCH_MAT0, SystemCoreClock / ${SW_PWM_HZ} - 1);\n` +
  `${tm}.setIRQPriority(InterruptPriority::low); // Bus und NeoPixel gehen vor\n` +
  `${tm}.interrupts();\n` +
  `${tm}.start();`;
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

/* ---------- Schieberegister (74HC595, 74HC165) ----------
   Ein Schieberegister-Block stellt weitere Pins bereit (SR1.Q0 …), die
   Digitaleingang, Digitalausgang und Relais wie Pins des Chips wählen. Bit i
   ist Q(A + i % 8) des (i / 8 + 1)-ten Bausteins der Kette, gezählt vom
   Mikrocontroller aus. Die Blöcke schreiben und lesen ein Abbild im RAM; der
   Schieberegister-Block überträgt es in seiner Schleife. */
const SR_LETTER = 'ABCDEFGH';
const srWhere = (chip, i) => `${chip} IC${(i >> 3) + 1} Q${SR_LETTER[i & 7]}`;
const SR_SSP = { spi0: 'LPC_SSP0', spi1: 'LPC_SSP1' };
/* SPI-Modus mit ruhendem Takt high (CPOL 1): der 595 übernimmt an der
   steigenden Flanke (CPHA 1), der 165 schiebt an ihr weiter, also wird an der
   fallenden gelesen (CPHA 0). Mehrere Schieberegister teilen sich so einen
   Port; vor jeder Übertragung wird CPHA passend gesetzt. */
const SR_SPI_LIB =
  `/* Ein Byte über den SSP (Schieberegister), CPHA je Baustein */\n` +
  `static uint8_t sbsSpiByte(LPC_SSP_TypeDef* ssp, uint32_t cpha, uint8_t v)\n` +
  `{\n` +
  `    if ((ssp->CR0 & (1 << 7)) != cpha)\n` +
  `    {\n` +
  `        ssp->CR1 = 0;                                // zum Umstellen aus\n` +
  `        ssp->CR0 = (ssp->CR0 & ~(1 << 7)) | cpha;\n` +
  `        ssp->CR1 = 2;                                // Master, ein\n` +
  `    }\n` +
  `    while (ssp->SR & 0x04) (void) ssp->DR;          // RNE: Altes verwerfen\n` +
  `    ssp->DR = v;\n` +
  `    while (!(ssp->SR & 0x04)) {}                     // Byte ist durch\n` +
  `    return ssp->DR;\n` +
  `}`;
/* 1 MHz: SSP-Takt 24 MHz, Vorteiler 2, Teiler 12 */
const srSpiSetup = port =>
  `{\n` +
  `    SPI spi(${SSP[port][0]}, SPI_FORMAT_SPI | SPI_CPOL_HIGH | SPI_CPHASE_FALL);\n` +
  `    spi.setClockDivider(12);\n` +
  `    spi.begin();\n` +
  `}`;
const srProps = (kind) => [
  { id: 'name', label: 'Name (Präfix der Pins)', kind: 'text', def: 'SR1' },
  { id: 'chips', label: 'Bausteine in Kette', kind: 'enum', def: 1, options: range(4).map(i => [i + 1, String(i + 1)]) },
  { id: 'iface', label: 'Anschluss', kind: 'enum', switches: true, def: kind === 'out' ? 'spi' : 'gpio',
    options: [['spi', 'SPI (Hardware)'], ['gpio', 'GPIO (Software)']] },
  ...(kind === 'out' ? [
    { id: 'port', label: 'SPI-Port (SCK, MOSI → SER)', kind: 'bus', buses: ['spi0', 'spi1'],
      signals: ['sck', 'mosi'], share: true, def: 'spi0', when: pr => pr.iface === 'spi' && !pr.check },
    { id: 'port', label: 'SPI-Port (SCK, MOSI → SER, MISO ← QH*)', kind: 'bus', buses: ['spi0', 'spi1'],
      signals: ['sck', 'mosi', 'miso'], share: true, def: 'spi0', when: pr => pr.iface === 'spi' && !!pr.check }
  ] : [
    { id: 'port', label: 'SPI-Port (SCK, MISO ← QH)', kind: 'bus', buses: ['spi0', 'spi1'],
      signals: ['sck', 'miso'], share: true, def: 'spi0', when: { iface: 'spi' } }
  ]),
  { id: 'pinClk', label: kind === 'out' ? 'Pin Takt (SRCLK/SCK)' : 'Pin Takt (CLK)', kind: 'pin', fn: 'out', native: true,
    def: kind === 'out' ? 'IO8' : 'IO1', when: { iface: 'gpio' } },
  kind === 'out'
    ? { id: 'pinData', label: 'Pin Daten (SER)', kind: 'pin', fn: 'out', native: true, def: 'IO7', when: { iface: 'gpio' } }
    : { id: 'pinData', label: 'Pin Daten (QH)', kind: 'pin', fn: 'in', native: true, def: 'IO2', when: { iface: 'gpio' } }
];
/* Bits per Software schieben: Takt ruht low, Übernahme an der steigenden
   Flanke; QH* (Rücklesen) zeigt vor ihr das herausfallende Bit */
const srBitbangOut = (c, v, back) =>
  (back ? `uint8_t rx = 0;\n` : '') +
  `for (int b = 7; b >= 0; b--)\n` +
  `{\n` +
  `    digitalWrite(${c.pin('pinData')}, (${v} >> b) & 1);\n` +
  (back ? `    rx |= digitalRead(${c.pin('pinBack')}) << b;\n` : '') +
  `    digitalWrite(${c.pin('pinClk')}, 1);\n` +
  `    digitalWrite(${c.pin('pinClk')}, 0);\n` +
  `}`;
/* PWM an /OE: 20 kHz ohne Vorteiler (Spulen pfeifen nicht hörbar), Periode
   auf MAT2; der Timer gehört dem Schieberegister allein */
const SR_PWM_HZ = 20000;
const srPwmSetup = c => {
  const t = c.gpio('pinOe').pwm[0];
  return `${t}.begin();\n` +
    `${t}.prescaler(0);\n` +
    `${t}.matchMode(TIMER_MATCH_MAT2, RESET);\n` +
    `${t}.match(TIMER_MATCH_MAT2, SystemCoreClock / ${SR_PWM_HZ} - 1);\n` +
    `${t}.start();`;
};

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
    help: 'Liest einen Pin entprellt und meldet jede Änderung. „Startzustand“ gibt den Zustand nach dem Start einmal aus (etwa für „Status senden bei Busspannungswiederkehr“), ohne dass „Zustand“ eine Änderung meldet. Schließt eine Parameterauswahl den Block und einen Digitalausgang gegenseitig aus, dürfen beide denselben Pin nutzen (Eingang oder LED); es arbeitet nur der gewählte.',
    outputs: [{ id: 'out', type: 'bool', label: 'Zustand' }, { id: 'start', type: 'bool', label: 'Startzustand' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'in', def: 'IO1' },
      { id: 'pullup', label: 'Pull-up', kind: 'bool', def: true },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false }
    ],
    params: [{ id: 'debounce', label: 'Entprellzeit', unit: 'ms', type: 'u16', def: 50, min: 0, max: 10000 }],
    gen: {
      state: c => `static Debouncer ${c.v('deb')};\nstatic int32_t ${c.v('last')};\nstatic bool ${c.v('told')};`,
      /* geteilter Pin: erst in init, wenn die Parameter gelesen sind */
      setup: c => c.pinGuard() ? '' : c.input('pin', c.prop('pullup')),
      init: c => guarded(c.pinGuard(),
        (c.pinGuard() ? c.input('pin', c.prop('pullup')) + '\n' : '') +
        `${c.v('last')} = ${bool(c.read('pin'), c.prop('invert'))};\n` +
        `${c.v('deb')}.init(${c.v('last')});`),
      loop: c => guarded(c.pinGuard(),
        `if (!${c.v('told')})\n{\n    ${c.v('told')} = true;\n    ${c.emit('start', c.v('last'))}\n}\n` +
        `int32_t v = ${c.v('deb')}.debounce(${bool(c.read('pin'), c.prop('invert'))}, ${c.param('debounce')});\n` +
        `if (v != ${c.v('last')})\n` +
        `{\n` +
        `    ${c.v('last')} = v;\n` +
        `    ${c.emit('out', 'v')}\n` +
        `}`, true)
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
      setup: c => c.pinGuard() ? '' : c.output('pin', (c.prop('initial') ? 1 : 0) ^ (c.prop('invert') ? 1 : 0)),
      /* geteilter Pin (siehe Digitaleingang): nur, wenn die Auswahl gilt */
      init: c => c.pinGuard() ? guarded(c.pinGuard(), c.output('pin', (c.prop('initial') ? 1 : 0) ^ (c.prop('invert') ? 1 : 0))) : '',
      in: c => (c.pinGuard() ? `if (!(${c.pinGuard()})) return;\n` : '') + c.write('pin', bool('v != 0', c.prop('invert')))
    }
  },
  {
    type: 'relay', cat: 'Hardware', name: 'Relais',
    help: 'Schaltet ein Relais (monostabil). Zum Energiesparen kann die Spule nach der Anzugszeit mit geringerem Haltestrom weiterlaufen: Software-PWM an jedem Ausgangspin, 20 kHz Takt als Pulsdichte (im Mittel genau das Tastverhältnis). Dafür braucht es einen Timer, den sich alle Relais teilen, und eine Freilaufdiode an der Spule. Der Haltewert muss über der Abfallspannung des Relais liegen (meist 30…50 %).',
    inputs: [{ id: 'in', type: 'bool', label: 'Schalten' }],
    props: [
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'out', def: 'IO2', when: pr => !pr.hold },
      /* Software-PWM schreibt direkt ins GPIO-Register: kein Schieberegister */
      { id: 'pin', label: 'Pin', kind: 'pin', fn: 'out', native: true, def: 'IO2', when: pr => !!pr.hold },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false },
      { id: 'initial', label: 'Zustand nach Start', kind: 'bool', def: false },
      { id: 'hold', label: 'Haltestrom per Software-PWM', kind: 'bool', def: false },
      { ...SW_TIMER, when: { hold: true } }
    ],
    params: n => n.props.hold ? [
      { id: 'pull', label: 'Anzugszeit', unit: 'ms', type: 'u16', def: 200, min: 10, max: 10000 },
      { id: 'duty', label: 'Tastverhältnis Halten', unit: '%', type: 'u8', def: 40, min: 5, max: 100 }
    ] : [],
    swTimer: n => n.props.hold ? n.props.timer : null,
    gen: {
      lib: c => c.prop('hold') ? [SW_PWM_LIB, swPwmLib(c.prop('timer'))] : null,
      shared: c => c.prop('hold') ? swPwmSetup(c.prop('timer')) : null,
      state: c => c.prop('hold')
        ? `static SwPwm ${c.v('pwm')};\nstatic Timeout ${c.v('t')};\nstatic bool ${c.v('on')};\n\n` +
          `static void ${c.v('set')}(bool on)\n{\n` +
          `    ${c.v('pwm')}.active = false;     // ab hier schreibt nur noch das Programm\n` +
          `    ${c.v('on')} = on;\n` +
          `    digitalWrite(${c.pin('pin')}, ${bool('on', c.prop('invert'))});\n` +
          `    if (on) ${c.v('t')}.start(${c.param('pull')});\n` +
          `    else ${c.v('t')}.stop();\n}`
        : `static bool ${c.v('on')};`,
      setup: c =>
        c.output('pin', c.prop('invert') ? 1 : 0) +
        (c.prop('hold')
          ? `\n${c.v('pwm')}.port = gpioPorts[digitalPinToPort(${c.pin('pin')})];\n` +
            `${c.v('pwm')}.mask = digitalPinToBitMask(${c.pin('pin')});\n` +
            `${c.v('pwm')}.on = ${c.prop('invert') ? '0' : `${c.v('pwm')}.mask`};\n` +
            `swPwmAdd_${c.prop('timer')}(&${c.v('pwm')});`
          : ''),
      init: c => c.prop('initial') ? (c.prop('hold') ? `${c.v('set')}(true);` : `${c.v('on')} = true;\n${c.write('pin', c.prop('invert') ? 0 : 1)}`) : '',
      in: c =>
        `bool on = v != 0;\n` +
        `if (on == ${c.v('on')}) return;\n` +
        (c.prop('hold') ? `${c.v('set')}(on);` : `${c.v('on')} = on;\n${c.write('pin', bool('on', c.prop('invert')))}`) +
        trace(c, 'schaltet', 'on'),
      loop: c => c.prop('hold')
        ? `if (${c.v('t')}.expired() && ${c.v('on')})\n{\n` +
          `    ${c.v('pwm')}.duty = ${c.param('duty')};\n` +
          `    ${c.v('pwm')}.acc = 0;\n` +
          `    ${c.v('pwm')}.active = true;    // Haltestrom` + trace(c, 'Haltestrom (%)', c.param('duty'), '    ') + `\n}`
        : ''
    }
  },
  {
    type: 'bistable', cat: 'Hardware', name: 'Relais bistabil',
    help: 'Bistabiles Relais (Stromstoß): ein Puls schaltet ein oder aus, danach hält es ohne Strom. Mit zwei Spulen je ein Pin für Ein und Aus; mit einer Spule über eine H-Brücke (z. B. DRV8833, L293D): IN1 = 1 schaltet ein, IN2 = 1 aus, beide 0 = Ruhe. Mit einer Spule und Kondensator in Reihe an einer Gegentaktstufe: der Pin hält den Zustand, Laden pulst ein, Entladen aus; die Pulsdauer legt der Kondensator fest. „Aus“ bei leerem Kondensator und unbekannter Lage (nach dem Start) geht dort nur über kurz ein. Pulse mehrerer Relais laufen nacheinander (Strom aus dem Bus). Nach dem Start ist die Lage unbekannt, der erste Befehl pulst immer. Mit „Eingang Freigabe“ wartet ein Puls, bis dort 1 anliegt – z. B. bis der Speicherkondensator geladen ist; bis zur ersten 1 nach dem Start pulst es nicht.',
    inputs: n => [{ id: 'in', type: 'bool', label: 'Schalten' }].concat(n.props.useEn ? [{ id: 'en', type: 'bool', label: 'Freigabe' }] : []),
    props: [
      { id: 'coils', label: 'Spulen', kind: 'enum', def: 'two', options: [['one', 'eine (H-Brücke)'], ['cap', 'eine mit Kondensator in Reihe'], ['two', 'zwei (Ein/Aus)']] },
      { id: 'pinOn', label: 'Pin Gegentaktstufe (Spule + Kondensator)', kind: 'pin', fn: 'out', def: 'IO2', when: { coils: 'cap' } },
      { id: 'pinOn', label: 'Pin Spule Ein', kind: 'pin', fn: 'out', def: 'IO2', when: { coils: 'two' } },
      { id: 'pinOff', label: 'Pin Spule Aus', kind: 'pin', fn: 'out', def: 'IO3', when: { coils: 'two' } },
      { id: 'pinOn', label: 'Pin H-Brücke IN1 (Ein)', kind: 'pin', fn: 'out', def: 'IO2', when: { coils: 'one' } },
      { id: 'pinOff', label: 'Pin H-Brücke IN2 (Aus)', kind: 'pin', fn: 'out', def: 'IO3', when: { coils: 'one' } },
      { id: 'invert', label: 'Invertieren (aktiv low)', kind: 'bool', def: false },
      { id: 'useEn', label: 'Eingang Freigabe', kind: 'bool', def: false }
    ],
    /* Kondensator: kein erneuter Puls ohne Umschalten, die Pulsdauer legt C fest */
    params: n => [
      n.props.coils === 'cap'
        ? { id: 'pulse', label: 'Umladezeit Kondensator', unit: 'ms', type: 'u16', def: 100, min: 5, max: 5000 }
        : { id: 'pulse', label: 'Pulsdauer', unit: 'ms', type: 'u16', def: 50, min: 5, max: 2000 },
      { id: 'pause', label: 'Pause nach Puls', unit: 'ms', type: 'u16', def: 100, min: 0, max: 10000 },
      { id: 'init', label: 'Nach Start', type: 'enum', options: [[0, 'unverändert'], [1, 'aus'], [2, 'ein']], def: 0 },
      { id: 'delay', label: 'Verzögerung nach Start', unit: 'ms', type: 'u16', def: 500 }
    ].concat(n.props.coils === 'cap' ? [] : [{ id: 'repeat', label: 'Gleichen Befehl erneut pulsen', type: 'enum', options: YES_NO, def: 0 }]),
    gen: {
      lib: '/* Bistabile Relais pulsen nacheinander, damit der Bus nicht einbricht */\nstatic bool sbsCoilBusy;',
      state: c =>
        `static Timeout ${c.v('t')};\n` +
        `static int8_t ${c.v('want')} = -1;   // Ziel: -1 keins, 0 aus, 1 ein\n` +
        `static int8_t ${c.v('pos')} = -1;    // Lage: -1 unbekannt\n` +
        (c.prop('coils') === 'cap' ? `static bool ${c.v('lvl')};       // Pegel = Kondensator geladen\n` : `static bool ${c.v('again')};\n`) +
        `static uint8_t ${c.v('phase')};      // 0 bereit, 1 Puls, 2 Pause, 3 Startverzögerung\n` +
        `static bool ${c.v('en')} = ${c.prop('useEn') ? 'false; // Freigabe kommt vom Eingang' : 'true;'}`,
      setup: c => (c.prop('coils') === 'cap' ? ['pinOn'] : ['pinOn', 'pinOff']).map(p =>
        c.output(p, c.prop('invert') ? 1 : 0)).join('\n'),
      init: c =>
        `if (${c.param('init')}) ${c.v('want')} = ${c.param('init')} - 1;\n` +
        `${c.v('phase')} = 3;\n` +
        `${c.v('t')}.start(${c.param('delay')} + 1);`,
      in: (c, port) => port === 'en' ? `${c.v('en')} = v != 0;`
        : `${c.v('want')} = v != 0;` + (c.prop('coils') === 'cap' ? '' : `\nif (${c.param('repeat')}) ${c.v('again')} = true;`),
      loop: c => {
        const off = c.prop('invert') ? 1 : 0;
        /* Kondensator in Reihe: der Pegel ist die Ladung, jeder Wechsel ein Puls
           (laden = ein, entladen = aus). Steht der Pin schon auf dem Ziel, die
           Lage aber nicht fest (nach dem Start „aus“ bei leerem Kondensator),
           geht es nur über einmal laden und wieder entladen. */
        if (c.prop('coils') === 'cap')
          return `if (${c.v('phase')} == 1 && ${c.v('t')}.expired())\n{\n` +
            `    ${c.v('phase')} = 2;\n` +
            `    ${c.v('t')}.start(${c.param('pause')} + 1);\n}\n` +
            `else if (${c.v('phase')} >= 2 && ${c.v('t')}.expired())\n{\n` +
            `    if (${c.v('phase')} == 2) sbsCoilBusy = false;\n` +
            `    ${c.v('phase')} = 0;\n}\n` +
            `if (${c.v('phase')} == 0 && ${c.v('want')} >= 0 && ${c.v('want')} != ${c.v('pos')} && ${c.v('en')} && !sbsCoilBusy)\n{\n` +
            `    sbsCoilBusy = true;\n` +
            `    ${c.v('lvl')} = !${c.v('lvl')};\n` +
            `    ${c.v('pos')} = ${c.v('lvl')};\n` +
            `    ${c.write('pinOn', bool(c.v('lvl'), c.prop('invert')))}` + trace(c, 'Puls (1 ein, 0 aus)', c.v('lvl'), '    ') + `\n` +
            `    ${c.v('phase')} = 1;\n` +
            `    ${c.v('t')}.start(${c.param('pulse')});\n}`;
        return `if (${c.v('phase')} == 1 && ${c.v('t')}.expired())\n{\n` +
          `    ${c.write('pinOn', off)}\n` +
          `    ${c.write('pinOff', off)}\n` +
          `    ${c.v('phase')} = 2;\n` +
          `    ${c.v('t')}.start(${c.param('pause')} + 1);\n}\n` +
          `else if (${c.v('phase')} >= 2 && ${c.v('t')}.expired())\n{\n` +
          `    if (${c.v('phase')} == 2) sbsCoilBusy = false;\n` +
          `    ${c.v('phase')} = 0;\n}\n` +
          `if (${c.v('phase')} == 0 && ${c.v('want')} >= 0 && (${c.v('want')} != ${c.v('pos')} || ${c.v('again')}) && ${c.v('en')} && !sbsCoilBusy)\n{\n` +
          `    sbsCoilBusy = true;\n` +
          `    ${c.v('again')} = false;\n` +
          `    ${c.v('pos')} = ${c.v('want')};\n` +
          `    if (${c.v('pos')}) ${c.write('pinOn', 1 - off)}\n` +
          `    else ${c.write('pinOff', 1 - off)}` + trace(c, 'Puls (1 ein, 0 aus)', c.v('pos'), '    ') + `\n` +
          `    ${c.v('phase')} = 1;\n` +
          `    ${c.v('t')}.start(${c.param('pulse')});\n}`;
      }
    }
  },
  {
    type: 'sr595', cat: 'Hardware', name: 'Schieberegister 74HC595 (Ausgänge)',
    help: 'Stellt 8 Ausgänge je Baustein als Pins bereit (Name.Q0 …), die Digitalausgang, Relais und Relais bistabil wie normale Pins wählen – z. B. Ein-/Aus-Spulen über ULN2803 wie beim Out8 mit Energy-Storage-Addon. Q0 = QA des ersten Bausteins (Daten vom Mikrocontroller), Q8 = QA des zweiten usw. Über SPI (SCK, MOSI) oder per Software an zwei beliebigen Pins; der Latch (RCK) ist ein eigener Ausgangspin, daher können mehrere Schieberegister an einem SPI-Bus hängen. /OE (G): als Pin bleiben die Ausgänge beim Start aus, bis der Anfangszustand übertragen ist (Pull-up an /OE vorsehen). Als PWM (20 kHz, Pin mit Timer-Match) gibt der Eingang „Freigabe /OE“ an, wie viel der Zeit die Ausgänge an sind (0…255 = 0…100 %) – z. B. vom Spannungsausgleich, damit 12-V-Relais am höher geladenen Speicherkondensator laufen. Kettenprüfung: QH* des letzten Bausteins an MISO (bzw. einem Pin) zurückgeführt, liest bei jeder Übertragung den vorigen Inhalt zurück und meldet Abweichungen (mindestens jede Sekunde). Software-PWM, PWM und Analog gehen an den Pins Q0 … nicht.',
    expander: n => ({ dir: 'out', count: 8 * Number(n.props.chips), chip: '74HC595' }),
    inputs: n => n.props.oe === 'pwm' ? [{ id: 'en', type: 'num', range: '0…255', label: 'Freigabe /OE', optional: true }] : [],
    outputs: n => n.props.check ? [{ id: 'err', type: 'bool', label: 'Kettenfehler' }] : [],
    props: srProps('out').concat([
      { id: 'pinLatch', label: 'Pin Latch (RCK)', kind: 'pin', fn: 'out', native: true, def: 'IO5' },
      { id: 'oe', label: 'Ausgänge freigeben über /OE', kind: 'enum', def: 'pin',
        options: [['none', 'nein (/OE fest an GND)'], ['pin', 'Pin (nach dem Start)'], ['pwm', 'PWM (Eingang Freigabe)']] },
      { id: 'pinOe', label: 'Pin /OE (G)', kind: 'pin', fn: 'out', native: true, def: 'IO15', when: { oe: 'pin' } },
      { id: 'pinOe', label: 'Pin /OE (G, Timer-Match)', kind: 'pin', fn: 'pwm', timer: 'exclusive', native: true, def: 'IO15', when: { oe: 'pwm' } },
      { id: 'check', label: 'Kette zurücklesen (QH* des letzten Bausteins)', kind: 'bool', def: false },
      { id: 'pinBack', label: 'Pin Rücklesen (QH*)', kind: 'pin', fn: 'in', native: true, def: 'IO6', when: { iface: 'gpio', check: true } }
    ]),
    gen: {
      include: c => c.prop('iface') === 'spi' ? 'sblib/spi.h' : null,
      shared: c => [c.prop('iface') === 'spi' && srSpiSetup(c.prop('port')), c.prop('oe') === 'pwm' && srPwmSetup(c)],
      lib: c => {
        const n = Number(c.prop('chips')), spi = c.prop('iface') === 'spi', check = c.prop('check');
        const q = `${c.v('q')}[i]`;
        const shift = spi
          ? (check ? `uint8_t rx = ` : '') + `sbsSpiByte(${SR_SSP[c.prop('port')]}, 1 << 7, ${q});`
          : srBitbangOut(c, q, check);
        const cmp = check ? `\nif (rx != ${c.v('sent')}[i]) bad = true;\n${c.v('sent')}[i] = ${q};` : '';
        return [spi && SR_SPI_LIB,
          `/* 74HC595 ${c.prop('name')}: Abbild der Ausgänge, Bit i = ${c.prop('name')}.Qi */\n` +
          `static uint8_t ${c.v('q')}[${n}];\n` +
          `static bool ${c.v('dirty')};\n` +
          (check
            ? `static uint8_t ${c.v('sent')}[${n}];   // zuletzt übertragen = was zurückkommen muss\n` +
              `static int8_t ${c.v('err')} = -1;     // Kettenfehler: -1 noch nicht geprüft\n` +
              `static Timeout ${c.v('t')};\n`
            : '') + `\n` +
          `static void ${c.v('write')}(int bit, int32_t v)\n` +
          `{\n` +
          `    uint8_t m = 1 << (bit & 7), old = ${c.v('q')}[bit >> 3];\n` +
          `    ${c.v('q')}[bit >> 3] = v ? old | m : old & ~m;\n` +
          `    if (${c.v('q')}[bit >> 3] != old) ${c.v('dirty')} = true;\n` +
          `}\n\n` +
          `/* Letzter Baustein zuerst, je Byte QH zuerst; dann Latch` +
          (check ? `. Zurück kommt\n   der vorige Inhalt der Kette (QH* des letzten Bausteins zuerst). */\n` : ` */\n`) +
          `static void ${c.v('send')}()\n` +
          `{\n` +
          `    ${c.v('dirty')} = false;\n` +
          (check ? `    bool bad = false;\n` : '') +
          `    for (int i = ${n - 1}; i >= 0; i--)\n` +
          (spi && !check ? `        ${shift}\n` : `    {\n${indent(shift + cmp, 2)}\n    }\n`) +
          `    digitalWrite(${c.pin('pinLatch')}, 1);\n` +
          `    digitalWrite(${c.pin('pinLatch')}, 0);\n` +
          (check
            ? `    ${c.v('t')}.start(1000);\n` +
              `    static bool known;                // vor der ersten Übertragung: Inhalt unbekannt\n` +
              `    if (known && bad != ${c.v('err')})\n` +
              `    {\n` +
              `        ${c.v('err')} = bad;` + trace(c, 'Kettenfehler', 'bad', '        ') + `\n` +
              `        ${c.emit('err', 'bad')}\n` +
              `    }\n` +
              `    known = true;\n`
            : '') +
          `}`];
      },
      /* PWM an /OE (aktiv low): Pin high, solange der Zähler unter dem
         Vergleichswert liegt – Vergleichswert 0 = immer aus, über der
         Periode = immer an */
      state: c => c.prop('oe') === 'pwm'
        ? `static int32_t ${c.v('duty')} = ${c.linked('en') ? 0 : 255}; // Freigabe 0…255\n` +
          `static void ${c.v('oe')}()\n{\n` +
          `    ${c.gpio('pinOe').pwm[0]}.match(${c.gpio('pinOe').pwm[1]}, ${c.v('duty')} * (SystemCoreClock / ${SR_PWM_HZ}) / 255);\n}`
        : '',
      setup: c =>
        `pinMode(${c.pin('pinLatch')}, OUTPUT);\n` +
        `digitalWrite(${c.pin('pinLatch')}, 0);\n` +
        (c.prop('oe') !== 'none' ? `pinMode(${c.pin('pinOe')}, OUTPUT);\ndigitalWrite(${c.pin('pinOe')}, 1); // Ausgänge aus bis zum Start\n` : '') +
        (c.prop('iface') === 'spi'
          ? `pinMode(${c.busPin('port', 'sck')}, OUTPUT | SPI_CLOCK);\npinMode(${c.busPin('port', 'mosi')}, OUTPUT | SPI_MOSI);` +
            (c.prop('check') ? `\npinMode(${c.busPin('port', 'miso')}, INPUT | SPI_MISO);` : '')
          : `pinMode(${c.pin('pinClk')}, OUTPUT);\ndigitalWrite(${c.pin('pinClk')}, 0);\npinMode(${c.pin('pinData')}, OUTPUT);` +
            (c.prop('check') ? `\npinMode(${c.pin('pinBack')}, INPUT);` : '')),
      /* Anfangszustand (Setup der Blöcke) übertragen, erst dann freigeben */
      init: c => `${c.v('send')}();` + (
        c.prop('oe') === 'pin' ? `\ndigitalWrite(${c.pin('pinOe')}, 0);`
        : c.prop('oe') === 'pwm' ? `\n${c.v('oe')}();\npinMode(${c.pin('pinOe')}, OUTPUT_MATCH);\n${c.gpio('pinOe').pwm[0]}.pwmEnable(${c.gpio('pinOe').pwm[1]});`
        : ''),
      in: (c, port) => port === 'en' ? `${c.v('duty')} = v < 0 ? 0 : v > 255 ? 255 : v;\n${c.v('oe')}();` : '',
      loop: c => c.prop('check')
        ? `if (${c.v('dirty')} || ${c.v('t')}.expired()) ${c.v('send')}();`
        : `if (${c.v('dirty')}) ${c.v('send')}();`
    }
  },
  {
    type: 'sr165', cat: 'Hardware', name: 'Schieberegister 74HC165 (Eingänge)',
    help: 'Stellt 8 Eingänge je Baustein als Pins bereit (Name.Q0 …), die der Digitaleingang wie normale Pins wählt (mit Entprellung). Q0 = Eingang A des ersten Bausteins (QH am Mikrocontroller), Q8 = A des zweiten usw. Gelesen wird in jedem Schleifendurchlauf: SH/LD kurz low übernimmt die Eingänge, dann werden sie über SPI (SCK, MISO) oder per Software an zwei beliebigen Pins herausgeschoben. CLK INH muss auf GND liegen. QH hat keinen Tristate-Ausgang: an einem gemeinsamen MISO darf nur ein Baustein treiben. Pull-up und Invertieren am Digitaleingang wirken nur in der Software.',
    expander: n => ({ dir: 'in', count: 8 * Number(n.props.chips), chip: '74HC165' }),
    props: srProps('in').concat([
      { id: 'pinLoad', label: 'Pin Laden (SH/LD)', kind: 'pin', fn: 'out', native: true, def: 'IO3' }
    ]),
    gen: {
      include: c => c.prop('iface') === 'spi' ? 'sblib/spi.h' : null,
      shared: c => c.prop('iface') === 'spi' ? srSpiSetup(c.prop('port')) : null,
      lib: c => {
        const n = Number(c.prop('chips')), spi = c.prop('iface') === 'spi';
        const read = spi
          ? `${c.v('q')}[i] = sbsSpiByte(${SR_SSP[c.prop('port')]}, 0, 0xFF);`
          : `uint8_t v = 0;\n` +
            `for (int b = 7; b >= 0; b--)\n` +
            `{\n` +
            `    v |= digitalRead(${c.pin('pinData')}) << b;\n` +
            `    digitalWrite(${c.pin('pinClk')}, 1);\n` +
            `    digitalWrite(${c.pin('pinClk')}, 0);\n` +
            `}\n` +
            `${c.v('q')}[i] = v;`;
        return [spi && SR_SPI_LIB,
          `/* 74HC165 ${c.prop('name')}: Abbild der Eingänge, Bit i = ${c.prop('name')}.Qi */\n` +
          `static uint8_t ${c.v('q')}[${n}];\n\n` +
          `static void ${c.v('load')}()\n` +
          `{\n` +
          `    digitalWrite(${c.pin('pinLoad')}, 0);           // Eingänge übernehmen\n` +
          `    digitalWrite(${c.pin('pinLoad')}, 1);\n` +
          `    for (int i = 0; i < ${n}; i++)                 // erster Baustein zuerst, je Byte H zuerst\n` +
          `    {\n${indent(read, 2)}\n    }\n` +
          `}\n\n` +
          `static int32_t ${c.v('read')}(int bit)\n` +
          `{\n` +
          `    return (${c.v('q')}[bit >> 3] >> (bit & 7)) & 1;\n` +
          `}`];
      },
      setup: c =>
        `pinMode(${c.pin('pinLoad')}, OUTPUT);\n` +
        `digitalWrite(${c.pin('pinLoad')}, 1);\n` +
        (c.prop('iface') === 'spi'
          ? `pinMode(${c.busPin('port', 'sck')}, OUTPUT | SPI_CLOCK);\npinMode(${c.busPin('port', 'miso')}, INPUT | SPI_MISO);\n`
          : `pinMode(${c.pin('pinClk')}, OUTPUT);\ndigitalWrite(${c.pin('pinClk')}, 0);\npinMode(${c.pin('pinData')}, INPUT);\n`) +
        `${c.v('load')}(); // Anfangszustand für die Digitaleingänge`,
      loop: c => `${c.v('load')}();`
    }
  },
  {
    type: 'ai', cat: 'Hardware', name: 'Analogeingang',
    help: 'Liest den A/D-Wandler (10 Bit, 0…1023 = 0…3,3 V) in festen Abständen und gibt Änderungen ab einer Mindestdifferenz aus. Mit mehreren Wandlungen je Messung wird gleich gemittelt (Rauschen, ohne Verzögerung); einzelne Ausreißer verwirft danach der Median im Block „Gleitender Mittelwert“.',
    outputs: [{ id: 'out', type: 'num', label: 'Rohwert' }],
    props: [{ id: 'pin', label: 'Pin', kind: 'pin', fn: 'adc', def: 'IO9' },
            { id: 'over', label: 'Wandlungen je Messung (gemittelt)', kind: 'enum', def: 1, options: [1, 4, 8, 16].map(n => [n, String(n)]) }],
    params: [
      { id: 'interval', label: 'Abfrageintervall', unit: 'ms', type: 'u16', def: 500, min: 1, max: 65535 },
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
        (Number(c.prop('over')) > 1
          ? `    int32_t v = 0;\n` +
            `    for (int i = 0; i < ${c.prop('over')}; i++) v += analogRead(${c.gpio('pin').adc});\n` +
            `    v = (v + ${c.prop('over') / 2}) / ${c.prop('over')};\n`
          : `    int32_t v = analogRead(${c.gpio('pin').adc});\n`) +
        indent(onChange(c, 'v', 'delta', 'out')) + `\n` +
        `}`
    }
  },
  /* Busspannung: Ausfall und Wiederkehr wie bei der KNX-Spezifikation
     (unter 20 V Ausfall, Hysterese 1 V), mit Mindestdauer gegen Störungen */
  {
    type: 'vbus', cat: 'Hardware', name: 'Busspannung',
    help: 'Überwacht die KNX-Busspannung über den Messeingang des Controllers. „Ausfall“ wird 1, wenn sie die Ausfallschwelle für die Ausfallzeit unterschreitet, und wieder 0, wenn sie die Wiederkehrschwelle lange genug überschreitet. Bei einem Ausfall bleibt nur wenig Zeit (Energie der Kondensatoren): gut geeignet, um „Dauerhaft speichern“ auszulösen. Wahlweise hält der Block das Senden von Gruppentelegrammen während des Ausfalls an.',
    outputs: [{ id: 'fail', type: 'bool', label: 'Ausfall' }, { id: 'mv', type: 'num', label: 'Spannung (mV)' }],
    props: [
      { id: 'bus', label: 'Messeingang', kind: 'bus', buses: ['vbus'], signals: ['adc'], def: 'vbus' },
      { id: 'scale', label: '1023 am A/D-Wandler entspricht (mV)', kind: 'int', min: 3300, max: 65535, def: 33330 },
      { id: 'mute', label: 'Bei Ausfall keine Gruppentelegramme senden', kind: 'bool', def: true }
    ],
    params: [
      { id: 'low', label: 'Ausfall unter', unit: 'mV', type: 'u16', def: 20000, min: 5000, max: 30000 },
      { id: 'high', label: 'Wiederkehr über', unit: 'mV', type: 'u16', def: 21000, min: 5000, max: 30000 },
      { id: 'tLow', label: 'Ausfallzeit', unit: 'ms', type: 'u16', def: 20, min: 1, max: 10000 },
      { id: 'tHigh', label: 'Wiederkehrzeit', unit: 'ms', type: 'u16', def: 1500, min: 1, max: 60000 },
      { id: 'delta', label: 'Spannung ausgeben ab Änderung um', unit: 'mV', type: 'u16', def: 500, min: 1, max: 30000 }
    ],
    gen: {
      include: 'sblib/analog_pin.h',
      shared: 'analogBegin();',
      state: c => `static uint32_t ${c.v('ms')};\nstatic uint32_t ${c.v('since')};\nstatic bool ${c.v('fail')};` +
        (c.linked('mv') ? `\nstatic int32_t ${c.v('last')} = -1;` : ''),
      setup: c => `pinMode(${c.busPin('bus', 'adc')}, INPUT_ANALOG);`,
      init: c => `${c.v('ms')} = ${c.v('since')} = millis();`,
      /* einmal je Millisekunde messen */
      loop: c => {
        const adc = adcOf(c.busPin('bus', 'adc'));
        return `if (millis() != ${c.v('ms')})\n{\n` +
          `    ${c.v('ms')} = millis();\n` +
          `    int32_t mv = (int32_t) analogRead(${adc}) * ${Number(c.prop('scale'))} / 1023;\n` +
          `    bool low = mv < (int32_t) (${c.v('fail')} ? ${c.param('high')} : ${c.param('low')});\n` +
          `    if (low != ${c.v('fail')} && ${c.v('ms')} - ${c.v('since')} >= (uint32_t) (${c.v('fail')} ? ${c.param('tHigh')} : ${c.param('tLow')}))\n    {\n` +
          `        ${c.v('fail')} = low;` + trace(c, 'Ausfall', 'low', '        ') + trace(c, 'Spannung (mV)', 'mv', '        ') + `\n` +
          (c.prop('mute') ? `        bcu.enableGroupTelSend(!low);\n` : '') +
          `        int32_t out = low;\n` +
          `        ${c.emit('fail', 'out')}\n` +
          `    }\n` +
          `    if (low == ${c.v('fail')}) ${c.v('since')} = ${c.v('ms')};\n` +
          (c.linked('mv')
            ? `    if (${c.v('last')} < 0 || mv - ${c.v('last')} >= (int32_t) ${c.param('delta')} || ${c.v('last')} - mv >= (int32_t) ${c.param('delta')})\n    {\n` +
              `        ${c.v('last')} = mv;\n        ${c.emit('mv', 'mv')}\n    }\n` : '') +
          `}`;
      }
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

  /* ---------- Bedienung ---------- */
  {
    type: 'press', cat: 'Bedienung', name: 'Tastenauswertung',
    help: 'Unterscheidet kurzen und langen Tastendruck, auf Wunsch auch Doppelklick (dann kommt „kurz“ erst nach der Doppelklickzeit). Jeder Ausgang gibt eine 1 aus, z. B. als Auslöser.',
    inputs: [{ id: 'in', type: 'bool', label: 'Taste' }],
    outputs: [{ id: 'short', type: 'bool', label: 'kurz' }, { id: 'long', type: 'bool', label: 'lang' },
              { id: 'end', type: 'bool', label: 'lang losgelassen' }, { id: 'dbl', type: 'bool', label: 'doppelt' }],
    params: [
      KEY_LONG,
      { id: 'dbl', label: 'Doppelklickzeit', unit: 'ms, 0 = aus', type: 'u16', def: 0, max: 2000 }
    ],
    gen: {
      state: c => keyState(c, 'k') + `\nstatic Timeout ${c.v('wait')}; // wartet auf den zweiten Klick\nstatic bool ${c.v('second')};`,
      in: c => keyIn(c, 'k', {
        press: `if (${c.v('wait')}.started()) ${c.v('second')} = true;`,
        end: c.emit('end', '1'),
        short:
          `if (!${c.param('dbl')}) { ${c.emit('short', '1')} }\n` +
          `else if (${c.v('second')})\n` +
          `{\n` +
          `    ${c.v('wait')}.stop();\n` +
          `    ${c.v('second')} = false;\n` +
          `    ${c.emit('dbl', '1')}\n` +
          `}\n` +
          `else ${c.v('wait')}.start(${c.param('dbl')});`
      }),
      loop: c =>
        keyLoop(c, 'k',
          `if (${c.v('wait')}.started())    // erster Klick war kurz\n` +
          `{\n` +
          `    ${c.v('wait')}.stop();\n` +
          `    ${c.v('second')} = false;\n` +
          `    ${c.emit('short', '1')}\n` +
          `}\n` +
          c.emit('long', '1')) +
        `\nif (!${c.v('kDown')} && ${c.v('wait')}.expired()) { ${c.emit('short', '1')} } // gedrückt: weiter warten`
    }
  },
  {
    type: 'dimkey', cat: 'Bedienung', name: 'Dimmtaste',
    help: 'Kurz schaltet, lang dimmt (DPT 3.007, Loslassen = Stopp). Einflächig: kurz schaltet um, lang dimmt abwechselnd heller und dunkler (aus: immer heller). Zweiflächig: eine Taste heller/ein, eine dunkler/aus. „Status“ ist die Rückmeldung des Dimmers.',
    inputs: n => keysOf(n, 'Taste heller/ein', 'Taste dunkler/aus').concat([{ id: 'status', type: 'bool', label: 'Status', optional: true }]),
    outputs: [{ id: 'sw', type: 'bool', label: 'Schalten' }, { id: 'dim', type: 'num', range: 'DPT 3.007', label: 'Dimmen' }],
    props: [KEYS],
    params: [KEY_LONG],
    gen: {
      state: c => keys(c).map(k => keyState(c, k)).join('\n') +
        `\nstatic bool ${c.v('on')};\nstatic bool ${c.v('up')};      // Richtung des laufenden Dimmens`,
      in: (c, port) => port === 'status'
        ? `${c.v('on')} = v != 0;`
        : keyIn(c, port, {
          short: c.prop('keys') === 'one'
            ? `${c.v('on')} = !${c.v('on')};\n${c.emit('sw', c.v('on'))}`
            : `${c.v('on')} = ${port === 'k' ? 'true' : 'false'};\n${c.emit('sw', c.v('on'))}`,
          end: `${c.emit('dim', `${c.v('up')} ? 0x08 : 0x00`)} // Stopp`
        }),
      loop: c => keys(c).map(k => keyLoop(c, k,
        (c.prop('keys') === 'one'
          ? `${c.v('up')} = !${c.v('on')} || !${c.v('up')};\n`
          : `${c.v('up')} = ${k === 'k' ? 'true' : 'false'};\n`) +
        `if (${c.v('up')}) ${c.v('on')} = true;\n` +
        `${c.emit('dim', `${c.v('up')} ? 0x09 : 0x01`)} // 100 % heller/dunkler`)).join('\n')
    }
  },
  {
    type: 'blindkey', cat: 'Bedienung', name: 'Jalousietaste',
    help: 'Lang fährt (DPT 1.008, 0 = auf, 1 = ab), kurz stoppt bzw. verstellt die Lamelle (DPT 1.007). Einflächig wechselt die Richtung bei jedem langen Druck. Mit „Totmann“ stoppt das Loslassen nach langem Druck.',
    inputs: n => keysOf(n, 'Taste auf', 'Taste ab'),
    outputs: [{ id: 'move', type: 'bool', label: 'Auf/Ab' }, { id: 'step', type: 'bool', label: 'Stopp/Lamelle' }],
    props: [KEYS],
    params: [
      KEY_LONG,
      { id: 'hold', label: 'Loslassen nach langem Druck', type: 'enum', options: [[0, 'fährt weiter'], [1, 'Stopp (Totmann)']], def: 0 }
    ],
    gen: {
      state: c => keys(c).map(k => keyState(c, k)).join('\n') + `\nstatic bool ${c.v('down')};    // Richtung: 1 = ab`,
      in: (c, port) => keyIn(c, port, {
        short: (c.prop('keys') === 'one' ? '' : `${c.v('down')} = ${port === 'k' ? 'false' : 'true'};\n`) + c.emit('step', c.v('down')),
        end: `if (${c.param('hold')}) { ${c.emit('step', c.v('down'))} }`
      }),
      loop: c => keys(c).map(k => keyLoop(c, k,
        `${c.v('down')} = ${c.prop('keys') === 'one' ? `!${c.v('down')}` : k === 'k' ? 'false' : 'true'};\n` +
        c.emit('move', c.v('down')))).join('\n')
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
        `    bool ok = ${c.v('sensor')}.measureHighPrecision();` + trace(c, 'Messung ok', 'ok', '    ') + `\n` +
        `    if (ok)\n` +
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
        `    float lux = ${c.v('sensor')}.readLightLevel();` + trace(c, 'Lux (-1 Fehler)', 'lux < 0 ? -1 : (int32_t) lux', '    ') + `\n` +
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
        `    if (!${c.v('ds')}.m_foundDevices) ${c.v('ds')}.Search();` + trace(c, 'Sensoren gefunden', `${c.v('ds')}.m_foundDevices`, '    ') + `\n` +
        `    ${c.v('conv')} = ${c.v('ds')}.startConversion(0);\n` +
        `}\n` +
        `if (${c.v('conv')} && ${c.v('ds')}.readResult(0))\n` +
        `{\n` +
        `    ${c.v('conv')} = false;\n` +
        `    if (${c.v('ds')}.lastReadOk(0))\n` +
        `    {\n` +
        `        float t = ${c.v('ds')}.temperature(0);\n` +
        `        int32_t v = ${hundredths('t')} + ${c.param('offset')};` + trace(c, 'Temperatur (1/100 Grad C)', 'v', '        ') + `\n` +
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
      { id: 'readInit', label: 'Wert beim Start lesen', kind: 'bool', def: false },
      { id: 'start', label: 'Wert nach Start ausgeben', kind: 'bool', def: false }
    ],
    /* Startwert, z. B. „Objektwert nach Busspannungswiederkehr“ */
    params: n => !n.props.start ? [] : DPT[n.props.dpt].type === 'bool'
      ? [{ id: 'startVal', label: 'Wert nach Start', type: 'enum', options: [[0, '0'], [1, '1']], def: 0 }]
      : [{ id: 'startVal', label: 'Wert nach Start', type: 'i16', def: 0 }],
    kos: n => [{ id: 'obj', text: n.props.name, func: 'Empfangen', dpt: n.props.dpt,
                 flags: 'CWU' + (n.props.readInit ? 'I' : '') }],
    gen: {
      state: c => c.prop('start') ? `static bool ${c.v('done')} = false;` : '',
      /* in der Hauptschleife, wenn alle Blöcke bereit sind */
      loop: c => c.prop('start') ? `if (!${c.v('done')})\n{\n    ${c.v('done')} = true;\n    int32_t v = ${c.param('startVal')};` + trace(c, 'Startwert', 'v', '    ') + `\n    ${c.emit('out', 'v')}\n}` : '',
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
      /* fest ohne zyklisches Senden: kein Timeout */
      /* letzter Wert in der Breite des DPT (Vergleich so, wie er auf dem Bus steht) */
      state: c => `static ${c.koStore('obj', 'in')} ${c.v('last')};\nstatic bool ${c.v('valid')};` + (c.param('cycle') === '0' ? '' : `\nstatic Timeout ${c.v('cyc')};`),
      init: c => c.param('cycle') === '0' ? '' : `if (${c.param('cycle')}) ${c.v('cyc')}.start(${c.param('cycle')} * 1000UL);`,
      in: c =>
        `if (${c.param('mode')} == 1 || !${c.v('valid')} || ${c.koStore('obj', 'in') === 'int32_t' ? 'v' : `(${c.koStore('obj', 'in')}) v`} != ${c.v('last')})\n` +
        `{\n` +
        `    ${c.v('valid')} = true;\n` +
        `    ${c.v('last')} = v;\n` +
        `    ${c.koWrite('obj', 'v')}\n` +
        `}`,
      loop: c => c.param('cycle') === '0' ? '' :
        `if (${c.v('cyc')}.expired())\n` +
        `{\n` +
        `    if (${c.v('valid')}) ${c.koWrite('obj', c.v('last'))}\n` +
        `    ${c.v('cyc')}.start(${c.param('cycle')} * 1000UL);\n` +
        `}`
    }
  },

  {
    type: 'text_out', cat: 'KNX', name: 'Text senden',
    help: 'Sendet einen Text (DPT 16, bis 14 Zeichen) auf den Bus: aus einer Liste nach Nummer (1…8, 0 = leer) oder einen Zahlenwert mit Vor- und Nachtext, z. B. „Temp 21,5 °C“ (DPT 9: 2 Nachkommastellen). Zu lange Zahlentexte werden abgeschnitten.',
    inputs: n => [n.props.mode === 'list'
      ? { id: 'in', type: 'num', range: ['1…{0}', Number(n.props.count)], label: 'Nummer' }
      : { id: 'in', type: 'num', label: 'Wert' }],
    props: [
      { id: 'name', label: 'Objektname', kind: 'text', def: 'Text' },
      TEXT_DPT,
      { id: 'mode', label: 'Inhalt', kind: 'enum', def: 'list', options: [['list', 'Text aus Liste'], ['value', 'Zahl als Text']] },
      ...textList(true),
      { id: 'pre', label: 'Vortext', kind: 'text', def: '', max: 14, when: { mode: 'value' } },
      { id: 'dec', label: 'Nachkommastellen', kind: 'enum', def: 2, options: [[0, '0'], [1, '1'], [2, '2 (DPT 9, Hundertstel)']], when: { mode: 'value' } },
      { id: 'post', label: 'Nachtext', kind: 'text', def: '', max: 14, when: { mode: 'value' } }
    ],
    check: textCheck,
    kos: n => [{ id: 'obj', text: n.props.name, func: 'Senden', dpt: n.props.dpt, flags: 'CRT' }],
    gen: {
      lib: c => [TEXT_WRITE_LIB, c.prop('mode') === 'value' && TEXT_FORMAT_LIB],
      state: c => c.prop('mode') === 'list'
        ? `static const char* const ${c.v('texts')}[] = { ${range(Number(c.prop('count'))).map(i => cText(c.prop('t' + i), c.prop('dpt'))).join(', ')} };`
        : '',
      in: c => c.prop('mode') === 'list'
        ? `sbsTextWrite(${c.ko('obj')}, v >= 1 && v <= ${Number(c.prop('count'))} ? ${c.v('texts')}[v - 1] : "");`
        : `char s[15];\n` +
          `sbsTextFormat(s, ${cText(c.prop('pre'), c.prop('dpt'))}, v, ${Number(c.prop('dec'))}, ${cText(c.prop('post'), c.prop('dpt'))});\n` +
          `sbsTextWrite(${c.ko('obj')}, s);`
    }
  },
  {
    type: 'text_in', cat: 'KNX', name: 'Text empfangen',
    help: 'Kommunikationsobjekt für Text (DPT 16), das der Bus beschreibt. Vergleicht den empfangenen Text mit der Liste und gibt die Nummer des passenden aus (0 = keiner), z. B. als Befehl an ein Gerät.',
    outputs: [{ id: 'out', type: 'num', label: 'Nummer' }],
    props: [
      { id: 'name', label: 'Objektname', kind: 'text', def: 'Text' },
      TEXT_DPT,
      ...textList(false),
      { id: 'icase', label: 'Groß-/Kleinschreibung egal', kind: 'bool', def: false }
    ],
    check: textCheck,
    kos: n => [{ id: 'obj', text: n.props.name, func: 'Empfangen', dpt: n.props.dpt, flags: 'CWU' }],
    gen: {
      include: 'cstring',
      lib: c => [TEXT_READ_LIB, c.prop('icase') && TEXT_ICASE_LIB],
      state: c => `static const char* const ${c.v('texts')}[] = { ${range(Number(c.prop('count'))).map(i => cText(c.prop('t' + i), c.prop('dpt'))).join(', ')} };`,
      ko: c =>
        `{\n` +
        `    char s[15];\n` +
        `    sbsTextRead(${c.ko('obj')}, s);\n` +
        `    int32_t n = 0;\n` +
        `    for (int i = 0; i < ${Number(c.prop('count'))} && !n; i++)\n` +
        `        if (!${c.prop('icase') ? 'sbsTextCaseCmp' : 'strcmp'}(s, ${c.v('texts')}[i])) n = i + 1;\n` +
        `    ${c.emit('out', 'n')}\n` +
        `}`
    }
  },
  /* ETS-Auswahl: ein Parameter mit eigenen Einträgen. Andere Blöcke und
     Makro-Instanzen können daran gebunden werden (Eigenschaften, „In der
     ETS sichtbar“); die knxprod blendet sie dann mit choose/when ein und
     aus. Der Ausgang liefert die Wahl auch der Firmware. */
  /* Telegrammratenbegrenzung der sblib (höchstens 28 je Sekunde) */
  {
    type: 'ratelimit', cat: 'KNX', name: 'Telegrammrate',
    help: 'Begrenzt, wie viele Gruppentelegramme das Gerät je Sekunde sendet; weitere warten. Ohne den Block gilt die Grenze der sblib (28 je Sekunde). Nur einmal je Gerät.',
    params: [{ id: 'limit', label: 'Höchstens Telegramme je Sekunde', type: 'u8', def: 10, min: 1, max: 28 }],
    resources: [['ratelimit', 'Telegrammrate']],
    gen: { init: c => `bcu.setGroupTelRateLimit(${c.param('limit')});` }
  },
  {
    type: 'option', cat: 'KNX', name: 'Parameterauswahl',
    help: 'KNX-Parameter mit eigenen Einträgen, z. B. „Zeitfunktion: keine / Treppenlicht / Verzögerung“. Blöcke und Makro-Instanzen lassen sich daran binden: Im Parameterdialog des Geräts (z. B. in der ETS) erscheinen ihre Parameter und KOs nur bei den gewählten Einträgen. Der Ausgang gibt die Nummer des Eintrags (ab 0) nach dem Start einmal aus, etwa für Auswahl oder Tor; bei zwei Einträgen als 0/1.',
    /* zwei Einträge (Nein/Ja): als bool, etwa für XOR oder Tor */
    outputs: n => [{ id: 'out', type: optionChoices(n).length === 2 ? 'bool' : 'num', label: 'Eintrag' }],
    props: [
      { id: 'name', label: 'Parametertext', kind: 'text', def: 'Funktion' },
      { id: 'choices', label: 'Einträge (je Zeile einer, Wert ab 0)', kind: 'lines', def: 'Nein\nJa' }
    ],
    params: n => [{ id: 'sel', label: { raw: n.props.name || '?' }, type: 'enum', def: 0,
                    options: optionChoices(n).map((s, i) => [i, { raw: s }]) }],
    check: n => optionChoices(n).length < 2 ? [['Mindestens zwei Einträge.']] : optionChoices(n).length > 32 ? [['Höchstens 32 Einträge.']] : [],
    gen: {
      state: c => `static bool ${c.v('done')} = false;`,
      loop: c => `if (!${c.v('done')})\n{\n    ${c.v('done')} = true;\n    int32_t out = ${c.param('sel')};\n    ${c.emit('out', 'out')}\n}`
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
    type: 'logic', cat: 'Logik', name: 'Logik (Parameter)',
    help: 'Verknüpfung, die sich über KNX-Parameter einstellen lässt (wie die Logikfunktionen vieler Binäreingänge): UND, ODER oder XOR; jeder Eingang nicht verwendet, normal oder invertiert; Ergebnis wahlweise invertiert. Nicht verwendete Eingänge zählen nicht mit und lösen nichts aus. Ein invertierter Eingang gilt vor dem ersten Wert als 1. Gibt bei jedem Ereignis an einem verwendeten Eingang aus.',
    inputs: n => range(Number(n.props.count)).map(i => ({ id: `i${i}`, type: 'bool', label: logicName(n, i) || `E${i + 1}`, optional: true })),
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    props: [
      { id: 'count', label: 'Eingänge', kind: 'enum', options: [2, 3, 4, 5, 6, 8].map(k => [k, String(k)]), def: 2 },
      { id: 'names', label: 'Namen der Eingänge (je Zeile einer, leer = Eingang 1 …)', kind: 'lines', def: '' }
    ],
    params: n => [{ id: 'op', label: 'Verknüpfung', type: 'enum', options: [[0, 'UND'], [1, 'ODER'], [2, 'XOR']], def: 0 }]
      .concat(range(Number(n.props.count)).map(i => ({ id: `m${i}`, label: logicName(n, i) ? { raw: logicName(n, i) } : ['Eingang {0}', i + 1], type: 'enum', def: 1,
        options: [[0, 'nicht verwendet'], [1, 'normal'], [2, 'invertiert']] })))
      .concat({ id: 'inv', label: 'Ergebnis invertieren', type: 'enum', options: YES_NO, def: 0 }),
    gen: {
      state: c => `static bool ${c.v('e')}[${Number(c.prop('count'))}];`,
      in: (c, port) => {
        const k = Number(port.slice(1)), e = c.v('e'), op = c.param('op');
        const val = i => `(${e}[${i}] != (${c.param(`m${i}`)} == 2))`;
        return `if (${c.param(`m${k}`)} == 0) return;\n` +
          `${e}[${k}] = v != 0;\n` +
          `bool out = ${op} == 0;\n` +
          range(Number(c.prop('count'))).map(i =>
            `if (${c.param(`m${i}`)} != 0) out = ${op} == 0 ? out && ${val(i)} : ${op} == 1 ? out || ${val(i)} : out != ${val(i)};`).join('\n') + '\n' +
          `int32_t res = out != (${c.param('inv')} != 0);\n` +
          c.emit('out', 'res');
      }
    }
  },
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
      state: c => `static bool ${c.v('st')};`,
      in: (c, port) => port === 'set'
        ? `${c.v('st')} = v != 0;`
        : `if (!v) return;\n${c.v('st')} = !${c.v('st')};\n${c.emit('out', c.v('st'))}`
    }
  },
  {
    type: 'const', cat: 'Logik', name: 'Wert senden',
    help: 'Gibt bei jeder 1 am Auslöser einen festen Wert aus. Der Parametertext ersetzt „Wert“ im Parameterdialog, etwa „Szenennummer“.',
    inputs: [{ id: 'trig', type: 'bool', label: 'Auslöser' }],
    outputs: [{ id: 'out', type: 'num', label: 'Wert' }],
    props: [{ id: 'name', label: 'Parametertext', kind: 'text', def: '' }],
    params: n => [{ id: 'value', label: n.props.name ? { raw: n.props.name } : 'Wert', type: 'i16', def: 1 }],
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
      state: c => `static int8_t ${c.v('st')} = -1;`,
      in: c =>
        `int32_t out = ${c.v('st')};\n` +
        `if (v >= ${c.param('thr')}) out = 1;\n` +
        `else if (v < (int32_t) ${c.param('thr')} - (int32_t) ${c.param('hyst')} || out < 0) out = 0;\n` +
        `if (out == ${c.v('st')}) return;\n` +
        `${c.v('st')} = out;\n` +
        `${c.emit('out', 'out')}`
    }
  },

  /* Zwei Schwellen wie ABB: als Hysteresegrenzen oder drei Bereiche mit
     eigener Reaktion; Schwelle 1 über einen Eingang änderbar */
  {
    type: 'thresholds', cat: 'Logik', name: 'Schwellwerte',
    help: 'Vergleicht einen Zahlenwert mit zwei Schwellen. Als Hysteresegrenzen: über der oberen gilt die Reaktion „oberer Bereich“, unter der unteren „unterer Bereich“, dazwischen bleibt es. Sonst gibt es drei Bereiche mit je eigener Reaktion (aus, ein, keine). Reagiert nur beim Wechsel des Bereichs. Schwelle 1 lässt sich über den Eingang ändern; dann wird neu verglichen.',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }, { id: 'thr1', type: 'num', label: 'Schwelle 1 ändern', optional: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    params: [
      { id: 'thr1', label: 'Schwelle 1', unit: 'Rohwert', type: 'i32', def: 80 },
      { id: 'thr2', label: 'Schwelle 2', unit: 'Rohwert', type: 'i32', def: 160 },
      { id: 'hyst', label: 'Schwellen als Hysteresegrenzen', type: 'enum', options: YES_NO, def: 1 },
      { id: 'low', label: 'Unterer Bereich', type: 'enum', options: REACT, def: 0 },
      { id: 'mid', label: 'Mittlerer Bereich (ohne Hysterese)', type: 'enum', options: REACT, def: 2 },
      { id: 'high', label: 'Oberer Bereich', type: 'enum', options: REACT, def: 1 }
    ],
    gen: {
      state: c => `static int32_t ${c.v('t1')};\nstatic int32_t ${c.v('last')};\nstatic bool ${c.v('seen')};\nstatic int8_t ${c.v('rg')} = -1;\n` +
        `static void ${c.v('eval')}()\n{\n` +
        `    int32_t v = ${c.v('last')}, t2 = ${c.param('thr2')};\n` +
        `    int32_t lo = ${c.v('t1')} < t2 ? ${c.v('t1')} : t2, hi = ${c.v('t1')} < t2 ? t2 : ${c.v('t1')};\n` +
        `    int8_t rg = v >= hi ? 2 : v < lo ? 0 : ${c.param('hyst')} ? ${c.v('rg')} : 1;\n` +
        `    if (rg < 0 || rg == ${c.v('rg')}) return;\n` +
        `    ${c.v('rg')} = rg;` + trace(c, 'Bereich (0 unter, 1 zwischen, 2 über)', 'rg', '    ') + `\n` +
        `    uint8_t r = rg == 0 ? ${c.param('low')} : rg == 1 ? ${c.param('mid')} : ${c.param('high')};\n` +
        `    if (r > 1) return;\n` +
        `    int32_t out = r;\n` +
        `    ${c.emit('out', 'out')}\n` +
        `}`,
      init: c => `${c.v('t1')} = ${c.param('thr1')};`,
      in: (c, port) => port === 'in'
        ? `${c.v('last')} = v;\n${c.v('seen')} = true;\n${c.v('eval')}();`
        : `${c.v('t1')} = v;\nif (${c.v('seen')}) ${c.v('eval')}();`
    }
  },
  /* Preset wie ABB: 0 ruft Preset 1, 1 Preset 2 auf; Setzen übernimmt den
     aktuellen Zustand (Rückführung, löst selbst nichts aus) */
  {
    type: 'preset', cat: 'Logik', name: 'Preset',
    help: 'Zwei voreingestellte Zustände. „Aufrufen“ mit 0 gibt Preset 1 aus, mit 1 Preset 2. Preset 1 kann auch den Zustand vor dem letzten Aufruf von Preset 2 wiederherstellen. „Setzen“ übernimmt den aktuellen Zustand als Preset 1 (0) bzw. 2 (1). Der Eingang „Aktueller Zustand“ ist eine Rückführung, etwa vom Status: er merkt sich nur den Wert und darf deshalb einen Kreis schließen.',
    inputs: [{ id: 'call', type: 'bool', label: 'Aufrufen' }, { id: 'set', type: 'bool', label: 'Setzen', optional: true },
             { id: 'state', type: 'bool', label: 'Aktueller Zustand', feedback: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    params: [
      { id: 'p1', label: 'Preset 1 (Wert 0)', type: 'enum', def: 0, options: [[0, 'aus'], [1, 'ein'], [2, 'keine Reaktion'], [3, 'Zustand vor Preset 2']] },
      { id: 'p2', label: 'Preset 2 (Wert 1)', type: 'enum', def: 1, options: [[0, 'aus'], [1, 'ein'], [2, 'keine Reaktion']] }
    ],
    gen: {
      state: c => `static int8_t ${c.v('cur')} = -1;\nstatic int8_t ${c.v('before')} = -1;\nstatic uint8_t ${c.v('p')}[2];`,
      init: c => `${c.v('p')}[0] = ${c.param('p1')};\n${c.v('p')}[1] = ${c.param('p2')};`,
      in: (c, port) => port === 'state' ? `${c.v('cur')} = v != 0;`
        : port === 'set' ? `if (${c.v('cur')} >= 0) ${c.v('p')}[v ? 1 : 0] = ${c.v('cur')};`
        : `uint8_t r = ${c.v('p')}[v ? 1 : 0];` + trace(c, 'Preset (0 = 1, 1 = 2)', 'v') + `\n` +
          `if (v) ${c.v('before')} = ${c.v('cur')};\n` +
          `if (r == 3) r = ${c.v('before')} < 0 ? 2 : ${c.v('before')};\n` +
          `if (r > 1) return;\n` +
          `int32_t out = r;\n` +
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
      state: c => `static ${c.store('in')} ${c.v('val')};\nstatic bool ${c.v('has')};\nstatic bool ${c.v('open')};`,
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
  /* Auswahl: mit zwei Werten „wenn … dann A, sonst B“, mit mehr Werten
     nach Nummer (0 …), etwa vom Ausgang einer Parameterauswahl. Beim
     Umschalten wird erst ausgegeben, wenn der gewählte Wert einmal
     angekommen ist – sonst schaltete die Wahl beim Start mit 0. */
  {
    type: 'select', cat: 'Logik', name: 'Auswahl',
    help: 'Wählt nach der Bedingung Wert A (1) oder Wert B (0) – „wenn … dann A, sonst B“. Mit mehr als zwei Werten wählt eine Nummer (ab 0) den Wert, z. B. vom Ausgang einer Parameterauswahl; Werte dürfen dann offen bleiben (Weiche: nur der gewählte Eingang kommt durch). Gibt aus, wenn sich die Wahl oder der gewählte Wert ändert; beim Umschalten erst, wenn der gewählte Wert einmal angekommen ist.',
    inputs: n => Number(n.props.count) > 2
      ? [{ id: 'cond', type: 'num', label: 'Nummer' }].concat(range(Number(n.props.count)).map(i => ({ id: 'i' + i, type: n.props.vtype, label: ['Wert {0}', i], optional: true })))
      : [{ id: 'cond', type: 'bool', label: 'Bedingung' },
         { id: 'a', type: n.props.vtype, label: 'A (bei 1)' }, { id: 'b', type: n.props.vtype, label: 'B (bei 0)' }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE, { id: 'count', label: 'Werte', kind: 'enum', options: [2, 3, 4, 5, 6, 8, 10, 12, 16].map(k => [k, String(k)]), def: 2 }],
    gen: {
      /* nach Nummer: Platz nur für die verbundenen Werte, „angekommen“ als Bits */
      state: c => Number(c.prop('count')) > 2
        ? `static ${c.store(...selSlots(c).map(i => 'i' + i))} ${c.v('val')}[${Math.max(1, selSlots(c).length)}];\nstatic uint16_t ${c.v('seen')};\nstatic int8_t ${c.v('sel')} = -1;`
        : `static ${c.store('a', 'b')} ${c.v('a')};\nstatic ${c.store('a', 'b')} ${c.v('b')};\nstatic bool ${c.v('cond')};\nstatic bool ${c.v('sa')};\nstatic bool ${c.v('sb')};`,
      in: (c, port) => {
        const k = Number(c.prop('count'));
        if (k > 2) {
          const slots = selSlots(c);
          if (port === 'cond') return `${c.v('sel')} = v >= 0 && v < ${k} ? v : -1;\n` +
            `int32_t out;\nswitch (v)\n{\n` +
            slots.map((i, j) => `case ${i}:\n    if (!(${c.v('seen')} & ${1 << j})) return;\n    out = ${c.v('val')}[${j}];\n    break;\n`).join('') +
            `default:\n    return;\n}\n${c.emit('out', 'out')}`;
          const j = slots.indexOf(Number(port.slice(1)));
          return j < 0 ? '' : `${c.v('val')}[${j}] = v;\n${c.v('seen')} |= ${1 << j};\nif (${c.v('sel')} == ${port.slice(1)}) { ${c.emit('out', 'v')} }`;
        }
        return port === 'cond'
          ? `${c.v('cond')} = v != 0;\n` +
            `if (!(${c.v('cond')} ? ${c.v('sa')} : ${c.v('sb')})) return;\n` +
            `int32_t out = ${c.v('cond')} ? ${c.v('a')} : ${c.v('b')};\n` +
            `${c.emit('out', 'out')}`
          : `${c.v(port)} = v;\n${c.v('s' + port)} = true;\n` +
            `if (${port === 'a' ? '' : '!'}${c.v('cond')}) { ${c.emit('out', 'v')} }`;
      }
    }
  },
  /* Zusammenführen: mehrere Quellen auf einen Weg, der letzte Wert gilt
     (ein Eingang hat sonst genau eine Quelle) */
  {
    type: 'merge', cat: 'Logik', name: 'Zusammenführen',
    help: 'Führt mehrere Quellen auf einen Weg zusammen: Jeder ankommende Wert wird weitergegeben, der letzte gilt. Etwa Schalten, Szene und Schwellwert auf denselben Ausgang.',
    inputs: n => range(Number(n.props.count)).map(i => ({ id: 'i' + i, type: n.props.vtype, label: `E${i + 1}`, optional: true })),
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE, { id: 'count', label: 'Eingänge', kind: 'enum', options: [2, 3, 4, 5, 6, 8, 10, 12, 16].map(k => [k, String(k)]), def: 2 }],
    gen: { in: c => c.emit('out', 'v') }
  },
  /* Priorität: Stufen übersteuern den normalen Wert, die erste aktive
     Stufe gilt (Sicherheit, Zwangsführung nach KNX-Art) */
  {
    type: 'priority', cat: 'Logik', name: 'Priorität',
    help: 'Übersteuert den normalen Wert, solange eine Stufe aktiv ist; Stufe 1 hat Vorrang vor 2 usw. Je Stufe: Stellung aus, ein, unverändert oder „nicht beachten“. Eine Stufe als 2-Bit-Zwangsführung (DPT 2.001) nimmt die Stellung aus dem Telegramm. Endet die letzte Stufe: aus, ein, unverändert oder zurück zum normalen Wert. Während eine Stufe aktiv ist, wird der normale Wert gemerkt, aber nicht ausgegeben.',
    inputs: n => [{ id: 'in', type: 'bool', label: 'Normaler Wert' }].concat(range(Number(n.props.levels)).map(i =>
      n.props['mode' + i] === 'dpt2' ? { id: 'a' + i, type: 'num', label: prioName(n, i), optional: true }
        : { id: 'a' + i, type: 'bool', label: prioName(n, i), optional: true })),
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }, { id: 'act', type: 'bool', label: 'Übersteuert' }],
    props: [{ id: 'levels', label: 'Stufen', kind: 'enum', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4']], def: 2 }]
      .concat(range(4).map(i => ({ id: 'mode' + i, label: ['Stufe {0}', i + 1], kind: 'enum', def: 'bit',
        options: [['bit', '1 Bit: 1 = aktiv'], ['dpt2', '2 Bit: Zwangsführung (DPT 2.001)']], when: p => Number(p.levels) > i })))
      .concat(range(4).map(i => ({ id: 'name' + i, label: ['Stufe {0}: Name', i + 1], kind: 'text', def: '', when: p => Number(p.levels) > i }))),
    params: n => range(Number(n.props.levels)).map(i => n.props['mode' + i] === 'dpt2'
      ? { id: 'pos' + i, label: ['{0}: Stellung', prioName(n, i)], type: 'enum', def: 4, options: [[4, 'aus dem Telegramm'], [2, 'unverändert'], [3, 'nicht beachten']] }
      : { id: 'pos' + i, label: ['{0}: Stellung', prioName(n, i)], type: 'enum', def: 0, options: [[0, 'aus'], [1, 'ein'], [2, 'unverändert'], [3, 'nicht beachten']] })
      .concat([{ id: 'end', label: 'Nach Ende', type: 'enum', def: 3, options: [[0, 'aus'], [1, 'ein'], [2, 'unverändert'], [3, 'normaler Wert']] }]),
    gen: {
      state: c => {
        const k = Number(c.prop('levels'));
        const pos = range(k).map(i => c.param('pos' + i));
        return `static bool ${c.v('act')}[${k}];\n` +
          `static bool ${c.v('val')}[${k}];\n` +
          `static int8_t ${c.v('cur')} = -1;\n` +
          `static bool ${c.v('nv')};\n` +
          `static bool ${c.v('seen')};\n` +
          `static void ${c.v('eval')}(bool force)\n{\n` +
          `    const uint8_t pos[${k}] = { ${pos.join(', ')} };\n` +
          `    int8_t h = -1;\n` +
          `    for (int i = 0; i < ${k} && h < 0; i++)\n` +
          `        if (${c.v('act')}[i] && pos[i] != 3) h = i;\n` +
          `    if (h == ${c.v('cur')} && !force) return;\n` +
          `    int8_t was = ${c.v('cur')};\n` +
          `    ${c.v('cur')} = h;` + trace(c, 'aktive Stufe (-1 keine)', 'h', '    ') + `\n` +
          `    if ((h < 0) != (was < 0)) { int32_t a = h >= 0; ${c.emit('act', 'a')} }\n` +
          `    int32_t out;\n` +
          `    if (h >= 0) {\n` +
          `        uint8_t p = pos[h] == 4 ? ${c.v('val')}[h] : pos[h];\n` +
          `        if (p > 1) return;\n` +
          `        out = p;\n` +
          `    } else {\n` +
          `        uint8_t e = ${c.param('end')};\n` +
          `        if (e == 2 || (e == 3 && !${c.v('seen')})) return;\n` +
          `        out = e == 3 ? ${c.v('nv')} : e;\n` +
          `    }\n` +
          `    ${c.emit('out', 'out')}\n}`;
      },
      in: (c, port) => {
        if (port === 'in') return `${c.v('nv')} = v != 0;\n${c.v('seen')} = true;\nif (${c.v('cur')} >= 0) return;\nint32_t out = ${c.v('nv')};\n${c.emit('out', 'out')}`;
        const i = Number(port.slice(1));
        return c.prop('mode' + i) === 'dpt2'
          ? `${c.v('act')}[${i}] = (v & 2) != 0;\n${c.v('val')}[${i}] = v & 1;\n${c.v('eval')}(${c.v('act')}[${i}] && ${c.v('cur')} == ${i});`
          : `${c.v('act')}[${i}] = v != 0;\n${c.v('eval')}(false);`;
      }
    }
  },
  {
    type: 'edge', cat: 'Logik', name: 'Flanke',
    help: 'Erkennt den Wechsel 0 → 1 (steigend) und 1 → 0 (fallend) und gibt dann eine 1 aus, z. B. als Auslöser. Gleiche Werte hintereinander lösen nichts aus. „Zustand setzen“ übernimmt einen Wert ohne Flanke, etwa den Startzustand eines Eingangs.',
    inputs: [{ id: 'in', type: 'bool', label: 'Eingang' }, { id: 'set', type: 'bool', label: 'Zustand setzen', optional: true }],
    outputs: [{ id: 'rise', type: 'bool', label: 'steigend' }, { id: 'fall', type: 'bool', label: 'fallend' }],
    gen: {
      state: c => `static bool ${c.v('st')};`,
      in: (c, port) => port === 'set' ? `${c.v('st')} = v != 0;` :
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
    type: 'latch', cat: 'Logik', name: 'Speicher',
    help: 'Merkt sich den Wert am Eingang und gibt ihn erst bei 1 an „Übernehmen“ aus (D-Flipflop, Abtasten und Halten). Wahlweise nur, wenn er sich seit der letzten Ausgabe geändert hat.',
    inputs: n => [{ id: 'in', type: n.props.vtype, label: 'Wert' }, { id: 'trig', type: 'bool', label: 'Übernehmen' }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE],
    params: [{ id: 'change', label: 'Nur bei Änderung ausgeben', type: 'enum', options: YES_NO, def: 0 }],
    gen: {
      state: c => `static ${c.store('in')} ${c.v('val')};\nstatic ${c.store('in')} ${c.v('out')};\nstatic bool ${c.v('sent')};`,
      in: (c, port) => port === 'in'
        ? `${c.v('val')} = v;`
        : `if (!v) return;\n` +
          `if (${c.param('change')} && ${c.v('sent')} && ${c.v('out')} == ${c.v('val')}) return;\n` +
          `${c.v('sent')} = true;\n` +
          `${c.v('out')} = ${c.v('val')};\n` +
          `${c.emit('out', c.v('out'))}`
    }
  },
  /* Dauerhaft speichern: Wert über Neustart und Busspannungsausfall retten.
     Alle Blöcke teilen sich eine Flash-Seite (persistLib); Platz je Block
     vergibt der Generator (c.persist()). */
  {
    type: 'persist', cat: 'Logik', name: 'Dauerhaft speichern', persist: true,
    help: 'Gibt den Wert am Eingang weiter und merkt ihn sich. Bei 1 an „Sichern“ schreibt er die Werte aller Blöcke dieser Art in den Flash, etwa ausgelöst vom Ausfall der Busspannung; wahlweise auch vor einem Reset oder Download (Rückruf der sblib). Unveränderte Werte schreibt er nicht noch einmal. Nach dem Start gibt er den gesicherten Wert einmal aus, so dass z. B. ein Relais die Stellung von vor dem Ausfall wieder einnimmt. Das Schreiben dauert einige Millisekunden; der Flash verträgt etwa 10 000 Löschvorgänge je Seite, vier Seiten wechseln sich ab.',
    inputs: n => [{ id: 'in', type: n.props.vtype, label: 'Wert' }, { id: 'save', type: 'bool', label: 'Sichern' }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }],
    props: [VTYPE, { id: 'auto', label: 'Auch vor Reset und Download sichern', kind: 'bool', def: true }],
    params: [{ id: 'start', label: 'Nach Start', type: 'enum', options: [[0, 'nichts ausgeben'], [1, 'gesicherten Wert ausgeben']], def: 1 }],
    gen: {
      include: ['cstring', 'sblib/internal/iap.h'],
      lib: c => persistLib(c.traceOn),
      state: c => `static bool ${c.v('done')} = false;`,
      in: (c, port) => port === 'in'
        ? `sbsPersist[${c.persist()}] = v;\n${c.emit('out', 'v')}`
        : `if (v) sbsPersistPending = true;` + trace(c, 'Sichern', 'v'),
      setup: () => `sbsPersistLoad();`,
      /* Ausgabe nach dem Start erst in der Hauptschleife (alle Blöcke bereit);
         Schreiben einmal für alle, sobald einer es verlangt */
      loop: c =>
        `if (!${c.v('done')})\n{\n` +
        `    ${c.v('done')} = true;\n` +
        `    int32_t v = sbsPersist[${c.persist()}];` + trace(c, 'gesicherter Wert', 'sbsPersistValid ? v : -1', '    ') + `\n` +
        `    if (${c.param('start')} && sbsPersistValid) { ${c.emit('out', 'v')} }\n` +
        `}\n` +
        `if (sbsPersistPending) sbsPersistSave();`
    }
  },
  {
    type: 'divider', cat: 'Logik', name: 'Impulsteiler',
    help: 'Zählt die Einsen am Eingang und gibt bei jeder n-ten eine 1 aus – oder schaltet den Ausgang jedes n-te Mal um (Rechteck, n = 1: T-Flipflop, halbiert die Frequenz). „Rücksetzen“ beginnt neu.',
    inputs: [{ id: 'in', type: 'bool', label: 'Impuls' }, { id: 'reset', type: 'bool', label: 'Rücksetzen', optional: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgang' }],
    params: [
      { id: 'n', label: 'Teiler n', type: 'u16', def: 2, min: 1 },
      { id: 'mode', label: 'Ausgang', type: 'enum', options: [[0, 'Impuls bei jedem n-ten'], [1, 'umschalten bei jedem n-ten']], def: 0 }
    ],
    gen: {
      state: c => `static uint32_t ${c.v('cnt')};\nstatic bool ${c.v('st')};`,
      in: (c, port) => port === 'reset'
        ? `if (!v) return;\n` +
          `${c.v('cnt')} = 0;\n` +
          `if (${c.v('st')})\n` +
          `{\n` +
          `    ${c.v('st')} = false;\n` +
          `    ${c.emit('out', '0')}\n` +
          `}`
        : `if (!v) return;\n` +
          `if (++${c.v('cnt')} < ${c.param('n')}) return;\n` +
          `${c.v('cnt')} = 0;\n` +
          `if (!${c.param('mode')}) { ${c.emit('out', '1')} return; }\n` +
          `${c.v('st')} = !${c.v('st')};\n` +
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
    help: 'Verknüpft zwei Zahlen. Gibt bei jedem Eingangsereignis aus; ÷ durch 0 gibt nichts aus. Bei DPT 9 (Hundertstel) skalieren × und ÷ mit. A oder B kann ein fester Wert sein (Parameter, 32 Bit) – z. B. 30600 ÷ B für einen Kehrwert, Minimum mit 255 als Obergrenze.',
    inputs: n => [{ id: 'a', type: 'num', label: 'A' }, { id: 'b', type: 'num', label: 'B' }].filter(p => p.id !== n.props.fixed),
    outputs: [{ id: 'out', type: 'num', label: 'Ergebnis' }],
    props: [{ id: 'op', label: 'Rechenart', kind: 'enum', options: Object.entries(MATH).map(([k, m]) => [k, m.name]), def: 'add' },
            { id: 'fixed', label: 'Fester Wert', kind: 'enum', def: 'none',
              options: [['none', 'keiner (zwei Eingänge)'], ['a', 'A ist fest'], ['b', 'B ist fest']] }],
    params: n => n.props.fixed === 'a' ? [{ id: 'k', label: 'Fester Wert A', type: 'i32', def: 0 }]
      : n.props.fixed === 'b' ? [{ id: 'k', label: 'Fester Wert B', type: 'i32', def: 0 }] : [],
    gen: {
      state: c => `static int32_t ${c.v('a')};\nstatic int32_t ${c.v('b')};`,
      init: c => c.prop('fixed') === 'a' || c.prop('fixed') === 'b' ? `${c.v(c.prop('fixed'))} = ${c.param('k')};` : '',
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
    type: 'rgb', cat: 'Rechnen', name: 'RGB-Farbe',
    help: 'Zerlegt eine Farbe (DPT 232.600, 0xRRGGBB) in Rot, Grün und Blau (je 0…255) oder setzt sie daraus zusammen, z. B. zwischen KO und NeoPixel.',
    inputs: n => n.props.dir === 'split'
      ? [{ id: 'in', type: 'num', range: 'DPT 232.600', label: 'Farbe' }]
      : [['r', 'Rot'], ['g', 'Grün'], ['b', 'Blau']].map(([id, label]) => ({ id, type: 'num', range: '0…255', label })),
    outputs: n => n.props.dir === 'split'
      ? [['r', 'Rot'], ['g', 'Grün'], ['b', 'Blau']].map(([id, label]) => ({ id, type: 'num', range: '0…255', label }))
      : [{ id: 'out', type: 'num', range: 'DPT 232.600', label: 'Farbe' }],
    props: [{ id: 'dir', label: 'Richtung', kind: 'enum', def: 'split',
      options: [['split', 'zerlegen (Farbe → R, G, B)'], ['join', 'zusammensetzen (R, G, B → Farbe)']] }],
    gen: {
      state: c => c.prop('dir') === 'join' ? `static int32_t ${c.v('rgb')}[3];` : '',
      in: (c, port) => c.prop('dir') === 'split'
        ? `int32_t r = (v >> 16) & 0xFF, g = (v >> 8) & 0xFF, b = v & 0xFF;\n${c.emit('r', 'r')}\n${c.emit('g', 'g')}\n${c.emit('b', 'b')}`
        : `${c.v('rgb')}[${'rgb'.indexOf(port)}] = v < 0 ? 0 : v > 255 ? 255 : v;\n` +
          `int32_t out = ${c.v('rgb')}[0] << 16 | ${c.v('rgb')}[1] << 8 | ${c.v('rgb')}[2];\n${c.emit('out', 'out')}`
    }
  },
  {
    type: 'scene', cat: 'Rechnen', name: 'Szene',
    help: 'Wertet eine Szenennummer aus (DPT 17.001/18.001, Szene 1…64) und gibt den Wert der passenden Szene aus. Lernen (18.001 mit Bit 7) wird nicht unterstützt und übergangen.',
    inputs: [{ id: 'in', type: 'num', label: 'Szene' }],
    outputs: n => [{ id: 'out', type: n.props.vtype || 'num', label: 'Wert' }],
    props: [{ id: 'slots', label: 'Szenen', kind: 'enum', options: range(8).map(i => [i + 1, String(i + 1)]), def: 2 },
            { id: 'vtype', label: 'Wert', kind: 'enum', options: [['num', 'Zahl'], ['bool', 'Ein/Aus']], def: 'num' }],
    params: n => range(n.props.slots).flatMap(i => [
      { id: `nr${i}`, label: `Szene ${i + 1}: Nummer`, unit: '1…64, 0 = aus', type: 'u8', def: i + 1, min: 0, max: 64 },
      n.props.vtype === 'bool'
        ? { id: `val${i}`, label: `Szene ${i + 1}: Wert`, type: 'enum', options: [[0, 'Aus'], [1, 'Ein']], def: i ? 0 : 1 }
        : { id: `val${i}`, label: `Szene ${i + 1}: Wert`, type: 'i16', def: i ? 0 : 1 }
    ]),
    gen: {
      in: c =>
        `if (v & 0x80) return;\n` +
        `int32_t nr = (v & 0x3F) + 1;\n` +
        range(c.prop('slots')).map(i =>
          `if (nr == ${c.param(`nr${i}`)}) { int32_t out = ${c.param(`val${i}`)}; ${c.emit('out', 'out')} return; }`).join('\n')
    }
  },

  {
    type: 'avg', cat: 'Rechnen', name: 'Gleitender Mittelwert',
    help: 'Mittelwert oder Median der letzten N Werte, bei jedem neuen Wert ausgegeben (gerundet). Der Mittelwert glättet unruhige Messwerte; der Median verwirft einzelne Ausreißer ganz (bei N = 3 ein Sprung, bei N = 5 zwei) und läuft bei echten Änderungen nur um N/2 Werte nach. Bis N Werte da sind, über die vorhandenen.',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }],
    outputs: [{ id: 'out', type: 'num', label: 'Mittelwert' }],
    props: [{ id: 'n', label: 'Anzahl Werte', kind: 'enum', options: [2, 3, 4, 5, 8, 16, 32].map(n => [n, String(n)]), def: 4 },
            { id: 'mode', label: 'Verfahren', kind: 'enum', def: 'mean', options: [['mean', 'Mittelwert'], ['median', 'Median (Ausreißer verwerfen)']] }],
    gen: {
      state: c => `static int32_t ${c.v('buf')}[${c.prop('n')}];\nstatic uint8_t ${c.v('pos')};\nstatic uint8_t ${c.v('cnt')};`,
      in: c => c.prop('mode') === 'median'
        ? `${c.v('buf')}[${c.v('pos')}] = v;\n` +
          `${c.v('pos')} = (${c.v('pos')} + 1) % ${c.prop('n')};\n` +
          `if (${c.v('cnt')} < ${c.prop('n')}) ${c.v('cnt')}++;\n` +
          `int32_t s[${c.prop('n')}];                      // sortierte Kopie\n` +
          `for (int i = 0; i < ${c.v('cnt')}; i++)\n{\n` +
          `    int j = i;\n` +
          `    for (; j > 0 && s[j - 1] > ${c.v('buf')}[i]; j--) s[j] = s[j - 1];\n` +
          `    s[j] = ${c.v('buf')}[i];\n}\n` +
          `int m = ${c.v('cnt')} / 2;\n` +
          `int32_t out = ${c.v('cnt')} % 2 ? s[m] : (int32_t) (((int64_t) s[m - 1] + s[m]) / 2);\n` +
          `${c.emit('out', 'out')}`
        : `${c.v('buf')}[${c.v('pos')}] = v;\n` +
        `${c.v('pos')} = (${c.v('pos')} + 1) % ${c.prop('n')};\n` +
        `if (${c.v('cnt')} < ${c.prop('n')}) ${c.v('cnt')}++;\n` +
        `int64_t sum = 0;\n` +
        `for (int i = 0; i < ${c.v('cnt')}; i++) sum += ${c.v('buf')}[i];\n` +
        `int32_t out = (int32_t) ((sum + (sum < 0 ? -${c.v('cnt')} : ${c.v('cnt')}) / 2) / ${c.v('cnt')});\n` +
        `${c.emit('out', 'out')}`
    }
  },

  /* ---------- Regeln ---------- */
  {
    type: 'integ', cat: 'Regeln', name: 'Integrator',
    help: 'Summiert den Eingang über die Zeit: Ausgang = Σ Wert × Zeit / Zeitbasis, z. B. Leistung (W) je Stunde → Energie (Wh). Abgetastet wird der zuletzt empfangene Wert. „Halten“ unterbricht, „Rücksetzen“ setzt auf 0.',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }, { id: 'hold', type: 'bool', label: 'Halten', optional: true },
             { id: 'reset', type: 'bool', label: 'Rücksetzen', optional: true }],
    outputs: [{ id: 'out', type: 'num', label: 'Summe' }],
    params: [SAMPLE, TIMEBASE, DELTA],
    gen: {
      state: c => `static int32_t ${c.v('x')};\nstatic bool ${c.v('hold')};\nstatic int64_t ${c.v('acc')};  // Wert × ms\n` +
        `static int32_t ${c.v('last')};\nstatic bool ${c.v('sent')};\nstatic Timeout ${c.v('t')};\nstatic uint32_t ${c.v('prev')};\n\n` +
        `static void ${c.v('out')}(bool force)\n{\n` +
        `    int32_t y = (int32_t) (${c.v('acc')} / ${timebase(c)});\n` +
        `    if (!force && ${c.v('sent')} && (y > ${c.v('last')} ? y - ${c.v('last')} : ${c.v('last')} - y) < (int32_t) ${c.param('delta')} + (${c.param('delta')} == 0)) return;\n` +
        `    ${c.v('sent')} = true;\n    ${c.v('last')} = y;\n    ${c.emit('out', 'y')}\n}`,
      init: c => `${c.v('prev')} = millis();\n${c.v('t')}.start(${c.param('sample')});`,
      in: (c, port) => ({
        in: `${c.v('x')} = v;`,
        hold: `${c.v('hold')} = v != 0;`,
        reset: `if (!v) return;\n${c.v('acc')} = 0;\n${c.v('prev')} = millis();\n${c.v('out')}(true);`
      })[port],
      loop: c =>
        `if (${c.v('t')}.expired())\n{\n` +
        `    uint32_t now = millis();\n` +
        `    if (!${c.v('hold')}) ${c.v('acc')} += (int64_t) ${c.v('x')} * (int32_t) (now - ${c.v('prev')});\n` +
        `    ${c.v('prev')} = now;\n` +
        `    ${c.v('t')}.start(${c.param('sample')});\n` +
        `    ${c.v('out')}(false);\n}`
    }
  },
  {
    type: 'diff', cat: 'Regeln', name: 'Differentiator',
    help: 'Änderungsgeschwindigkeit des Eingangs: (Wert − Wert eine Abtastzeit vorher) × Zeitbasis / Abtastzeit, z. B. Temperatur in Hundertstel °C je Minute. Längere Abtastzeit glättet.',
    inputs: [{ id: 'in', type: 'num', label: 'Wert' }],
    outputs: [{ id: 'out', type: 'num', label: 'Änderung' }],
    params: [SAMPLE, TIMEBASE, DELTA],
    gen: {
      state: c => `static int32_t ${c.v('x')};\nstatic int32_t ${c.v('xp')};\nstatic bool ${c.v('has')};\n` +
        `static int32_t ${c.v('last')};\nstatic bool ${c.v('sent')};\nstatic Timeout ${c.v('t')};\nstatic uint32_t ${c.v('prev')};`,
      init: c => `${c.v('t')}.start(${c.param('sample')});`,
      in: c => `${c.v('x')} = v;\nif (!${c.v('has')}) { ${c.v('xp')} = v; ${c.v('prev')} = millis(); ${c.v('has')} = true; }`,
      loop: c =>
        `if (${c.v('t')}.expired())\n{\n` +
        `    ${c.v('t')}.start(${c.param('sample')});\n` +
        `    uint32_t now = millis(), dt = now - ${c.v('prev')};\n` +
        `    if (${c.v('has')} && dt)\n    {\n` +
        `        int32_t y = (int32_t) ((int64_t) (${c.v('x')} - ${c.v('xp')}) * ${timebase(c)} / (int32_t) dt);\n` +
        `        ${c.v('xp')} = ${c.v('x')};\n` +
        `        ${c.v('prev')} = now;\n` +
        `        int32_t d = y > ${c.v('last')} ? y - ${c.v('last')} : ${c.v('last')} - y;\n` +
        `        if (!${c.v('sent')} || d >= (int32_t) ${c.param('delta')} + (${c.param('delta')} == 0))\n        {\n` +
        `            ${c.v('sent')} = true;\n            ${c.v('last')} = y;\n            ${c.emit('out', 'y')}\n        }\n    }\n}`
    }
  },
  {
    type: 'pid', cat: 'Regeln', name: 'PID-Regler',
    help: 'PID-Regler mit verzögertem D-Anteil (PIDT1) und Begrenzung des I-Anteils (Anti-Windup). Fehler = Soll − Ist (Heizen) bzw. Ist − Soll (Kühlen), in Rohwerten (DPT 9: Hundertstel). Der D-Anteil wirkt auf den Istwert, ein Sollwertsprung schlägt nicht durch. Stellwert 0…255 (DPT 5.001); ohne Freigabe gilt der Sperrwert.',
    inputs: [{ id: 'x', type: 'num', label: 'Istwert' }, { id: 'w', type: 'num', label: 'Sollwert', optional: true },
             { id: 'en', type: 'bool', label: 'Freigabe', optional: true }],
    outputs: [{ id: 'out', type: 'num', range: '0…255', label: 'Stellwert' }],
    params: [
      { id: 'dir', label: 'Wirkrichtung', type: 'enum', options: [[0, 'Heizen (Ist < Soll → mehr)'], [1, 'Kühlen (Ist > Soll → mehr)']], def: 0 },
      { id: 'w0', label: 'Sollwert nach Start', unit: 'Rohwert, DPT 9 × 100', type: 'i16', def: 2100 },
      { id: 'kp', label: 'Proportionalbeiwert Kp', unit: 'Stellwert je 100 Rohwert Fehler (DPT 9: je 1 K)', type: 'u16', def: 100 },
      { id: 'ti', label: 'Nachstellzeit Ti', unit: 's, 0 = ohne I', type: 'u16', def: 600 },
      { id: 'td', label: 'Vorhaltzeit Td', unit: 's, 0 = ohne D', type: 'u16', def: 0 },
      { id: 't1', label: 'Verzögerung T1 des D-Anteils', unit: '0,1 s', type: 'u16', def: 50 },
      { id: 'sample', label: 'Abtastzeit', unit: 'ms', type: 'u16', def: 1000, min: 100 },
      { id: 'min', label: 'Stellwert min', type: 'u8', def: 0 },
      { id: 'max', label: 'Stellwert max', type: 'u8', def: 255 },
      { id: 'off', label: 'Stellwert ohne Freigabe', type: 'u8', def: 0 },
      { id: 'delta', label: 'Ausgabe ab Änderung um', unit: 'Stellwert', type: 'u8', def: 3 }
    ],
    gen: {
      state: c =>
        `static int32_t ${c.v('x')};\nstatic bool ${c.v('hasX')};\nstatic int32_t ${c.v('w')};\nstatic bool ${c.v('en')} = true;\n` +
        `static float ${c.v('i')};\nstatic float ${c.v('d')};\nstatic int32_t ${c.v('xp')};\n` +
        `static int32_t ${c.v('u')} = -1;\nstatic Timeout ${c.v('t')};\n\n` +
        `static void ${c.v('set')}(int32_t u)\n{\n` +
        `    int32_t du = u > ${c.v('u')} ? u - ${c.v('u')} : ${c.v('u')} - u;\n` +
        `    bool edge = u != ${c.v('u')} && (u == ${c.param('min')} || u == ${c.param('max')} || u == ${c.param('off')});\n` +
        `    if (${c.v('u')} >= 0 && du < (int32_t) ${c.param('delta')} + (${c.param('delta')} == 0) && !edge) return;\n` +
        `    ${c.v('u')} = u;\n    ${c.emit('out', 'u')}\n}\n\n` +
        `/* Ein Abtastschritt; h = Abtastzeit in s */\n` +
        `static void ${c.v('step')}()\n{\n` +
        `    const float h = ${c.param('sample')} / 1000.0f, kp = ${c.param('kp')} / 100.0f;\n` +
        `    const int32_t sign = ${c.param('dir')} ? -1 : 1;\n` +
        `    float e = (float) (sign * (${c.v('w')} - ${c.v('x')}));\n` +
        `    float de = (float) (-sign * (${c.v('x')} - ${c.v('xp')}));  // Fehleränderung aus dem Istwert\n` +
        `    ${c.v('xp')} = ${c.v('x')};\n` +
        `    float p = kp * e;\n` +
        `    if (${c.param('td')})\n    {\n` +
        `        float t1 = ${c.param('t1')} / 10.0f;\n` +
        `        ${c.v('d')} = t1 / (t1 + h) * ${c.v('d')} + kp * ${c.param('td')} / (t1 + h) * de;\n    }\n` +
        `    float i = ${c.v('i')};\n` +
        `    if (${c.param('ti')}) i += kp * e * h / ${c.param('ti')};\n` +
        `    const float lo = ${c.param('min')}, hi = ${c.param('max')};\n` +
        `    /* Anti-Windup: der I-Anteil wächst nur bis zur Grenze des Stellwerts */\n` +
        `    if (i > ${c.v('i')} && p + i + ${c.v('d')} > hi) i = hi - p - ${c.v('d')} > ${c.v('i')} ? hi - p - ${c.v('d')} : ${c.v('i')};\n` +
        `    if (i < ${c.v('i')} && p + i + ${c.v('d')} < lo) i = lo - p - ${c.v('d')} < ${c.v('i')} ? lo - p - ${c.v('d')} : ${c.v('i')};\n` +
        `    ${c.v('i')} = i;\n` +
        `    float u = p + i + ${c.v('d')};\n` +
        `    if (u > hi) u = hi;\n` +
        `    if (u < lo) u = lo;\n` +
        `    ${c.v('set')}((int32_t) (u + 0.5f));\n}`,
      init: c => `${c.v('w')} = ${c.param('w0')};\n${c.v('t')}.start(${c.param('sample')});`,
      in: (c, port) => ({
        x: `${c.v('x')} = v;\nif (!${c.v('hasX')}) { ${c.v('xp')} = v; ${c.v('hasX')} = true; }`,
        w: `${c.v('w')} = v;`,
        en: `${c.v('en')} = v != 0;\n` +
            `if (${c.v('en')}) return;\n` +
            `${c.v('i')} = 0;\n${c.v('d')} = 0;\n${c.v('set')}(${c.param('off')});`
      })[port],
      loop: c =>
        `if (${c.v('t')}.expired())\n{\n` +
        `    ${c.v('t')}.start(${c.param('sample')});\n` +
        `    if (${c.v('en')} && ${c.v('hasX')}) ${c.v('step')}();\n}`
    }
  },

  /* ---------- Zeit ---------- */
  /* Treppenlicht wie ABB/out-cs-bim112: Vorwarnung über Ausgang und/oder
     kurzes Aus (0,7 s), Vorwarnzeit zusätzlich; Verlängern durch Neustart
     oder Aufpumpen bis zum n-fachen. Phasen: 0 aus, 1 ein, 2 Warn-Aus,
     3 Vorwarnzeit, 4 Warn-Aus, danach wieder ein (nachgetriggert) */
  {
    type: 'staircase', cat: 'Zeit', name: 'Treppenlicht',
    help: '1 schaltet ein; nach der Laufzeit aus. Vor dem Ausschalten kann gewarnt werden: der Ausgang „Warnung“ ist während der Vorwarnzeit 1 und/oder das Licht geht kurz (0,7 s) aus; die Vorwarnzeit kommt zur Laufzeit hinzu. Eine 1 während der Laufzeit startet sie neu oder pumpt sie auf (jede 1 addiert die Laufzeit, höchstens bis zum gewählten Vielfachen). Der optionale Eingang „Laufzeit“ ändert sie in Sekunden.',
    inputs: [{ id: 'trig', type: 'bool', label: 'Auslöser' }, { id: 'time', type: 'num', label: 'Laufzeit (s)', optional: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Licht' }, { id: 'warn', type: 'bool', label: 'Warnung' }],
    params: [
      { id: 'time', label: 'Laufzeit', unit: 's', type: 'u16', def: 120, min: 1, max: 65535 },
      { id: 'offEarly', label: '0 schaltet sofort aus', type: 'enum', options: YES_NO, def: 0 },
      { id: 'pump', label: 'Verlängern während der Laufzeit', type: 'enum', def: 1,
        options: [[0, 'nein'], [1, 'neu starten'], ...[2, 3, 4, 5].map(k => [k, ['bis zu {0}-fach aufpumpen', k]])] },
      { id: 'warn', label: 'Warnung vor Ablauf', type: 'enum', def: 0,
        options: [[0, 'nein'], [1, 'über Ausgang „Warnung“'], [2, 'kurz ausschalten'], [3, 'beides']] },
      { id: 'warnTime', label: 'Vorwarnzeit', unit: 's', type: 'u16', def: 45, min: 1, max: 65535 }
    ],
    gen: {
      state: c => `static uint8_t ${c.v('ph')};\nstatic uint32_t ${c.v('end')};\nstatic uint32_t ${c.v('dur')};`,
      init: c => `${c.v('dur')} = ${c.param('time')} * 1000UL;`,
      in: (c, port) => port === 'time'
        ? `if (v > 0) ${c.v('dur')} = (uint32_t) v * 1000UL;`
        : `uint32_t now = millis();\n` +
          `if (v && ${c.v('ph')} == 0)\n{\n` +
          `    ${c.v('ph')} = 1;\n    ${c.v('end')} = now + ${c.v('dur')};` + trace(c, 'Phase (1 an, 2 Warnblinken, 3 Vorwarnung, 0 aus)', 1, '    ') + `\n    ${c.emit('out', '1')}\n}\n` +
          `else if (v && ${c.param('pump')})\n{\n` +
          `    if (${c.v('ph')} == 4) return;\n` +
          `    if (${c.v('ph')} == 2) ${c.v('ph')} = 4;\n` +
          `    else\n    {\n` +
          `        if (${c.param('pump')} == 1 || ${c.v('ph')} == 3) ${c.v('end')} = now + ${c.v('dur')};\n` +
          `        else\n        {\n` +
          `            ${c.v('end')} += ${c.v('dur')};\n` +
          `            if (${c.v('end')} - now > ${c.v('dur')} * ${c.param('pump')}) ${c.v('end')} = now + ${c.v('dur')} * ${c.param('pump')};\n` +
          `        }\n` +
          `        if (${c.v('ph')} == 3) ${c.v('ph')} = 1;\n` +
          `        else return;\n` +
          `    }\n` +
          `    if (${c.param('warn')} & 1) { ${c.emit('warn', '0')} }\n}\n` +
          `else if (!v && ${c.param('offEarly')} && ${c.v('ph')})\n{\n` +
          `    bool lit = ${c.v('ph')} != 2 && ${c.v('ph')} != 4, warned = ${c.v('ph')} >= 2;\n` +
          `    ${c.v('ph')} = 0;\n` +
          `    if (warned && (${c.param('warn')} & 1)) { ${c.emit('warn', '0')} }\n` +
          `    if (lit) { ${c.emit('out', '0')} }\n}`,
      loop: c =>
        `if (${c.v('ph')} && (int32_t) (millis() - ${c.v('end')}) >= 0)\n{\n` +
        `    uint32_t now = millis();\n` +
        `    switch (${c.v('ph')})\n    {\n` +
        `    case 1:\n` +
        `        if (!${c.param('warn')}) { ${c.v('ph')} = 0; ${c.emit('out', '0')} break; }\n` +
        `        if (${c.param('warn')} & 1) { ${c.emit('warn', '1')} }\n` +
        `        if (${c.param('warn')} & 2) { ${c.v('ph')} = 2; ${c.v('end')} = now + 700; ${c.emit('out', '0')} }\n` +
        `        else { ${c.v('ph')} = 3; ${c.v('end')} = now + ${c.param('warnTime')} * 1000UL; }\n` +
        `        break;\n` +
        `    case 2:\n` +
        `        ${c.v('ph')} = 3; ${c.v('end')} = now + ${c.param('warnTime')} * 1000UL;\n` +
        `        ${c.emit('out', '1')}\n` +
        `        break;\n` +
        `    case 3:\n` +
        `        ${c.v('ph')} = 0;\n` +
        `        if (${c.param('warn')} & 1) { ${c.emit('warn', '0')} }\n` +
        `        ${c.emit('out', '0')}\n` +
        `        break;\n` +
        `    default:\n` +
        `        ${c.v('ph')} = 1; ${c.v('end')} = now + ${c.v('dur')};\n` +
        `        ${c.emit('out', '1')}\n` +
        `        break;\n` +
        `    }` + trace(c, 'Phase (1 an, 2 Warnblinken, 3 Vorwarnung, 0 aus)', c.v('ph'), '    ') + `\n}`
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
      state: c => `static Timeout ${c.v('t')};\nstatic bool ${c.v('next')};`,
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
    help: 'Blinkt mit einstellbarer Ein- und Auszeit, solange die Freigabe 1 ist (statt einer Schleife). Ohne Freigabe-Verbindung läuft er ab dem Start. Mit einer Anzahl Ein-Impulse hört er danach von selbst auf. Beim Sperren und am Ende geht der Ausgang auf den gewählten Zustand.',
    inputs: [{ id: 'en', type: 'bool', label: 'Freigabe', optional: true }],
    outputs: [{ id: 'out', type: 'bool', label: 'Takt' }],
    params: [
      { id: 'on', label: 'Ein-Zeit', unit: 'ms', type: 'u16', def: 500, min: 10 },
      { id: 'off', label: 'Aus-Zeit', unit: 'ms', type: 'u16', def: 500, min: 10 },
      { id: 'count', label: 'Anzahl Ein-Impulse', unit: '0 = unbegrenzt', type: 'u8', def: 0 },
      { id: 'after', label: 'Zustand danach', type: 'enum', def: 0, options: [[0, 'aus'], [1, 'ein'], [2, 'unverändert']] }
    ],
    gen: {
      state: c => `static Timeout ${c.v('t')};\nstatic bool ${c.v('st')};\nstatic bool ${c.v('run')};\nstatic uint8_t ${c.v('n')};\n` +
        `static void ${c.v('stop')}()\n{\n` +
        `    ${c.v('run')} = false;\n` +
        `    ${c.v('t')}.stop();\n` +
        `    if (${c.param('after')} == 2 || ${c.v('st')} == (${c.param('after')} == 1)) return;\n` +
        `    ${c.v('st')} = ${c.param('after')} == 1;\n` +
        `    ${c.emit('out', c.v('st'))}\n` +
        `}`,
      init: c => c.linked('en') ? '' : `${c.v('run')} = true;\n${c.v('t')}.start(1);`,
      in: c =>
        `bool run = v != 0;\n` +
        `if (run == ${c.v('run')}) return;\n` +
        `if (run) { ${c.v('run')} = true; ${c.v('n')} = 0; ${c.v('t')}.start(1); return; }\n` +
        `${c.v('stop')}();`,
      loop: c => {
        /* fest unbegrenzt: ohne Zählen */
        const toggle = `${c.v('st')} = !${c.v('st')};\n` +
          `${c.v('t')}.start(${c.v('st')} ? ${c.param('on')} : ${c.param('off')});\n` +
          `${c.emit('out', c.v('st'))}`;
        return `if (${c.v('t')}.expired() && ${c.v('run')})\n{\n` + indent(c.param('count') === '0' ? toggle :
          `if (${c.v('st')} && ${c.param('count')} && ++${c.v('n')} >= ${c.param('count')}) ${c.v('stop')}();\n` +
          `else\n{\n${indent(toggle)}\n}`) + '\n}';
      }
    }
  },

  {
    type: 'ramp', cat: 'Zeit', name: 'Dimmer/Rampe',
    help: 'Fährt den Ausgang gleitend zum Zielwert (0…255): absolut über „Wert“ (DPT 5.001), über „Schalten“ (Ein = Einschaltwert bzw. letzter Wert) oder relativ über „Dimmen“ (DPT 3.007, Stopp hält an). Die logarithmische Kennlinie (1…100 %) wirkt für das Auge gleichmäßig. Für ein KO besser nur den Endwert senden.',
    inputs: [
      { id: 'val', type: 'num', range: '0…255', label: 'Wert', optional: true },
      { id: 'sw', type: 'bool', label: 'Schalten', optional: true },
      { id: 'dim', type: 'num', range: 'DPT 3.007', label: 'Dimmen', optional: true }
    ],
    outputs: [{ id: 'out', type: 'num', range: '0…255', label: 'Wert' }, { id: 'on', type: 'bool', label: 'Ein' }],
    props: [{ id: 'curve', label: 'Kennlinie', kind: 'enum', def: 'lin', options: [['lin', 'linear'], ['log', 'logarithmisch (Seheindruck)']] }],
    params: [
      { id: 'time', label: 'Dimmzeit 0…100 %', unit: 'ms, 0 = sofort', type: 'u16', def: 3000 },
      { id: 'onVal', label: 'Einschaltwert', unit: '1…255, 0 = letzter Wert', type: 'u8', def: 255 },
      { id: 'soft', label: 'Schalten mit Rampe', type: 'enum', options: YES_NO, def: 1 },
      { id: 'every', label: 'Ausgabe', type: 'enum', options: [[0, 'jeder Schritt (z. B. an PWM)'], [1, 'nur Endwert (z. B. an KO)']], def: 0 }
    ],
    gen: {
      lib: c => c.prop('curve') === 'log' ? RAMP_LOG_LIB : null,
      state: c => {
        const log = c.prop('curve') === 'log';
        return `static int32_t ${c.v('pos')};      // Stufe 0…255 der Kennlinie\n` +
          `static int32_t ${c.v('tgt')};\n` +
          `static int32_t ${c.v('last')} = 255;  // letzte Stufe vor dem Ausschalten\n` +
          `static int32_t ${c.v('on')} = -1;\n` +
          `static Timeout ${c.v('step')};\n\n` +
          `/* Wert 0…255 → Stufe der Kennlinie */\n` +
          `static int32_t ${c.v('toPos')}(int32_t v)\n` +
          `{\n` +
          `    v = v < 0 ? 0 : v > 255 ? 255 : v;\n` +
          (log ? `    int32_t p = 0;\n    while (p < 255 && rampLog[p] < v) p++;\n    return p;\n` : `    return v;\n`) +
          `}\n\n` +
          `static void ${c.v('show')}()\n` +
          `{\n` +
          `    int32_t out = ${log ? `rampLog[${c.v('pos')}]` : c.v('pos')};\n` +
          `    if (${c.v('pos')} && ${c.v('pos')} == ${c.v('tgt')}) ${c.v('last')} = ${c.v('pos')}; // nicht beim Ausblenden\n` +
          `    if (!${c.param('every')} || ${c.v('pos')} == ${c.v('tgt')}) { ${c.emit('out', 'out')} }\n` +
          `    int32_t on = ${c.v('pos')} > 0;\n` +
          `    if (on != ${c.v('on')})\n` +
          `    {\n` +
          `        ${c.v('on')} = on;\n` +
          `        ${c.emit('on', 'on')}\n` +
          `    }\n` +
          `}\n\n` +
          `static void ${c.v('go')}(int32_t p, bool soft)\n` +
          `{\n` +
          `    ${c.v('tgt')} = p < 0 ? 0 : p > 255 ? 255 : p;\n` +
          `    if (!soft || ${c.param('time')} == 0)\n` +
          `    {\n` +
          `        ${c.v('step')}.stop();\n` +
          `        ${c.v('pos')} = ${c.v('tgt')};\n` +
          `        ${c.v('show')}();\n` +
          `    }\n` +
          `    else if (!${c.v('step')}.started()) ${c.v('step')}.start(1);\n` +
          `}`;
      },
      in: (c, port) => ({
        val: `${c.v('go')}(${c.v('toPos')}(v), true);`,
        sw: `int32_t p = !v ? 0 : ${c.param('onVal')} ? ${c.v('toPos')}(${c.param('onVal')}) : ${c.v('last')};\n` +
            `${c.v('go')}(p, ${c.param('soft')} != 0);`,
        /* DPT 3.007: Bit 3 = heller, Bits 0…2 = Schritt (1 = 100 %, 2 = 50 % …, 0 = Stopp) */
        dim: `int32_t n = v & 7;\n` +
             `if (!n)\n` +
             `{\n` +
             `    ${c.v('step')}.stop();\n` +
             `    ${c.v('tgt')} = ${c.v('pos')};\n` +
             `    ${c.v('show')}();\n` +
             `    return;\n` +
             `}\n` +
             `int32_t d = 255 >> (n - 1);\n` +
             `${c.v('go')}(${c.v('pos')} + ((v & 8) ? d : -d), true);`
      })[port],
      loop: c =>
        `if (${c.v('step')}.expired() && ${c.v('pos')} != ${c.v('tgt')})\n` +
        `{\n` +
        `    ${c.v('pos')} += ${c.v('pos')} < ${c.v('tgt')} ? 1 : -1;\n` +
        `    ${c.v('show')}();\n` +
        `    if (${c.v('pos')} != ${c.v('tgt')}) ${c.v('step')}.start(${c.param('time')} / 255 + 1);\n` +
        `}`
    }
  },
  {
    type: 'timeswitch', cat: 'Zeit', name: 'Zeitschaltuhr',
    help: 'Schaltet zu festen Zeiten oder nach Sonnenauf-/-untergang an gewählten Tagen. Die Uhr stellt sich über „Uhrzeit“ (DPT 10.001) und „Datum“ (DPT 11.001) vom Bus und läuft dazwischen selbst weiter. Sendet der Zeitgeber UTC, rechnet sie mit Zeitzone und Sommerzeit (EU) in Ortszeit um. Sommerzeit, Astro und Feiertage brauchen das Datum; ohne Wochentag gelten nur tägliche Zeiten. Feiertage: bundesweite plus wählbare regionale. „Sperre“ = 1 unterdrückt das Schalten.',
    inputs: [{ id: 'time', type: 'num', range: 'DPT 10.001', label: 'Uhrzeit' },
             { id: 'date', type: 'num', range: 'DPT 11.001', label: 'Datum', optional: true },
             { id: 'lock', type: 'bool', label: 'Sperre', optional: true }],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: 'Wert' }]
      .concat(n.props.holidays ? [{ id: 'hol', type: 'bool', label: 'Feiertag' }] : []),
    props: [
      { id: 'slots', label: 'Schaltzeiten', kind: 'enum', options: range(8).map(i => [i + 1, String(i + 1)]), def: 2 },
      VTYPE,
      { id: 'astro', label: 'Astrofunktion (Sonnenauf-/-untergang)', kind: 'bool', def: false },
      { id: 'holidays', label: 'Feiertage', kind: 'bool', def: false }
    ],
    params: n => [
      { id: 'catchup', label: 'Nach dem Stellen letzten Wert nachholen', type: 'enum', options: YES_NO, def: 1 },
      { id: 'utc', label: 'Zeitgeber sendet', type: 'enum', options: [[0, 'Ortszeit'], [1, 'UTC']], def: 0 },
      { id: 'tz', label: 'Zeitzone (Versatz zu UTC)', unit: 'min', type: 'i16', def: 60, min: -720, max: 840 },
      { id: 'dst', label: 'Sommerzeit', type: 'enum', options: [[0, 'keine'], [1, 'EU (letzter Sonntag im März bis Oktober)']], def: 1 }
    ].concat(n.props.astro ? [
      { id: 'lat', label: 'Breitengrad', unit: '0,01°, Nord positiv', type: 'i16', def: 5100, min: -9000, max: 9000 },
      { id: 'lng', label: 'Längengrad', unit: '0,01°, Ost positiv', type: 'i16', def: 1000, min: -18000, max: 18000 }
    ] : [], n.props.holidays ? [
      { id: 'holMode', label: 'An Feiertagen', type: 'enum', options: [[0, 'wie Werktag'], [1, 'wie Sonntag']], def: 1 }
    ].concat(HOLIDAYS.map(([id, label]) => ({ id, label, type: 'enum', options: YES_NO, def: 0 }))) : [],
    ...range(n.props.slots).map(i => [
      { id: `days${i}`, label: ['Schaltzeit {0}: Tage', i + 1], type: 'enum', options: DAYS, def: i < 2 ? 127 : 0 }
    ].concat(n.props.astro ? [
      { id: `ref${i}`, label: ['Schaltzeit {0}: Bezug', i + 1], type: 'enum', options: [[0, 'Uhrzeit'], [1, 'Sonnenaufgang'], [2, 'Sonnenuntergang']], def: 0 },
      { id: `off${i}`, label: ['Schaltzeit {0}: Versatz zur Sonne', i + 1], unit: 'min', type: 'i16', def: 0, min: -720, max: 720 }
    ] : [], [
      { id: `h${i}`, label: ['Schaltzeit {0}: Stunde', i + 1], type: 'u8', def: [7, 22][i] || 0, min: 0, max: 23 },
      { id: `m${i}`, label: ['Schaltzeit {0}: Minute', i + 1], type: 'u8', def: 0, min: 0, max: 59 },
      { id: `v${i}`, label: ['Schaltzeit {0}: Wert', i + 1], type: 'i16', def: i ? 0 : 1 }
    ]))),
    gen: {
      include: c => c.prop('astro') ? 'cmath' : null,
      lib: c => [DATE_LIB, c.prop('holidays') && HOLIDAY_LIB, c.prop('astro') && SUN_LIB],
      state: c => {
        const n = Number(c.prop('slots')), v = c.v, p = c.param, astro = c.prop('astro'), hol = c.prop('holidays');
        const slotSec = i => astro
          ? `${p('ref' + i)} == 0 ? ${p('h' + i)} * 3600L + ${p('m' + i)} * 60L\n` +
            `             : sun < 0 ? -1 : ((sun + ${p('off' + i)}) % 1440 + 1440) % 1440 * 60L`
          : `${p('h' + i)} * 3600L + ${p('m' + i)} * 60L`;
        return `/* Uhr in der Zeit des Zeitgebers (Ortszeit oder UTC) */\n` +
          `static int32_t ${v('sday')};        // Tage seit 1.1.2000\n` +
          `static bool ${v('dateOk')};\n` +
          `static int32_t ${v('ssec')} = -1;   // Sekunde des Tages, -1 = nicht gestellt\n` +
          `static int8_t ${v('swd')} = -1;     // Wochentag aus DPT 10 (0 = Montag), -1 = keiner\n` +
          `static uint32_t ${v('next')};       // millis() der nächsten Sekunde\n` +
          `static bool ${v('pending')} = true; // Nachholen nach dem ersten Stellen\n` +
          `static bool ${v('lock')};\n` +
          `/* daraus Ortszeit */\n` +
          `static int32_t ${v('lday')};\n` +
          `static int32_t ${v('lsec')} = -1;\n` +
          `static int8_t ${v('lwd')} = -1;\n` +
          `static int32_t ${v('calc')} = -1;   // Tag, für den Sonne/Feiertag gerechnet sind\n` +
          (astro ? `static int32_t ${v('rise')} = -1, ${v('set')} = -1; // Minute des Tages, Ortszeit\n` : '') +
          (hol ? `static int32_t ${v('hol')} = -1;\n` : '') + `\n` +
          `/* Versatz der Ortszeit zu UTC in s am UTC-Zeitpunkt day/sec */\n` +
          `static int32_t ${v('offset')}(int32_t day, int32_t sec)\n` +
          `{\n` +
          `    return ${p('tz')} * 60L + (${p('dst')} && ${v('dateOk')} && sbsEuDst(day, sec) ? 3600 : 0);\n` +
          `}\n\n` +
          `static void ${v('local')}()\n` +
          `{\n` +
          `    int32_t t = ${v('ssec')}, d = ${v('sday')}, wd = ${v('swd')};\n` +
          `    if (${p('utc')}) t += ${v('offset')}(d, t);\n` +
          `    while (t < 0) { t += 86400; d--; if (wd >= 0) wd = (wd + 6) % 7; }\n` +
          `    while (t >= 86400) { t -= 86400; d++; if (wd >= 0) wd = (wd + 1) % 7; }\n` +
          `    ${v('lsec')} = t;\n` +
          `    ${v('lday')} = d;\n` +
          `    ${v('lwd')} = (int8_t) (${v('dateOk')} ? sbsWeekday(d) : wd);\n` +
          `    if (!${v('dateOk')} || d == ${v('calc')}) return;\n` +
          `    ${v('calc')} = d;\n` +
          (astro
            ? `    int32_t y, m, dd, rise, set;\n` +
              `    sbsCivil(d, &y, &m, &dd);\n` +
              `    sbsSun(d - sbsDays(y, 1, 1) + 1, ${p('lat')} / 100.0f, ${p('lng')} / 100.0f, &rise, &set);\n` +
              `    int32_t off = ${v('offset')}(d, 43200 - ${p('tz')} * 60L) / 60; // Mittag Ortszeit\n` +
              `    ${v('rise')} = rise < 0 ? -1 : ((rise + off) % 1440 + 1440) % 1440;\n` +
              `    ${v('set')} = set < 0 ? -1 : ((set + off) % 1440 + 1440) % 1440;\n`
            : '') +
          (hol
            ? `    int32_t hol = sbsHoliday(d, ${HOLIDAYS.map(([id], b) => `(${p(id)} ? ${1 << b} : 0)`).join(' | ')});\n` +
              `    if (hol != ${v('hol')})\n` +
              `    {\n` +
              `        ${v('hol')} = hol;\n` +
              `        ${c.emit('hol', 'hol')}\n` +
              `    }\n`
            : '') +
          `}\n\n` +
          `/* Schaltzeit i: Tage (Bit 0 = Montag), Sekunde des Tages (Ortszeit), Wert */\n` +
          `static bool ${v('slot')}(int i, uint8_t* days, int32_t* sec, int32_t* val)\n` +
          `{\n` +
          (astro ? `    int32_t sun = -1;\n` : '') +
          `    switch (i)\n` +
          `    {\n` +
          range(n).map(i =>
            `    case ${i}:\n` +
            (astro ? `        sun = ${p('ref' + i)} == 1 ? ${v('rise')} : ${v('set')};\n` : '') +
            `        *days = ${p('days' + i)};\n` +
            `        *sec = ${slotSec(i)};\n` +
            `        *val = ${p('v' + i)};\n` +
            `        break;\n`).join('') +
          `    default: return false;\n` +
          `    }\n` +
          `    return *days != 0 && *sec >= 0;\n` +
          `}\n\n` +
          `/* Sekunden seit dem letzten Termin der Schaltzeit i, -1 = keiner */\n` +
          `static int32_t ${v('since')}(int i, int32_t* val)\n` +
          `{\n` +
          `    uint8_t days;\n` +
          `    int32_t sec, best = -1;\n` +
          `    if (!${v('slot')}(i, &days, &sec, val)) return -1;\n` +
          `    if (${v('lwd')} < 0)\n` +
          `        return days == 0x7F ? (${v('lsec')} - sec + 86400) % 86400 : -1;\n` +
          `    int32_t now = ${v('lwd')} * 86400L + ${v('lsec')};\n` +
          (hol ? `    if (${p('holMode')} && ${v('hol')} > 0) now = 6 * 86400L + ${v('lsec')}; // heute wie Sonntag\n` : '') +
          `    for (int d = 0; d < 7; d++)\n` +
          `    {\n` +
          `        if (!(days & (1 << d))) continue;\n` +
          `        int32_t ago = (now - (d * 86400L + sec) + 604800L) % 604800L;\n` +
          `        if (best < 0 || ago < best) best = ago;\n` +
          `    }\n` +
          `    return best;\n` +
          `}\n\n` +
          `/* Fällige Schaltzeiten (ago == 0) oder beim Stellen die zuletzt fällige */\n` +
          `static void ${v('check')}(bool latest)\n` +
          `{\n` +
          `    int32_t best = -1, out = 0;\n` +
          `    for (int i = 0; i < ${n}; i++)\n` +
          `    {\n` +
          `        int32_t val, ago = ${v('since')}(i, &val);\n` +
          `        if (ago < 0 || (!latest && ago != 0)) continue;\n` +
          `        if (best < 0 || ago < best) { best = ago; out = val; }\n` +
          `    }\n` +
          `    if (best < 0) return;` + trace(c, 'Schaltzeit (Wert, gesperrt nicht ausgegeben)', 'out', '    ') + `\n` +
          `    if (${v('lock')}) return;\n` +
          (c.prop('vtype') === 'bool' ? `    out = out != 0;\n` : '') +
          `    ${c.emit('out', 'out')}\n` +
          `}\n\n` +
          `/* Nach dem Stellen: Ortszeit rechnen, einmal nachholen (mit Datum, wenn verbunden) */\n` +
          `static void ${v('synced')}()\n` +
          `{\n` +
          `    ${v('next')} = millis() + 1000;\n` +
          `    ${v('local')}();\n` +
          `    if (!${v('pending')} || ${v('ssec')} < 0${c.linked('date') ? ` || !${v('dateOk')}` : ''}) return;\n` +
          `    ${v('pending')} = false;` + trace(c, 'Uhr gestellt (Sekunde des Tages)', v('lsec'), '    ') + `\n` +
          `    if (${p('catchup')}) ${v('check')}(true);\n` +
          `}`;
      },
      in: (c, port) => ({
        lock: `${c.v('lock')} = v != 0;`,
        /* DPT 10.001: Tag (1 = Montag … 7, 0 = keiner) in Bit 21…23, Stunde, Minute, Sekunde */
        time: `int32_t wd = (v >> 21) & 7, h = (v >> 16) & 0x1F, m = (v >> 8) & 0x3F, s = v & 0x3F;\n` +
              `if (h > 23 || m > 59 || s > 59) return;\n` +
              `${c.v('swd')} = (int8_t) (wd - 1);\n` +
              `${c.v('ssec')} = h * 3600L + m * 60L + s;\n` +
              `${c.v('synced')}();`,
        /* DPT 11.001: Tag, Monat, Jahr (0…99, ab 90 = 19xx) */
        date: `int32_t d = (v >> 16) & 0x1F, m = (v >> 8) & 0x0F, y = v & 0x7F;\n` +
              `if (!d || !m || m > 12) return;\n` +
              `${c.v('sday')} = sbsDays(y >= 90 ? 1900 + y : 2000 + y, m, d);\n` +
              `${c.v('dateOk')} = true;\n` +
              `if (${c.v('ssec')} >= 0) ${c.v('synced')}();`
      })[port],
      loop: c =>
        `while (${c.v('ssec')} >= 0 && (int32_t) (millis() - ${c.v('next')}) >= 0)\n` +
        `{\n` +
        `    ${c.v('next')} += 1000;\n` +
        `    if (++${c.v('ssec')} == 86400)\n` +
        `    {\n` +
        `        ${c.v('ssec')} = 0;\n` +
        `        ${c.v('sday')}++;\n` +
        `        if (${c.v('swd')} >= 0) ${c.v('swd')} = (int8_t) ((${c.v('swd')} + 1) % 7);\n` +
        `    }\n` +
        `    int32_t before = ${c.v('lsec')};\n` +
        `    ${c.v('local')}();\n` +
        `    if (${c.v('lsec')} % 60 == 0 && ${c.v('lsec')} != before) ${c.v('check')}(false);\n` +
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
  },
  /* Überwachung: Auslösewert oder ausbleibende Telegramme (Sicherheit,
     Lebenszeichen); gibt nur Änderungen aus */
  {
    type: 'watchdog', cat: 'Zeit', name: 'Überwachung',
    help: 'Gibt 1 aus, wenn der Eingang den Auslösewert hat oder innerhalb der Überwachungszeit kein Telegramm mit dem anderen Wert kommt, sonst 0 – etwa für Sicherheitsobjekte oder ein Lebenszeichen. Die Zeit läuft ab dem Start; 0 schaltet sie ab. Gibt nur Änderungen aus.',
    inputs: [{ id: 'in', type: 'bool', label: 'Eingang' }],
    outputs: [{ id: 'out', type: 'bool', label: 'Ausgelöst' }],
    params: [
      { id: 'trig', label: 'Auslösen bei', type: 'enum', def: 1, options: [[0, 'Wert 0'], [1, 'Wert 1'], [2, 'nie (nur Zeit)']] },
      { id: 'time', label: 'Überwachungszeit', unit: 's, 0 = aus', type: 'u16', def: 0 }
    ],
    gen: {
      state: c => `static Timeout ${c.v('t')};\nstatic int8_t ${c.v('st')} = -1;\n` +
        `static void ${c.v('set')}(int8_t x)\n{\n    if (x == ${c.v('st')}) return;\n    ${c.v('st')} = x;` + trace(c, 'Ausfall', 'x', '    ') + `\n    int32_t out = x;\n    ${c.emit('out', 'out')}\n}`,
      init: c => `if (${c.param('time')}) ${c.v('t')}.start(${c.param('time')} * 1000UL);`,
      in: c => `if (${c.param('trig')} != 2 && (v != 0) == (${c.param('trig')} == 1)) { ${c.v('set')}(1); return; }\n` +
        `if (${c.param('time')}) ${c.v('t')}.start(${c.param('time')} * 1000UL);\n` +
        `${c.v('set')}(0);`,
      loop: c => `if (${c.v('t')}.expired()) ${c.v('set')}(1);`
    }
  },

  /* ---------- Debug ---------- */
  {
    type: 'debug', cat: 'Debug', name: 'Debug-Ausgabe',
    help: 'Gibt jeden Wert an einem Eingang als Zeile „Zeit (ms) Block: Name = Wert“ aus – über die UART am SB-Debug-Anschluss (ISP-TXD), einen anderen UART-Pin oder über SWD (RTT: ein Puffer im RAM, den der Debugger liest, z. B. J-Link, pyOCD oder OpenOCD). Übersetzt wird das nur im Debug-Build (build.sh Debug, oder im Release mit -DSBS_DEBUG=ON); sonst kostet der Block nichts. Ein Eingang je Zeile der Namensliste. Mit „Zusatzinfos der Blöcke“ melden die übrigen Blöcke außerdem wichtige Ereignisse (Relais schaltet, Busspannung fehlt, Wert gespeichert, Treppenlicht-Phase, empfangene KOs …), wahlweise nur Blöcke, deren Name einen der Filterbegriffe enthält.',
    inputs: n => debugNames(n).map((x, i) => ({ id: 'i' + i, type: 'num', any: true, label: { raw: x } })),
    props: [
      { id: 'out', label: 'Ausgabe', kind: 'enum', def: 'uart', switches: true,
        options: [['uart', 'UART am SB-Debug (ISP-TXD)'], ['uart2', 'UART (TXD)'], ['rtt', 'SWD (RTT über den Debugger)']] },
      { id: 'port', label: 'Anschluss', kind: 'bus', buses: ['debug'], signals: ['isp_txd'], share: true, def: 'debug', when: { out: 'uart' } },
      { id: 'port', label: 'Anschluss', kind: 'bus', buses: ['uart'], signals: ['txd'], share: true, def: 'uart', when: { out: 'uart2' } },
      { id: 'baud', label: 'Baudrate', kind: 'enum', def: 115200, options: [115200, 230400, 460800, 1500000].map(b => [b, String(b)]),
        when: p => p.out !== 'rtt' },
      { id: 'names', label: 'Eingänge (je Zeile ein Name)', kind: 'lines', def: 'Wert' },
      { id: 'hello', label: 'Start melden', kind: 'bool', def: true },
      { id: 'trace', label: 'Zusatzinfos der Blöcke', kind: 'enum', def: 'off', switches: true,
        options: [['off', 'Aus'], ['all', 'Alle Blöcke'], ['filter', 'Nur Blöcke, deren Name passt']] },
      { id: 'traceFilter', label: 'Name enthält (mehrere mit Komma)', kind: 'text', def: '', when: { trace: 'filter' } }
    ],
    check: n => debugNames(n).length || (n.props.trace || 'off') !== 'off' ? [] : [['Mindestens ein Eingang (Name) oder Zusatzinfos nötig.']],
    gen: {
      include: c => c.prop('out') === 'rtt' ? null : 'sblib/serial.h',
      lib: c => [DEBUG_LIB, c.prop('out') === 'rtt' ? DEBUG_RTT_LIB : DEBUG_UART_LIB]
        .concat(c.traceSink ? [debugTraceLib(c.prop('out') === 'rtt' ? 'sbsDbgRtt' : 'sbsDbgUart')] : []),
      shared: c => (c.prop('out') === 'rtt' ? '#ifdef SBS_DEBUG\nsbsRttInit();\n'
        : `#ifdef SBS_DEBUG\nserial.setTxPin(${c.busPin('port', c.prop('out') === 'uart' ? 'isp_txd' : 'txd')});\nserial.begin(${Number(c.prop('baud'))});\n`)
        + (c.traceSink ? 'sbsTraceOn = true;\n' : '') + '#endif',
      init: c => c.prop('hello') ? `#ifdef SBS_DEBUG\nsbsDbgLine(${c.prop('out') === 'rtt' ? 'sbsDbgRtt' : 'sbsDbgUart'}, ${JSON.stringify(c.title + ': Start')}, 0);\n#endif` : '',
      in: (c, port) => {
        const name = debugNames({ props: { names: c.prop('names') } })[Number(port.slice(1))];
        return `#ifdef SBS_DEBUG\nsbsDbgLine(${c.prop('out') === 'rtt' ? 'sbsDbgRtt' : 'sbsDbgUart'}, ${JSON.stringify(c.title + ': ' + name)}, v);\n#else\n(void) v;\n#endif`;
      }
    }
  },

  /* ---------- Makro ----------
     Die Instanz hat keinen eigenen Code: der Resolver löst sie in die
     Blöcke des Makros auf (model.js, expand). Makro-Ein-/Ausgang reichen
     dann den Wert weiter; im Makro selbst haben sie nur die Seite nach innen. */
  {
    type: 'macro', cat: 'Makro', name: 'Makro', hidden: true,
    help: 'Mehrere Blöcke als ein Block, z. B. ein Kanal, den das Gerät mehrfach hat. Jede Instanz hat eigene Pins, Parameter und KO-Nummern; KO-Namen und Parameter tragen ihren Namen voran (Kanal 1: Schalten).',
    inputs: n => macroPorts(n, 'macro_in'),
    outputs: n => macroPorts(n, 'macro_out'),
    props: [{ id: 'macro', label: 'Makro', kind: 'macro', def: '' }]
  },
  {
    type: 'macro_in', cat: 'Makro', name: 'Makro-Eingang', macroOnly: true,
    help: 'Eingang des Makros: erscheint am Makro-Block als Port und gibt den Wert hier hinein weiter. Die Reihenfolge der Ports folgt der Lage von oben nach unten.',
    inputs: n => n._flat ? [{ id: 'in', type: n.props.vtype, label: { raw: n.props.name }, optional: n.props.optional }] : [],
    outputs: n => [{ id: 'out', type: n.props.vtype, label: { raw: n.props.name } }],
    props: [{ id: 'name', label: 'Name', kind: 'text', def: 'Eingang' }, VTYPE,
            { id: 'optional', label: 'Darf unverbunden bleiben', kind: 'bool', def: false }],
    gen: { in: c => c.emit('out', 'v') }
  },
  {
    type: 'macro_out', cat: 'Makro', name: 'Makro-Ausgang', macroOnly: true,
    help: 'Ausgang des Makros: erscheint am Makro-Block als Port und gibt den Wert von hier nach außen.',
    inputs: n => [{ id: 'in', type: n.props.vtype, label: { raw: n.props.name } }],
    outputs: n => n._flat ? [{ id: 'out', type: n.props.vtype, label: { raw: n.props.name } }] : [],
    props: [{ id: 'name', label: 'Name', kind: 'text', def: 'Ausgang' }, VTYPE],
    gen: { in: c => c.emit('out', 'v') }
  },

  /* ---------- Skript ---------- */
  {
    type: 'script', cat: 'Skript', name: 'Skript (C++)',
    help: 'Eigener C++-Code für alles, was die Blöcke nicht können. input(k) liefert den letzten Wert von Eingang Ek, emit(k, v) sendet v an Ausgang Ak, param(k) liest den KNX-Parameter k, trace("Text", v) gibt eine Zusatzinfo über den Debug-Block aus. Im Code „Bei Eingang“ sind k (Nummer) und v (Wert) gesetzt. „Zustand“ steht außerhalb der Funktionen (Variablen, Hilfsfunktionen, z. B. static Timeout t;), „Zyklisch“ läuft in jeder Runde der Hauptschleife (millis() ist verfügbar).',
    inputs: n => range(Number(n.props.ins)).map(i => ({ id: `i${i}`, type: 'num', label: `E${i + 1}` })),
    outputs: n => range(Number(n.props.outs)).map(i => ({ id: `o${i}`, type: 'num', label: `A${i + 1}` })),
    params: n => range(Number(n.props.nparams)).map(i => ({ id: `p${i}`, label: ['Parameter {0}', i + 1], type: 'i16', def: 0 })),
    props: [
      { id: 'ins', label: 'Eingänge', kind: 'enum', def: 2, options: range(5).map(i => [i, String(i)]) },
      { id: 'outs', label: 'Ausgänge', kind: 'enum', def: 1, options: range(4).map(i => [i + 1, String(i + 1)]) },
      { id: 'nparams', label: 'Parameter', kind: 'enum', def: 0, options: range(5).map(i => [i, String(i)]) },
      { id: 'state', label: 'Zustand', kind: 'code', def: '' },
      { id: 'init', label: 'Beim Start', kind: 'code', def: '' },
      { id: 'in', label: 'Bei Eingang (k, v)', kind: 'code', def: 'emit(1, input(1) + input(2));' },
      { id: 'loop', label: 'Zyklisch', kind: 'code', def: '' },
      { id: 'desc', label: 'Beschreibung (Markdown)', kind: 'markdown', def: '' }
    ],
    check: scriptCheck,
    gen: {
      state: c => {
        const ins = Number(c.prop('ins')), outs = Number(c.prop('outs')), np = Number(c.prop('nparams'));
        const fn = (head, body) => `${head}\n{\n${body.trim() ? indent(body.trim()) + '\n' : ''}}`;
        const desc = String(c.prop('desc') || '').trim();
        return (desc ? `/*\n${desc.replace(/\*\//g, '* /').split('\n').map(l => (' * ' + l).trimEnd()).join('\n')}\n */\n` : '') +
          `/* Eigener Code in einem eigenen Namensraum: Namen stören keine anderen Blöcke */\n` +
          `namespace ${c.v('script')}\n{\n` +
          `[[maybe_unused]] static int32_t E[${Math.max(ins, 1)}];\n` +
          `[[maybe_unused]] static int32_t input(int k) { return k >= 1 && k <= ${ins} ? E[k - 1] : 0; }\n` +
          `[[maybe_unused]] static int32_t param([[maybe_unused]] int k)\n{\n` +
          (np ? `    switch (k)\n    {\n${range(np).map(i => `    case ${i + 1}: return ${c.param('p' + i)};\n`).join('')}    default: return 0;\n    }\n` : `    return 0;\n`) +
          `}\n` +
          `/* Zusatzinfo „Zeit Block: was = v“ (Debug-Block mit Zusatzinfos, nur im Debug-Build) */\n` +
          `[[maybe_unused]] static void trace([[maybe_unused]] const char* what, [[maybe_unused]] int32_t v)\n{\n` +
          (c.traceWho && c.traceWho() ? `#ifdef SBS_TRACE\n    sbsTrace(${c.traceWho()}, what, v);\n#endif\n` : '') +
          `}\n` +
          `[[maybe_unused]] static void emit(int k, int32_t v)\n{\n    switch (k)\n    {\n` +
          range(outs).map(i => `    case ${i + 1}: ${c.emit('o' + i, 'v')} break;\n`).join('') +
          `    default: (void) v; break;\n    }\n}\n\n` +
          (String(c.prop('state')).trim() ? `// Zustand\n${String(c.prop('state')).trim()}\n\n` : '') +
          fn('static void start()', String(c.prop('init'))) + '\n\n' +
          fn('[[maybe_unused]] static void onInput([[maybe_unused]] int k, [[maybe_unused]] int32_t v)', String(c.prop('in'))) + '\n\n' +
          fn('static void cyclic()', String(c.prop('loop'))) + '\n' +
          `}`;
      },
      init: c => `${c.v('script')}::start();`,
      in: (c, port) => `${c.v('script')}::E[${port.slice(1)}] = v;\n${c.v('script')}::onInput(${Number(port.slice(1)) + 1}, v);`,
      loop: c => `${c.v('script')}::cyclic();`
    }
  },

  /* ---------- Notiz ---------- */
  {
    type: 'note', cat: 'Notiz', name: 'Notiz',
    help: 'Freier Text auf der Arbeitsfläche, mit Markdown: # Überschrift, **fett**, *kursiv*, `Code`, Listen mit - oder 1., [Link](https://…). Erzeugt keinen Code. In einem Makro kann eine Notiz die Beschreibung des Makros sein – sie steht dann auch in den Eigenschaften jeder Instanz und als Hinweis in der Blockliste.',
    note: true,
    props: [
      { id: 'text', label: 'Text (Markdown)', kind: 'markdown', def: '**Notiz**\n\nText mit *Markdown*.' },
      { id: 'width', label: 'Breite', kind: 'enum', def: 280, options: [[184, 'schmal'], [280, 'mittel'], [400, 'breit'], [560, 'sehr breit']] },
      { id: 'desc', label: 'Beschreibung des Makros', kind: 'bool', def: false, macroOnly: true }
    ]
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
  DPT, OBJ_SIZE, portType, MASK, CHIP, PLATFORMS, PLATFORM_OF_MCU, BUS_NAMES, BUS_INFO, PIN_FN, PTYPE, SW_PWM_MAX, DEFS, CATS,
  pinFns, pwmOf, timerFn, srWhere, busesFor, activeProps, feasible, maxOf, pinsFor, fnsOf, missing,
  get: type => byType.get(type),
  inputs: (def, node) => list(def.inputs, node),
  outputs: (def, node) => list(def.outputs, node),
  params: (def, node) => list(def.params, node),
  kos: (def, node) => list(def.kos, node),
  resources: (def, node) => list(def.resources, node),
  defaults
};
})();
