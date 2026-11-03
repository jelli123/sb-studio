/* ============================================================
   Sprachumschaltung, nach dem Muster von SB-Project (knx-i18n.js)
   ------------------------------------------------------------
   Schlüssel ist der deutsche Text selbst: `t('Block löschen')` sagt im Code,
   was dasteht. Wird der deutsche Text geändert, muss der Eintrag in der
   Sprachtabelle mitgeändert werden – test/i18n.js findet, was fehlt.

   - Jeder Schlüssel läuft durch normalize('NFC'), sonst träfe ein „ü“ in
     NFD-Schreibweise lautlos daneben.
   - Sätze mit eingesetzten Werten tragen {0}, {1} … und bekommen die Werte
     als weitere Argumente.
   - Fehlt eine Übersetzung, steht der deutsche Text da, nie ein leeres Feld.

   Übersetzt wird nur die Oberfläche. Erzeugte Dateien (Firmware, knxprod)
   bleiben unabhängig von der gewählten Sprache gleich.
   ============================================================ */
var SBS = (typeof globalThis !== 'undefined' ? globalThis : window).SBS || {};
(typeof globalThis !== 'undefined' ? globalThis : window).SBS = SBS;

SBS.i18n = (function () {
'use strict';
const KEY = 'sbs-lang-v1';
const LANGS = { de: 'Deutsch', en: 'English' };
const DEFAULT = 'de';

const dicts = {};
const missing = new Map();
const listeners = new Set();
const norm = s => String(s == null ? '' : s).normalize('NFC');

let lang = DEFAULT;
try {
  const saved = localStorage.getItem(KEY);
  if (saved && LANGS[saved]) lang = saved;
} catch (e) { /* nur Komfort */ }

function add(code, table) {
  const into = dicts[code] || (dicts[code] = {});
  Object.keys(table || {}).forEach(k => { into[norm(k)] = table[k]; });
}

function t(de, ...args) {
  let out = de == null ? '' : String(de);
  if (lang !== DEFAULT) {
    const hit = dicts[lang] && dicts[lang][norm(out)];
    if (hit != null) out = hit;
    else if (out.trim()) missing.set(norm(out), lang);
  }
  if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (args[+i] != null ? args[+i] : m));
  return out;
}

/* Fester Text im Markup: data-i18n (Textinhalt), data-i18n-title usw. Der
   deutsche Text bleibt als Schlüssel im Markup stehen. */
const ATTRS = ['title', 'placeholder', 'aria-label'];
function applyStatic(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    if (!el.dataset.i18nDe) el.dataset.i18nDe = el.textContent.trim();
    el.textContent = t(el.dataset.i18nDe);
  });
  ATTRS.forEach(a => {
    root.querySelectorAll(`[data-i18n-${a}]`).forEach(el => {
      const keep = 'i18n' + a.replace(/(^|-)([a-z])/g, (m, _, c) => c.toUpperCase()) + 'De';
      if (!el.dataset[keep]) el.dataset[keep] = el.getAttribute(a) || '';
      el.setAttribute(a, t(el.dataset[keep]));
    });
  });
  if (document.documentElement) document.documentElement.lang = lang;
}

function set(next) {
  if (!LANGS[next] || next === lang) return lang;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch (e) { /* nur Komfort */ }
  applyStatic();
  listeners.forEach(fn => { try { fn(lang); } catch (e) { /* ein Zuhörer darf nicht alles aufhalten */ } });
  return lang;
}

return {
  LANGS, t, add, set, applyStatic,
  lang: () => lang,
  has: (code, de) => !!(dicts[code] && norm(de) in dicts[code]),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  missing: () => [...missing.keys()].sort()
};
})();
