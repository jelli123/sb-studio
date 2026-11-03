/* Vollständigkeit der Übersetzungen.
 *
 *   node test/i18n.js            # prüft, Ausgabe der fehlenden Schlüssel
 *   node test/i18n.js --list     # alle deutschen Schlüssel ausgeben
 *
 * Gesammelt wird, was die Oberfläche zeigt: t('…') im Quelltext, data-i18n
 * im Markup und die Texte der Blockdefinitionen (Namen, Hilfen, Ports,
 * Eigenschaften, Parameter, Auswahltexte). Jede Sprache in i18n.LANGS
 * außer Deutsch muss jeden Schlüssel kennen. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { querySelectorAll: () => [], documentElement: null };
['i18n', 'lang-en', 'blocks'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS, I = S.i18n, B = S.blocks;

const keys = new Map();          // Schlüssel → Fundstelle
const add = (k, where) => {
  if (Array.isArray(k)) { k.filter(x => typeof x !== 'number').forEach(x => add(x, where)); return; }   // [Vorlage, Teile …]
  if (k != null && String(k).trim() && !keys.has(k)) keys.set(String(k), where);
};

/* t('…') mit festem Text als erstem Argument */
const unq = s => s.replace(/\\(.)/g, '$1');
['app', 'editor', 'model'].forEach(f => {
  const src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) add(unq(m[1]), f + '.js');
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) add(unq(m[1]), f + '.js');
});
/* Feste Tabellen in app.js, die über t(TABELLE[x]) laufen */
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const theme = /THEME_LABEL = \{([^}]*)\}/.exec(app);
for (const m of theme[1].matchAll(/'([^']+)'/g)) if (!/^(system|light|dark)$/.test(m[1])) add(m[1], 'app.js THEME_LABEL');

/* Markup */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/<(\w+)([^>]*)\sdata-i18n[\s>][^>]*>([^<]*)</g)) add(m[3].trim(), 'index.html');
for (const m of html.matchAll(/<\w+[^>]*>/g)) {
  const tag = m[0];
  ['title', 'aria-label', 'placeholder'].forEach(a => {
    if (new RegExp(`data-i18n-${a}[\\s>]`).test(tag)) {
      const v = new RegExp(`\\s${a}="([^"]*)"`).exec(tag);
      if (v) add(v[1].replace(/&amp;/g, '&'), 'index.html ' + a);
    }
  });
}

/* Blockdefinitionen: Listen können von den Eigenschaften abhängen, darum
   für jede Auswahl jeder enum-Eigenschaft einmal auswerten */
B.CATS.forEach(c => add(c, 'Kategorie'));
B.DEFS.forEach(d => {
  const where = 'Block ' + d.type;
  add(d.name, where); add(d.help, where);
  const variants = [B.defaults(d).props];
  (d.props || []).filter(p => p.kind === 'enum').forEach(p =>
    p.options.forEach(([k]) => variants.push({ ...B.defaults(d).props, [p.id]: k })));
  (d.props || []).forEach(p => { add(p.label, where); (p.options || []).forEach(o => add(o[1], where)); });
  variants.forEach(props => {
    const n = { props };
    B.inputs(d, n).concat(B.outputs(d, n)).forEach(p => add(p.label, where));
    B.params(d, n).forEach(p => { add(p.label, where); add(p.unit, where); (p.options || []).forEach(o => add(o[1], where)); });
    B.resources(d, n).forEach(([, text]) => add(text, where));
  });
});

if (process.argv.includes('--list')) {
  [...keys.keys()].forEach(k => console.log(JSON.stringify(k)));
  process.exit(0);
}

let failed = 0;
Object.keys(I.LANGS).filter(l => l !== 'de').forEach(l => {
  const miss = [...keys].filter(([k]) => !I.has(l, k));
  if (miss.length) {
    failed += miss.length;
    console.error(`${l}: ${miss.length} Übersetzungen fehlen`);
    miss.forEach(([k, w]) => console.error(`  ${JSON.stringify(k)}  (${w})`));
  }
  /* Platzhalter müssen in der Übersetzung wieder vorkommen */
  [...keys.keys()].filter(k => I.has(l, k)).forEach(k => {
    const ph = s => (String(s).match(/\{\d+\}/g) || []).sort().join();
    I.set(l);
    const tr = I.t(k);
    if (ph(tr) !== ph(k)) { failed++; console.error(`  ${l}: Platzhalter passen nicht: ${JSON.stringify(k)}`); }
  });
});
console.log(failed ? `\n${failed} Fehler` : `${keys.size} Texte, alle übersetzt`);
process.exit(failed ? 1 : 0);
