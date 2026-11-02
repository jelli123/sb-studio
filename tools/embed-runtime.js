/* Bettet die Laufzeitdateien aus runtime/ in js/runtime-lpc11xx.js ein,
 * damit der Generator sie ohne Server (file://) in den Export legen kann.
 *
 *   node tools/embed-runtime.js
 *
 * test/run.js prüft, dass die eingebettete Fassung aktuell ist.          */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = {
  'src/startup_lpc11xx.cpp': 'runtime/lpc11xx/startup_lpc11xx.cpp',
  'src/libc_stubs.cpp': 'runtime/lpc11xx/libc_stubs.cpp',
  'linkscripts/lpc1115.ld.in': 'runtime/lpc11xx/lpc1115.ld.in'
};

function build() {
  const files = Object.fromEntries(Object.entries(FILES).map(([to, from]) =>
    [to, fs.readFileSync(path.join(root, from), 'utf8')]));
  return `/* Erzeugt von tools/embed-runtime.js aus runtime/lpc11xx/ — nicht von Hand ändern.
   Start-up-Code, C-Bibliotheks-Stubs und Linkerskript für den LPC1115 ohne
   NXP-Dateien (aus theportapps, out8-bcu1, Branch lpc/own-startup).
   Lizenzen stehen in den Dateien selbst. */
SBS.runtime = SBS.runtime || {};
SBS.runtime.lpc11xx = ${JSON.stringify(files, null, 2)};
`;
}

if (require.main === module) {
  fs.writeFileSync(path.join(root, 'js', 'runtime-lpc11xx.js'), build());
  console.log('js/runtime-lpc11xx.js geschrieben');
}
module.exports = { build };
