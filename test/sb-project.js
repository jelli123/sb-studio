/* Integrationstest mit SB-Project: die erzeugte knxprod so importieren und
 * laden, wie SB-Project es tut, und das Ergebnis lesen wie die sblib.
 *
 *   node test/sb-project.js [Pfad zu sb-project]
 *
 * Nimmt knx-prod.js (Import) und knx-download.js (Downloadplan) aus dem
 * Nachbar-Repository. Ein kleiner XML-Parser ersetzt den DOMParser des
 * Browsers. Statt eines Geräts sammelt ein Speicherabbild die Schreib-
 * zugriffe des Plans; geprüft wird, was MASK0701 daraus liest:
 * Tabellenadressen aus den Task-Segmenten, Adress-, Assoziations- und
 * KO-Tabelle, Parameter. Fehlt sb-project, wird der Test übersprungen.   */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sbp = path.resolve(process.argv[2] || path.join(root, '..', 'sb-project'));
if (!fs.existsSync(path.join(sbp, 'knx-prod.js'))) {
  console.log(`sb-project nicht gefunden unter ${sbp} — übersprungen`);
  process.exit(0);
}

/* ---------- XML-DOM, so weit knx-prod.js ihn braucht ---------- */

const decodeXml = s => s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, e) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'"
    : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)));

class El {
  constructor(name, attrs, parent) {
    this.nodeName = name;
    this.localName = name.split(':').pop();
    this.attributes = attrs;
    this.parentElement = parent;
    this.children = [];
    this.text = '';
  }
  getAttribute(n) { const a = this.attributes.find(x => x.name === n); return a ? a.value : null; }
  hasAttribute(n) { return this.attributes.some(x => x.name === n); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  *all() { for (const c of this.children) { yield c; yield* c.all(); } }
  getElementsByTagName(n) { return [...this.all()].filter(e => n === '*' || e.nodeName === n); }
  getElementsByTagNameNS(ns, n) { return [...this.all()].filter(e => n === '*' || e.localName === n); }
}

function parseXml(text) {
  const doc = new El('#document', [], null);
  let cur = doc;
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) cur.text += m[1];
    else if (m[6] !== undefined) cur.text += decodeXml(m[6]);
    else if (m[3]) {
      if (m[2]) { if (cur.nodeName !== m[3]) throw new Error(`</${m[3]}> schließt <${cur.nodeName}>`); cur = cur.up; continue; }
      const attrs = [];
      m[4].replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, n, a, b) => { attrs.push({ name: n, value: decodeXml(a !== undefined ? a : b) }); });
      const el = new El(m[3], attrs, cur === doc ? null : cur);
      el.up = cur;
      cur.children.push(el);
      if (!m[5]) cur = el;
    }
  }
  if (cur !== doc) throw new Error(`<${cur.nodeName}> nicht geschlossen`);
  doc.documentElement = doc.children[0];
  return doc;
}

class DOMParser {
  parseFromString(text) {
    try { return parseXml(text); }
    catch (e) { const d = new El('#document', [], null); d.children.push(new El('parsererror', [], null)); return d; }
  }
}

/* ---------- Skripte laden ---------- */

['i18n', 'blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS;

const ctx = { console, DOMParser, TextDecoder, TextEncoder, DecompressionStream, Response, Blob, atob, btoa };
vm.createContext(ctx);
for (const f of ['knx-prod.js', 'knx-download.js'])
  vm.runInContext(fs.readFileSync(path.join(sbp, f), 'utf8') +
    '\nthis.KNXProd = typeof KNXProd !== "undefined" ? KNXProd : this.KNXProd;' +
    '\nthis.KNXDownload = typeof KNXDownload !== "undefined" ? KNXDownload : this.KNXDownload;', ctx, { filename: f });
const P = ctx.KNXProd, D = ctx.KNXDownload;

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('  FEHLER:', msg); } };
const fromHex = h => Uint8Array.from((h || '').match(/../g) || [], x => parseInt(x, 16));
const word = (b, i) => (b[i] << 8) | b[i + 1];

