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
  '**Funktion Zeit** (ABB „A: Zeit“)\n\n- Funktion Zeit: Treppenlicht, Ein-/Ausschaltverzögerung oder Blinken; die Auswahl schaltet Parameter und Weg um.\n- **Dauer-EIN** übersteuert als Priorität (ein, danach normaler Wert).\n- Noch nicht abgebildet: Warnung vor Auslauf, Pumpen, Zeitdauer über Objekt, Anzahl Impulse, „Funktion Zeit sperren“.');
{
  const { v, pin } = zeit;
  const f = option(v, 220, -120, 'Funktion Zeit', ['Treppenlichtfunktion', 'Ein- und Ausschaltverzögerung', 'Blinken'], 'Funktion Zeit');
  const st = add(v, 'staircase', 480, 0, { label: 'Treppenlicht', when: [f, 0] });
  const dl = add(v, 'delay', 480, 160, { label: 'Ein- und Ausschaltverzögerung', when: [f, 1] });
  const ck = add(v, 'clock', 480, 320, { label: 'Blinken', when: [f, 2] });
  const sel = add(v, 'select', 760, 120, { props: { count: 3 } });
  const on = add(v, 'ko_in', 760, 380, { label: 'Dauer-EIN', props: { name: 'Dauer-EIN', dpt: '1.001' } });
  const pr = add(v, 'priority', 1040, 120, { label: 'Dauer-EIN', props: { levels: 1, name0: 'Dauer-EIN' }, params: { pos0: 1, end: 3 }, fixed: ['pos0', 'end'] });
  link(v, pin.Wert, 'out', st, 'trig'); link(v, pin.Wert, 'out', dl, 'in'); link(v, pin.Wert, 'out', ck, 'en');
  link(v, f, 'out', sel, 'cond'); link(v, st, 'out', sel, 'i0'); link(v, dl, 'out', sel, 'i1'); link(v, ck, 'out', sel, 'i2');
  link(v, sel, 'out', pr, 'in'); link(v, on, 'out', pr, 'a0');
  link(v, pr, 'out', zeit.out.Wert, 'in');
}

const szene = macro('Szene', [], [['Wert', 'bool']],
  '**Funktion Szene (8 Bit)** (ABB „A: Szene“): fünf Zuordnungen Szene 1…64 → EIN/AUS; 0 = keiner Szene zugeordnet. Lernen (Speichern über den Bus) ist noch nicht abgebildet.');
{
  const { v, out } = szene;
  const ko = add(v, 'ko_in', 240, 60, { label: '8-Bit-Szene', props: { name: '8-Bit-Szene', dpt: '18.001' } });
  const sc = add(v, 'scene', 620, 60, { props: { slots: 5, vtype: 'bool' }, params: { nr0: 0, nr1: 0, nr2: 0, nr3: 0, nr4: 0 } });
  link(v, ko, 'out', sc, 'in'); link(v, sc, 'out', out.Wert, 'in');
}

const logik = macro('Logik', [['Wert', 'bool']], [['Wert', 'bool']],
  '**Funktion Verknüpfung/Logik** (ABB „A: Logik“): Verknüpfungsobjekt 1 mit UND, ODER, XODER oder TOR; die Auswahl schaltet den Weg um. Noch nicht abgebildet: Verknüpfungsobjekt 2, Ergebnis invertieren, Objektwert nach Busspannungswiederkehr.');
{
  const { v, pin } = logik;
  const ko = add(v, 'ko_in', 0, 300, { label: 'Log. Verknüpfung 1', props: { name: 'Log. Verknüpfung 1', dpt: '1.002' } });
  const f = option(v, 240, -120, 'Funktion von Verknüpfungsobjekt 1', ['UND', 'ODER', 'XODER', 'TOR'], 'Funktion');
  const g = [['and', 'UND'], ['or', 'ODER'], ['xor', 'XODER']].map(([t, l], k) => add(v, t, 520, 160 * k, { label: l }));
  const tor = add(v, 'gate', 520, 480, { label: 'TOR', when: [f, 3], params: { lock: 1, init: 1, resend: 0 } });
  const sel = add(v, 'select', 820, 200, { props: { count: 4 } });
  g.forEach((x, k) => { link(v, pin.Wert, 'out', x, 'i0'); link(v, ko, 'out', x, 'i1'); link(v, x, 'out', sel, 'i' + k); });
  link(v, pin.Wert, 'out', tor, 'in'); link(v, ko, 'out', tor, 'ctl'); link(v, tor, 'out', sel, 'i3');
  link(v, f, 'out', sel, 'cond'); link(v, sel, 'out', logik.out.Wert, 'in');
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
  '**Funktion Schwellwert** (ABB „A: Schwellwert“), 1-Byte-Variante: Schwellwerte als Hysteresegrenzen 80 / 160 → über der oberen EIN, unter der unteren AUS. Noch nicht abgebildet: 2-Byte-Eingang, Reaktion je Bereich wählbar, Schwellwert über den Bus ändern.');
{
  const { v, out } = schwelle;
  const ko = add(v, 'ko_in', 240, 60, { label: 'Schwellwerteingang', props: { name: 'Schwellwerteingang', dpt: '5.010' } });
  const th = add(v, 'threshold', 620, 60, { params: { thr: 160, hyst: 80 } });
  link(v, ko, 'out', th, 'in'); link(v, th, 'out', out.Wert, 'in');
}

