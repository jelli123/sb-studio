/* Rauchtest der Oberfläche ohne Browser.
 *
 *   node test/ui-smoke.js
 *
 * Ein Proxy ersetzt das DOM: jedes Element nimmt jede Eigenschaft und jeden
 * Aufruf an. Geprüft wird nur, dass app.js und editor.js für jeden Blocktyp
 * und jede Ansicht ohne Laufzeitfehler durchlaufen — nicht das Aussehen. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function stub(name) {
  const store = { dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
                  style: { setProperty() {} }, value: '', textContent: '', innerHTML: '' };
  const fn = function () {};
  return new Proxy(fn, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === 'querySelectorAll') return () => [];
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 1000, height: 700 });
      if (k === 'closest') return () => null;
      if (k === 'getComputedTextLength') return () => String(store.textContent).length * 7;  // grobe Schriftbreite
      if (k === 'getAttribute') return a => store['attr:' + a] ?? null;
      if (k === 'setAttribute') return (a, v) => { store['attr:' + a] = String(v); };
      if (k === Symbol.toPrimitive) return () => name;
      return stub(name + '.' + String(k));
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return stub(name + '()'); }
  });
}

const created = [];
const elements = new Map();
const byId = sel => { if (!elements.has(sel)) elements.set(sel, stub(sel)); return elements.get(sel); };
globalThis.document = new Proxy({}, {
  get(t, k) {
    if (k === 'querySelector') return byId;
    if (k === 'querySelectorAll') return () => [];
    if (k === 'createElementNS' || k === 'createElement') return (...a) => { const e = stub('el'); e.tag = a[a.length - 1]; created.push(e); return e; };
    if (k === 'elementFromPoint') return () => null;
    return stub('document.' + String(k));
  }
});
globalThis.requestAnimationFrame = f => f();
globalThis.window = globalThis;
globalThis.matchMedia = q => ({ matches: /max-width/.test(q) && process.env.NARROW === '1', addEventListener() {} });
globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.SBSTheme = { mode: () => 'system', resolved: () => 'light', next: () => 'light', set: m => m };
globalThis.addEventListener = () => {};
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };

const root = path.join(__dirname, '..');
['i18n', 'lang-en', 'blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples', 'editor', 'app'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS;

/* Der Editor ist in app.js gekapselt; ein zweiter auf demselben Modell
   reicht, um render() und die Auswahl je Blocktyp durchzuspielen. */
let failed = 0;
const model = S.model.create();
S.blocks.DEFS.forEach((d, i) => S.model.addNode(model, d.type, i * 200, 0));
const res = S.model.resolve(model);
const ed = S.editor.create(stub('svg'), { getModel: () => model, onSelect() {}, onChange() {}, onAdd() {} });
model.nodes[0].label = 'Ein sehr langer Name, der nicht in den Kopf passt';
try { ed.render(S.model.resolve(model)); ed.fit(); } catch (e) { failed++; console.error('editor.render:', e); }

/* Kein Text ragt über den Block hinaus (Breite 184, Ränder 10/8) */
const texts = created.filter(e => e.tag === 'text');
const tooWide = texts.filter(e => e.getComputedTextLength() > 184 - 18);
if (!texts.length || tooWide.length) { failed++; console.error('Text zu breit:', tooWide.map(e => e.textContent)); }
if (!texts.some(e => /…$/.test(e.textContent))) { failed++; console.error('langer Name wurde nicht gekürzt'); }

/* app.js mit diesem Modell neu laden, dann jede Ansicht des Inspektors */
mem.set('sbs.model', S.model.serialize(model));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8'), { filename: 'app.js' });
const app = S.app;
const run = (what, f) => { try { f(); } catch (e) { failed++; console.error(what + ':', e); } };
app.model.nodes.forEach(n => run(n.type, () => app.select({ kind: 'node', id: n.id })));
app.model.links.push({ from: [app.model.nodes[0].id, 'out'], to: [app.model.nodes[1].id, 'in'] });
run('update', () => app.update());
run('link', () => app.select({ kind: 'link', id: 0 }));
run('device', () => app.select(null));

