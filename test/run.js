/* Tests der Generatoren ohne Abhängigkeiten.
 *
 *   node test/run.js [Ausgabeverzeichnis]
 *
 * Lädt die Skripte wie der Browser in einen gemeinsamen Kontext, erzeugt
 * aus jedem Beispiel Firmware und knxprod und prüft das Ergebnis. Mit
 * Ausgabeverzeichnis werden die Dateien zusätzlich geschrieben (für den
 * Übersetzungstest in test/compile.sh).                                  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
['i18n', 'blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS;

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('  FEHLER:', msg); } };

function xmlWellFormed(text) {
  // Grobe Prüfung ohne DOMParser: Tags müssen sich paarweise schließen
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w.-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].startsWith('<?')) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; }
    else if (!m[3]) stack.push(m[2]);
  }
  return stack.length === 0;
}

const out = process.argv[2];
for (const ex of S.examples) {
  console.log(ex.name);
  const f = S.firmware.slug(ex.name);
  const model = S.model.parse(JSON.stringify(ex.model));
  const res = S.model.resolve(model);
  res.errors.forEach(e => console.error('  Fehler:', e.msg));
  res.warnings.forEach(w => console.log('  Hinweis:', w.msg));
  check(!res.errors.length, 'Beispiel hat Fehler');

  const fw = S.firmware.files(res);
  const prod = S.knxprod.files(res, null);
  check(/BcuBase\* setup\(\)/.test(fw['src/app_main.cpp']), 'setup() fehlt');
  check(/^build\/$/m.test(fw['.gitignore'] || ''), '.gitignore schließt build/ nicht aus');
  res.kos.forEach(k => check(fw['src/app_config.h'].includes(k.macro), `${k.macro} fehlt in app_config.h`));
  Object.entries(prod).forEach(([n, x]) => check(xmlWellFormed(x), `${n} ist kein wohlgeformtes XML`));

  /* KO-Nummern und Parameter-Offsets müssen in beiden Ergebnissen gleich sein */
  const app = Object.entries(prod).find(([n]) => /_A-/.test(n))[1];
  res.kos.forEach(k => check(app.includes(`Number="${k.number}"`), `KO ${k.number} fehlt in der knxprod`));
  res.params.filter(p => !p.fixed).forEach(p => {
    check(app.includes(`Name="${p.name}"`), `Parameter ${p.name} fehlt in der knxprod`);
    check(new RegExp(`PARAM_${p.name.toUpperCase()}\\s+0x${p.offset.toString(16).toUpperCase().padStart(4, '0')}`).test(fw['src/app_config.h']),
      `Offset von ${p.name} passt nicht`);
  });
  res.params.filter(p => p.fixed).forEach(p => check(!app.includes(`Name="${p.name}"`), `fester Parameter ${p.name} steht in der knxprod`));

  /* BIM112: KO-Tabelle so, wie die sblib sie liest (ComObjectsBCU2) */
  const lay = res.layout;
  const seg = addr => new RegExp(`<AbsoluteSegment Id="[^"]+_AS-${addr.toString(16).toUpperCase().padStart(4, '0')}" Address="${addr}" Size="(\\d+)"[^>]*>(?:\\s*<Data>([^<]*)</Data>)?`).exec(app);
  const com = seg(lay.comTab.addr);
  check(com, 'Segment der KO-Tabelle fehlt');
  if (com) {
    const t = Buffer.from(com[2] || '', 'base64');
    check(t.length === +com[1] && t.length === 3 + 4 * t[0], 'Länge der KO-Tabelle passt nicht');
    check(((t[1] << 8) | t[2]) === lay.flags, 'Zeiger auf die RAM-Flags falsch');
    res.kos.forEach(k => {
      const e = 3 + 4 * k.number;
      check(((t[e] << 8) | t[e + 1]) === k.ram, `KO ${k.number}: Wertzeiger falsch`);
      check(t[e + 3] === S.blocks.OBJ_SIZE[k.dpt.size].type, `KO ${k.number}: Typ falsch`);
      check(!!(t[e + 2] & 0x04) === k.def.flags.includes('C'), `KO ${k.number}: Kommunikationsflag falsch`);
      check(k.ram >= res.mask.ram.addr && k.ram < res.mask.ram.end, `KO ${k.number}: Wert liegt außerhalb des User-RAM`);
    });
    const rams = res.kos.map(k => k.ram);
    check(new Set(rams).size === rams.length, 'Objektwerte überlappen');
  }
  check(res.kos.every(k => k.number >= res.mask.koBase) && res.kos.some(k => k.number === res.mask.koBase),
    'KO-Nummern beginnen nicht bei der ersten der Maske');
  const ps = seg(lay.params.addr);
  check(ps && Buffer.from(ps[2] || '', 'base64').length === +ps[1], 'Parametersegment fehlt oder hat falsche Länge');
  check(fw['src/app_config.h'].includes(`#define PARAM_BASE         0x${lay.params.addr.toString(16).toUpperCase()}`), 'PARAM_BASE passt nicht zum Segment');
  check(fw['src/app_main.cpp'].includes(`#include <${res.mask.header}>`), 'Masken-Header fehlt');
  check(/LoadProcedureStyle="ProductProcedure"/.test(app) && /<LdCtrlTaskSegment LsmIdx="3" Address="17408"/.test(app),
    'Ladeprozedur der Applikation fehlt');
  res.params.filter(p => !p.fixed && ps).forEach(p => {
    const b = Buffer.from(ps[2], 'base64');
    const v = p.size === 2 ? (b[p.offset] << 8) | b[p.offset + 1] : b[p.offset];
    check(v === (p.value & (p.size === 2 ? 0xFFFF : 0xFF)), `Vorgabe von ${p.name} steht falsch im Segment`);
  });

  /* Stabile KO-Nummern: Knoten entfernen ändert die anderen Nummern nicht */
  const before = new Map(model.nodes.map(n => [n.id, JSON.stringify(n.kos)]));
  const copy = S.model.parse(S.model.serialize(model));
  S.model.removeNode(copy, copy.nodes.find(n => Object.keys(n.kos).length).id);
  S.model.normalize(copy);
  copy.nodes.forEach(n => check(before.get(n.id) === JSON.stringify(n.kos), `KO-Nummer von ${n.id} hat sich geändert`));

  if (out) {
    const dir = path.join(out, f);
    Object.entries({ ...fw, ...Object.fromEntries(Object.entries(prod).map(([n, x]) => ['knxprod/' + n, x])) })
      .forEach(([n, x]) => {
        fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true });
        fs.writeFileSync(path.join(dir, n), x);
      });
    fs.writeFileSync(path.join(dir, 'device.knxprod'), S.zip.write(prod));
    console.log('  geschrieben nach', dir);
  }
}

