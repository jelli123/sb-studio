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
['i18n', 'blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples', 'markdown'].forEach(f =>
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
      /* Varianten einer Nummer: Tabelle von der ersten, die Ladeprozedur setzt die aktive */
      if (!k.alt) check(t[e + 3] === S.blocks.OBJ_SIZE[k.dpt.size].type, `KO ${k.number}: Typ falsch`);
      if (!k.alt) check(!!(t[e + 2] & 0x04) === k.def.flags.includes('C'), `KO ${k.number}: Kommunikationsflag falsch`);
      check(k.ram >= res.mask.ram.addr && k.ram < res.mask.ram.end, `KO ${k.number}: Wert liegt außerhalb des User-RAM`);
    });
    const rams = res.kos.filter(k => !k.alt).map(k => k.ram);
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
    const v = b.subarray(p.offset, p.offset + p.size).reduce((x, y) => x * 256 + y, 0);
    check(v === (p.size === 4 ? p.value >>> 0 : p.value & (p.size === 2 ? 0xFFFF : 0xFF)), `Vorgabe von ${p.name} steht falsch im Segment`);
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
    /* dauerhafter Speicher: 4 Seiten (1 KB) vor dem UserEeprom */
    const end = mcu.flashEnd - (res.nodes.some(r => r.def.persist) ? 0x400 : 0);
    check(len && +len[1] === end && mcu.flashEnd % 0x1000 === 0, `${id}: Flash-Länge im CMake falsch`);
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
/* Ältere eigene Plattformen mit SSEL am SPI-Bus: SSEL fällt beim Laden weg */
{
  const m = S.model.create();
  m.platforms.push({ id: 'custom-1', name: 'Alt', chip: 'lpc1115', prog: 'PIO2_0', pins: [],
                     buses: { knx: { rx: 'PIO1_8', tx: 'PIO1_9' }, spi1: { sck: 'PIO2_1', miso: 'PIO2_2', mosi: 'PIO2_3', ssel: 'PIO2_4' } } });
  m.device.platform = 'custom-1';
  const back = S.model.parse(S.model.serialize(m));
  const spi = back.platforms[0].buses.spi1;
  check(!('ssel' in spi) && spi.mosi === 'PIO2_3', 'Alte Plattform: SSEL nicht entfernt');
  check(!S.model.checkPlatform(S.model.platformOf(back)).length, 'Alte Plattform: Prüfung meldet Fehler');
}