/* Kontextmenüs für jede Art von Ziel, das Menü der schmalen Kopfleiste */
const at = { clientX: 100, clientY: 100, x: 0, y: 0 };
app.model.nodes.forEach(n => {
  run('menu node ' + n.type, () => app.menu({ ...at, kind: 'node', id: n.id }));
  const r = app.resolved.byId.get(n.id);
  r.inputs.forEach(p => run('menu in ' + n.type, () => app.menu({ ...at, kind: 'port', id: n.id, port: p.id, dir: 'in' })));
  r.outputs.forEach(p => run('menu out ' + n.type, () => app.menu({ ...at, kind: 'port', id: n.id, port: p.id, dir: 'out' })));
});
run('menu link', () => app.menu({ ...at, kind: 'link', id: 0 }));
run('menu canvas', () => app.menu({ ...at, kind: 'canvas' }));
run('menu more', () => app.moreMenu());

/* Rückgängig / Wiederholen: jede Änderung ein Schritt, ohne Änderung keiner */
const undoBtn = byId('#btn-undo'), redoBtn = byId('#btn-redo');
const nodes0 = app.model.nodes.length, links0 = app.model.links.length;
run('history', () => {
  const h0 = app.history.undo;
  app.update();
  if (app.history.undo !== h0) throw new Error('Schritt ohne Änderung');
  app.model.links.pop();
  app.update();
  if (app.history.undo !== h0 + 1 || undoBtn.disabled) throw new Error('Löschen ergab keinen Schritt');
  if (!/^Rückgängig: \d+ Schritte? \(Strg\+Z\)$/.test(undoBtn.title)) throw new Error('Tooltip: ' + undoBtn.title);
  app.undo();
  if (app.model.links.length !== links0 || !app.history.redo || redoBtn.disabled) throw new Error('Rückgängig wirkt nicht');
  if (redoBtn.title !== 'Wiederholen: 1 Schritt (Strg+Y)') throw new Error('Tooltip: ' + redoBtn.title);
  app.redo();
  if (app.model.links.length !== links0 - 1 || app.history.redo) throw new Error('Wiederholen wirkt nicht');
  app.undo();
  /* Tippen im selben Feld fasst zusammen */
  const h1 = app.history.undo;
  app.model.device.name = 'a'; app.update({ merge: 'input:test' });
  app.model.device.name = 'ab'; app.update({ merge: 'input:test' });
  if (app.history.undo !== h1 + 1) throw new Error('Tippen nicht zusammengefasst');
  app.undo();
  if (app.model.nodes.length !== nodes0 || app.model.links.length !== links0) throw new Error('Stand nach Rückgängig falsch');
});

/* Englisch: alles noch einmal */
run('lang en', () => S.i18n.set('en'));
app.model.nodes.forEach(n => run('en ' + n.type, () => app.select({ kind: 'node', id: n.id })));
run('en device', () => app.select(null));
app.model.nodes.forEach(n => run('en menu ' + n.type, () => app.menu({ ...at, kind: 'node', id: n.id })));
run('en menu canvas', () => app.menu({ ...at, kind: 'canvas' }));
run('en menu more', () => app.moreMenu());
/* Tooltips der Verlaufsknöpfe folgen der Sprache (in SB-Project nicht) */
if (!/^Undo: \d+ steps? \(Ctrl\+Z\)$/.test(undoBtn.title)) { failed++; console.error('Tooltip Rückgängig nicht übersetzt:', undoBtn.title); }
if (!/^Redo: \d+ steps? \(Ctrl\+Y\)$/.test(redoBtn.title)) { failed++; console.error('Tooltip Wiederholen nicht übersetzt:', redoBtn.title); }
/* Was zur Laufzeit ohne Übersetzung blieb (auch zusammengesetzte Schlüssel) */
const miss = S.i18n.missing();
if (miss.length) { failed++; console.error('Englisch fehlt:', miss); }
console.log(failed ? `${failed} Fehler` : `Oberfläche läuft für ${S.blocks.DEFS.length} Blocktypen ohne Laufzeitfehler`);
process.exit(failed ? 1 : 0);
