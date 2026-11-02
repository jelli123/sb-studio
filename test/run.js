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
['blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples'].forEach(f =>
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

/* Jede MCU: Beispiele gültig, Flash endet vor dem UserEeprom-Sektor */
for (const [id, mcu] of Object.entries(S.blocks.MCU)) {
  console.log('MCU', id);
  S.examples.forEach(ex => {
    const m = S.model.parse(JSON.stringify(ex.model));
    m.device.mcu = id;
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
/* ZIP lesen und schreiben */
(async () => {
  const z = S.zip.write({ 'a.txt': 'hallo', 'b/c.xml': '<x/>' });
  const got = await S.zip.read(z, n => n === 'b/c.xml');
  check(new TextDecoder().decode(got) === '<x/>', 'ZIP-Eintrag falsch gelesen');
  console.log(failed ? `\n${failed} Fehler` : '\nAlle Tests bestanden');
  process.exit(failed ? 1 : 0);
})();
