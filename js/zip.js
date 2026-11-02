/* ============================================================
   ZIP: Schreiben ohne Kompression, Lesen einzelner Einträge
   (für knx_master.xml aus einer vorhandenen knxprod)
   ============================================================ */
SBS.zip = (function () {
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* files: { Pfad: string | Uint8Array } → Uint8Array */
function write(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let at = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const entries = Object.entries(files);
  entries.forEach(([path, content]) => {
    const name = enc.encode(path);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(data);
    const head = (sig, central) => {
      const b = new DataView(new ArrayBuffer(central ? 46 : 30));
      b.setUint32(0, sig, true);
      let o = 4;
      if (central) { b.setUint16(o, 0x0314, true); o += 2; }   // erstellt mit: Unix, 2.0
      b.setUint16(o, 20, true);                                 // nötige Version
      b.setUint16(o + 2, 0x0800, true);                         // Namen in UTF-8
      b.setUint16(o + 4, 0, true);                              // gespeichert
      b.setUint16(o + 6, time, true);
      b.setUint16(o + 8, date, true);
      b.setUint32(o + 10, crc, true);
      b.setUint32(o + 14, data.length, true);
      b.setUint32(o + 18, data.length, true);
      b.setUint16(o + 22, name.length, true);
      return b;
    };
    parts.push(new Uint8Array(head(0x04034b50, false).buffer), name, data);
    const cen = head(0x02014b50, true);
    // Unix-Rechte, damit build.sh ausführbar bleibt
    cen.setUint32(38, ((/\.sh$/.test(path) ? 0o100755 : 0o100644) << 16) >>> 0, true);
    cen.setUint32(42, at, true);
    central.push(new Uint8Array(cen.buffer), name);
    at += 30 + name.length + data.length;
  });
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, at, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let o = 0;
  all.forEach(b => { out.set(b, o); o += b.length; });
  return out;
}

/* Liest einen Eintrag (gespeichert oder deflate) als Uint8Array.
   match: Funktion über den Namen. Ohne Treffer: null. */
async function read(buf, match) {
  const v = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  let eocd = -1;
  for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Keine ZIP-Datei.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt.');
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!match(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) return raw.slice();
    if (method !== 8) throw new Error(`Kompression ${method} wird nicht unterstützt.`);
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return null;
}

return { write, read, crc32 };
})();