/* ---------- Kanal ---------- */

const kanal = macro('Schaltkanal', [['Freigabe', 'bool'], ['Priorität 1', 'bool', true], ['Priorität 2', 'bool', true], ['Priorität 3', 'bool', true]], [],
  '**Schaltkanal** wie ein Ausgang der ABB SA/S 8.16.2.1\n\n' +
  'Weg des Schaltbefehls: Schalten, Szene und Schwellwert → Logik → Zeit → Sicherheit → Status und Relais. Jede Funktion ist eine Unterseite (Untermakro mit eigener Seite), die „Funktion … freigeben“ einblendet; dieselbe Auswahl schaltet in der Firmware den Weg um.\n\n' +
  '- Verhalten des Ausgangs: Schließer/Öffner kehrt den Relaisbefehl um, der Status zeigt den Schaltzustand.\n' +
  '- Objektwert Schaltzustand: Status unverändert oder invertiert.\n' +
  '- Noch nicht abgebildet: Verhalten bei Busspannungsausfall/-wiederkehr (Relais „Nach Start“ ist der Ersatz), Preset, Strommessung.');
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
  const iS = M.addMacro(v, szene.mac.id, 240, 560); iS.label = 'Szene'; iS.when = { on: oS.id, values: [1] };
  const iSw = M.addMacro(v, schwelle.mac.id, 240, 720); iSw.label = 'Schwellwert'; iSw.when = { on: oSw.id, values: [1] };
  const mg = add(v, 'merge', 520, 480, { props: { count: 3 } });
  const iL = M.addMacro(v, logik.mac.id, 760, 360); iL.label = 'Logik'; iL.when = { on: oL.id, values: [1] };
  const sL = add(v, 'select', 1000, 440, { label: 'Logik freigegeben' });
  const iT = M.addMacro(v, zeit.mac.id, 1240, 360); iT.label = 'Zeit'; iT.when = { on: oT.id, values: [1] };
  const sT = add(v, 'select', 1480, 440, { label: 'Zeit freigegeben' });
  const iSi = M.addMacro(v, sicher.mac.id, 1720, 360); iSi.label = 'Sicherheit'; iSi.when = { on: oSi.id, values: [1] };
  const sSi = add(v, 'select', 1960, 440, { label: 'Sicherheit freigegeben' });
  const nInv = add(v, 'not', 2200, 260), sInv = add(v, 'select', 2440, 260, { label: 'Status invertiert' });
  const st = add(v, 'ko_out', 2680, 260, { label: 'Status Schalten', props: { name: 'Status Schalten', dpt: '1.001' } });
  const nNc = add(v, 'not', 2200, 560), sNc = add(v, 'select', 2440, 560, { label: 'Öffner' });
  const rl = add(v, 'bistable', 2680, 560, { label: 'Relais', props: { coils: 'two', useEn: true },
    params: { pulse: 50, pause: 100, init: 0, delay: 500, repeat: 0 }, fixed: ['pulse', 'pause', 'delay', 'repeat'] });
  M.normalize(m);
  const P = x => M.macroOf(m, x.props.macro).nodes;
  const inPort = (x, name) => P(x).find(n => n.type === 'macro_in' && n.props.name === name).id;
  const outPort = x => P(x).find(n => n.type === 'macro_out').id;
  link(v, sw, 'out', mg, 'i0');
  v.links.push({ from: [iS.id, outPort(iS)], to: [mg.id, 'i1'] }, { from: [iSw.id, outPort(iSw)], to: [mg.id, 'i2'] });
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
  link(v, sSi, 'out', nInv, 'in'); link(v, nInv, 'out', sInv, 'a'); link(v, sSi, 'out', sInv, 'b'); link(v, oInv, 'out', sInv, 'cond');
  link(v, sInv, 'out', st, 'in');
  link(v, sSi, 'out', nNc, 'in'); link(v, nNc, 'out', sNc, 'a'); link(v, sSi, 'out', sNc, 'b'); link(v, oNc, 'out', sNc, 'cond');
  link(v, sNc, 'out', rl, 'in'); link(v, pin.Freigabe, 'out', rl, 'en');
  Object.assign(K, { sw, st, rl, iS, iSw, iL, iT, iSi });
}

