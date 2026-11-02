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
                  style: {}, value: '', textContent: '', innerHTML: '' };
  const fn = function () {};
  return new Proxy(fn, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === 'querySelectorAll') return () => [];
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 1000, height: 700 });
      if (k === 'closest') return () => null;
      if (k === Symbol.toPrimitive) return () => name;
      return stub(name + '.' + String(k));
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return stub(name + '()'); }
  });
}

const elements = new Map();
const byId = sel => { if (!elements.has(sel)) elements.set(sel, stub(sel)); return elements.get(sel); };
globalThis.document = new Proxy({}, {
  get(t, k) {
    if (k === 'querySelector') return byId;
    if (k === 'querySelectorAll') return () => [];
    if (k === 'createElementNS' || k === 'createElement') return () => stub('el');
    if (k === 'elementFromPoint') return () => null;
    return stub('document.' + String(k));
  }
});
globalThis.requestAnimationFrame = f => f();
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };

const root = path.join(__dirname, '..');
['blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod', 'zip', 'examples', 'editor', 'app'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS;

/* Der Editor ist in app.js gekapselt; ein zweiter auf demselben Modell
   reicht, um render() und die Auswahl je Blocktyp durchzuspielen. */
let failed = 0;
const model = S.model.create();
S.blocks.DEFS.forEach((d, i) => S.model.addNode(model, d.type, i * 200, 0));
const res = S.model.resolve(model);
const ed = S.editor.create(stub('svg'), { getModel: () => model, onSelect() {}, onChange() {}, onAdd() {} });
try { ed.render(res); ed.fit(); } catch (e) { failed++; console.error('editor.render:', e); }

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
console.log(failed ? `${failed} Fehler` : `Oberfläche läuft für ${S.blocks.DEFS.length} Blocktypen ohne Laufzeitfehler`);
process.exit(failed ? 1 : 0);
