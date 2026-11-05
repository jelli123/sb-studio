/* Baut das Beispiel „Tasterinterface 4f LED“ nach dem Vorbild der MDT-
 * Applikation „Tasterinterface 4-fach/LED V1.6“ (BE-04001.01, Binary
 * input/LED 4f), die die Selfbus-Firmware in16-bim112 nachbildet, und
 * schreibt es in js/examples.js (zwischen den Markierungen BEGIN/END tasterif).
 *
 *   node tools/build-tasterif-example.js
 *
 * Aufbau wie bei MDT: Seite „Allgemein“ (Startzeit, Telegrammrate, Logik 1–4
 * freigeben), je Kanalpaar A/B und C/D die Auswahl deaktiviert / gruppiert
 * (zweiflächig Schalten, Dimmen, Jalousie) / einzeln; einzeln hat jeder
 * Eingang die Funktion Schalter, Schalter kurz/lang, Dimmen, Jalousie,
 * Zähler, Szene oder LED-Ausgang – am selben Pin, den dann ein
 * Digitalausgang statt des Digitaleingangs nutzt. KO-Nummern wie bei MDT:
 * Kanal k ab 5·k, Logik l ab 20 + 3·l, LED k = 32 + k.                    */
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
const NAME = 'Tasterinterface 4f LED';

const m = M.create();
Object.assign(m.device, {
  name: NAME, orderNumber: 'SBS-TI4-LED', manufacturer: 250, appNumber: 41732, appVersion: 16,
  hwSerial: '0005', hwVersion: 0, busCurrent: 10, platform: '4te-lpc1115',
  sblibPath: '../../software-arm-incubation/software-arm-lib'
});
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
/* Auswahl nach Nummer: Werte, die nur den gewählten Eingang durchlassen */
const route = (g, x, y, label, cond, count = 12, vtype = 'bool') => {
  const s = add(g, 'select', x, y, { label, props: { vtype, count } });
  link(g, cond, 'out', s, 'cond');
  return s;
};

/* Makro mit Ein- und Ausgängen [Name, Typ, optional] */
function macro(name, ins, outs, help, channel = false) {
  const mac = M.createMacro(m, name);
  mac.channel = channel;
  const v = M.macroView(m, mac.id);
  const [mi, mo] = v.nodes;
  M.removeNode(v, mi.id); M.removeNode(v, mo.id);
  const pin = {}, out = {};
  ins.forEach(([n, t, opt], k) => { pin[n] = add(v, 'macro_in', 0, 60 + 120 * k, { props: { name: n, vtype: t, optional: !!opt } }); });
  outs.forEach(([n, t], k) => { out[n] = add(v, 'macro_out', 2200, 60 + 120 * k, { props: { name: n, vtype: t } }); });
  if (help) M.helpNote(mac, help);
  return { mac, v, pin, out };
}
/* Instanz eines Makros in einem Graphen, Ports nach Namen */
function use(g, mc, x, y, label, when) {
  const n = M.addMacro(g, mc.mac.id, x, y);
  n.label = label;
  if (when) n.when = { on: when[0].id, values: when.slice(1) };
  M.normalize(m);
  return n;
}
const port = (mc, kind, name) => mc.v.nodes.find(n => n.type === kind && n.props.name === name).id;
const into = (g, a, ap, inst, mc, name) => g.links.push({ from: [a.id, ap], to: [inst.id, port(mc, 'macro_in', name)] });
const from = (g, inst, mc, name, b, bp) => g.links.push({ from: [inst.id, port(mc, 'macro_out', name)], to: [b.id, bp] });

const AUS_EIN = ['Aus', 'Ein'];

/* ---------- Funktionen eines Eingangs (ohne eigene Seite) ---------- */

/* Schalter: Unterfunktionen wie bei MDT */
const UNTER = ['Schalten bei steigender Flanke', 'Umschalten bei steigender Flanke', 'Schalten bei fallender Flanke',
  'Umschalten bei fallender Flanke', 'Status senden', 'Umschalten bei steigender und fallender Flanke',
  'Wert senden bei steigender Flanke (1 Byte / 2 Bit)', 'Wert senden bei fallender Flanke (1 Byte / 2 Bit)',
  'Wert senden bei beiden Flanken (1 Byte / 2 Bit)', 'Status senden mit Einschaltverzögerung', 'Status senden mit Ausschaltverzögerung'];

