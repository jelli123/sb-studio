/* Baut das Beispiel „Out8 Energy Storage“ nach dem Vorbild der ABB-
 * Applikation SA/S 8.16.2.1 (Switch 8f 16A/3.2b), die die Selfbus-Firmware
 * out-cs-bim112 nachbildet, und schreibt es in js/examples.js (zwischen den
 * Markierungen BEGIN/END out8).
 *
 *   node tools/build-out8-example.js
 *
 * Aufbau wie bei ABB: Seite „Allgemein“ (In Betrieb, Sicherheit Priorität
 * 1–3 mit Überwachung), je Ausgang A–H ein Kanal mit Unterseiten Zeit,
 * Szene, Logik, Sicherheit, Schwellwert; KO-Nummern wie dort (Ausgang k ab
 * 10 + 20·k). Das Makro „Spannungsausgleich“ wird aus dem bisherigen
 * Beispiel übernommen.                                                   */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
global.window = global;
global.SBS = {};
['i18n', 'markdown', 'blocks', 'model', 'examples'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = global.SBS, M = S.model;
const NAME = 'Out8 Energy Storage';
const old = S.examples.find(e => e.name === NAME).model;

const m = M.create();
Object.assign(m.device, old.device);
const copy = x => JSON.parse(JSON.stringify(x));
m.macros.push(copy(old.macros.find(x => x.name === 'Spannungsausgleich')));
M.normalize(m);

/* Block in einem Graphen anlegen: Eigenschaften, dann Parameter (die von
   den Eigenschaften abhängen können) */
function add(g, type, x, y, o = {}) {
  const n = M.addNode(g, type, x, y);
  Object.assign(n.props, o.props || {});
  if (o.label) n.label = o.label;
  M.normalize(m);
  Object.assign(n.params, o.params || {});
  if (o.fixed) o.fixed.forEach(p => { n.fixed[p] = true; });
  if (o.when) n.when = { on: o.when[0].id, values: o.when.slice(1) };
  return n;
}
const link = (g, a, ap, b, bp) => g.links.push({ from: [a.id, ap], to: [b.id, bp] });
const option = (g, x, y, name, choices, label, o = {}) =>
  add(g, 'option', x, y, Object.assign({ label, props: { name, choices: choices.join('\n') } }, o));
const YN = ['nein', 'ja'];

/* Makro mit Ein- und Ausgängen [Name, Typ, optional] */
function macro(name, ins, outs, help) {
  const mac = M.createMacro(m, name);
  const v = M.macroView(m, mac.id);
  const [mi, mo] = v.nodes;
  M.removeNode(v, mi.id); M.removeNode(v, mo.id);
  const pin = {}, out = {};
  ins.forEach(([n, t, opt], k) => { pin[n] = add(v, 'macro_in', 0, 60 + 120 * k, { props: { name: n, vtype: t, optional: !!opt } }); });
  outs.forEach(([n, t], k) => { out[n] = add(v, 'macro_out', 1500, 60 + 120 * k, { props: { name: n, vtype: t } }); });
  if (help) M.helpNote(mac, help);
  return { mac, v, pin, out };
}

/* ---------- Unterseiten ---------- */

const zeit = macro('Zeit', [['Wert', 'bool']], [['Wert', 'bool']],
  '**Funktion Zeit** (ABB „A: Zeit“)\n\n- Funktion Zeit: Treppenlicht, Ein-/Ausschaltverzögerung oder Blinken; die Auswahl schaltet Parameter und Weg um.\n- **Dauer-EIN** übersteuert als Priorität (ein, danach normaler Wert).\n- Treppenlicht: Warnung vor Ablauf (Objekt „Warnung Treppenlicht“ und/oder kurzes Aus), Verlängern durch Neustart oder Aufpumpen, Laufzeit über das Objekt „Dauer Treppenlicht“.\n- Blinken: Anzahl Ein-Impulse und Zustand danach.\n- **Zeitfunktion sperren** (Objekt): bei 1 geht der Wert an der Zeitfunktion vorbei.\n- Treppenlicht nach Ende von Dauer-EIN neu starten: die fallende Flanke von Dauer-EIN startet die Laufzeit.');
{
  const { v, pin } = zeit;
  const f = option(v, 220, -120, 'Funktion Zeit', ['Treppenlichtfunktion', 'Ein- und Ausschaltverzögerung', 'Blinken'], 'Funktion Zeit');
  const st = add(v, 'staircase', 480, 0, { label: 'Treppenlicht', when: [f, 0] });
  const dl = add(v, 'delay', 480, 160, { label: 'Ein- und Ausschaltverzögerung', when: [f, 1] });
  const ck = add(v, 'clock', 480, 320, { label: 'Blinken', when: [f, 2] });
  const sel = add(v, 'select', 760, 120, { props: { count: 3 } });
  const on = add(v, 'ko_in', 760, 380, { label: 'Dauer-EIN', props: { name: 'Dauer-EIN', dpt: '1.001' } });
  const pr = add(v, 'priority', 1040, 120, { label: 'Dauer-EIN', props: { levels: 1, name0: 'Dauer-EIN' }, params: { pos0: 1, end: 3 }, fixed: ['pos0', 'end'] });
  const dur = add(v, 'ko_in', 240, 120, { label: 'Dauer Treppenlicht', props: { name: 'Dauer Treppenlicht', dpt: '7.005' }, when: [f, 0] });
  const warn = add(v, 'ko_out', 760, -120, { label: 'Warnung Treppenlicht', props: { name: 'Warnung Treppenlicht', dpt: '1.001' },
    params: { mode: 1 }, fixed: ['mode'], when: [f, 0] });
  link(v, dur, 'out', st, 'time'); link(v, st, 'warn', warn, 'in');
  /* Treppenlicht nach Ende von Dauer-EIN neu starten */
  const oRe = option(v, 480, -260, 'Treppenlichtzeit nach Ende von Dauer-EIN neu starten', YN, 'Neustart nach Dauer-EIN', { when: [f, 0] });
  const eg = add(v, 'edge', 240, 240, { label: 'Ende Dauer-EIN' });
  const gRe = add(v, 'gate', 360, 240, { label: 'Neustart freigegeben', props: { vtype: 'bool' }, params: { lock: 0, init: 0, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
  const mTr = add(v, 'merge', 400, 0, { label: 'Auslöser Treppenlicht', props: { vtype: 'bool' } });
  link(v, eg, 'fall', gRe, 'in'); link(v, oRe, 'out', gRe, 'ctl'); link(v, gRe, 'out', mTr, 'i1');
  link(v, pin.Wert, 'out', mTr, 'i0'); link(v, mTr, 'out', st, 'trig'); link(v, pin.Wert, 'out', dl, 'in'); link(v, pin.Wert, 'out', ck, 'en');
  link(v, f, 'out', sel, 'cond'); link(v, st, 'out', sel, 'i0'); link(v, dl, 'out', sel, 'i1'); link(v, ck, 'out', sel, 'i2');
  const lock = add(v, 'ko_in', 760, 520, { label: 'Zeitfunktion sperren', props: { name: 'Zeitfunktion sperren', dpt: '1.003' } });
  const sLock = add(v, 'select', 900, 120, { label: 'Zeitfunktion gesperrt' });
  link(v, lock, 'out', sLock, 'cond'); link(v, pin.Wert, 'out', sLock, 'a'); link(v, sel, 'out', sLock, 'b');
  /* erst neu starten, dann Dauer-EIN beenden: der Status bleibt ein */
  link(v, sLock, 'out', pr, 'in'); link(v, on, 'out', eg, 'in'); link(v, on, 'out', pr, 'a0');
  link(v, pr, 'out', zeit.out.Wert, 'in');
}

const szene = macro('Szene', [['Zustand', 'bool']], [['Wert', 'bool']],
  '**Funktion Szene (8 Bit)** (ABB „A: Szene“): fünf Zuordnungen Szene 1…64 → EIN/AUS; 0 = keiner Szene zugeordnet. Speichern über den Bus (Bit 7) übernimmt den aktuellen Schaltzustand als Wert der Szene und sichert ihn im Flash; nach einem Download der Parameter gelten wahlweise wieder die eingestellten Werte.');
{
  const { v, pin, out } = szene;
  const ko = add(v, 'ko_in', 240, 60, { label: '8-Bit-Szene', props: { name: '8-Bit-Szene', dpt: '18.001' } });
  const sc = add(v, 'scene', 620, 60, { props: { slots: 5, vtype: 'bool', learn: true }, params: { nr0: 0, nr1: 0, nr2: 0, nr3: 0, nr4: 0 } });
  link(v, ko, 'out', sc, 'in'); link(v, sc, 'out', out.Wert, 'in');
  /* Lernen: der aktuelle Schaltzustand (Rückführung vom Kanal) */
  link(v, pin.Zustand, 'out', sc, 'state');
}

/* Ein Verknüpfungsobjekt: Objekt mit Wert nach Busspannungswiederkehr,
   Funktion UND/ODER/XODER/TOR, Ergebnis invertieren. Ohne eigene Seite –
   die Parameter stehen auf der Seite „Logik“. */
const verkn = macro('Verknüpfung', [['Wert', 'bool']], [['Wert', 'bool']],
  '**Verknüpfungsobjekt** (ABB „Verknüpfungsobjekt x“): Funktion UND, ODER, XODER oder TOR mit dem Objekt „Log. Verknüpfung x“, Ergebnis wahlweise invertiert; der Objektwert nach Busspannungswiederkehr ist einstellbar.');
verkn.mac.channel = false;
const VK = {};
{
  const { v, pin } = verkn;
  const ko = add(v, 'ko_in', 0, 300, { label: 'Log. Verknüpfung', props: { name: 'Log. Verknüpfung', dpt: '1.002', start: true }, params: { startVal: 0 } });
  const f = option(v, 240, -120, 'Funktion des Verknüpfungsobjekts', ['UND', 'ODER', 'XODER', 'TOR'], 'Funktion');
  const g = [['and', 'UND'], ['or', 'ODER'], ['xor', 'XODER']].map(([t, l], k) => add(v, t, 520, 160 * k, { label: l }));
  const tor = add(v, 'gate', 520, 480, { label: 'TOR', when: [f, 3], params: { lock: 1, init: 1, resend: 0 } });
  const sel = add(v, 'select', 820, 200, { props: { count: 4 } });
  const inv = option(v, 820, -120, 'Ergebnis invertieren', YN, 'Ergebnis invertieren', { when: [f, 0, 1, 2] });
  const not = add(v, 'not', 1060, 100), sInv = add(v, 'select', 1300, 200, { label: 'invertiert' });
  g.forEach((x, k) => { link(v, pin.Wert, 'out', x, 'i0'); link(v, ko, 'out', x, 'i1'); link(v, x, 'out', sel, 'i' + k); });
  link(v, pin.Wert, 'out', tor, 'in'); link(v, ko, 'out', tor, 'ctl'); link(v, tor, 'out', sel, 'i3');
  link(v, f, 'out', sel, 'cond');
  link(v, sel, 'out', not, 'in'); link(v, not, 'out', sInv, 'a'); link(v, sel, 'out', sInv, 'b'); link(v, inv, 'out', sInv, 'cond');
  link(v, sInv, 'out', verkn.out.Wert, 'in');
  VK.ko = ko;
}

const logik = macro('Logik', [['Wert', 'bool']], [['Wert', 'bool']],
  '**Funktion Verknüpfung/Logik** (ABB „A: Logik“): Verknüpfungsobjekt 1 und 2 nacheinander, jedes einzeln aktivierbar (Untermakro *Verknüpfung*).');
{
  const { v, pin } = logik;
  const P = x => M.macroOf(m, x.props.macro).nodes;
  const inPort = x => P(x).find(n => n.type === 'macro_in').id, outPort = x => P(x).find(n => n.type === 'macro_out').id;
  let src = [pin.Wert, 'out'];
  [1, 2].forEach(k => {
    const en = option(v, 240 + 520 * (k - 1), -240, `Verknüpfungsobjekt ${k}`, ['deaktiviert', 'aktiviert'], `Verknüpfungsobjekt ${k}`, { params: { sel: k === 1 ? 1 : 0 } });
    const x = M.addMacro(v, verkn.mac.id, 240 + 520 * (k - 1), 60); x.label = `Verknüpfungsobjekt ${k}`; x.when = { on: en.id, values: [1] };
    M.normalize(m);
    const sx = add(v, 'select', 480 + 520 * (k - 1), 200, { label: `Verknüpfungsobjekt ${k} aktiviert` });
    v.links.push({ from: [src[0].id, src[1]], to: [x.id, inPort(x)] }, { from: [x.id, outPort(x)], to: [sx.id, 'a'] });
    link(v, src[0], src[1], sx, 'b'); link(v, en, 'out', sx, 'cond');
    src = [sx, 'out'];
  });
  link(v, src[0], src[1], logik.out.Wert, 'in');
}

const sicher = macro('Sicherheit', [['Wert', 'bool'], ['Priorität 1', 'bool', true], ['Priorität 2', 'bool', true], ['Priorität 3', 'bool', true]], [['Wert', 'bool']],
  '**Funktion Sicherheit** (ABB „A: Sicherheit“): Die Reihenfolge gibt den Vorrang an – Sicherheit Priorität 1, Zwangsführung (2 Bit), Priorität 2, Priorität 3. „nicht beachten“ entspricht „inaktiv“. Danach: Schaltzustand bei Ende (aktualisiert = normaler Wert).');
{
  const { v, pin } = sicher;
  const zw = add(v, 'ko_in', 240, 520, { label: 'Zwangsführung', props: { name: 'Zwangsführung', dpt: '2.001' } });
  const pr = add(v, 'priority', 620, 120, {
    props: { levels: 4, mode1: 'dpt2', name0: 'Sicherheit Priorität 1', name1: 'Zwangsführung', name2: 'Sicherheit Priorität 2', name3: 'Sicherheit Priorität 3' },
    params: { pos0: 3, pos1: 3, pos2: 3, pos3: 3, end: 3 }
  });
  link(v, pin.Wert, 'out', pr, 'in'); link(v, pin['Priorität 1'], 'out', pr, 'a0'); link(v, zw, 'out', pr, 'a1');
  link(v, pin['Priorität 2'], 'out', pr, 'a2'); link(v, pin['Priorität 3'], 'out', pr, 'a3');
  link(v, pr, 'out', sicher.out.Wert, 'in');
}

const schwelle = macro('Schwellwert', [], [['Wert', 'bool']],
  '**Funktion Schwellwert** (ABB „A: Schwellwert“): Datentyp 1 Byte (DPT 5.010) oder 2 Byte (DPT 7.001) – je ein Objekt mit derselben Nummer, das der Datentyp einblendet. Zwei Schwellen als Hysteresegrenzen oder drei Bereiche mit eigener Reaktion (aus, ein, keine); Schwellwert 1 über das Objekt „Schwellwert 1 ändern“.');
{
  const { v, out } = schwelle;
  const typ = option(v, 240, -160, 'Datentyp', ['1 Byte', '2 Byte'], 'Datentyp');
  const ko = (name, dpt, k, y) => add(v, 'ko_in', 240, y, { label: `${name} (${k ? 2 : 1} Byte)`, props: { name, dpt }, when: [typ, k] });
  const in1 = ko('Schwellwerteingang', '5.010', 0, 0), in2 = ko('Schwellwerteingang', '7.001', 1, 100);
  const ch1 = ko('Schwellwert 1 ändern', '5.010', 0, 220), ch2 = ko('Schwellwert 1 ändern', '7.001', 1, 320);
  const mIn = add(v, 'merge', 440, 40, { props: { vtype: 'num' } }), mCh = add(v, 'merge', 440, 260, { props: { vtype: 'num' } });
  const th = add(v, 'thresholds', 620, 60, { params: { thr1: 80, thr2: 160, hyst: 1, low: 0, mid: 2, high: 1 } });
  link(v, in1, 'out', mIn, 'i0'); link(v, in2, 'out', mIn, 'i1'); link(v, ch1, 'out', mCh, 'i0'); link(v, ch2, 'out', mCh, 'i1');
  link(v, mIn, 'out', th, 'in'); link(v, mCh, 'out', th, 'thr1'); link(v, th, 'out', out.Wert, 'in');
}

const preset = macro('Preset', [['Zustand', 'bool']], [['Wert', 'bool']],
  '**Funktion Preset** (ABB „A: Preset“): „Preset 1/2 aufrufen“ (0 = Preset 1, 1 = Preset 2), „Preset 1/2 setzen“ übernimmt den aktuellen Schaltzustand. Preset 1 kann den Zustand vor Preset 2 wiederherstellen.');
{
  const { v, pin, out } = preset;
  const call = add(v, 'ko_in', 240, 60, { label: 'Preset 1/2 aufrufen', props: { name: 'Preset 1/2 aufrufen', dpt: '1.001' } });
  const set = add(v, 'ko_in', 240, 200, { label: 'Preset 1/2 setzen', props: { name: 'Preset 1/2 setzen', dpt: '1.001' } });
  const pr = add(v, 'preset', 620, 60, { params: { p1: 3, p2: 1 } });
  link(v, call, 'out', pr, 'call'); link(v, set, 'out', pr, 'set'); link(v, pin.Zustand, 'out', pr, 'state');
  link(v, pr, 'out', out.Wert, 'in');
}

/* ---------- Kanal ---------- */

const kanal = macro('Schaltkanal', [['Freigabe', 'bool'], ['Priorität 1', 'bool', true], ['Priorität 2', 'bool', true], ['Priorität 3', 'bool', true], ['Busspannungsausfall', 'bool', true]], [],
  '**Schaltkanal** wie ein Ausgang der ABB SA/S 8.16.2.1\n\n' +
  'Weg des Schaltbefehls: Schalten, Szene und Schwellwert → Logik → Zeit → Sicherheit → Status und Relais. Jede Funktion ist eine Unterseite (Untermakro mit eigener Seite), die „Funktion … freigeben“ einblendet; dieselbe Auswahl schaltet in der Firmware den Weg um.\n\n' +
  '- Verhalten des Ausgangs: Schließer/Öffner kehrt den Relaisbefehl um, der Status zeigt den Schaltzustand.\n' +
  '- Objektwert Schaltzustand: Status unverändert oder invertiert.\n' +
  '- Verhalten bei Busspannungsausfall: Priorität mit höchstem Vorrang vor dem Relais (Kontakt unverändert, offen oder geschlossen).\n' +
  '- Verhalten bei Busspannungswiederkehr: „Dauerhaft speichern“ sichert beim Ausfall die Kontaktstellung im Flash und stellt sie nach dem Start wieder her; sonst gilt „Nach Start“ des Relais (unverändert, offen, geschlossen).\n' +
  '- Preset: Unterseite, Rückführung vom Schaltzustand.\n' +
  '- Noch nicht abgebildet: Strommessung.');
const K = {};
{
  const { v, pin } = kanal;
  const sw = add(v, 'ko_in', 240, 400, { label: 'Schalten', props: { name: 'Schalten', dpt: '1.001' } });
  const oNc = option(v, 240, -560, 'Verhalten des Ausgangs', ['Schließer', 'Öffner'], 'Verhalten des Ausgangs');
  const oInv = option(v, 240, -440, 'Objektwert Schaltzustand (Objekt „Status Schalten“)', ['1 = geschlossen, 0 = geöffnet', '0 = geschlossen, 1 = geöffnet'], 'Objektwert Schaltzustand');
  const oT = option(v, 520, -560, 'Funktion Zeit: Verzögerung, Treppenlicht, Blinken freigeben', YN, 'Funktion Zeit');
  const oS = option(v, 520, -440, 'Funktion Szene (8 Bit) freigeben', YN, 'Funktion Szene');
  const oL = option(v, 520, -320, 'Funktion Verknüpfung/Logik freigeben', YN, 'Funktion Logik');
  const oSi = option(v, 800, -560, 'Funktion Sicherheit freigeben', YN, 'Funktion Sicherheit');
  const oSw = option(v, 800, -440, 'Funktion Schwellwert freigeben', YN, 'Funktion Schwellwert');
  const oP = option(v, 800, -320, 'Funktion Preset freigeben', YN, 'Funktion Preset');
  const iS = M.addMacro(v, szene.mac.id, 240, 560); iS.label = 'Szene'; iS.when = { on: oS.id, values: [1] };
  const iSw = M.addMacro(v, schwelle.mac.id, 240, 720); iSw.label = 'Schwellwert'; iSw.when = { on: oSw.id, values: [1] };
  const iP = M.addMacro(v, preset.mac.id, 240, 880); iP.label = 'Preset'; iP.when = { on: oP.id, values: [1] };
  const mg = add(v, 'merge', 520, 480, { props: { count: 4 } });
  const iL = M.addMacro(v, logik.mac.id, 760, 360); iL.label = 'Logik'; iL.when = { on: oL.id, values: [1] };
  const sL = add(v, 'select', 1000, 440, { label: 'Logik freigegeben' });
  const iT = M.addMacro(v, zeit.mac.id, 1240, 360); iT.label = 'Zeit'; iT.when = { on: oT.id, values: [1] };
  const sT = add(v, 'select', 1480, 440, { label: 'Zeit freigegeben' });
  const iSi = M.addMacro(v, sicher.mac.id, 1720, 360); iSi.label = 'Sicherheit'; iSi.when = { on: oSi.id, values: [1] };
  const sSi = add(v, 'select', 1960, 440, { label: 'Sicherheit freigegeben' });
  const nInv = add(v, 'not', 2200, 260), sInv = add(v, 'select', 2440, 260, { label: 'Status invertiert' });
  const st = add(v, 'ko_out', 2680, 260, { label: 'Status Schalten', props: { name: 'Status Schalten', dpt: '1.001' } });
  const nNc = add(v, 'not', 2200, 560), sNc = add(v, 'select', 2440, 560, { label: 'Öffner' });
  const keep = add(v, 'persist', 2680, 720, { label: 'Kontaktstellung wie vor Busspannungsausfall', props: { vtype: 'bool' }, params: { start: 1 } });
  const bf = add(v, 'priority', 2920, 720, { label: 'Verhalten bei Busspannungsausfall', props: { levels: 1, name0: 'Busspannungsausfall' },
    params: { pos0: 2, end: 3 }, fixed: ['end'] });
  const rl = add(v, 'bistable', 3160, 560, { label: 'Relais', props: { coils: 'two', useEn: true },
    params: { pulse: 50, pause: 100, init: 0, delay: 500, repeat: 0 }, fixed: ['pulse', 'pause', 'delay', 'repeat'] });
  M.normalize(m);
  const P = x => M.macroOf(m, x.props.macro).nodes;
  const inPort = (x, name) => P(x).find(n => n.type === 'macro_in' && n.props.name === name).id;
  const outPort = x => P(x).find(n => n.type === 'macro_out').id;
  link(v, sw, 'out', mg, 'i0');
  v.links.push({ from: [iS.id, outPort(iS)], to: [mg.id, 'i1'] }, { from: [iSw.id, outPort(iSw)], to: [mg.id, 'i2'] },
    { from: [iP.id, outPort(iP)], to: [mg.id, 'i3'] });
  /* Freigabe: 1 → über die Unterseite (A), 0 → daran vorbei (B) */
  const stage = (inst, sel, opt, src, srcPort) => {
    v.links.push({ from: [src.id, srcPort], to: [inst.id, inPort(inst, 'Wert')] });
    v.links.push({ from: [inst.id, outPort(inst)], to: [sel.id, 'a'] });
    link(v, src, srcPort, sel, 'b');
    link(v, opt, 'out', sel, 'cond');
  };
  stage(iL, sL, oL, mg, 'out');
  stage(iT, sT, oT, sL, 'out');
  stage(iSi, sSi, oSi, sT, 'out');
  ['Priorität 1', 'Priorität 2', 'Priorität 3'].forEach(p => v.links.push({ from: [pin[p].id, 'out'], to: [iSi.id, inPort(iSi, p)] }));
  /* Preset und Szene merken sich den Schaltzustand (Rückführung) */
  v.links.push({ from: [sSi.id, 'out'], to: [iP.id, inPort(iP, 'Zustand')] });
  v.links.push({ from: [sSi.id, 'out'], to: [iS.id, inPort(iS, 'Zustand')] });
  link(v, sSi, 'out', nInv, 'in'); link(v, nInv, 'out', sInv, 'a'); link(v, sSi, 'out', sInv, 'b'); link(v, oInv, 'out', sInv, 'cond');
  link(v, sInv, 'out', st, 'in');
  link(v, sSi, 'out', nNc, 'in'); link(v, nNc, 'out', sNc, 'a'); link(v, sSi, 'out', sNc, 'b'); link(v, oNc, 'out', sNc, 'cond');
  link(v, sNc, 'out', keep, 'in'); link(v, keep, 'out', bf, 'in'); link(v, bf, 'out', rl, 'in');
  link(v, pin.Busspannungsausfall, 'out', keep, 'save'); link(v, pin.Busspannungsausfall, 'out', bf, 'a0');
  link(v, pin.Freigabe, 'out', rl, 'en');
  Object.assign(K, { sw, st, rl, iS, iSw, iL, iT, iSi, iP });
}

/* ---------- Gerät ---------- */

const oldNode = id => old.nodes.find(n => n.id === id);
const ai = add(m, 'ai', 40, 40, { label: 'Speicherspannung', props: copy(oldNode('n1').props), params: copy(oldNode('n1').params), fixed: ['interval', 'delta'] });
const comp = M.addMacro(m, m.macros[0].id, 330, 40); comp.label = '12-V-Relais';
/* Spannungsausgleich gehört zur Hardware: alle Werte fest in der Firmware */
M.normalize(m);
Object.values(comp.inner).forEach(e => { Object.keys(e.params || {}).forEach(p => { e.fixed[p] = true; }); });
m.macros[0].nodes.forEach(n => { const st = comp.inner[n.id]; const d = S.blocks.get(n.type); if (st && d) S.blocks.params(d, Object.assign({}, n, { props: Object.assign({}, n.props, st.props) })).forEach(p => { st.fixed[p.id] = true; }); });
const sr = add(m, 'sr595', 620, 40, { label: 'Relaistreiber', props: copy(oldNode('n3').props) });
const err = add(m, 'ko_out', 900, 40, { label: 'Kettenfehler', props: { name: 'Relaistreiber Fehler', dpt: '1.001' } });
const start = add(m, 'start', 40, -360, { label: 'Sende- und Schaltverzögerung' });
start.params.delay = 2;
const alive = add(m, 'ko_out', 330, -360, { label: 'In Betrieb', props: { name: 'In Betrieb', dpt: '1.002' }, params: { mode: 1, cycle: 0 }, fixed: ['mode'] });
const oSafe = option(m, 40, -240, 'Gerätesicherheitsobjekte für Betriebsart „Schaltaktor“ freischalten', YN, 'Gerätesicherheitsobjekte');
const prio = [1, 2, 3].map(k => {
  const ko = add(m, 'ko_in', 330, -240 + 110 * (k - 1), { label: `Sicherheit Priorität ${k}`, props: { name: `Sicherheit Priorität ${k}`, dpt: '1.001' }, when: [oSafe, 1] });
  const w = add(m, 'watchdog', 620, -240 + 110 * (k - 1), { label: `Funktion Sicherheit Priorität ${k}`, params: { trig: 2, time: 0 }, when: [oSafe, 1] });
  link(m, ko, 'out', w, 'in');
  return w;
});
link(m, start, 'out', alive, 'in');
add(m, 'ratelimit', 40, -640, { label: 'Telegrammratenbegrenzung', params: { limit: 10 } });
/* Busspannung: Schwellen nach KNX (20 V / 21 V), fest in der Firmware */
const vbus = add(m, 'vbus', 40, -520, { label: 'Busspannung', props: { mute: true },
  fixed: ['low', 'high', 'tLow', 'tHigh', 'delta'] });
const [mi] = m.macros[0].nodes.filter(n => n.type === 'macro_in');
const outs = m.macros[0].nodes.filter(n => n.type === 'macro_out');
const duty = outs.find(n => /Tastverh/.test(n.props.name)), ok = outs.find(n => /ausreichend/.test(n.props.name));
m.links.push({ from: [ai.id, 'out'], to: [comp.id, mi.id] }, { from: [comp.id, duty.id], to: [sr.id, 'en'] });
link(m, sr, 'err', err, 'in');

const kv = M.macroView(m, kanal.mac.id);
const kin = name => kv.nodes.find(n => n.type === 'macro_in' && n.props.name === name).id;
const chans = 'ABCDEFGH'.split('').map((c, k) => {
  const x = M.addMacro(m, kanal.mac.id, 1200, -360 + 160 * k);
  x.label = `Ausgang ${c}`;
  m.links.push({ from: [comp.id, ok.id], to: [x.id, kin('Freigabe')] });
  prio.forEach((w, p) => m.links.push({ from: [w.id, 'out'], to: [x.id, kin(`Priorität ${p + 1}`)] }));
  m.links.push({ from: [vbus.id, 'fail'], to: [x.id, kin('Busspannungsausfall')] });
  return x;
});
M.normalize(m);
/* Spulen: Aus an SR1.Q(2k), Ein an SR1.Q(2k+1) */
chans.forEach((x, k) => Object.assign(x.inner[K.rl.id].props, { pinOff: `SR1.Q${2 * k}`, pinOn: `SR1.Q${2 * k + 1}` }));

const note = add(m, 'note', 40, 260, { props: { width: 560, text:
  '**Out8 bistabil v2.2 mit Energy-Storage-Addon**, Applikation wie **ABB SA/S 8.16.2.1** (out-cs-bim112)\n\n' +
  '- Seite *Allgemein*: Sende- und Schaltverzögerung, „In Betrieb“ (KO 0, zyklisch), Gerätesicherheitsobjekte Priorität 1–3 (KO 1–3) mit Überwachungszeit, Relaistreiber Fehler (KO 4).\n' +
  '- Ausgang A–H: je ein Kanal (Makro *Schaltkanal*), KO-Nummern wie bei ABB ab 10 + 20·k: Schalten +0, Dauer-EIN +1, Zeitfunktion sperren +2, Dauer/Warnung Treppenlicht +3/+4, Preset +5/+6, 8-Bit-Szene +7, Log. Verknüpfung 1/2 +8/+9, Zwangsführung +10, Schwellwerteingang +11, Schwellwert 1 ändern +12, Status Schalten +19.\n' +
  '- Spulen über zwei 74HC595 an SPI0: Aus = `SR1.Q(2k)`, Ein = `SR1.Q(2k+1)`; /G an IO15 als PWM nach der Speicherspannung (Makro *Spannungsausgleich*), Kette über MISO geprüft.\n' +
  '- Busspannung: Ausfall unter 20 V (20 ms), Wiederkehr über 21 V (1,5 s); während des Ausfalls keine Gruppentelegramme, die Kanäle sichern ihre Kontaktstellung im Flash.\n' +
  '- Telegrammratenbegrenzung: höchstens 10 Gruppentelegramme je Sekunde.\n' +
  '- Nicht abgebildet: Strommessung – siehe Beschreibung der Makros.' } });

/* ---------- KO-Nummern wie bei ABB ---------- */

const res0 = M.resolve(m);
const NUM = { 'In Betrieb': 0, 'Sicherheit Priorität 1': 1, 'Sicherheit Priorität 2': 2, 'Sicherheit Priorität 3': 3, 'Relaistreiber Fehler': 4 };
const OFS = { 'Schalten': 0, 'Dauer-EIN': 1, 'Zeitfunktion sperren': 2, 'Dauer Treppenlicht': 3, 'Warnung Treppenlicht': 4,
  'Preset 1/2 aufrufen': 5, 'Preset 1/2 setzen': 6, 'Log. Verknüpfung 2': 9, 'Schwellwert 1 ändern': 12, '8-Bit-Szene': 7, 'Log. Verknüpfung 1': 8, 'Zwangsführung': 10, 'Schwellwerteingang': 11, 'Status Schalten': 19 };
res0.kos.forEach(k => {
  const n = k.r.node;
  const chan = n._chan ? chans.findIndex(x => x.id === n._chan.id) : -1;
  /* Verknüpfungsobjekt 1/2: gleiches Untermakro, Nummer aus dem Instanznamen */
  const name = n.props.name === 'Log. Verknüpfung' ? `Log. Verknüpfung ${/Verknüpfungsobjekt (\d)/.exec(n._prefix)[1]}` : n.props.name;
  const nr = chan >= 0 ? 10 + 20 * chan + OFS[name] : NUM[name];
  if (!Number.isInteger(nr)) throw new Error('KO ohne Nummer: ' + k.def.text);
  (n._store || n).kos[k.def.id] = nr;
});
M.normalize(m);
const res = M.resolve(m);
if (res.errors.length) throw new Error(res.errors.map(e => e.msg).join('\n'));

/* ---------- in examples.js schreiben ---------- */

const json = JSON.stringify(JSON.parse(M.serialize(m)), null, 1).replace(/\n\s*/g, ' ');
const file = path.join(root, 'js', 'examples.js');
const src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('  /* BEGIN out8'), b = src.indexOf('  /* END out8 */');
if (a < 0 || b < 0) throw new Error('Markierungen BEGIN/END out8 in js/examples.js fehlen');
const entry = `  /* BEGIN out8 – erzeugt von tools/build-out8-example.js, nicht von Hand ändern.
     Out8 bistabil v2.2 mit Energy-Storage-Addon, Applikation nach dem Vorbild
     der ABB SA/S 8.16.2.1: Allgemein, 8 Kanäle mit Unterseiten, KO-Nummern
     wie dort. */
  { name: '${NAME}', model: ${json} },
`;
fs.writeFileSync(file, src.slice(0, a) + entry + src.slice(b));
console.log(`${NAME}: ${res.nodes.length} Blöcke, ${res.kos.length} KOs, ${res.params.filter(p => !p.fixed).length} Parameter (${res.layout.params.size} Byte), ${res.warnings.length} Hinweise`);
res.warnings.slice(0, 20).forEach(w => console.log('  ' + w.msg));