/* Gerät aus Sicht der sblib: Speicher und Load State Machines */
function device(steps) {
  const mem = new Map();
  const lsm = {};
  const task = {};
  steps.forEach(s => {
    if (s.op === 'writeMem') fromHex(s.data).forEach((v, i) => mem.set(s.addr + i, v));
    if (s.op === 'lsm') {
      /* Speicherabbildete Ladesteuerung an 0104h: LSM | Ereignis, bei
         Ereignis 3 folgen Segmenttyp, 00 und die Nutzdaten */
      const b = fromHex(s.data);
      const n = s.lsm != null ? s.lsm : b[0] >> 4, ev = s.event != null ? s.event : b[0] & 0x0F;
      lsm[n] = { 1: 'loading', 2: 'loaded', 4: 'unloaded' }[ev] || lsm[n];
      if (ev === 3 && b[1] === 2) task[n] = word(b, 3);
    }
  });
  const read = (a, n) => Array.from({ length: n }, (_, i) => mem.get(a + i));
  return { mem, lsm, task, read };
}

/* Zusätzlich: Objekte aller Größen (2 Bit, 4 Bit, 3, 4 und 14 Byte) */
function sizes() {
  const m = S.model.create();
  ['2.001', '3.007', '10.001', '13.001', '14.056', '232.600'].forEach(dpt => {
    const i = S.model.addNode(m, 'ko_in', 0, 0), o = S.model.addNode(m, 'ko_out', 0, 0);
    i.props.dpt = o.props.dpt = dpt;
    S.model.normalize(m);
    m.links.push({ from: [i.id, 'out'], to: [o.id, 'in'] });
  });
  S.model.addNode(m, 'text_in', 0, 0);
  const tx = S.model.addNode(m, 'text_out', 0, 0), k = S.model.addNode(m, 'ko_in', 0, 0);
  k.props.dpt = '5.010';
  S.model.normalize(m);
  m.links.push({ from: [k.id, 'out'], to: [tx.id, 'in'] });
  return { name: 'Objektgrößen', model: JSON.parse(S.model.serialize(m)) };
}

/* Zusätzlich: zwei Instanzen eines Makros (KO, Relais, ETS-Parameter) */
function macros() {
  const M = S.model, m = M.create();
  const mac = M.createMacro(m, 'Kanal'), v = M.macroView(m, mac.id);
  const sw = M.addNode(v, 'ko_in', 0, 120), rl = M.addNode(v, 'relay', 220, 120);
  M.addNode(v, 'start', 0, 240);
  sw.props.name = 'Schalten';
  v.links.push({ from: [sw.id, 'out'], to: [rl.id, 'in'] });
  M.normalize(m);
  M.addMacro(m, mac.id, 0, 0).label = 'Kanal 1';
  M.addMacro(m, mac.id, 0, 200).label = 'Kanal 2';
  return { name: 'Makro-Kanäle', model: JSON.parse(M.serialize(m)), names: ['Kanal 1: Schalten', 'Kanal 2: Schalten'] };
}

