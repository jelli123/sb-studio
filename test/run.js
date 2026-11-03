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
