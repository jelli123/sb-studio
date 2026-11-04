/* ============================================================
   Markdown → HTML für Notizen und Beschreibungen (klein, ohne
   Bibliothek). HTML im Text wird immer maskiert; Links nur http(s).
   Kann: # Überschriften, Absätze, - / * / 1. Listen, **fett**,
   *kursiv* / _kursiv_, `Code`, ```Codeblock```, > Zitat, [Text](URL),
   --- Linie. Zwei Leerzeichen oder \ am Zeilenende: Zeilenumbruch.
   ============================================================ */
SBS.markdown = (function () {
'use strict';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Zeichenformate innerhalb einer Zeile; Code zuerst herausnehmen */
function inline(text) {
  const code = [];
  let s = esc(text).replace(/`([^`]+)`/g, (m, c) => `\u0000${code.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/( {2,}|\\)$/gm, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${code[+i]}</code>`);
}

function render(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join('\n')).replace(/\n/g, ' ').replace(/<br> /g, '<br>')}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  const flushQuote = () => { if (quote.length) out.push(`<blockquote>${render(quote.join('\n'))}</blockquote>`); quote = []; };
  const flush = () => { flushPara(); flushList(); flushQuote(); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if (/^\s*```/.test(l)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    } else if (/^\s*>/.test(l)) {
      flushPara(); flushList();
      quote.push(l.replace(/^\s*> ?/, ''));
    } else if (!l.trim()) {
      flush();
    } else if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) {
      flush();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      flush();
      out.push('<hr>');
    } else if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l))) {
      flushPara(); flushQuote();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[2]);
    } else if (list && /^\s{2,}\S/.test(l)) {
      list.items[list.items.length - 1] += ' ' + l.trim();   // Fortsetzung eines Listenpunkts
    } else {
      flushList(); flushQuote();
      para.push(l);
    }
  }
  flush();
  return out.join('\n');
}

/* Reiner Text (Tooltips, Blockliste): Formatzeichen weg */
const plain = src => String(src || '')
  .replace(/```[\s\S]*?```/g, '')
  .replace(/^#{1,4}\s+/gm, '').replace(/^\s*>\s?/gm, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*|__|`/g, '').replace(/(^|\W)[*_](\S[^*_]*)[*_]/g, '$1$2')
  .trim();

return { render, plain, esc };
})();