/* ---------- Gerät ---------- */

const oldNode = id => old.nodes.find(n => n.id === id);
const ai = add(m, 'ai', 40, 40, { label: 'Speicherspannung', props: copy(oldNode('n1').props), params: copy(oldNode('n1').params) });
const comp = M.addMacro(m, m.macros[0].id, 330, 40); comp.label = '12-V-Relais';
const sr = add(m, 'sr595', 620, 40, { label: 'Relaistreiber', props: copy(oldNode('n3').props) });
const err = add(m, 'ko_out', 900, 40, { label: 'Kettenfehler', props: { name: 'Relaistreiber Fehler', dpt: '1.001' } });
const start = add(m, 'start', 40, -360, { label: 'Sende- und Schaltverzögerung' });
start.params.delay = 2;
const alive = add(m, 'ko_out', 330, -360, { label: 'In Betrieb', props: { name: 'In Betrieb', dpt: '1.002' }, params: { mode: 1, cycle: 0 } });
const oSafe = option(m, 40, -240, 'Gerätesicherheitsobjekte für Betriebsart „Schaltaktor“ freischalten', YN, 'Gerätesicherheitsobjekte');
const prio = [1, 2, 3].map(k => {
  const ko = add(m, 'ko_in', 330, -240 + 110 * (k - 1), { label: `Sicherheit Priorität ${k}`, props: { name: `Sicherheit Priorität ${k}`, dpt: '1.001' }, when: [oSafe, 1] });
  const w = add(m, 'watchdog', 620, -240 + 110 * (k - 1), { label: `Funktion Sicherheit Priorität ${k}`, params: { trig: 2, time: 0 }, when: [oSafe, 1] });
  link(m, ko, 'out', w, 'in');
  return w;
});
link(m, start, 'out', alive, 'in');
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
  return x;
});
M.normalize(m);
/* Spulen: Aus an SR1.Q(2k), Ein an SR1.Q(2k+1) */
chans.forEach((x, k) => Object.assign(x.inner[K.rl.id].props, { pinOff: `SR1.Q${2 * k}`, pinOn: `SR1.Q${2 * k + 1}` }));

const note = add(m, 'note', 40, 260, { props: { width: 560, text:
  '**Out8 bistabil v2.2 mit Energy-Storage-Addon**, Applikation wie **ABB SA/S 8.16.2.1** (out-cs-bim112)\n\n' +
  '- Seite *Allgemein*: Sende- und Schaltverzögerung, „In Betrieb“ (KO 0, zyklisch), Gerätesicherheitsobjekte Priorität 1–3 (KO 1–3) mit Überwachungszeit, Relaistreiber Fehler (KO 4).\n' +
  '- Ausgang A–H: je ein Kanal (Makro *Schaltkanal*), KO-Nummern wie bei ABB ab 10 + 20·k: Schalten +0, Dauer-EIN +1, 8-Bit-Szene +7, Log. Verknüpfung 1 +8, Zwangsführung +10, Schwellwerteingang +11, Status Schalten +19.\n' +
  '- Spulen über zwei 74HC595 an SPI0: Aus = `SR1.Q(2k)`, Ein = `SR1.Q(2k+1)`; /G an IO15 als PWM nach der Speicherspannung (Makro *Spannungsausgleich*), Kette über MISO geprüft.\n' +
  '- Nicht abgebildet: Busspannungsausfall/-wiederkehr, Preset, Telegrammratenbegrenzung, Strommessung – siehe Beschreibung der Makros.' } });

/* ---------- KO-Nummern wie bei ABB ---------- */

const res0 = M.resolve(m);
const NUM = { 'In Betrieb': 0, 'Sicherheit Priorität 1': 1, 'Sicherheit Priorität 2': 2, 'Sicherheit Priorität 3': 3, 'Relaistreiber Fehler': 4 };
const OFS = { 'Schalten': 0, 'Dauer-EIN': 1, '8-Bit-Szene': 7, 'Log. Verknüpfung 1': 8, 'Zwangsführung': 10, 'Schwellwerteingang': 11, 'Status Schalten': 19 };
res0.kos.forEach(k => {
  const n = k.r.node;
  const chan = n._chan ? chans.findIndex(x => x.id === n._chan.id) : -1;
  const nr = chan >= 0 ? 10 + 20 * chan + OFS[n.props.name] : NUM[n.props.name];
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