const wert = macro('Wert senden', [['steigend', 'bool'], ['fallend', 'bool']], [],
  '**Wert senden** (MDT „Wert (1 Byte) / Zwangsführung (2 Bit)“): bei der gewählten Flanke einen 1-Byte-Wert (DPT 5.010) oder eine Zwangsführung (DPT 2.001: nicht aktiv, AUS, EIN). Beide Objekte haben dieselbe Nummer, die Auswahl blendet eines ein.');
{
  const { v, pin } = wert;
  const typ = option(v, 240, -200, 'Wert (1 Byte) / Zwangsführung (2 Bit)', ['1-Byte-Wert', '2-Bit-Wert (Zwangsführung)'], 'Werttyp');
  /* 1 Byte */
  const cR = add(v, 'const', 480, 0, { label: 'Wert bei steigender Flanke', props: { name: 'Wert bei steigender Flanke (0…255)' }, params: { value: 0 }, when: [typ, 0] });
  const cF = add(v, 'const', 480, 140, { label: 'Wert bei fallender Flanke', props: { name: 'Wert bei fallender Flanke (0…255)' }, params: { value: 0 }, when: [typ, 0] });
  const m1 = add(v, 'merge', 760, 60, { props: { vtype: 'num' } });
  const k1 = add(v, 'ko_out', 1000, 60, { label: 'Wert senden', props: { name: 'Wert senden', dpt: '5.010' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [typ, 0] });
  link(v, pin.steigend, 'out', cR, 'trig'); link(v, pin.fallend, 'out', cF, 'trig');
  link(v, cR, 'out', m1, 'i0'); link(v, cF, 'out', m1, 'i1'); link(v, m1, 'out', k1, 'in');
  /* 2 Bit: Eintrag 0/1/2 → DPT 2.001 0 (nicht aktiv), 2 (AUS), 3 (EIN) = e + min(e, 1) */
  const ZW = ['nicht aktiv', 'Zwangsführung AUS', 'Zwangsführung EIN'];
  const zw = (y, flank, src) => {
    const o = option(v, 240, y, `Zwangsführung bei ${flank} Flanke`, ZW, `Zwangsführung ${flank}`, { when: [typ, 1] });
    const mn = add(v, 'math', 480, y + 40, { label: 'aktiv', props: { op: 'min', fixed: 'b' }, params: { k: 1 }, fixed: ['k'] });
    const ad = add(v, 'math', 640, y, { label: 'DPT 2.001', props: { op: 'add', fixed: 'none' } });
    const l = add(v, 'latch', 800, y, { props: { vtype: 'num' }, fixed: ['change'] });
    link(v, o, 'out', mn, 'a'); link(v, o, 'out', ad, 'a'); link(v, mn, 'out', ad, 'b'); link(v, ad, 'out', l, 'in'); link(v, src, 'out', l, 'trig');
    return l;
  };
  const zR = zw(320, 'steigender', pin.steigend), zF = zw(500, 'fallender', pin.fallend);
  const m2 = add(v, 'merge', 1000, 400, { props: { vtype: 'num' } });
  const k2 = add(v, 'ko_out', 1240, 400, { label: 'Zwangsführung', props: { name: 'Zwangsführung', dpt: '2.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [typ, 1] });
  link(v, zR, 'out', m2, 'i0'); link(v, zF, 'out', m2, 'i1'); link(v, m2, 'out', k2, 'in');
}

const schalter = macro('Schalter', [['Taste', 'bool'], ['Startzustand', 'bool'], ['Betrieb', 'bool']], [],
  '**Funktion Schalter** (MDT „Schalter“) mit den Unterfunktionen der MDT-Applikation:\n\n' +
  '- Schalten bzw. Umschalten bei steigender, fallender oder beiden Flanken; Umschalten folgt dem Objekt „Wert für Umschalten“ (Rückmeldung des Aktors).\n' +
  '- Status senden: Wert für steigende und fallende Flanke, wahlweise nach Busspannungswiederkehr (nach der Startzeit) und zyklisch.\n' +
  '- Status mit Ein- oder Ausschaltverzögerung.\n' +
  '- Wert senden (1 Byte oder Zwangsführung 2 Bit) bei steigender, fallender oder beiden Flanken (Untermakro *Wert senden*).\n\n' +
  'Die Unterfunktion wählt über Auswahl-Blöcke, welche Flanke welchen Weg auslöst.');
{
  const { v, pin } = schalter;
  const u = option(v, 240, -360, 'Unterfunktion', UNTER, 'Unterfunktion', { params: { sel: 1 } });
  const e = add(v, 'edge', 240, 0);
  link(v, pin.Taste, 'out', e, 'in'); link(v, pin.Startzustand, 'out', e, 'set');
  const oR = option(v, 480, -240, 'Wert bei steigender Flanke', AUS_EIN, 'Wert steigend', { params: { sel: 1 }, when: [u, 0, 4] });
  const oF = option(v, 480, -120, 'Wert bei fallender Flanke', AUS_EIN, 'Wert fallend', { when: [u, 2, 4] });
  /* Schalten / Status: Wert der Flanke */
  const sR = route(v, 480, 0, 'Flanke für Wert steigend', u), sF = route(v, 480, 160, 'Flanke für Wert fallend', u);
  link(v, e, 'rise', sR, 'i0'); link(v, e, 'rise', sR, 'i4'); link(v, e, 'fall', sF, 'i2'); link(v, e, 'fall', sF, 'i4');
  const lR = add(v, 'latch', 720, 0, { label: 'Wert steigend', fixed: ['change'] });
  const lF = add(v, 'latch', 720, 160, { label: 'Wert fallend', fixed: ['change'] });
  link(v, oR, 'out', lR, 'in'); link(v, sR, 'out', lR, 'trig'); link(v, oF, 'out', lF, 'in'); link(v, sF, 'out', lF, 'trig');
  /* Umschalten */
  const both = add(v, 'merge', 480, 320, { label: 'beide Flanken' });
  link(v, e, 'rise', both, 'i0'); link(v, e, 'fall', both, 'i1');
  const sT = route(v, 720, 320, 'Flanke für Umschalten', u);
  link(v, e, 'rise', sT, 'i1'); link(v, e, 'fall', sT, 'i3'); link(v, both, 'out', sT, 'i5');
  const st = add(v, 'ko_in', 720, 480, { label: 'Wert für Umschalten', props: { name: 'Wert für Umschalten', dpt: '1.001' }, when: [u, 1, 3, 5] });
  const tg = add(v, 'toggle', 960, 320);
  link(v, sT, 'out', tg, 'trig'); link(v, st, 'out', tg, 'set');
  /* Status mit Verzögerung */
  const dOn = add(v, 'delay', 480, 640, { label: 'Einschaltverzögerung', params: { on: 1, off: 0 }, fixed: ['off'], when: [u, 9] });
  const dOff = add(v, 'delay', 480, 800, { label: 'Ausschaltverzögerung', params: { on: 0, off: 1 }, fixed: ['on'], when: [u, 10] });
  link(v, pin.Taste, 'out', dOn, 'in'); link(v, pin.Taste, 'out', dOff, 'in');
  const sD = route(v, 720, 700, 'Verzögerter Status', u);
  link(v, dOn, 'out', sD, 'i9'); link(v, dOff, 'out', sD, 'i10');
  /* Status nach Busspannungswiederkehr (nach der Startzeit) */
  const oBus = option(v, 480, 960, 'Verhalten bei Busspannungswiederkehr', ['nichts senden', 'Status senden'], 'Status bei Start', { when: [u, 4] });
  const sSt = add(v, 'select', 720, 960, { label: 'Status bei Start' });
  link(v, pin.Startzustand, 'out', sSt, 'cond'); link(v, oR, 'out', sSt, 'a'); link(v, oF, 'out', sSt, 'b');
  const gBus = add(v, 'gate', 960, 960, { label: 'Status senden', params: { lock: 0, init: 0, resend: 1 }, fixed: ['lock', 'init', 'resend'] });
  const gRun = add(v, 'gate', 1200, 960, { label: 'nach der Startzeit', params: { lock: 0, init: 0, resend: 1 }, fixed: ['lock', 'init', 'resend'] });
  const sBus = route(v, 1440, 960, 'nur bei Status senden', u);
  link(v, sSt, 'out', gBus, 'in'); link(v, oBus, 'out', gBus, 'ctl'); link(v, gBus, 'out', gRun, 'in'); link(v, pin.Betrieb, 'out', gRun, 'ctl');
  link(v, gRun, 'out', sBus, 'i4');
  /* 1 Bit auf das Objekt „Schalten“ */
  const mg = add(v, 'merge', 1680, 240, { props: { count: 5 } });
  [lR, lF, tg, sD, sBus].forEach((x, k) => link(v, x, 'out', mg, 'i' + k));
  const ko = add(v, 'ko_out', 1920, 240, { label: 'Schalten', props: { name: 'Schalten', dpt: '1.001' }, params: { mode: 1 }, fixed: ['mode'], when: [u, 0, 1, 2, 3, 4, 5, 9, 10] });
  link(v, mg, 'out', ko, 'in');
  /* Wert senden */
  const vR = route(v, 960, -200, 'Flanke für Wert senden steigend', u), vF = route(v, 960, -60, 'Flanke für Wert senden fallend', u);
  link(v, e, 'rise', vR, 'i6'); link(v, e, 'rise', vR, 'i8'); link(v, e, 'fall', vF, 'i7'); link(v, e, 'fall', vF, 'i8');
  const w = use(v, wert, 1200, -140, 'Wert senden', [u, 6, 7, 8]);
  into(v, vR, 'out', w, wert, 'steigend'); into(v, vF, 'out', w, wert, 'fallend');
}

/* Schalter kurz/lang: je Objekt Aus, Ein, Umschalten, Wert oder nichts */
const kurzlang = macro('Schalter kurz/lang', [['Taste', 'bool']], [],
  '**Funktion Schalter kurz/lang** (MDT „Schalter kurz/lang“): kurzer Druck auf Objekt 1, langer auf Objekt 2, jeweils Aus, Ein, Umschalten (mit eigenem Objekt „Wert für Umschalten“), Wert senden (1 Byte) oder keine Reaktion. Die Zeit für den langen Druck steht bei der Tastenauswertung.');
{
  const { v, pin } = kurzlang;
  const pr = add(v, 'press', 240, 0, { label: 'Tastendruck', params: { long: 800, dbl: 0 }, fixed: ['dbl'] });
  link(v, pin.Taste, 'out', pr, 'in');
  const CH = ['Aus', 'Ein', 'Umschalten', 'Wert senden', 'keine Reaktion'];
  const side = (y, k, what, obj, def, num) => {
    const o = option(v, 480, y - 160, `Wert für Tastendruck ${what} – Objekt ${k}`, CH, `Tastendruck ${what}`, { params: { sel: def } });
    const s = route(v, 480, y, `Tastendruck ${what}`, o, 5);
    [0, 1, 2, 3].forEach(i => link(v, pr, what === 'kurz' ? 'short' : 'long', s, 'i' + i));
    /* Aus sendet 0, Ein 1 */
    const l = add(v, 'not', 720, y, { label: `Aus ${what}` });
    link(v, s, 'out', l, 'in');
    const sT = route(v, 720, y + 120, `Umschalten ${what}`, o, 5);
    link(v, s, 'out', sT, 'i2');
    const st = add(v, 'ko_in', 720, y + 240, { label: `Wert für Umschalten ${what}`, props: { name: `Wert für Umschalten ${what}`, dpt: '1.001' }, when: [o, 2] });
    const tg = add(v, 'toggle', 960, y + 120);
    link(v, sT, 'out', tg, 'trig'); link(v, st, 'out', tg, 'set');
    const sl = route(v, 960, y, `Aus/Ein ${what}`, o, 5);
    link(v, l, 'out', sl, 'i0'); link(v, s, 'out', sl, 'i1');
    const mg = add(v, 'merge', 1200, y);
    link(v, sl, 'out', mg, 'i0'); link(v, tg, 'out', mg, 'i1');
    const ko = add(v, 'ko_out', 1440, y, { label: `Taste ${what}`, props: { name: `Taste ${what}`, dpt: '1.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [o, 0, 1, 2] });
    link(v, mg, 'out', ko, 'in');
    const sV = route(v, 960, y + 360, `Wert ${what}`, o, 5);
    link(v, s, 'out', sV, 'i3');
    const c = add(v, 'const', 1200, y + 360, { label: `Wert ${what}`, props: { name: `Wert ${what} (0…255)` }, params: { value: 0 }, when: [o, 3] });
    const kv = add(v, 'ko_out', 1440, y + 360, { label: `Taste ${what} Wert`, props: { name: `Taste ${what}`, dpt: '5.010' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [o, 3] });
    link(v, sV, 'out', c, 'trig'); link(v, c, 'out', kv, 'in');
    void obj; void num;
  };
  side(0, 1, 'kurz', 0, 1);
  side(700, 2, 'lang', 2, 4);
}

const dimmen = macro('Dimmen', [['Taste', 'bool']], [],
  '**Funktion Dimmen** (MDT „Eintasten-Dimmen“): kurz schaltet um, lang dimmt abwechselnd heller und dunkler, Loslassen stoppt. Das Objekt „Status Dimmen“ nimmt die Rückmeldung des Dimmers auf. Schrittweite und Wiederholzeit der MDT-Applikation sind nicht abgebildet (Start-Stopp-Dimmen).');
{
  const { v, pin } = dimmen;
  const dk = add(v, 'dimkey', 480, 0, { props: { keys: 'one' }, params: { long: 800 } });
  const st = add(v, 'ko_in', 240, 160, { label: 'Status Dimmen', props: { name: 'Status Dimmen', dpt: '1.001' } });
  link(v, pin.Taste, 'out', dk, 'k'); link(v, st, 'out', dk, 'status');
  const sw = add(v, 'ko_out', 760, 0, { label: 'Dimmen Ein/Aus', props: { name: 'Dimmen Ein/Aus', dpt: '1.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'] });
  const dm = add(v, 'ko_out', 760, 140, { label: 'Dimmen', props: { name: 'Dimmen', dpt: '3.007' }, params: { mode: 1 }, fixed: ['mode', 'cycle'] });
  link(v, dk, 'sw', sw, 'in'); link(v, dk, 'dim', dm, 'in');
}

const jalousie = macro('Jalousie', [['Taste', 'bool']], [],
  '**Funktion Jalousie** (MDT „Eintasten-Jalousie“): lang fährt (Richtung wechselt bei jedem langen Druck), kurz stoppt bzw. verstellt die Lamelle. Die umgekehrte Bedienung (kurz fahren, lang Lamelle) und das Objekt für den Richtungswechsel sind nicht abgebildet.');
{
  const { v, pin } = jalousie;
  const bk = add(v, 'blindkey', 480, 0, { props: { keys: 'one' }, params: { long: 800 } });
  link(v, pin.Taste, 'out', bk, 'k');
  const mv = add(v, 'ko_out', 760, 0, { label: 'Jalousie Auf/Ab', props: { name: 'Jalousie Auf/Ab', dpt: '1.008' }, params: { mode: 1 }, fixed: ['mode', 'cycle'] });
  const sp = add(v, 'ko_out', 760, 140, { label: 'Stopp/Lamelle', props: { name: 'Stopp/Lamelle', dpt: '1.007' }, params: { mode: 1 }, fixed: ['mode', 'cycle'] });
  link(v, bk, 'move', mv, 'in'); link(v, bk, 'step', sp, 'in');
}

const zaehler = macro('Zähler', [['Taste', 'bool'], ['Startzustand', 'bool']], [],
  '**Funktion Zähler** (MDT „Zähler“): zählt steigende, fallende oder beide Flanken; das Objekt „Zähler zurücksetzen“ setzt auf 0. Abweichend von MDT zählt der Block mit 16 Bit (bis zur Zählergrenze, höchstens 32767) und sendet jeden neuen Stand (keine Sendedifferenz).');
{
  const { v, pin } = zaehler;
  const u = option(v, 240, -200, 'Unterfunktion', ['steigende Flanke zählen', 'fallende Flanke zählen', 'steigende und fallende Flanke zählen'], 'Unterfunktion', { params: { sel: 2 } });
  const e = add(v, 'edge', 240, 0);
  link(v, pin.Taste, 'out', e, 'in'); link(v, pin.Startzustand, 'out', e, 'set');
  const both = add(v, 'merge', 480, 120, { label: 'beide Flanken' });
  link(v, e, 'rise', both, 'i0'); link(v, e, 'fall', both, 'i1');
  const s = route(v, 720, 0, 'Flanke zählen', u, 3);
  link(v, e, 'rise', s, 'i0'); link(v, e, 'fall', s, 'i1'); link(v, both, 'out', s, 'i2');
  const rs = add(v, 'ko_in', 720, 200, { label: 'Zähler zurücksetzen', props: { name: 'Zähler zurücksetzen', dpt: '1.001' } });
  const c = add(v, 'counter', 960, 0, { label: 'Zähler', params: { step: 1, min: 0, max: 32767, start: 0, wrap: 1 }, fixed: ['step', 'min', 'start'] });
  link(v, s, 'out', c, 'up'); link(v, rs, 'out', c, 'reset');
  const ko = add(v, 'ko_out', 1200, 0, { label: 'Zähler', props: { name: 'Zähler', dpt: '13.001' }, params: { mode: 0 }, fixed: ['mode', 'cycle'] });
  link(v, c, 'out', ko, 'in');
}

const szene = macro('Szene', [['Taste', 'bool'], ['Betrieb', 'bool']], [],
  '**Funktion Szene** (MDT „Szene“): kurzer Druck ruft die Szene ab, mit „Speichern“ speichert ein langer Druck sie (DPT 18.001, Bit 7). Ohne Speichern ruft auch ein langer Druck ab.');
{
  const { v, pin } = szene;
  const sv = option(v, 240, -200, 'Unterfunktion', ['ohne Speichern', 'mit Speichern'], 'Speichern', { params: { sel: 1 } });
  const pr = add(v, 'press', 240, 0, { label: 'Tastendruck', params: { long: 800, dbl: 0 }, fixed: ['dbl'] });
  link(v, pin.Taste, 'out', pr, 'in');
  /* Szenennummer 1…64 → 0…63, einmal nach dem Start in die Speicher */
  const nr = add(v, 'const', 240, 200, { label: 'Szenennummer', props: { name: 'Szenennummer (1…64)' }, params: { value: 1 } });
  const sub = add(v, 'math', 480, 200, { label: '−1', props: { op: 'sub', fixed: 'b' }, params: { k: 1 }, fixed: ['k'] });
  const lrn = add(v, 'math', 480, 340, { label: 'Speichern (+128)', props: { op: 'add', fixed: 'b' }, params: { k: 128 }, fixed: ['k'] });
  link(v, pin.Betrieb, 'out', nr, 'trig'); link(v, nr, 'out', sub, 'a'); link(v, sub, 'out', lrn, 'a');
  const gS = add(v, 'gate', 480, -100, { label: 'lang speichert', params: { lock: 0, init: 0, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
  const gA = add(v, 'gate', 480, 60, { label: 'lang ruft ab', params: { lock: 1, init: 0, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
  link(v, pr, 'long', gS, 'in'); link(v, sv, 'out', gS, 'ctl'); link(v, pr, 'long', gA, 'in'); link(v, sv, 'out', gA, 'ctl');
  const call = add(v, 'merge', 720, 0, { label: 'Abrufen' });
  link(v, pr, 'short', call, 'i0'); link(v, gA, 'out', call, 'i1');
  const lC = add(v, 'latch', 960, 100, { label: 'Szene abrufen', props: { vtype: 'num' }, fixed: ['change'] });
  const lS = add(v, 'latch', 960, 260, { label: 'Szene speichern', props: { vtype: 'num' }, fixed: ['change'] });
  link(v, sub, 'out', lC, 'in'); link(v, call, 'out', lC, 'trig'); link(v, lrn, 'out', lS, 'in'); link(v, gS, 'out', lS, 'trig');
  const mg = add(v, 'merge', 1200, 160, { props: { vtype: 'num' } });
  link(v, lC, 'out', mg, 'i0'); link(v, lS, 'out', mg, 'i1');
  const ko = add(v, 'ko_out', 1440, 160, { label: 'Szene', props: { name: 'Szene', dpt: '18.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'] });
  link(v, mg, 'out', ko, 'in');
}

const led = macro('LED-Ausgang', [['Betrieb', 'bool']], [['LED', 'bool']],
  '**Funktion LED-Ausgang** (MDT „LED-Ausgang“): Der Pin des Eingangs treibt eine LED. Objektwert normal oder invertiert, bei EIN dauernd oder blinkend (700 ms), solange das Objekt noch keinen Wert hat aus oder kurzes Aufblitzen (100 ms alle 1,5 s) wie bei in16-bim112.');
{
  const { v, pin, out } = led;
  const ko = add(v, 'ko_in', 0, 300, { label: 'LED schalten', props: { name: 'LED schalten', dpt: '1.001' } });
  const oInv = option(v, 240, -240, 'LED-Zustand bei Objektwert 0/1', ['AUS / EIN (normal)', 'EIN / AUS (invertiert)'], 'LED invertiert');
  const oBl = option(v, 480, -240, 'LED-Zustand bei EIN', ['dauernd', 'blinkend'], 'LED blinkt');
  const oUn = option(v, 720, -240, 'Verhalten der LED bei undefiniertem Objekt', ['AUS', 'kurzes Aufblitzen'], 'LED unbekannt');
  /* erst der Weg zur LED, dann das Ende des Aufblitzens (Reihenfolge der Verbindungen) */
  const not = add(v, 'not', 240, 200);
  const sInv = add(v, 'select', 480, 300, { label: 'invertiert' });
  link(v, ko, 'out', not, 'in'); link(v, not, 'out', sInv, 'a'); link(v, ko, 'out', sInv, 'b'); link(v, oInv, 'out', sInv, 'cond');
  const blink = add(v, 'clock', 720, 400, { label: 'Blinken', params: { on: 700, off: 700, count: 0, after: 0 }, fixed: ['on', 'off', 'count', 'after'] });
  const sBl = add(v, 'select', 960, 300, { label: 'blinkend' });
  link(v, sInv, 'out', blink, 'en'); link(v, blink, 'out', sBl, 'a'); link(v, sInv, 'out', sBl, 'b'); link(v, oBl, 'out', sBl, 'cond');
  /* x ODER nicht x: 1 bei jedem Telegramm */
  const nk = add(v, 'not', 120, 640);
  const known = add(v, 'or', 240, 560, { label: 'Wert empfangen' });
  link(v, ko, 'out', known, 'i0'); link(v, ko, 'out', nk, 'in'); link(v, nk, 'out', known, 'i1');
  const and = add(v, 'and', 480, 660, { label: 'Aufblitzen gewählt' });
  link(v, pin.Betrieb, 'out', and, 'i0'); link(v, oUn, 'out', and, 'i1');
  const rs = add(v, 'rs', 720, 600, { label: 'Objekt unbekannt', fixed: ['prio'] });
  link(v, and, 'out', rs, 's'); link(v, known, 'out', rs, 'r');
  const flash = add(v, 'clock', 960, 600, { label: 'Aufblitzen', params: { on: 100, off: 1400, count: 0, after: 2 }, fixed: ['on', 'off', 'count', 'after'] });
  link(v, rs, 'out', flash, 'en');
  const mg = add(v, 'merge', 1200, 400);
  link(v, sBl, 'out', mg, 'i0'); link(v, flash, 'out', mg, 'i1'); link(v, mg, 'out', out.LED, 'in');
}

/* ---------- Eingang (eine Seite je Kanal) ---------- */

const FUNKTION = ['inaktiv', 'Schalter', 'Schalter kurz/lang', 'Dimmen', 'Jalousie', 'Zähler', 'Szene', 'LED-Ausgang'];
const IN = [1, 2, 3, 4, 5, 6];
const eingang = macro('Eingang', [['Betrieb', 'bool']], [['Zustand', 'bool']],
  '**Eingang** wie ein Kanal der MDT-Applikation (Kanäle einzeln)\n\n' +
  '- Funktion: Schalter, Schalter kurz/lang, Dimmen, Jalousie, Zähler, Szene (je ein Untermakro ohne eigene Seite) oder LED-Ausgang.\n' +
  '- Eingang: Digitaleingang mit Pull-up gegen Masse (aktiv low), Entprellzeit je Kanal. Bis zum Ende der Startzeit (Systemstart auf der Seite Allgemein) gehen keine Flanken weiter.\n' +
  '- Sperrobjekt: 1 sperrt die Funktion (wie MDT „Sperrobjekt“).\n' +
  '- LED-Ausgang: Derselbe Pin wird zum Digitalausgang. Digitaleingang und -ausgang schließen sich über die Funktion aus, darum dürfen sie sich den Pin teilen; die Firmware richtet nur den gewählten ein.\n' +
  '- Ausgang „Zustand“: entprellter Eingang für die Logik.', true);
const E = {};
{
  const { v, pin, out } = eingang;
  const f = option(v, 240, -360, 'Funktion', FUNKTION, 'Funktion', { params: { sel: 1 } });
  const di = add(v, 'di', 0, 0, { label: 'Eingang', props: { pin: 'IO1', pullup: true, invert: true }, params: { debounce: 30 }, when: [f, ...IN] });
  const gRun = add(v, 'gate', 240, 0, { label: 'Startzeit', params: { lock: 0, init: 0, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
  link(v, di, 'out', gRun, 'in'); link(v, pin.Betrieb, 'out', gRun, 'ctl'); link(v, gRun, 'out', out.Zustand, 'in');
  const oLock = option(v, 480, -240, 'Sperrobjekt', ['inaktiv', 'aktiv'], 'Sperrobjekt', { when: [f, ...IN] });
  const kLock = add(v, 'ko_in', 480, 160, { label: 'Sperrobjekt', props: { name: 'Sperrobjekt', dpt: '1.003' }, when: [oLock, 1] });
  const gLock = add(v, 'gate', 720, 0, { label: 'Sperre', params: { lock: 1, init: 1, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
  link(v, gRun, 'out', gLock, 'in'); link(v, kLock, 'out', gLock, 'ctl');
  const fx = [[schalter, 1], [kurzlang, 2], [dimmen, 3], [jalousie, 4], [zaehler, 5], [szene, 6]].map(([mc, k], i) => {
    const x = use(v, mc, 1000, -200 + 180 * i, FUNKTION[k], [f, k]);
    into(v, gLock, 'out', x, mc, 'Taste');
    if (mc.pin.Startzustand) into(v, di, 'start', x, mc, 'Startzustand');
    if (mc.pin.Betrieb) v.links.push({ from: [pin.Betrieb.id, 'out'], to: [x.id, port(mc, 'macro_in', 'Betrieb')] });
    return x;
  });
  const lx = use(v, led, 1000, 900, 'LED-Ausgang', [f, 7]);
  v.links.push({ from: [pin.Betrieb.id, 'out'], to: [lx.id, port(led, 'macro_in', 'Betrieb')] });
  const dout = add(v, 'do', 1300, 900, { label: 'LED', props: { pin: 'IO1', invert: false, initial: false }, when: [f, 7] });
  from(v, lx, led, 'LED', dout, 'in');
  Object.assign(E, { di, dout, fx, lx });
}

/* ---------- Zweiflächig (Kanäle gruppiert, eigene Seite) ---------- */

const zwei = macro('Zweiflächig', [['Betrieb', 'bool']], [['Zustand 1', 'bool'], ['Zustand 2', 'bool']],
  '**Kanäle gruppiert** (MDT „Kanäle gruppiert“): zwei Eingänge als Wippe – Schalten (Ein/Aus), Dimmen (heller/dunkler) oder Jalousie (auf/ab), die Belegung der Tasten umkehrbar. Ein gemeinsames Sperrobjekt.', true);
const Z = {};
{
  const { v, pin, out } = zwei;
  const g = option(v, 240, -360, 'Funktion', ['Schalten', 'Dimmen', 'Jalousie'], 'Funktion', { params: { sel: 1 } });
  const dis = [0, 1].map(k => {
    const di = add(v, 'di', 0, 160 * k, { label: `Eingang ${k + 1}`, props: { pin: 'IO1', pullup: true, invert: true }, params: { debounce: 30 } });
    const gr = add(v, 'gate', 240, 160 * k, { label: `Startzeit ${k + 1}`, params: { lock: 0, init: 0, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
    link(v, di, 'out', gr, 'in'); link(v, pin.Betrieb, 'out', gr, 'ctl'); link(v, gr, 'out', out[`Zustand ${k + 1}`], 'in');
    return [di, gr];
  });
  const oLock = option(v, 480, -240, 'Sperrobjekt', ['inaktiv', 'aktiv'], 'Sperrobjekt');
  const kLock = add(v, 'ko_in', 480, 360, { label: 'Sperrobjekt', props: { name: 'Sperrobjekt', dpt: '1.003' }, when: [oLock, 1] });
  const keys = dis.map(([, gr], k) => {
    const gl = add(v, 'gate', 480, 160 * k, { label: `Sperre ${k + 1}`, params: { lock: 1, init: 1, resend: 0 }, fixed: ['lock', 'init', 'resend'] });
    link(v, gr, 'out', gl, 'in'); link(v, kLock, 'out', gl, 'ctl');
    return gl;
  });
  /* Belegung umkehren: Taste für „heller/ein/auf“ und „dunkler/aus/ab“ */
  const swap = (y, opt, label) => [0, 1].map(k => {
    const s = add(v, 'select', 720, y + 120 * k, { label: `${label} ${k + 1}` });
    link(v, opt, 'out', s, 'cond'); link(v, keys[1 - k], 'out', s, 'a'); link(v, keys[k], 'out', s, 'b');
    return s;
  });
  /* Schalten */
  const oS = option(v, 720, -240, 'Schaltfunktion', ['Eingang 1 = Ein, Eingang 2 = Aus', 'Eingang 1 = Aus, Eingang 2 = Ein'], 'Schaltfunktion', { when: [g, 0] });
  const [sOn, sOff] = swap(0, oS, 'Taste Ein/Aus');
  const eOn = add(v, 'edge', 960, 0), eOff = add(v, 'edge', 960, 120);
  link(v, sOn, 'out', eOn, 'in'); link(v, sOff, 'out', eOff, 'in');
  /* Ein-Taste sendet 1, Aus-Taste 0 */
  const nOff = add(v, 'not', 1200, 120);
  link(v, eOff, 'rise', nOff, 'in');
  const mS = add(v, 'merge', 1440, 60);
  link(v, eOn, 'rise', mS, 'i0'); link(v, nOff, 'out', mS, 'i1');
  const kS = add(v, 'ko_out', 1680, 60, { label: 'Schalten', props: { name: 'Schalten', dpt: '1.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [g, 0] });
  link(v, mS, 'out', kS, 'in');
  /* Dimmen */
  const oD = option(v, 720, 260, 'Dimmfunktion', ['Eingang 1 = heller, Eingang 2 = dunkler', 'Eingang 1 = dunkler, Eingang 2 = heller'], 'Dimmfunktion', { when: [g, 1] });
  const [dUp, dDn] = swap(400, oD, 'Taste heller/dunkler');
  const dk = add(v, 'dimkey', 960, 400, { props: { keys: 'two' }, params: { long: 800 }, when: [g, 1] });
  link(v, dUp, 'out', dk, 'k'); link(v, dDn, 'out', dk, 'k2');
  const kD1 = add(v, 'ko_out', 1680, 400, { label: 'Dimmen Ein/Aus', props: { name: 'Dimmen Ein/Aus', dpt: '1.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [g, 1] });
  const kD2 = add(v, 'ko_out', 1680, 520, { label: 'Dimmen', props: { name: 'Dimmen', dpt: '3.007' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [g, 1] });
  link(v, dk, 'sw', kD1, 'in'); link(v, dk, 'dim', kD2, 'in');
  /* Jalousie */
  const oJ = option(v, 720, 660, 'Jalousiefunktion', ['Eingang 1 = auf, Eingang 2 = ab', 'Eingang 1 = ab, Eingang 2 = auf'], 'Jalousiefunktion', { when: [g, 2] });
  const [jUp, jDn] = swap(800, oJ, 'Taste auf/ab');
  const bk = add(v, 'blindkey', 960, 800, { props: { keys: 'two' }, params: { long: 800 }, when: [g, 2] });
  link(v, jUp, 'out', bk, 'k'); link(v, jDn, 'out', bk, 'k2');
  const kJ1 = add(v, 'ko_out', 1680, 800, { label: 'Jalousie Auf/Ab', props: { name: 'Jalousie Auf/Ab', dpt: '1.008' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [g, 2] });
  const kJ2 = add(v, 'ko_out', 1680, 920, { label: 'Stopp/Lamelle', props: { name: 'Stopp/Lamelle', dpt: '1.007' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [g, 2] });
  link(v, bk, 'move', kJ1, 'in'); link(v, bk, 'step', kJ2, 'in');
  Z.dis = dis.map(([di]) => di);
}

/* ---------- Logik (eine Seite je Logik) ---------- */

const logik = macro('Logik', [['A', 'bool'], ['B', 'bool'], ['C', 'bool'], ['D', 'bool']], [],
  '**Logik** (MDT „Logik 1…4“): UND oder ODER über die Eingänge A–D und zwei Verknüpfungsobjekte (je nicht verwendet, normal oder invertiert), Ergebnis wahlweise invertiert. Objekttyp Schalten (Senden bei Änderung des Eingangs oder des Ausgangs), Szene oder 1-Byte-Wert – diese beiden werden gesendet, wenn das Ergebnis 1 ist. Die Verknüpfungsobjekte stehen immer zur Verfügung, auch wenn sie nicht verwendet werden.', true);
{
  const { v, pin } = logik;
  const lg = add(v, 'logic', 480, 0, { label: 'Verknüpfung',
    props: { count: 6, names: 'Eingang A\nEingang B\nEingang C\nEingang D\nVerknüpfungsobjekt A\nVerknüpfungsobjekt B' },
    params: { op: 0, m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, inv: 0 } });
  /* Verknüpfung UND/ODER wie bei MDT, XOR nicht */
  ['A', 'B', 'C', 'D'].forEach((x, k) => link(v, pin[x], 'out', lg, 'i' + k));
  ['A', 'B'].forEach((x, k) => {
    const ko = add(v, 'ko_in', 240, 300 + 120 * k, { label: `Verknüpfungsobjekt ${x}`, props: { name: `Verknüpfungsobjekt ${x}`, dpt: '1.002' } });
    link(v, ko, 'out', lg, 'i' + (4 + k));
  });
  const typ = option(v, 480, -240, 'Objekttyp', ['Schalten', 'Szene', '1-Byte-Wert'], 'Objekttyp');
  const ks = add(v, 'ko_out', 960, -100, { label: 'Ausgang', props: { name: 'Ausgang', dpt: '1.002' }, params: { mode: 0 }, when: [typ, 0] });
  link(v, lg, 'out', ks, 'in');
  const cS = add(v, 'const', 720, 100, { label: 'Szene', props: { name: 'Szenennummer (1…64)' }, params: { value: 1 }, when: [typ, 1] });
  const sub = add(v, 'math', 900, 100, { label: '−1', props: { op: 'sub', fixed: 'b' }, params: { k: 1 }, fixed: ['k'] });
  const kS = add(v, 'ko_out', 1100, 100, { label: 'Ausgang Szene', props: { name: 'Ausgang Szene', dpt: '17.001' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [typ, 1] });
  link(v, lg, 'out', cS, 'trig'); link(v, cS, 'out', sub, 'a'); link(v, sub, 'out', kS, 'in');
  const cV = add(v, 'const', 720, 260, { label: 'Wert', props: { name: '1-Byte-Wert (0…255)' }, params: { value: 0 }, when: [typ, 2] });
  const kV = add(v, 'ko_out', 1100, 260, { label: 'Ausgang Wert', props: { name: 'Ausgang Wert', dpt: '5.010' }, params: { mode: 1 }, fixed: ['mode', 'cycle'], when: [typ, 2] });
  link(v, lg, 'out', cV, 'trig'); link(v, cV, 'out', kV, 'in');
}

/* ---------- Gerät ---------- */

const start = add(m, 'start', 40, -360, { label: 'Startzeit', params: { delay: 1 } });
add(m, 'ratelimit', 40, -520, { label: 'Telegrammratenbegrenzung', params: { limit: 10 } });
/* Kanalpaare: deaktiviert, gruppiert (eine Seite „Eingang A / B“) oder
   einzeln (Seiten „Eingang A“ und „Eingang B“); Zustand für die Logik */
const zust = [];
const pairs = [['A', 'B'], ['C', 'D']].map(([a, b], k) => {
  const y = -200 + 700 * k;
  const p = option(m, 40, y, `Funktion Eingang ${a} / ${b}`, ['deaktiviert', 'Kanäle gruppiert', 'Kanäle einzeln'], `Funktion Eingang ${a} / ${b}`, { params: { sel: 2 } });
  const gz = use(m, zwei, 400, y, `Eingang ${a} / ${b}`, [p, 1]);
  const ch = [a, b].map((c, j) => use(m, eingang, 400, y + 200 + 200 * j, `Eingang ${c}`, [p, 2]));
  into(m, start, 'out', gz, zwei, 'Betrieb');
  ch.forEach(x => into(m, start, 'out', x, eingang, 'Betrieb'));
  [0, 1].forEach(j => {
    const mg = add(m, 'merge', 760, y + 100 + 200 * j, { label: `Zustand ${[a, b][j]}` });
    from(m, gz, zwei, `Zustand ${j + 1}`, mg, 'i0'); from(m, ch[j], eingang, 'Zustand', mg, 'i1');
    zust.push(mg);
  });
  return { p, gz, ch };
});
M.normalize(m);
/* Pins IO1–IO4: Gruppe und einzelne Kanäle teilen sie (die Auswahl schließt aus) */
pairs.forEach(({ gz, ch }, k) => {
  ch.forEach((c, j) => {
    const io = `IO${2 * k + j + 1}`;
    c.inner[E.di.id].props.pin = io;
    c.inner[E.dout.id].props.pin = io;
  });
  Z.dis.forEach((di, j) => { gz.inner[di.id].props.pin = `IO${2 * k + j + 1}`; });
});

const lOpt = [0, 1, 2, 3].map(l => option(m, 40, 300 + 120 * l, `Logik ${l + 1}`, ['deaktiviert', 'aktiv'], `Logik ${l + 1}`));
const logs = lOpt.map((o, l) => {
  const x = use(m, logik, 1000, 300 + 220 * l, `Logik ${l + 1}`, [o, 1]);
  zust.forEach((z, c) => into(m, z, 'out', x, logik, 'ABCD'[c]));
  return x;
});
M.normalize(m);

add(m, 'note', 40, 1300, { props: { width: 620, text:
  '**Tasterinterface 4-fach mit LED-Ausgängen**, Applikation wie **MDT BE-04001.01 V1.6** (in16-bim112, *Binary input/LED 4f*)\n\n' +
  '- Seite *Allgemein*: Startzeit (bis dahin gehen keine Flanken weiter), Telegrammratenbegrenzung, Funktion Eingang A / B und C / D (deaktiviert, gruppiert, einzeln), Logik 1–4.\n' +
  '- Eingang A–D (einzeln): Schalter, Schalter kurz/lang, Dimmen, Jalousie, Zähler, Szene oder LED-Ausgang, Sperrobjekt; Eingang A / B bzw. C / D (gruppiert): zweiflächig Schalten, Dimmen oder Jalousie.\n' +
  '- Pins IO1–IO4 des 4TE-Controllers, Taster gegen Masse (Pull-up, aktiv low). Als LED-Ausgang wird derselbe Pin zum Ausgang.\n' +
  '- KO-Nummern wie MDT: Kanal k ab 5·k (+0 Schalten/Wert, +1 Umschalten/Dimmen/Stopp, +2 lang/Szene, +3 Zähler, +4 Sperrobjekt), Logik l ab 20 + 3·l (Objekt A, Objekt B, Ausgang), LED schalten 32–35.\n' +
  '- Abweichungen von MDT: siehe die Beschreibung der Makros (u. a. Dimmen ohne Schrittweite, Zähler mit 16 Bit, Zeit für langen Tastendruck je Funktion statt global, Entprellzeit je Kanal).' } });

/* ---------- KO-Nummern wie bei MDT ---------- */

/* Name → Abstand vom ersten Objekt des Kanals */
const OFS = { 'Schalten': 0, 'Wert senden': 0, 'Zwangsführung': 0, 'Wert für Umschalten': 1,
  'Taste kurz': 0, 'Wert für Umschalten kurz': 1, 'Taste lang': 2, 'Wert für Umschalten lang': 3,
  'Dimmen Ein/Aus': 0, 'Dimmen': 1, 'Status Dimmen': 2, 'Jalousie Auf/Ab': 0, 'Stopp/Lamelle': 1,
  'Zähler zurücksetzen': 0, 'Zähler': 3, 'Szene': 2, 'Sperrobjekt': 4 };
const LOGIC = { 'Verknüpfungsobjekt A': 0, 'Verknüpfungsobjekt B': 1, 'Ausgang': 2, 'Ausgang Szene': 2, 'Ausgang Wert': 2 };
const res0 = M.resolve(m);
res0.kos.forEach(k => {
  const n = k.r.node, p = n._path || [];
  const name = n.props.name;
  let nr;
  const top = p[0] && p[0].id;
  const li = logs.findIndex(x => x.id === top);
  /* gruppiert: Objekte beim ersten Kanal des Paars */
  const chan = pairs.flatMap(({ gz, ch }) => [[gz, ch[0]], [ch[1]]]).findIndex(xs => xs.some(x => x.id === top));
  if (li >= 0) nr = 20 + 3 * li + LOGIC[name];
  else if (chan >= 0) nr = name === 'LED schalten' ? 32 + chan : 5 * chan + OFS[name];
  if (!Number.isInteger(nr)) throw new Error('KO ohne Nummer: ' + k.def.text);
  (n._store || n).kos[k.def.id] = nr;
});
M.normalize(m);
const res = M.resolve(m);
if (res.errors.length) throw new Error(res.errors.map(e => e.msg).join('\n'));

/* ---------- in examples.js schreiben ---------- */

const json = JSON.stringify(JSON.parse(M.serialize(m)), null, 1).replace(/\n\s*/g, ' ');
const file = path.join(root, 'js', 'examples.js');
let src = fs.readFileSync(file, 'utf8');
const BEGIN = '  /* BEGIN tasterif', END = '  /* END tasterif */';
if (!src.includes(BEGIN)) src = src.replace(/\n\];\s*$/, `\n${BEGIN} */\n${END}\n];\n`);
const a = src.indexOf(BEGIN), b = src.indexOf(END);
const entry = `  /* BEGIN tasterif – erzeugt von tools/build-tasterif-example.js, nicht von Hand ändern.
     Tasterinterface 4-fach mit LED-Ausgängen, Applikation nach dem Vorbild
     der MDT BE-04001.01 V1.6 (in16-bim112): Kanalpaare gruppiert oder
     einzeln, Funktionen je Eingang, Logik 1–4, KO-Nummern wie dort. */
  { name: '${NAME}', model: ${json} },
`;
fs.writeFileSync(file, src.slice(0, a) + entry + src.slice(b));
console.log(`${NAME}: ${res.nodes.length} Blöcke, ${res.kos.length} KOs, ${res.params.filter(p => !p.fixed).length} Parameter (${res.layout.params.size} Byte), ${res.warnings.length} Hinweise`);
res.warnings.slice(0, 30).forEach(w => console.log('  ' + w.msg));