/* Schieberegister als Pin-Erweiterung: Out8 bistabil mit Energy-Storage-Addon
   (2 × 74HC595 an SPI0, Latch IO5, /OE IO15) und in8 24 V (74HC165 per
   Software an IO1/IO2/IO3) */
{
  const save = (name, res) => { if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, name, n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  }); };
  const m = S.model.create();
  const sr = S.model.addNode(m, 'sr595', 0, 0);
  check(sr.props.name === 'SR1' && sr.props.iface === 'spi' && sr.props.port === 'spi0', '595: Vorgaben');
  sr.props.chips = 2;
  check(S.model.pinOptions(m, { fn: 'out' }).filter(x => x.ext).length === 16, '595: 16 Ausgangspins erwartet');
  check(!S.model.pinOptions(m, { fn: 'in' }).some(x => x.ext), '595: Pins sind keine Eingänge');
  check(!S.model.pinOptions(m, { fn: 'out', native: true }).some(x => x.ext), 'native: Schieberegister-Pins angeboten');
  for (let k = 0; k < 8; k++) {
    const r = S.model.addNode(m, 'bistable', 0, 0);
    r.props.coils = 'two';
    r.props.pinOff = `SR1.Q${2 * k}`;      // OFF_n an QA, QC …
    r.props.pinOn = `SR1.Q${2 * k + 1}`;   // ON_n an QB, QD …
    const ko = S.model.addNode(m, 'ko_in', 0, 0);
    S.model.normalize(m);
    m.links.push({ from: [ko.id, 'out'], to: [r.id, 'in'] });
  }
  let res = S.model.resolve(m);
  check(!res.errors.length, 'Out8 hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  let fw = S.firmware.files(res), main = fw['src/app_main.cpp'];
  check(/pinMode\(PIO2_11, OUTPUT \| SPI_CLOCK\);/.test(main), '595: SCK0 nicht an PIO2_11');
  check(/pinMode\(PIO0_9, OUTPUT \| SPI_MOSI\);/.test(main), '595: MOSI fehlt');
  check(new RegExp(`sbsSpiByte\\(LPC_SSP0, 1 << 7, ${sr.id}_q\\[i\\]\\);`).test(main), '595: Senden über SSP0 fehlt');
  check(new RegExp(`if \\(\\w+_pos\\) ${sr.id}_write\\(1, 1\\);`).test(main), 'Relais 1: Ein-Spule nicht an Q1');
  check(new RegExp(`else ${sr.id}_write\\(0, 1\\);`).test(main), 'Relais 1: Aus-Spule nicht an Q0');
  check(/digitalWrite\(PIN_\w+_PINOE, 0\);/.test(main), '595: /OE wird nicht freigegeben');
  check(!/SR1\.Q/.test(fw['src/app_config.h'].replace(/\/\/.*$/gm, '')), 'Schieberegister-Pin als #define');
  save('Out8', res);

  /* zweites Schieberegister bekommt einen freien Namen; Umbenennen nimmt Pins mit */
  const sr2 = S.model.addNode(m, 'sr165', 0, 0);
  check(sr2.props.name === 'SR2' && sr2.props.iface === 'gpio', '165: Vorgaben ' + sr2.props.name + ' ' + sr2.props.iface);
  S.model.renameExpander(m, 'SR1', 'K');
  sr.props.name = 'K';
  check(m.nodes.filter(n => n.type === 'bistable').every(n => /^K\.Q\d+$/.test(n.props.pinOn)), 'Umbenennen: Pins nicht mitgenommen');
  m.nodes = m.nodes.filter(n => n !== sr2);

  /* zwei Blöcke an einem Schieberegister-Pin, NeoPixel teilt SPI0 nicht */
  const d = S.model.addNode(m, 'do', 0, 0);
  d.props.pin = 'K.Q0';
  res = S.model.resolve(m);
  check(res.errors.some(e => /K\.Q0 .*doppelt belegt/.test(e.msg)), 'doppelter Schieberegister-Pin nicht erkannt');
  m.nodes = m.nodes.filter(n => n !== d);
  const np = S.model.addNode(m, 'neopixel', 0, 0);
  np.props.port = 'spi0';
  res = S.model.resolve(m);
  check(res.errors.some(e => /SPI0 doppelt belegt/.test(e.msg)), 'NeoPixel und Schieberegister an SPI0 nicht erkannt');
}
{
  const m = S.model.create();
  const sr = S.model.addNode(m, 'sr165', 0, 0);
  check(sr.props.pinClk === 'IO1' && sr.props.pinData === 'IO2' && sr.props.pinLoad === 'IO3', '165: Pins wie in8 24 V');
  for (let k = 0; k < 8; k++) {
    const di = S.model.addNode(m, 'di', 0, 0);
    di.props.pin = `SR1.Q${k}`;
    const ko = S.model.addNode(m, 'ko_out', 0, 0);
    S.model.normalize(m);
    m.links.push({ from: [di.id, 'out'], to: [ko.id, 'in'] });
  }
  /* dazu ein 595 und ein 165 am selben SPI0: SCK/MOSI geteilt, MISO für einen */
  const o = S.model.addNode(m, 'sr595', 0, 0);
  const i2 = S.model.addNode(m, 'sr165', 0, 0);
  i2.props.iface = 'spi';
  i2.props.pinLoad = 'IO4';
  S.model.freePins(m, i2);
  o.props.pinLatch = 'IO5';
  o.props.oe = 'none';
  const dout = S.model.addNode(m, 'do', 0, 0);
  dout.props.pin = `${o.props.name}.Q3`;
  let res = S.model.resolve(m);
  check(!res.errors.length, 'in8 hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(new RegExp(`v \\|= digitalRead\\(PIN_${sr.id.toUpperCase()}_PINDATA\\) << b;`).test(main), '165: Lesen per Software fehlt');
  check(new RegExp(`debounce\\(\\(${sr.id}_read\\(0\\)\\)`).test(main), 'Digitaleingang liest nicht aus dem 165');
  check(new RegExp(`${i2.id}_q\\[i\\] = sbsSpiByte\\(LPC_SSP0, 0, 0xFF\\);`).test(main), '165 über SPI fehlt');
  check((main.match(/static uint8_t sbsSpiByte/g) || []).length === 1, 'SPI-Hilfsfunktion nicht genau einmal');
  check((main.match(/SPI spi\(SPI_PORT_0/g) || []).length === 1, 'SPI0 nicht genau einmal eingerichtet');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'In8', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  /* zweiter 165 an MISO: QH hat keinen Tristate */
  const i3 = S.model.addNode(m, 'sr165', 0, 0);
  i3.props.iface = 'spi';
  i3.props.pinLoad = 'IO9';
  res = S.model.resolve(m);
  check(res.errors.some(e => /MISO.*doppelt belegt/.test(e.msg)), 'zwei 165 an MISO nicht erkannt');
}

/* Out8 mit Energy Storage: /G als PWM nach der Speicherspannung, Kette über
   MISO zurückgelesen, Relais warten auf ausreichende Spannung */
{
  const ex = S.examples.find(e => e.name === 'Out8 Energy Storage');
  const m = S.model.parse(JSON.stringify(ex.model));
  let res = S.model.resolve(m);
  check(!res.errors.length, 'Out8 ES hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(/timer32_0\.prescaler\(0\);\n\s*timer32_0\.matchMode\(TIMER_MATCH_MAT2, RESET\);\n\s*timer32_0\.match\(TIMER_MATCH_MAT2, SystemCoreClock \/ 20000 - 1\);/.test(main), '/OE-PWM: Timer nicht eingerichtet');
  check(/timer32_0\.match\(TIMER_MATCH_MAT0, n3_duty \* \(SystemCoreClock \/ 20000\) \/ 255\);/.test(main), '/OE-PWM: Vergleichswert falsch');
  check(/static int32_t n3_duty = 0;/.test(main), '/OE-PWM: verbunden muss mit 0 (aus) starten');
  check(/n3_send\(\);\n\s*n3_oe\(\);\n\s*pinMode\(PIN_N3_PINOE, OUTPUT_MATCH\);\n\s*timer32_0\.pwmEnable\(TIMER_MATCH_MAT0\);/.test(main), '/OE-PWM: erst senden, dann freigeben');
  check(/digitalWrite\(PIN_N3_PINOE, 1\); \/\/ Ausgänge aus bis zum Start/.test(main), '/OE: beim Start nicht aus');
  check(/pinMode\(PIO0_8, INPUT \| SPI_MISO\);/.test(main), 'Kettenprüfung: MISO nicht eingerichtet');
  check(/uint8_t rx = sbsSpiByte\(LPC_SSP0, 1 << 7, n3_q\[i\]\);\n\s*if \(rx != n3_sent\[i\]\) bad = true;/.test(main), 'Kettenprüfung: Vergleich fehlt');
  check(/n4_in_in\(bad\);/.test(main), 'Kettenfehler geht nicht ans KO');
  /* Die acht Kanäle teilen sich den Code (eine Struktur, acht Instanzen) */
  const relays = res.nodes.filter(r => r.def.type === 'bistable').map(r => r.node.id);
  const ch = res.nodes.find(r => r.def.type === 'bistable').node.id.replace(/^n\d+_/, 'm_');
  check(relays.length === 8 && /^struct S\d+_Schaltkanal$/m.test(main) && /static S\d+_Schaltkanal S\d+_Schaltkanal_i\[8\];/.test(main),
        'Kanäle teilen sich den Code nicht');
  check(main.includes(`bool ${ch}_en = false;`) && main.includes(`&& ${ch}_en && !sbsCoilBusy`), 'Relais wartet nicht auf die Freigabe');
  check(/static const uint8_t S\d+_Schaltkanal_bit_\w+_pinOn\[8\] = \{ 1, 3, 5, 7, 9, 11, 13, 15 \};/.test(main), 'Relais-Pins je Kanal falsch');
  check(/bcu\.enableGroupTelSend\(!low\);/.test(main) && /static const uint8_t S\d+_Schaltkanal_ps_\w+\[8\] = \{ 0, 1, 2, 3, 4, 5, 6, 7 \};/.test(main) &&
        /#define SBS_PERSIST_SLOTS 8/.test(S.firmware.files(res)['src/app_config.h']), 'Busspannungsausfall: Speicher je Kanal fehlt');
  check(/n3_in_en\(v\);/.test(main) && main.includes(`${ch}_in_en(v)`), 'Spannungsausgleich (Makro) nicht verbunden');
  /* wie ABB SA/S 8.16.2.1: KO-Nummern, Kanäle A–H mit Unterseiten */
  const nums = res.kos.map(k => k.number);
  const want = [0, 1, 2, 3, 4].concat(...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 19].map(o => 10 + 20 * k + o)));
  check(nums.join() === want.join(), 'Out8 ES: KO-Nummern nicht wie ABB: ' + nums.join());
  /* Schwellwert 1 oder 2 Byte: ein Objekt, zwei Refs; Firmware fragt den Datentyp ab */
  const k21 = res.kos.filter(k => k.number === 21);
  check(k21.length === 2 && k21.map(k => k.dpt.size).join() === '1 Byte,2 Bytes' &&
        (xml0 => (xml0.match(/<ComObject [^>]*Number="21"/g) || []).length === 1 && /<ComObjectRef Id="[^"]+_O-21_R-10021" [^>]*ObjectSize="2 Bytes"/.test(xml0))(S.knxprod.application(res, S.knxprod.NS_DEFAULT)),
        'Out8 ES: Schwellwerteingang 1/2 Byte nicht als ein Objekt');
  check(/case KO_\w+:\n\s*if \(\(S\d+_Schaltkanal_i\[0\]\.m_\w+_p_sel == 1\) && \(S\d+_Schaltkanal_i\[0\]\.m_\w+_p_sel == 0\)\)/.test(main),
        'Out8 ES: Varianten einer KO-Nummer ohne Abfrage des Datentyps');
  check(res.kos.find(k => k.number === 160).def.text === 'Ausgang H: Sicherheit: Zwangsführung' && res.kos.find(k => k.number === 29).def.text === 'Ausgang A: Status Schalten', 'Out8 ES: KO-Namen');
  const xml = S.knxprod.application(res, S.knxprod.NS_DEFAULT);
  check((xml.match(/<Channel /g) || []).length === 8 && /<Channel [^>]*Text="Ausgang H">/.test(xml), 'Out8 ES: acht Kanäle');
  ['Zeit', 'Szene', 'Logik', 'Sicherheit', 'Schwellwert'].forEach(p =>
    check((xml.match(new RegExp(`<ParameterBlock [^>]*Text="${p}">`, 'g')) || []).length === 8, `Out8 ES: Unterseite ${p} nicht je Kanal`));
  check(!/<Channel [^>]*Text="12-V-Relais"/.test(xml), 'Out8 ES: Spannungsausgleich als Kanal');
  /* 32-Bit-Parameter (Rechnen mit festem Operanden) über KNX einstellbar */
  {
    const q = S.model.create();
    const mt = S.model.addNode(q, 'math', 0, 0);
    mt.props.fixed = 'a';
    S.model.normalize(q);
    check(/static int32_t paramI32\(uint32_t offset\)/.test(S.firmware.files(S.model.resolve(q))['src/app_main.cpp']), '32-Bit-Parameter: Lesefunktion fehlt');
  }
  check(res.errors.length === 0 && res.pins.some(p => p.name === 'IO6' && p.gpio === 'PIO0_8') === false, 'MISO als Pin statt als Bus belegt');
  /* MISO gehört dem 595: ein 165 am selben SPI geht nicht mehr */
  const i = S.model.addNode(m, 'sr165', 0, 0);
  i.props.iface = 'spi';
  i.props.pinLoad = 'IO4';
  check(S.model.resolve(m).errors.some(e => /MISO.*doppelt belegt/.test(e.msg)), '595 mit Kettenprüfung und 165 an MISO nicht erkannt');
  m.nodes.pop();
  /* PWM-Ausgang auf demselben Timer: der gehört dem Schieberegister */
  const pw = S.model.addNode(m, 'pwm', 0, 0);
  pw.props.pin = 'IO14';    // PIO1_7 = CT32B0_MAT1
  check(S.model.resolve(m).errors.some(e => /Timer timer32_0 doppelt belegt/.test(e.msg)), 'PWM am Timer der /OE-PWM nicht erkannt');
  m.nodes.pop();
  /* Rücklesen per Software, /OE als Pin */
  const sr = m.nodes.find(n => n.type === 'sr595');
  sr.props.iface = 'gpio'; sr.props.oe = 'pin';
  S.model.normalize(m);
  m.links = m.links.filter(l => l.to[1] !== 'en' || l.to[0] !== sr.id);
  res = S.model.resolve(m);
  check(!res.errors.length, 'Out8 ES per GPIO hat Fehler: ' + res.errors.map(e => e.msg).join('; '));
  const g = S.firmware.files(res)['src/app_main.cpp'];
  check(/rx \|= digitalRead\(PIN_N3_PINBACK\) << b;/.test(g), 'Rücklesen per Software fehlt');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'Out8EsGpio', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
  /* frühere Modelle: /OE als Schalter */
  const old = JSON.parse(JSON.stringify(ex.model));
  old.nodes.find(n => n.type === 'sr595').props.oe = true;
  check(S.model.parse(JSON.stringify(old)).nodes.find(n => n.type === 'sr595').props.oe === 'pin', '/OE true nicht zu „pin“ übernommen');
  /* Freigabe am Relais: früher optionaler Eingang, jetzt Eigenschaft */
  const um = S.model.create();
  const ub = S.model.addNode(um, 'bistable', 0, 0), uk = S.model.addNode(um, 'ko_in', 0, 0);
  ub.props.useEn = true;
  S.model.normalize(um);
  um.links.push({ from: [uk.id, 'out'], to: [ub.id, 'en'] });
  const ou = JSON.parse(S.model.serialize(um));
  delete ou.nodes.find(n => n.type === 'bistable').props.useEn;
  const om = S.model.parse(JSON.stringify(ou));
  check(om.nodes.find(n => n.type === 'bistable').props.useEn === true && om.links.filter(l => l.to[1] === 'en').length === 1, 'Freigabe-Verbindungen nicht übernommen');
  const fm = S.model.create();
  const rb = S.model.addNode(fm, 'bistable', 0, 0);
  check(!S.model.resolve(fm).byId.get(rb.id).inputs.some(p => p.id === 'en'), 'Freigabe-Eingang ohne Eigenschaft sichtbar');
  check(/static bool n1_en = true;/.test(S.firmware.files(S.model.resolve(fm))['src/app_main.cpp']), 'ohne Freigabe-Eingang muss das Relais frei sein');
  rb.props.useEn = true;
  S.model.normalize(fm);
  check(S.model.resolve(fm).warnings.some(w => /Freigabe.*nicht verbunden/.test(w.msg)), 'offene Freigabe nicht gemeldet');
}

/* Notizen und Beschreibungen: Markdown, Makro-Beschreibung als Notiz, kein Code */
{
  const md = S.markdown.render;
  check(md('# Titel\n\n**fett** und *kursiv*, `a<b`') === '<h1>Titel</h1>\n<p><strong>fett</strong> und <em>kursiv</em>, <code>a&lt;b</code></p>', 'Markdown: Grundformate ' + md('# Titel\n\n**fett** und *kursiv*, `a<b`'));
  check(md('- a\n- b\n\n1. x\n2. y') === '<ul><li>a</li><li>b</li></ul>\n<ol><li>x</li><li>y</li></ol>', 'Markdown: Listen');
  check(!/<script|<img/.test(md('<script>alert(1)</script> <img src=x>')), 'Markdown: HTML nicht maskiert');
  check(!/href/.test(md('[x](javascript:alert(1))')) && /href="https:\/\/selfbus.org"/.test(md('[S](https://selfbus.org)')), 'Markdown: Links');
  check(md('Zeile 1  \nZeile 2\nweiter') === '<p>Zeile 1<br>Zeile 2 weiter</p>', 'Markdown: Zeilenumbruch ' + md('Zeile 1  \nZeile 2\nweiter'));
  check(S.markdown.plain('**A** *b* `c` [d](https://x)') === 'A b c d', 'Markdown: reiner Text');

  /* altes Makro mit Beschreibung: bekommt die Notiz, Text bleibt gleich */
  const m = S.model.create();
  const mac = S.model.createMacro(m, 'K');
  mac.help = 'Alt **beschrieben**';
  delete mac.helpNote;
  const p = S.model.parse(S.model.serialize(m));
  const note = p.macros[0].nodes.find(n => n.type === 'note');
  check(note && note.props.desc && note.props.text === 'Alt **beschrieben**' && p.macros[0].help === 'Alt **beschrieben**', 'Makro-Beschreibung nicht als Notiz übernommen');
  note.props.text = 'Neu';
  S.model.normalize(p);
  check(p.macros[0].help === 'Neu', 'Makro-Beschreibung folgt der Notiz nicht');
  S.model.helpNote(p.macros[0], 'Aus dem Eigenschaftenfenster');
  check(note.props.text === 'Aus dem Eigenschaftenfenster' && p.macros[0].nodes.filter(n => n.type === 'note').length === 1, 'helpNote legt eine zweite Notiz an');
  /* Notiz erzeugt keinen Code, Instanz und Gerät bleiben fehlerfrei */
  S.model.addMacro(p, mac.id, 0, 0);
  S.model.addNode(p, 'note', 0, 0);
  const sc = S.model.addNode(p, 'script', 0, 0);
  sc.props.desc = 'Rechnet **etwas**\nzweite Zeile */ Ende';
  const res = S.model.resolve(p);
  check(!res.errors.length, 'Notizen: Fehler ' + res.errors.map(e => e.msg).join('; '));
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(!/Notiz/.test(main.replace(/\/\/.*$/gm, '')), 'Notiz erzeugt Code');
  check(/\/\*\n \* Rechnet \*\*etwas\*\*\n \* zweite Zeile \* \/ Ende\n \*\//.test(main), 'Skript-Beschreibung fehlt als Kommentar');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'Notizen', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
}

/* Debug-Ausgabe: UART am SB-Debug belegt ISP-TXD (IO14), RTT keinen Pin;
   CMake schaltet SBS_DEBUG im Debug-Build ein */
['uart', 'rtt'].forEach(kind => {
  const M = S.model, m = M.create();
  const i = M.addNode(m, 'ko_in', 0, 0), d = M.addNode(m, 'debug', 200, 0);
  d.props.out = kind; d.props.names = 'Wert\nZweiter';
  M.normalize(m);
  m.links.push({ from: [i.id, 'out'], to: [d.id, 'i0'] }, { from: [i.id, 'out'], to: [d.id, 'i1'] });
  const res = M.resolve(m);
  check(!res.errors.length, `Debug ${kind}: ` + res.errors.map(e => e.msg).join('; '));
  check(!res.warnings.some(w => /als Zahl gelesen/.test(w.msg)), `Debug ${kind}: Warnung bool → Zahl`);
  const f = S.firmware.files(res), main = f['src/app_main.cpp'];
  check(/add_compile_definitions\(\$<\$<OR:\$<CONFIG:Debug>,\$<BOOL:\$\{SBS_DEBUG\}>>:SBS_DEBUG>\)/.test(f['CMakeLists.txt']), `Debug ${kind}: CMake ohne SBS_DEBUG`);
  check(kind === 'uart' ? /serial\.setTxPin\(PIO1_7\);/.test(main) : /sbsRttInit\(\);/.test(main), `Debug ${kind}: Ausgabe nicht eingerichtet`);
  /* IO14 ist dann belegt */
  if (kind === 'uart') {
    const o = M.addNode(m, 'do', 0, 200); o.props.pin = 'IO14'; M.normalize(m);
    check(M.resolve(m).errors.some(e => /doppelt belegt/.test(e.msg)), 'Debug uart: IO14 nicht als belegt erkannt');
  }
  if (out) Object.entries(f).forEach(([n, x]) => {
    const file = path.join(out, 'Debug-' + kind, n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });
});

/* KO-Varianten: gleiche Nummer nur, wenn eine Parameterauswahl sie ausschließt */
{
  const M = S.model, m = M.create();
  const opt = M.addNode(m, 'option', 0, 0); opt.props.choices = 'klein\ngroß';
  const a = M.addNode(m, 'ko_in', 0, 100), b = M.addNode(m, 'ko_in', 0, 200), c = M.addNode(m, 'ko_in', 0, 300);
  a.props.dpt = '5.010'; b.props.dpt = '7.001';
  M.normalize(m);
  a.when = { on: opt.id, values: [0] }; b.when = { on: opt.id, values: [1] };
  a.kos.obj = 5; b.kos.obj = 5; c.kos.obj = 6;
  M.normalize(m);
  let res = M.resolve(m);
  check(!res.errors.length && a.kos.obj === 5 && b.kos.obj === 5, 'KO-Varianten: gleiche Nummer abgelehnt ' + res.errors.map(e => e.msg).join('; '));
  check(res.layout.objects.find(o => o.number === 5).alts.length === 2, 'KO-Varianten: nicht in einem Objekt');
  const ram = res.layout.objects.map(o => o.ram);
  check(ram[6] - ram[5] === 2, 'KO-Varianten: Platz nicht für die größte');
  c.kos.obj = 5; M.normalize(m);
  check(c.kos.obj !== 5, 'KO-Varianten: Nummer ohne Ausschluss doppelt vergeben');
}

/* ETS-Kanäle und Sichtbarkeit: Makro-Instanz = Kanal, ETS-Auswahl blendet
   Parameter und KOs mit choose/when ein; fest eingestellt entscheidet sie
   schon beim Erzeugen */
{
  const M = S.model, m = M.create();
  const mac = M.createMacro(m, 'Kanal'), v = M.macroView(m, mac.id);
  const sw = M.addNode(v, 'ko_in', 0, 0), opt = M.addNode(v, 'option', 0, 100);
  const st = M.addNode(v, 'staircase', 200, 0), rl = M.addNode(v, 'relay', 400, 0);
  sw.props.name = 'Schalten';
  opt.props.name = 'Treppenlicht verwenden';
  st.when = { on: opt.id, values: [1] };
  v.links.push({ from: [sw.id, 'out'], to: [st.id, 'trig'] }, { from: [st.id, 'out'], to: [rl.id, 'in'] });
  /* Hilfsmakro ohne eigenen Kanal, Untermakro mit eigener Seite */
  const help = M.createMacro(m, 'Hilfe'), hv = M.macroView(m, help.id);
  M.addNode(hv, 'threshold', 0, 0);
  help.channel = false;
  const sub = M.createMacro(m, 'Zusatz'), sv = M.macroView(m, sub.id);
  M.addNode(sv, 'start', 0, 0);
  M.addMacro(v, help.id, 0, 300);
  M.addMacro(v, sub.id, 0, 400);
  M.normalize(m);
  const top = M.addNode(m, 'option', 0, -200);
  top.props.name = 'Kanal 2 verwenden';
  const k1 = M.addMacro(m, mac.id, 0, 0), k2 = M.addMacro(m, mac.id, 0, 300), k3 = M.addMacro(m, mac.id, 0, 600);
  k1.label = 'Kanal 1'; k2.label = 'Kanal 2'; k3.label = 'Kanal 3';
  k2.when = { on: top.id, values: [1] };
  /* Kanal 3: Treppenlicht fest aus – Auswahl und Treppenlicht fehlen in der ETS */
  k3.inner[opt.id].fixed = { sel: true };
  k3.inner[opt.id].params = { sel: 0 };
  M.normalize(m);
  const p = M.parse(M.serialize(m));
  check(p.macros[0].nodes.find(n => n.id === st.id).when.on === opt.id && p.nodes.find(n => n.id === k2.id).when.values.join() === '1', 'Sichtbarkeit nicht gespeichert');
  check(p.macros.find(x => x.id === help.id).channel === false, 'Makro ohne Kanal nicht gespeichert');
  const res = M.resolve(p);
  check(!res.errors.length, 'Sichtbarkeit: Fehler ' + res.errors.map(e => e.msg).join('; '));
  const ets = res.params.filter(x => !x.fixed);
  const ref = (node, pid) => { const k = ets.findIndex(x => x.r.node.id === node && x.def.id === pid); return k < 0 ? null : `_P-${k + 1}_R-${k + 1}"`; };
  const xml = S.knxprod.application(res, S.knxprod.NS_DEFAULT);
  const dyn = xml.slice(xml.indexOf('<Dynamic>'), xml.indexOf('</Dynamic>'));
  const chan = name => { const a = dyn.indexOf(`Text="${name}">`); return a < 0 ? '' : dyn.slice(a, dyn.indexOf('</Channel>', a)); };
  check((dyn.match(/<choose /g) || []).length === (dyn.match(/<\/choose>/g) || []).length &&
        (dyn.match(/<when /g) || []).length === (dyn.match(/<\/when>/g) || []).length, 'Sichtbarkeit: choose/when nicht geschlossen');
  check(/<Channel Id="[^"]+_CH-1" Name="Ch1" Number="1" Text="Kanal 1">/.test(dyn) && chan('Kanal 2') && chan('Kanal 3'), 'Instanzen nicht als Kanäle');
  check(/<ChannelIndependentBlock>[\s\S]*Text="Allgemein"[\s\S]*<\/ChannelIndependentBlock>/.test(dyn) && dyn.indexOf(ref(top.id, 'sel')) < dyn.indexOf('<Channel '), 'Auswahl auf Geräteebene nicht auf „Allgemein“');
  const c1 = chan('Kanal 1');
  const sel1 = ref(`${k1.id}_${opt.id}`, 'sel'), time1 = ref(`${k1.id}_${st.id}`, 'time');
  check(new RegExp(`<choose ParamRefId="[^"]+${sel1.slice(0, -1)}">\\s*<when test="1">\\s*<ParameterSeparator [^>]*Text="Treppenlicht" />\\s*<ParameterRefRef RefId="[^"]+${time1}`).test(c1),
        'Treppenlicht nicht an die Auswahl gebunden:\n' + c1);
  check(c1.indexOf(sel1) < c1.indexOf('<choose'), 'Auswahl steht nicht vor dem, was sie steuert');
  check(/Text="Hilfe: Schwellwert"/.test(c1) && !/<ParameterBlock [^>]*Text="Hilfe"/.test(c1), 'Hilfsmakro ohne Kanal nicht auf der Seite darüber');
  check(/<ParameterBlock [^>]*Text="Zusatz">/.test(c1), 'Untermakro ohne eigene Seite');
  const c2 = chan('Kanal 2');
  check(new RegExp(`^[^>]*>\\s*<choose ParamRefId="[^"]+${ref(top.id, 'sel').slice(0, -1)}">\\s*<when test="1">\\s*<ParameterBlock`).test(c2) ||
        new RegExp(`<choose ParamRefId="[^"]+${ref(top.id, 'sel').slice(0, -1)}">\\s*<when test="1">`).test(c2), 'Kanal 2 nicht an die Geräte-Auswahl gebunden');
  check(/<when test="1">\s*<ParameterBlock [^>]*Text="Kanal 2">\s*<ParameterRefRef [^>]*\/>\s*<ComObjectRefRef [^>]*\/>\s*<choose /.test(c2) || /<when test="1">\s*<ParameterBlock [^>]*Text="Kanal 2">[\s\S]*<choose /.test(c2), 'Kanal 2: Seite nicht an die Auswahl gebunden oder Bedingungen nicht verschachtelt:\n' + c2);
  const c3 = chan('Kanal 3');
  check(!ref(`${k3.id}_${opt.id}`, 'sel') && !c3.includes(ref(`${k3.id}_${st.id}`, 'time')) && !/Text="Treppenlicht"/.test(c3) && /Text="Hilfe: Schwellwert"/.test(c3),
        'Kanal 3: fest abgewählter Teil steht in der ETS:\n' + c3);
  /* KO in einer Bedingung: Schalten steht in jedem Kanal ohne */
  check(/<ComObjectRefRef /.test(c1), 'Kanal 1 ohne KO');
  /* Firmware: Auswahl liefert ihren Wert */
  const main = S.firmware.files(res)['src/app_main.cpp'];
  check(new RegExp(`int32_t out = ${k1.id}_${opt.id}_p_sel;`).test(main) && /int32_t out = 0;/.test(main), 'ETS-Auswahl gibt ihren Wert nicht aus');
  if (out) Object.entries(S.firmware.files(res)).forEach(([n, x]) => {
    const file = path.join(out, 'Sichtbarkeit', n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, x);
  });

  /* Kreis: zwei Auswahlen sichtbar nur über die jeweils andere */
  const q = M.create();
  const a = M.addNode(q, 'option', 0, 0), b = M.addNode(q, 'option', 0, 100);
  a.when = { on: b.id, values: [1] }; b.when = { on: a.id, values: [1] };
  M.normalize(q);
  check(M.resolve(q).errors.some(e => /im Kreis/.test(e.msg)), 'Kreis in der Sichtbarkeit nicht erkannt');
  /* gelöschte Auswahl: Bindung fällt weg */
  M.removeNode(q, a.id);
  M.normalize(q);
  check(!b.when, 'Bindung an gelöschte Auswahl bleibt');
  /* Instanz auflösen: Bindung zeigt auf die neue Kennung, Instanz-Bindung geht an die übrigen */
  const ex = M.parse(M.serialize(m));
  const added = M.explode(ex, k2.id);
  const nst = added.find(n => n.type === 'staircase'), nopt = added.find(n => n.type === 'option'), nsw = added.find(n => n.type === 'ko_in');
  check(nst.when.on === nopt.id && nsw.when.on === top.id, 'Auflösen: Sichtbarkeit nicht übernommen');
  M.normalize(ex);
  check(!M.resolve(ex).errors.length, 'Auflösen mit Sichtbarkeit: Fehler');
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
  di.props.pin = 'IO5';   // PIO0_2 (früher SSEL0) ist ein normaler Pin
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
/* Auswahl als Makro übernehmen: gleiche Firmware-Logik, KO-Nummern und
   Pins bleiben; eine Quelle für zwei Eingänge wird ein Port, ein Ausgang
   zu zwei Zielen auch */
{
  const M = S.model, p = M.create();
  const add = (type, props) => { const n = M.addNode(p, type, 0, 0); Object.assign(n.props, props || {}); return n; };
  const key = add('ko_in', { name: 'Taste' }), lock = add('ko_in', { name: 'Sperre' });
  const tg = add('toggle'), gate = add('gate'), st = add('ko_out', { name: 'Status' }), rl = add('relay', { pin: 'IO5' });
  const fb = add('ko_out', { name: 'Rückmeldung' }), led = add('do', { pin: 'IO4' });
  tg.x = 200; gate.x = 400; st.x = 600; st.y = 100;
  M.normalize(p);
  const L = (a, ap, b, bp) => p.links.push({ from: [a.id, ap], to: [b.id, bp] });
  L(key, 'out', tg, 'trig'); L(tg, 'out', gate, 'in'); L(lock, 'out', gate, 'ctl'); L(gate, 'out', st, 'in');
  L(gate, 'out', rl, 'in'); L(gate, 'out', fb, 'in'); L(gate, 'out', led, 'in'); L(key, 'out', tg, 'set');
  M.normalize(p);
  const before = M.resolve(p);
  const kosBefore = before.kos.map(k => k.number + ':' + k.def.text).sort();
  const pinsBefore = before.pins.map(x => x.name).sort();
  const c = M.collapse(p, [tg.id, gate.id, st.id, rl.id]);
  M.normalize(p);
  const after = M.resolve(p);
  check(!after.errors.length, 'nach Übernahme Fehler: ' + after.errors.map(e => e.msg).join('; '));
  check(JSON.stringify(after.kos.map(k => k.number + ':' + k.def.text.replace(/^[^:]*: /, '')).sort()) === JSON.stringify(kosBefore),
    'KO-Nummern geändert: ' + after.kos.map(k => k.number + ':' + k.def.text));
  check(JSON.stringify(after.pins.map(x => x.name).sort()) === JSON.stringify(pinsBefore), 'Pins geändert');
  const r = after.view.byId.get(c.inst.id);
  check(r && r.inputs.length === 2 && r.outputs.length === 1, 'Ports der Übernahme: ' + (r && [r.inputs.length, r.outputs.length]));
  check(p.links.filter(l => l.from[0] === c.inst.id).length === 2, 'Ausgang nicht an beide Ziele');
  check(c.macro.links.filter(l => c.macro.nodes.find(n => n.id === l.from[0]).type === 'macro_in').length === 3, 'Taste nicht an beide Eingänge');
  check(!after.warnings.some(w => /nicht verbunden/.test(w.msg)), 'Übernahme lässt Eingänge offen: ' + after.warnings.map(w => w.msg));
  const fn = res => S.firmware.files(res)['src/app_main.cpp'].split('\n').filter(l => /^static void n[\d_n]+_in_/.test(l) && !/;$/.test(l)).length;
  check(fn(after) === fn(before) + 3, 'Firmware: Anzahl Eingangsfunktionen ' + fn(before) + ' → ' + fn(after));

  /* Auflösen: wieder dasselbe Gerät, nur mit neuen Block-Kennungen */
  const linksBefore = 8;
  const added = M.explode(p, c.inst.id);
  M.normalize(p);
  const back = M.resolve(p);
  check(added && added.length === 4 && !p.nodes.some(n => n.type === 'macro'), 'Auflösen: Blöcke ' + (added && added.length));
  check(!back.errors.length, 'nach Auflösen Fehler: ' + back.errors.map(e => e.msg).join('; '));
  check(p.links.length === linksBefore, 'Auflösen: Verbindungen ' + p.links.length);
  check(JSON.stringify(back.kos.map(k => k.number + ':' + k.def.text).sort()) === JSON.stringify(kosBefore),
    'Auflösen: KOs ' + back.kos.map(k => k.number + ':' + k.def.text));
  check(JSON.stringify(back.pins.map(x => x.name).sort()) === JSON.stringify(pinsBefore), 'Auflösen: Pins');
  check(fn(back) === fn(before), 'Auflösen: Firmware ' + fn(before) + ' → ' + fn(back));
  check(M.macroOf(p, c.macro.id), 'Auflösen löscht die Definition');
}

/* Auflösen mit Instanz-Einstellungen, durchgereichtem Wert und verschachteltem Makro */
{
  const M = S.model, p = M.create();
  const inner = M.createMacro(p, 'Innen');
  const iv = M.macroView(p, inner.id);
  const [ii, io] = iv.nodes;
  const nt = M.addNode(iv, 'not', 200, 60);
  iv.links.push({ from: [ii.id, 'out'], to: [nt.id, 'in'] }, { from: [nt.id, 'out'], to: [io.id, 'in'] });
  const outer = M.createMacro(p, 'Außen');
  const ov = M.macroView(p, outer.id);
  const [oi, oo] = ov.nodes;
  const sub = M.addMacro(ov, inner.id, 200, 0);
  const pass = M.addNode(ov, 'macro_out', 420, 200); pass.props.name = 'Durch';
  ov.links.push({ from: [oi.id, 'out'], to: [sub.id, ii.id] }, { from: [sub.id, io.id], to: [oo.id, 'in'] },
                { from: [oi.id, 'out'], to: [pass.id, 'in'] });
  M.normalize(p);
  const a = M.addNode(p, 'ko_in', 0, 0), inst = M.addMacro(p, outer.id, 300, 0);
  const b = M.addNode(p, 'ko_out', 600, 0), d = M.addNode(p, 'do', 600, 200);
  p.links.push({ from: [a.id, 'out'], to: [inst.id, oi.id] }, { from: [inst.id, oo.id], to: [b.id, 'in'] },
               { from: [inst.id, pass.id], to: [d.id, 'in'] });
  M.normalize(p);
  const before = M.resolve(p);
  check(!before.errors.length, 'verschachtelt: ' + before.errors.map(e => e.msg));
  const fw = res => S.firmware.files(res)['src/app_main.cpp'].split('\n').filter(l => /^static void n[\d_n]+_in_/.test(l) && !/;$/.test(l)).length;
  M.explode(p, inst.id);
  M.normalize(p);
  const mid = M.resolve(p);
  check(!mid.errors.length, 'aufgelöst: ' + mid.errors.map(e => e.msg));
  check(p.nodes.filter(n => n.type === 'macro').length === 1, 'innere Instanz bleibt eine Instanz');
  check(p.links.some(l => l.from[0] === a.id && l.to[0] === d.id), 'Durchgereichter Wert nicht direkt verbunden');
  check(fw(mid) === fw(before) - 3, 'Firmware nach Auflösen: ' + fw(before) + ' → ' + fw(mid));

  /* Bibliothek: Außen samt Innen in ein anderes Projekt */
  const entry = JSON.parse(JSON.stringify(M.packMacro(p, outer.id)));
  check(entry.macros.length === 2 && entry.macros[0].name === 'Außen', 'Eintrag: ' + entry.macros.map(m => m.name));
  check(M.sameMacro(p, outer.id, entry), 'Eintrag gleicht dem Makro nicht');
  const q = M.create();
  M.createMacro(q, 'Schon da');
  const got = M.unpackMacro(q, entry);
  check(got && got.name === 'Außen' && q.macros.length === 3, 'Entpacken: ' + q.macros.map(m => m.id + m.name));
  const sub2 = got.nodes.find(n => n.type === 'macro');
  check(sub2 && M.macroOf(q, sub2.props.macro).name === 'Innen', 'Verweis auf Innen falsch umgeschrieben');
  check(M.sameMacro(q, got.id, entry), 'entpackt gleicht dem Eintrag nicht');
  M.unpackMacro(q, entry);
  check(q.macros.length === 3, 'zweites Entpacken legt neu an: ' + q.macros.length);
  got.name = 'Geändert';
  check(!M.sameMacro(q, got.id, entry), 'Änderung nicht erkannt');
  M.unpackMacro(q, entry, true);
  check(got.name === 'Außen' && q.macros.length === 3, 'Stand laden: ' + got.name);
  const qi = M.addMacro(q, got.id, 0, 0);
  M.normalize(q);
  check(!M.resolve(q).errors.length && qi._m === got, 'Instanz aus der Bibliothek');
  let bad = null;
  try { M.unpackMacro(q, { format: 'x' }); } catch (e) { bad = e; }
  check(bad, 'falsche Datei nicht abgelehnt');
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