/* Start-up ohne NXP: eingebettet wie in runtime/, Symbole und Variablen passen */
{
  console.log('Start-up-Code');
  check(fs.readFileSync(path.join(root, 'js', 'runtime-lpc11xx.js'), 'utf8') === require('../tools/embed-runtime.js').build(),
    'js/runtime-lpc11xx.js ist veraltet — node tools/embed-runtime.js');
  const res = S.model.resolve(S.model.parse(JSON.stringify(S.examples[0].model)));
  const fw = S.firmware.files(res);
  const ld = fw['linkscripts/lpc1115.ld.in'], cm = fw['CMakeLists.txt'];
  check(fw['src/startup_lpc11xx.cpp'] && fw['src/libc_stubs.cpp'] && ld, 'Laufzeitdateien fehlen im Export');
  if (ld) {
    const defined = new Set([...ld.matchAll(/^\s*(?:PROVIDE\()?([A-Za-z_][\w]*)\s*=/gm)].map(m => m[1]));
    const wanted = [...fw['src/startup_lpc11xx.cpp'].matchAll(/^extern uint32_t (\w+);/gm), ...fw['src/libc_stubs.cpp'].matchAll(/^extern uint8_t (\w+);/gm)]
      .map(m => m[1]).concat('__valid_user_code_checksum');
    wanted.forEach(sym => check(defined.has(sym), `Linkerskript definiert ${sym} nicht`));
    [...new Set([...ld.matchAll(/@(\w+)@/g)].map(m => m[1]))].forEach(v =>
      check(new RegExp(`set\\(${v} `).test(cm), `CMake setzt ${v} nicht`));
    const code = (cm.replace(/#.*$/gm, '') + ld.replace(/\/\*[\s\S]*?\*\//g, ''));
    check(!/libcr|cr_startup|SB_STARTUP_DIR|LPC1115\.ld/.test(code), 'Verweis auf NXP-Start-up oder libcr übrig');
  }
}

/* Jede vordefinierte Plattform: Beispiele gültig, Flash endet vor dem
   UserEeprom-Sektor */
for (const [id, platform] of Object.entries(S.blocks.PLATFORMS)) {
  console.log('Plattform', id);
  const mcu = S.blocks.CHIP[platform.chip];
  check(!S.model.checkPlatform(platform).length, `${id}: ${S.model.checkPlatform(platform).join('; ')}`);
  S.examples.forEach(ex => {
    const m = S.model.parse(JSON.stringify(ex.model));
    m.device.platform = id;
    const res = S.model.resolve(m);
    check(!res.errors.length, `${ex.name} auf ${id}: ${res.errors.map(e => e.msg).join('; ')}`);
    if (res.errors.length) return;
    const cm = S.firmware.files(res)['CMakeLists.txt'];
    const len = /set\(SBS_FLASH_LENGTH "(0x[0-9A-F]+)"\)/.exec(cm);
    check(len && +len[1] === mcu.flashEnd && mcu.flashEnd % 0x1000 === 0, `${id}: Flash-Länge im CMake falsch`);
  });
}

/* Zyklus wird erkannt */
{
  const m = S.model.create();
  const a = S.model.addNode(m, 'not', 0, 0), b = S.model.addNode(m, 'not', 0, 0);
  m.links.push({ from: [a.id, 'out'], to: [b.id, 'in'] }, { from: [b.id, 'out'], to: [a.id, 'in'] });
  check(S.model.resolve(m).errors.some(e => /Zyklus/.test(e.msg)), 'Zyklus nicht erkannt');
}
/* Doppelter Pin wird erkannt */
{
  const m = S.model.create();
  const a = S.model.addNode(m, 'di', 0, 0), b = S.model.addNode(m, 'do', 0, 0);
  b.props.pin = a.props.pin;
  check(S.model.resolve(m).errors.some(e => /doppelt belegt/.test(e.msg)), 'doppelter Pin nicht erkannt');
}
/* Pin ohne passende Funktion (PWM nur an Timer-Ausgängen) */
{
  const m = S.model.create();
  S.model.addNode(m, 'pwm', 0, 0).props.pin = 'IO1';
  check(S.model.resolve(m).errors.some(e => /geht hier nicht/.test(e.msg)), 'PWM an IO1 nicht abgelehnt');
}
/* Alte Modelle: device.mcu und Pins als sblib-Makro */
{
  const old = S.model.create();
  delete old.device.platform; delete old.platforms;
  old.device.mcu = 'lpc1114';
  old.nodes.push({ id: 'n1', type: 'di', x: 0, y: 0, label: '', props: { pin: 'PIN_IO4' }, params: {}, fixed: {}, kos: {} });
  const m = S.model.parse(JSON.stringify(old));
  check(m.device.platform === '4te-lpc1114' && !('mcu' in m.device), 'MCU nicht in Plattform umgesetzt');
  check(m.nodes[0].props.pin === 'IO4', 'PIN_IO4 nicht in IO4 umgesetzt');
  const res = S.model.resolve(m);
  check(!res.errors.length, 'altes Modell hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  check(/#define PIN_N1_PIN\s+PIO2_9 /.test(S.firmware.files(res)['src/app_config.h']), 'Pin-Makro für IO4 fehlt');
}
/* Eigene Plattform: Pins, Funktionen und Busse bestimmen die Blöcke */
{
  const m = S.model.create();
  m.platforms.push({ id: 'custom-1', name: 'Testplatine', chip: 'lpc1114', prog: 'PIO0_3',
    pins: [{ name: 'T1', gpio: 'PIO0_4', fn: ['in'] }, { name: 'L1', gpio: 'PIO1_1', fn: ['out', 'pwm'] }],
    buses: { knx: { rx: 'PIO1_8', tx: 'PIO1_9' } } });
  m.device.platform = 'custom-1';
  const p = S.model.platformOf(m);
  check(!S.model.checkPlatform(p).length, 'gültige Plattform beanstandet: ' + S.model.checkPlatform(p).join('; '));
  check(S.model.unavailable(S.blocks.get('ai'), p), 'Analogeingang ohne Analog-Pin verfügbar');
  check(S.model.unavailable(S.blocks.get('sht4x'), p), 'SHT4x ohne I²C verfügbar');
  check(!S.model.unavailable(S.blocks.get('pwm'), p), 'PWM trotz PWM-Pin nicht verfügbar');
  const di = S.model.addNode(m, 'di', 0, 0), pwm = S.model.addNode(m, 'pwm', 0, 0);
  check(di.props.pin === 'T1' && pwm.props.pin === 'L1', 'kein passender Pin vorgeschlagen');
  let res = S.model.resolve(m);
  check(!res.errors.length, 'eigene Plattform hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const fw = S.firmware.files(res);
  check(/bcu\.setProgPin\(PIO0_3\);/.test(fw['src/app_main.cpp']), 'setProgPin fehlt');
  /* für test/compile.sh mitübersetzen */
  if (out) Object.entries(fw).forEach(([n, x]) => {
    const file = path.join(out, 'Testplatine', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  check(/timer32_1\.match\(TIMER_MATCH_MAT0,/.test(fw['src/app_main.cpp']), 'PWM-Kanal aus der Chip-Tabelle fehlt');
  S.model.addNode(m, 'sht4x', 0, 0);
  check(S.model.resolve(m).errors.some(e => /nicht verfügbar auf Testplatine/.test(e.msg)), 'SHT4x ohne I²C nicht abgelehnt');
  /* I²C anschließen: SCL liegt auf PIO0_4 = T1 des Digitaleingangs */
  p.buses.i2c = { scl: 'PIO0_4', sda: 'PIO0_5' };
  m.platforms[0].buses = p.buses;
  res = S.model.resolve(m);
  check(res.errors.some(e => /T1 \(PIO0_4\) doppelt belegt/.test(e.msg)), 'I²C gegen Digitaleingang nicht erkannt');
  /* Fehlerhafte Plattform */
  const bad = { name: 'X', chip: 'lpc1114', prog: 'PIO2_0',
    buses: { knx: { rx: 'PIO1_8', tx: 'PIO1_9' }, uart: { rxd: 'PIO3_1', txd: 'PIO1_7' } },
    pins: [{ name: 'A', gpio: 'PIO1_9', fn: ['in'] }, { name: 'A', gpio: 'PIO2_0', fn: ['adc'] }] };
  const msgs = S.model.checkPlatform(bad).join('\n');
  [/PIO1_9 ist vergeben \(KNX TX\)/, /Pinname A doppelt/, /kann Analog nicht/, /Programmiertaste/, /UART RXD geht nicht an PIO3_1/].forEach(re =>
    check(re.test(msgs), `Plattformprüfung meldet ${re} nicht`));
  /* KNX-Bus: fehlt, Timer passen nicht, von der sblib nicht unterstützt */
  const knx = buses => S.model.checkPlatform({ name: 'K', chip: 'lpc1115', prog: '', pins: [], buses }).join('\n');
  check(/KNX-Bus fehlt/.test(knx({})), 'fehlender KNX-Bus nicht gemeldet');
  check(/selben Timer/.test(knx({ knx: { rx: 'PIO1_8', tx: 'PIO0_8' } })), 'KNX RX/TX an verschiedenen Timern nicht gemeldet');
  check(/sblib unterstützt nur/.test(knx({ knx: { rx: 'PIO3_5', tx: 'PIO1_10' } })), 'KNX an timer16_1 CAP1/MAT1 nicht als nicht unterstützt gemeldet');
  check(!knx({ knx: { rx: 'PIO1_8', tx: 'PIO1_9' } }), 'Standard-KNX-Pins beanstandet');
  check(!S.blocks.CHIP.lpc1114.buses.knx.rx.includes('PIO3_5') && S.blocks.CHIP.lpc1115.buses.knx.rx.includes('PIO3_5'),
    'CT16B1_CAP1 an PIO3_5 gibt es nur beim LPC1100XL');
  /* SB-Debug: RESET/SWD/ISP_EN fest, ISP_TXD/RXD mitbenutzbar */
  const dbg = { knx: { rx: 'PIO1_8', tx: 'PIO1_9' }, debug: Object.assign({}, S.blocks.PLATFORMS['4te-lpc1115'].buses.debug) };
  const pd = S.model.checkPlatform({ name: 'D', chip: 'lpc1115', prog: '', buses: dbg,
    pins: [{ name: 'S', gpio: 'PIO1_3', fn: ['in'] }, { name: 'R', gpio: 'PIO1_6', fn: ['in'] }] }).join('\n');
  check(/Pin S: PIO1_3 ist vergeben \(SB-Debug SWDIO\)/.test(pd), 'SWDIO als Pin nicht abgelehnt');
  check(!/Pin R/.test(pd), 'ISP_RXD nicht mitbenutzbar');
}
/* NeoPixel: belegt nur MOSI des SPI-Ports, Treiber einmal im Code */
{
  const m = S.model.create();
  const np = S.model.addNode(m, 'neopixel', 0, 0);
  check(np.props.port === 'spi0', 'NeoPixel: SPI0 nicht vorgeschlagen');
  const ko = S.model.addNode(m, 'ko_in', 0, 0);
  ko.props.dpt = '5.001';
  S.model.normalize(m);
  m.links.push({ from: [ko.id, 'out'], to: [np.id, 'r'] });
  const di = S.model.addNode(m, 'di', 0, 0);
  di.props.pin = 'IO5';   // SSEL0 bleibt frei
  let res = S.model.resolve(m);
  check(!res.errors.length, 'NeoPixel hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(/pinMode\(PIO0_9, OUTPUT \| SPI_MOSI\);/.test(main), 'NeoPixel: MOSI-Pin nicht eingerichtet');
  check(/SPI spi\(SPI_PORT_0, SPI_FORMAT_SPI \| SPI_CPOL_LOW \| SPI_CPHASE_FALL\);/.test(main), 'NeoPixel: SPI0 nicht eingerichtet');
  check(/ws2812Send\(LPC_SSP0, led, 3, 8\);/.test(main), 'NeoPixel: Senden fehlt');
  check(/0x924, .*0xDB6\n/.test(main), 'NeoPixel: Bitmuster falsch (0 = 0x924, F = 0xDB6)');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'NeoPixel', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  /* zweiter Streifen: nur ein SPI am 4TE */
  S.model.addNode(m, 'neopixel', 0, 0);
  res = S.model.resolve(m);
  check(res.errors.some(e => /SPI0 doppelt belegt/.test(e.msg)), 'zwei NeoPixel an SPI0 nicht erkannt');
  check((main.match(/static void ws2812Send/g) || []).length === 1, 'Treiber nicht genau einmal');
  m.nodes.pop();
  /* Digitalausgang an IO7 = MOSI */
  S.model.addNode(m, 'do', 0, 0).props.pin = 'IO7';
  check(S.model.resolve(m).errors.some(e => /IO7 \(PIO0_9\) doppelt belegt: NeoPixel/.test(e.msg)), 'IO7 gegen NeoPixel-MOSI nicht erkannt');
  m.nodes.pop();
  /* GRBW: vierter Kanal, Zahl der LEDs geprüft */
  np.props.order = 'GRBW'; np.props.count = 0;
  S.model.normalize(m);
  res = S.model.resolve(m);
  check(res.byId.get(np.id).inputs.some(p => p.id === 'w'), 'GRBW ohne Weiß-Eingang');
  check(res.errors.some(e => /Anzahl LEDs/.test(e.msg)), 'Anzahl 0 nicht beanstandet');
  /* einzeln: 1…8 LEDs mit eigenen Eingängen */
  np.props.order = 'GRB'; np.props.mode = 'single'; np.props.count = 3;
  S.model.normalize(m);
  res = S.model.resolve(m);
  const ins = res.byId.get(np.id).inputs.map(p => p.id).join(' ');
  check(ins === 'l1r l1g l1b l2r l2g l2b l3r l3g l3b bri on', 'NeoPixel einzeln: Eingänge ' + ins);
  check(/ws2812Send\(LPC_SSP0, led, 9, 1\);/.test(S.firmware.files(res)['src/app_main.cpp']), 'NeoPixel einzeln: Senden falsch');
  /* HSV statt RGB: Eingänge Farbton/Sättigung/Hellwert, Umrechnung einmal im Code */
  np.props.color = 'hsv'; np.props.order = 'GRBW';
  S.model.normalize(m);
  res = S.model.resolve(m);
  check(res.byId.get(np.id).inputs.map(p => p.id).slice(0, 4).join(' ') === 'l1h l1s l1v l1w', 'NeoPixel HSV: Eingänge falsch');
  const hsvMain = S.firmware.files(res)['src/app_main.cpp'];
  check(/static void hsvToRgb\(/.test(hsvMain) && /out\[i \* 4 \+ 0\] = \(uint8_t\) \(rgb\[1\] \* k \/ 255\);/.test(hsvMain) &&
    /out\[i \* 4 \+ 3\] = \(uint8_t\) \(n1_color\[i\]\[3\] \* k \/ 255\);/.test(hsvMain), 'NeoPixel HSV: Umrechnung fehlt');
  check(/n1_color\[2\]\[3\] = v/.test(hsvMain), 'NeoPixel HSV: Weiß-Eingang falsch zugeordnet');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'NeoPixelHsv', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  np.props.color = 'rgb'; np.props.order = 'GRB';
  S.model.normalize(m);
  np.props.count = 9;
  check(S.model.resolve(m).errors.some(e => /Anzahl LEDs.*1 und 8/.test(e.msg)), 'einzeln mehr als 8 LEDs nicht beanstandet');
  /* Plattform ohne SPI und ohne PWM-Pin */
  const p = S.model.platformOf(m);
  const bare = Object.assign({}, p, { buses: { knx: p.buses.knx }, pins: p.pins.map(x => Object.assign({}, x, { fn: x.fn.filter(f => f !== 'pwm') })) });
  check(/kein SPI0\/SPI1-Bus, kein Pin mit PWM/.test(S.model.unavailable(S.blocks.get('neopixel'), bare)), 'NeoPixel ohne SPI und PWM verfügbar');
  check(!S.model.unavailable(S.blocks.get('neopixel'), Object.assign({}, p, { buses: { knx: p.buses.knx } })), 'NeoPixel ohne SPI, aber mit Timer nicht verfügbar');
}
/* NeoPixel per Timer-Interrupt, wenn kein SPI angeschlossen ist (und umgekehrt) */
{
  const m = S.model.create();
  const base = S.blocks.PLATFORMS['4te-lpc1115'];
  m.platforms.push(Object.assign(JSON.parse(JSON.stringify(base)), { id: 'custom-1', name: 'Ohne SPI' }));
  delete m.platforms[0].buses.spi0;
  m.device.platform = 'custom-1';
  const np = S.model.addNode(m, 'neopixel', 0, 0);
  check(np.props.method === 'timer' && np.props.pin === 'IO6', 'NeoPixel ohne SPI nicht auf Timer umgestellt');
  np.props.mode = 'single'; np.props.count = 2;
  S.model.normalize(m);
  let res = S.model.resolve(m);
  check(!res.errors.length, 'NeoPixel (Timer) hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(/void TIMER16_0_IRQHandler\(\)/.test(main) && /LPC_TMR16B0->MR0 = /.test(main), 'NeoPixel (Timer): Interrupt fehlt');
  check(/timer16_0\.matchMode\(TIMER_MATCH_MAT0, INTERRUPT \| RESET \| STOP \| CLEAR\);/.test(main), 'NeoPixel (Timer): Match nicht eingerichtet');
  check(/pinMode\(PIN_N1_PIN, OUTPUT_MATCH\);/.test(main) && /NVIC_SetPendingIRQ\(TIMER_16_0_IRQn\)/.test(main), 'NeoPixel (Timer): Start fehlt');
  check(/\[2\]\[6\];/.test(main) && /= 48;/.test(main), 'NeoPixel (Timer): Doppelpuffer oder Bitzahl falsch');
  check(!/spi\.h|ws2812Send/.test(main), 'NeoPixel (Timer) bindet SPI ein');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'NeoPixelTimer', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  /* PWM am selben Timer (IO7 = timer16_0 MAT1) */
  S.model.addNode(m, 'pwm', 0, 0).props.pin = 'IO7';
  check(S.model.resolve(m).errors.some(e => /Timer timer16_0 doppelt belegt/.test(e.msg)), 'PWM am NeoPixel-Timer nicht erkannt');
  m.nodes.pop();
  /* umgekehrt: SPI zurück, Timer-Pin fehlt → wieder SPI */
  m.platforms[0].buses.spi0 = base.buses.spi0;
  m.platforms[0].pins.forEach(x => { x.fn = x.fn.filter(f => f !== 'pwm'); });
  S.model.freePins(m, np);
  check(np.props.method === 'spi' && !S.model.resolve(m).errors.length, 'NeoPixel ohne Timer-Pin nicht auf SPI umgestellt');
}
/* XL: derselbe Match-Kanal an zwei Pins */
{
  const m = S.model.create();
  m.platforms.push({ id: 'custom-1', name: 'XL', chip: 'lpc1115', prog: 'PIO2_0', buses: { knx: { rx: 'PIO1_8', tx: 'PIO1_9' } },
    pins: [{ name: 'A', gpio: 'PIO0_8', fn: ['out', 'pwm'] }, { name: 'B', gpio: 'PIO3_0', fn: ['out', 'pwm'] }] });
  m.device.platform = 'custom-1';
  S.model.addNode(m, 'pwm', 0, 0); S.model.addNode(m, 'pwm', 0, 0);
  check(m.nodes[0].props.pin === 'A' && m.nodes[1].props.pin === 'B', 'PWM-Pins nicht verteilt');
  check(S.model.resolve(m).errors.some(e => /PWM-Kanal timer16_0 MAT0 doppelt/.test(e.msg)), 'doppelter PWM-Kanal nicht erkannt');
  check(S.blocks.pinFns(S.blocks.CHIP.lpc1114, 'PIO3_0').indexOf('pwm') < 0, 'PWM an PIO3_0 beim LPC1114/302 angeboten');
  check(S.blocks.pinFns(S.blocks.CHIP.lpc1115, 'PIO1_10').indexOf('pwm') < 0, 'PWM am Bus-Timer timer16_1 angeboten');
}
/* Logik-Paket: Tor, Auswahl, Flanke, RS, Zähler, Taktgeber; PWM logarithmisch */
{
  const m = S.model.create();
  const add = (type, props) => Object.assign(S.model.addNode(m, type, 0, 0).props, props) && m.nodes[m.nodes.length - 1];
  const link = (a, ap, b, bp) => m.links.push({ from: [a.id, ap], to: [b.id, bp] });
  const btn = add('di'), edge = add('edge'), cnt = add('counter'), clk = add('clock'), gate = add('gate');
  const rs = add('rs'), sel = add('select', { vtype: 'num' }), pwm = add('pwm', { curve: 'log', invert: true });
  const koCnt = add('ko_out', { dpt: '5.010' }), koLim = add('ko_out'), koSel = add('ko_out', { dpt: '5.010' });
  S.model.normalize(m);
  link(btn, 'out', edge, 'in'); link(edge, 'rise', cnt, 'up'); link(edge, 'fall', rs, 'r');
  link(cnt, 'out', koCnt, 'in'); link(cnt, 'limit', koLim, 'in'); link(cnt, 'limit', rs, 's');
  link(clk, 'out', gate, 'in'); link(rs, 'out', gate, 'ctl'); link(gate, 'out', sel, 'cond');
  /* Regeln: übersetzt gegen die echten sblib-Header (Verhalten: test/simulate.js) */
  ['avg', 'integ', 'diff'].forEach(t => link(cnt, 'out', add(t), 'in'));
  link(cnt, 'out', add('pid'), 'x');
  const ts = add('timeswitch', { slots: 8 });
  S.model.normalize(m);
  link(cnt, 'out', ts, 'time');
  link(cnt, 'out', add('text_out'), 'in');
  link(cnt, 'out', add('text_out', { mode: 'value', pre: 'T ' }), 'in');
  add('text_in', { icase: true, dpt: '16.001', t0: 'Küche' });
  const ts2 = add('timeswitch', { slots: 3, astro: true, holidays: true });
  S.model.normalize(m);
  link(cnt, 'out', ts2, 'time'); link(cnt, 'out', ts2, 'date');
  /* Skript: mit Eingängen, und ohne Eingänge mit ETS-Parametern und leerem Code */
  const sc = add('script', { state: 'static int32_t sum;', in: 'sum += v;\nemit(1, sum);' });
  add('script', { ins: 0, outs: 3, nparams: 2, in: '', loop: 'if (millis() % 1000 == 0) emit(3, param(2));' });
  S.model.normalize(m);
  link(cnt, 'out', sc, 'i0'); link(cnt, 'out', sc, 'i1'); link(sc, 'o0', koSel, 'in');
  link(cnt, 'out', sel, 'a'); link(cnt, 'out', sel, 'b'); link(sel, 'out', pwm, 'in'); link(sel, 'out', koSel, 'in');
  /* Relais: Haltestrom per Software-PWM (zwei teilen sich timer32_1), bistabil mit zwei Spulen und H-Brücke */
  [['relay', { pin: 'IO2', hold: true }], ['relay', { pin: 'IO3', hold: true, invert: true }], ['relay', { pin: 'IO13' }],
   ['bistable', { pinOn: 'IO4', pinOff: 'IO5' }], ['bistable', { coils: 'one', pinOn: 'IO7', pinOff: 'IO8', invert: true }],
   ['bistable', { coils: 'cap', pinOn: 'IO10', invert: true }]]
    .forEach(([type, props]) => link(btn, 'out', add(type, props), 'in'));
  S.model.normalize(m);
  const res = S.model.resolve(m);
  check(!res.errors.length, 'Logik hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  check(!res.warnings.some(w => /Abwärts|Rücksetzen|Freigabe/.test(w.msg)), 'optionale Eingänge als unverbunden gemeldet');
  check(!res.warnings.some(w => /als bool gelesen|als Zahl 0\/1/.test(w.msg) && !/Auswahl/.test(w.msg)), 'Datentyp von Tor/Auswahl passt nicht');
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(/static const uint16_t pwmLog\[256\] = \{\n    0, 1, 1, /.test(main) && /, 1000\n\};/.test(main), 'PWM: logarithmische Tabelle falsch');
  check(/int32_t d = pwmLog\[n\d+_cur\];\n    d = 1000 - d;/.test(main), 'PWM: Kennlinie/Invertierung nicht angewandt');
  check(/n\d+_run = true;/.test(main), 'Taktgeber ohne Freigabe läuft nicht ab Start');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'Logik', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
}
/* Dimmen relativ: 4-Bit-Objekt (DPT 3.007) in Firmware und knxprod */
{
  const m = S.model.create();
  const d = S.model.addNode(m, 'dimkey', 0, 0), k = S.model.addNode(m, 'ko_out', 0, 0);
  k.props.dpt = '3.007';
  S.model.normalize(m);
  m.links.push({ from: [d.id, 'dim'], to: [k.id, 'in'] });
  const res = S.model.resolve(m);
  check(!res.errors.length, 'Dimmtaste hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  check(!res.warnings.some(w => /Status/.test(w.msg)), 'Status-Eingang der Dimmtaste als unverbunden gemeldet');
  const xml = Object.values(S.knxprod.files(res, null) || {}).join('\n');
  check(/ObjectSize="4 Bit"[^>]*DatapointType="DPST-3-7"/.test(xml), 'knxprod: 4-Bit-Objekt DPT 3.007 fehlt');
}
/* Text: zu lang oder Zeichen außerhalb des Zeichensatzes */
{
  const m = S.model.create();
  const n = S.model.addNode(m, 'text_out', 0, 0);
  n.props.t0 = 'Viel zu langer Text'; n.props.t1 = 'Küche';
  const errs = S.model.resolve(m).errors.map(e => e.msg).join('\n');
  check(/„Text 1“ ist länger als 14 Zeichen/.test(errs), 'zu langer Text nicht gemeldet');
  check(/„Text 2“: ü gibt es in 16.000 nicht/.test(errs), 'Umlaut in ASCII nicht gemeldet');
  n.props.dpt = '16.001'; n.props.t0 = 'Aus';
  check(!S.model.resolve(m).errors.length, 'Umlaut in ISO 8859-1 abgelehnt');
  check(!S.blocks.get('ko_out').props.find(p => p.id === 'dpt').options.some(o => /^16\./.test(o[0])), 'DPT 16 im normalen KO angeboten');
}
/* Skript: Klammern und Nummern von emit/input/param; Kommentare und Texte zählen nicht */
{
  const m = S.model.create();
  const n = S.model.addNode(m, 'script', 0, 0);
  S.model.normalize(m);
  const errs = () => S.model.resolve(m).errors.map(e => e.msg).join('\n');
  n.props.in = 'if (v) { emit(2, v);';
  check(/Bei Eingang \(k, v\): Klammern/.test(errs()), 'Skript: offene Klammer nicht gemeldet');
  check(/emit\(2\) – Ausgang 1…1 erwartet/.test(errs()), 'Skript: falscher Ausgang nicht gemeldet');
  n.props.in = 'emit(1, param(1)); // ) }'; n.props.loop = 'const char* s = "{(";';
  check(/param\(1\) – der Block hat keine Parameter/.test(errs()) && !/Klammern/.test(errs()), 'Skript: Parameter/Kommentar falsch geprüft');
  n.props.nparams = 1; S.model.normalize(m);
  check(!errs(), 'Skript: gültiger Code abgelehnt: ' + errs());
}
/* Software-PWM der Relais: Timer nicht mit PWM-Pin oder NeoPixel teilen, höchstens 8 je Timer */
{
  const m = S.model.create();
  const add = (type, props) => { const n = S.model.addNode(m, type, 0, 0); Object.assign(n.props, props); return n; };
  add('pwm', { pin: 'IO6' });                         // timer16_0
  const rl = add('relay', { pin: 'IO2', hold: true, timer: 'timer16_0' });
  S.model.normalize(m);
  check(S.model.resolve(m).errors.some(e => /Timer timer16_0 doppelt belegt/.test(e.msg)), 'Software-PWM am PWM-Timer nicht erkannt');
  rl.props.timer = 'timer32_0';
  check(!S.model.resolve(m).errors.length, 'Software-PWM auf freiem Timer abgelehnt: ' + S.model.resolve(m).errors.map(e => e.msg));
  ['IO3', 'IO4', 'IO5', 'IO7', 'IO8', 'IO9', 'IO10'].forEach(pin => add('relay', { pin, hold: true, timer: 'timer32_0' }));
  S.model.normalize(m);
  check(!S.model.resolve(m).errors.length, '8 Relais mit Software-PWM abgelehnt: ' + S.model.resolve(m).errors.map(e => e.msg));
  add('relay', { pin: 'IO11', hold: true, timer: 'timer32_0' });
  S.model.normalize(m);
  check(S.model.resolve(m).errors.some(e => /höchstens 8 Blöcke mit Software-PWM je Timer/.test(e.msg)), '9. Relais am Timer nicht gemeldet');
}
/* Makros: Instanzen werden zu gewöhnlichen Knoten mit eigenen KOs, Pins
   und Parametern; KO-Namen tragen den Namen der Instanz; Nummern bleiben
   stabil, wenn das Makro wächst; verschachtelt, nicht in sich selbst */
{
  const M = S.model, p = M.create();
  const m = M.createMacro(p, 'Kanal');
  const v = M.macroView(p, m.id);
  const [mi, mo] = v.nodes;
  const sw = M.addNode(v, 'ko_in', 0, 120), rl = M.addNode(v, 'relay', 220, 120), st = M.addNode(v, 'start', 0, 240);
  sw.props.name = 'Schalten';
  v.links.push({ from: [sw.id, 'out'], to: [rl.id, 'in'] }, { from: [mi.id, 'out'], to: [mo.id, 'in'] });
  M.normalize(p);
  const a = M.addMacro(p, m.id, 0, 0), b = M.addMacro(p, m.id, 0, 200);
  a.label = 'Kanal 1'; b.label = 'Kanal 2';
  const src = M.addNode(p, 'ko_in', -300, 0);
  p.links.push({ from: [src.id, 'out'], to: [a.id, mi.id] }, { from: [a.id, mo.id], to: [b.id, mi.id] });
  M.normalize(p);
  let res = M.resolve(p);
  check(!res.errors.length, 'Makro hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const texts = res.kos.map(k => k.def.text);
  check(texts.includes('Kanal 1: Schalten') && texts.includes('Kanal 2: Schalten'), 'KO-Namen ohne Instanz: ' + texts);
  const pinsOf = n => res.pins.filter(x => x.node._owner === n.id).map(x => x.name);
  check(pinsOf(a).length === 1 && pinsOf(b).length === 1 && pinsOf(a)[0] !== pinsOf(b)[0], 'Instanzen teilen sich den Relais-Pin');
  check(res.view.nodes.some(r => r.node === a && r.inputs.length === 1 && r.outputs.length === 1), 'Instanz ohne Ports');
  check(res.warnings.some(w => w.node === b.id) === false && !res.warnings.some(w => /Eingang/.test(w.msg) && w.node === a.id), 'verbundener Makro-Eingang gemeldet');
  /* Instanz-Parameter und ETS-Freigabe */
  a.inner[st.id].params.delay = 7;
  b.inner[st.id].fixed.delay = true;
  res = M.resolve(p);
  const par = n => res.params.find(x => x.r.node._owner === n.id && x.def.id === 'delay');
  check(par(a).value === 7 && !par(a).fixed && par(b).value === 2 && par(b).fixed, 'Parameter je Instanz falsch');
  check(par(a).r.title === 'Kanal 1: Systemstart', 'ETS-Block ohne Instanz: ' + par(a).r.title);
  /* Makro wächst: vorhandene KO-Nummern bleiben */
  const nums = res.kos.map(k => `${k.def.text}=${k.number}`);
  M.addNode(v, 'ko_out', 400, 120);
  M.normalize(p);
  res = M.resolve(p);
  check(nums.every(x => res.kos.some(k => `${k.def.text}=${k.number}` === x)), 'KO-Nummern verschoben');
  check(res.kos.length === 5, 'neues KO je Instanz fehlt: ' + res.kos.length);
  /* Unverbundener Eingang zeigt auf die Instanz */
  check(!res.warnings.some(w => w.node === b.id && /„Eingang“/.test(w.msg)), 'Eingang von Kanal 2 ist verbunden');
  check(res.warnings.some(w => w.node === b.id && /Kanal 2: KO senden/.test(w.msg)), 'unverbundener Block im Makro nicht an der Instanz gemeldet');
  p.links = p.links.filter(l => l.to[0] !== b.id);
  res = M.resolve(p);
  check(res.warnings.some(w => w.node === b.id && /Kanal 2: Eingang „Eingang“ ist nicht verbunden/.test(w.msg)), 'unverbundener Makro-Eingang nicht an der Instanz');
  /* Firmware: Makro-Eingang reicht weiter */
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(new RegExp(`static void ${a.id}_${mi.id}_in_in\\(int32_t v\\)\\n\\{\\n    ${a.id}_${mo.id}_in_in\\(v\\);`).test(main), 'Makro-Eingang reicht nicht weiter');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const f = path.join(out, 'Makro', n);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, x);
  });
  /* Verschachtelt, nicht in sich selbst, Speichern und Laden */
  const outer = M.createMacro(p, 'Doppel');
  const ov = M.macroView(p, outer.id);
  M.addMacro(ov, m.id, 0, 120); M.addMacro(ov, m.id, 0, 300);
  const d = M.addMacro(p, outer.id, 400, 0);
  res = M.resolve(p);
  check(!res.errors.length, 'verschachteltes Makro hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  check(res.kos.filter(k => k.r.node._owner === d.id).length === 4 && res.pins.filter(x => x.node._owner === d.id).length === 2, 'verschachtelte Instanz unvollständig');
  check(M.macroUsers(p, m.id).has(outer.id), 'enthaltendes Makro nicht erkannt');
  M.addMacro(M.macroView(p, m.id), outer.id, 0, 400);
  check(M.resolve(p).errors.some(e => /enthält sich selbst/.test(e.msg)), 'Makro in sich selbst nicht erkannt');
  m.nodes = m.nodes.filter(n => n.type !== 'macro'); M.normalize(p);
  const q = M.parse(M.serialize(p));
  check(M.serialize(q) === M.serialize(p) && !M.resolve(q).errors.length, 'Makro nach Speichern/Laden anders');
  M.deleteMacro(p, m.id);
  check(!p.nodes.some(n => n.type === 'macro' && n.props.macro === m.id) && !outer.nodes.some(n => n.type === 'macro'), 'Instanzen nach Löschen übrig');
}
/* Leeres Zahlenfeld eines Parameters: Meldung statt Absturz */
{
  const m = S.model.create();
  S.model.addNode(m, 'pwm', 0, 0).params.fade = NaN;
  let errs = [];
  try { errs = S.model.resolve(m).errors; } catch (e) { check(false, 'resolve() stürzt bei leerem Parameter ab: ' + e.message); }
  check(errs.some(e => /„Dimmzeit 0…100 %“ ist keine Zahl/.test(e.msg)), 'leerer Parameter nicht gemeldet');
}
/* Zwei Sensoren auf derselben I²C-Adresse */
{
  const m = S.model.create();
  S.model.addNode(m, 'bh1750', 0, 0); S.model.addNode(m, 'bh1750', 0, 0);
  check(S.model.resolve(m).errors.some(e => /I²C-Adresse 23h doppelt/.test(e.msg)), 'doppelte I²C-Adresse nicht erkannt');
  m.nodes[1].props.addr = 0x5C;
  check(!S.model.resolve(m).errors.some(e => /I²C/.test(e.msg)), 'verschiedene I²C-Adressen als Konflikt gemeldet');
}
/* ZIP lesen und schreiben */
(async () => {
  const z = S.zip.write({ 'a.txt': 'hallo', 'b/c.xml': '<x/>' });
  const got = await S.zip.read(z, n => n === 'b/c.xml');
  check(new TextDecoder().decode(got) === '<x/>', 'ZIP-Eintrag falsch gelesen');
  console.log(failed ? `\n${failed} Fehler` : '\nAlle Tests bestanden');
  process.exit(failed ? 1 : 0);
})();