(async () => {
  for (const ex of S.examples.concat([sizes(), macros()])) {
    console.log(ex.name);
    const model = S.model.parse(JSON.stringify(ex.model));
    const res = S.model.resolve(model);
    check(!res.errors.length, 'Beispiel hat Fehler');
    const bytes = S.zip.write(S.knxprod.files(res, null));

    let r;
    try { r = await P.read({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }); }
    catch (e) { check(false, `Import: ${e.message}`); continue; }
    check(r.products.length === 1, `${r.products.length} Produkte statt 1`);
    const item = P.expand ? P.expand(r.products[0]) : r.products[0];
    item.id = 'c1';
    check(item.prog && item.prog.mask === res.mcu.mask, 'Maske nicht übernommen');

    /* Projekt: jedem KO eine eigene Gruppenadresse, Flags aus der Produktdatei,
       der erste ETS-Parameter auf einen anderen Wert */
    const refs = Object.keys(item.objs || {});
    const names = refs.map(k => item.objs[k].name || item.objs[k].text || '');
    (ex.names || []).forEach(n => check(names.some(x => x === n || x.startsWith(n + " — ")), `KO „${n}“ nicht importiert (${names.join(', ')})`));
    check(refs.length === res.kos.length, `${refs.length} KOs importiert, ${res.kos.length} erzeugt`);
    const groups = res.kos.map((k, i) => ({ id: 'g' + i, raw: 0x0800 + i }));
    const objs = refs.map((ref, i) => {
      const o = item.objs[ref];
      const fl = o.f || '';
      return { num: o.num != null ? o.num : o.n, ref, name: o.name || ref, gas: ['g' + i],
               flags: { c: /c/.test(fl), r: /r/.test(fl), w: /w/.test(fl), t: /t/.test(fl), u: /u/.test(fl) } };
    });
    const ets = res.params.filter(p => !p.fixed);
    const params = {};
    const pref = ets.length && Object.keys(item.params || {}).find(k => /_R-1$/.test(k));
    const changed = ets.length ? Math.min(ets[0].value + 1, ets[0].def.max != null ? ets[0].def.max : 255) : null;
    if (pref) params[pref] = String(changed);
    const dev = { id: 'd1', addr: 0x1105, lineId: 'l11', catalogId: 'c1', objs, params };
    const project = {
      areas: [{ id: 'a1', addr: 1, lines: [{ id: 'l11', addr: 1 }] }],
      catalog: [item], groups, devices: [dev]
    };
    const plan = D.plan(project, dev, item, { kind: 'all' });
    plan.errors.forEach(e => console.error('  Plan-Fehler:', e));
    plan.warnings.forEach(w => console.log('  Plan-Hinweis:', w));
    check(!plan.errors.length, 'Downloadplan hat Fehler');
    if (plan.errors.length) continue;

    const dv = device(plan.steps);
    const mk = res.mask, lay = res.layout;
    [1, 2, 3].forEach(n => check(dv.lsm[n] === 'loaded', `LSM ${n} nicht geladen (${dv.lsm[n]})`));
    check(dv.task[1] === mk.addrTab.addr && dv.task[2] === mk.assocTab.addr && dv.task[3] === lay.comTab.addr,
      'Task-Segmente nennen nicht die Tabellenadressen');

    /* Adresstabelle: Anzahl + 1, eigene PA, Gruppenadressen aufsteigend */
    const at = dv.read(mk.addrTab.addr, 3 + 2 * groups.length);
    check(at[0] === groups.length + 1, 'Adresstabelle: Anzahl falsch');
    check(word(at, 1) === dev.addr, 'Adresstabelle: eigene Adresse falsch');
    groups.forEach((g, i) => check(word(at, 3 + 2 * i) === g.raw, `Adresstabelle: GA ${i + 1} falsch`));

    /* Assoziationen: je KO seine GA */
    const n = dv.mem.get(mk.assocTab.addr);
    const as = dv.read(mk.assocTab.addr + 1, 2 * n);
    check(n === res.kos.length, `${n} Zuordnungen statt ${res.kos.length}`);
    objs.forEach((o, i) => check([...Array(n).keys()].some(j => as[2 * j] === i + 1 && as[2 * j + 1] === o.num),
      `KO ${o.num} ist nicht mit seiner GA verbunden`));

    /* KO-Tabelle: so, wie ComObjectsBCU2 sie liest */
    const ct = dv.read(lay.comTab.addr, lay.comTab.size);
    check(ct.every(v => v !== undefined), 'KO-Tabelle nicht vollständig geschrieben');
    check(ct[0] === lay.comTab.count && word(ct, 1) === lay.flags, 'Kopf der KO-Tabelle falsch');
    res.kos.forEach(k => {
      const e = 3 + 4 * k.number;
      check(word(ct, e) === k.ram, `KO ${k.number}: Wertzeiger nach dem Laden falsch`);
      const f = k.def.flags;
      const want = (f.includes('T') ? 0x40 : 0) | (f.includes('W') ? 0x10 : 0) | (f.includes('R') ? 0x08 : 0) | (f.includes('C') ? 0x04 : 0);
      check((ct[e + 2] & 0x5C) === want, `KO ${k.number}: Flags ${ct[e + 2].toString(16)} statt ${want.toString(16)}`);
      check(ct[e + 3] === S.blocks.OBJ_SIZE[k.dpt.size].type, `KO ${k.number}: Typ ${ct[e + 3]} nach dem Laden`);
    });

    /* Parameter: Vorgaben, der geänderte mit neuem Wert */
    ets.forEach((p, i) => {
      const b = dv.read(lay.params.addr + p.offset, p.size);
      const v = Array.from(b).reduce((x, y) => x * 256 + y, 0);
      const raw = i === 0 && pref ? changed : p.value;
      const want = p.size === 4 ? raw >>> 0 : raw & (p.size === 2 ? 0xFFFF : 0xFF);
      check(v === want, `Parameter ${p.name}: ${v} statt ${want}`);
    });
    if (ets.length && !pref) check(false, 'ParameterRef des ersten Parameters nicht gefunden');
    console.log(`  ${plan.steps.length} Schritte, ${groups.length} GA, ${ets.length} Parameter`);
  }
  console.log(failed ? `\n${failed} Fehler` : '\nImport und Download mit SB-Project in Ordnung');
  process.exit(failed ? 1 : 0);
})();
