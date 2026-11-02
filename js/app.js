/* ============================================================
   Oberfläche: Palette, Inspektor, Meldungen, Ausgabe, Export
   ============================================================ */
(function () {
'use strict';
const S = SBS, B = S.blocks, M = S.model;
const $ = sel => document.querySelector(sel);
const STORE = 'sbs.model', STORE_MASTER = 'sbs.master';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

let model = load();
let res = null;
let master = loadMaster();        // { name, xml }
let tab = 'src/app_main.cpp';

function load() {
  const saved = store.get(STORE);
  if (saved) { try { return M.parse(saved); } catch (e) { /* verworfen */ } }
  return M.parse(JSON.stringify(S.examples[0].model));
}
function loadMaster() {
  try { return JSON.parse(store.get(STORE_MASTER)) || null; } catch (e) { return null; }
}

const editor = S.editor.create($('#canvas'), {
  getModel: () => model,
  onSelect: () => renderInspector(),
  onChange: o => update(o),
  onAdd: (type, x, y) => add(type, x, y)
});

/* ---------- Ablauf ---------- */

function update(opts = {}) {
  M.normalize(model);
  res = M.resolve(model);
  editor.render(res);
  if (!opts.keepInspector && !opts.layoutOnly) renderInspector();
  renderMessages();
  renderOutput();
  store.set(STORE, M.serialize(model));
}

function add(type, x, y) {
  const n = M.addNode(model, type, x, y);
  editor.select({ kind: 'node', id: n.id });
  update();
}

function deleteSelection() {
  const sel = editor.selection;
  if (!sel) return;
  if (sel.kind === 'node') M.removeNode(model, sel.id);
  if (sel.kind === 'link') model.links.splice(sel.id, 1);
  editor.select(null);
  update();
}

/* ---------- Palette ---------- */

function renderPalette() {
  const box = $('#palette');
  box.textContent = '';
  B.CATS.forEach(cat => {
    const h = document.createElement('h3');
    h.textContent = cat;
    box.appendChild(h);
    B.DEFS.filter(d => d.cat === cat).forEach(d => {
      const item = document.createElement('button');
      item.className = `block-item cat-${d.cat}`;
      item.draggable = true;
      item.title = d.help || '';
      item.innerHTML = `<span class="swatch"></span><span>${esc(d.name)}</span>`;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/x-sbs-block', d.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => {
        const c = editor.center();
        const k = model.nodes.length % 5;
        add(d.type, c.x + k * 20, c.y + k * 20);
      });
      box.appendChild(item);
    });
  });
}

/* ---------- Inspektor ---------- */

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (v, w) => '0x' + Number(v).toString(16).toUpperCase().padStart(w, '0');
const parseHex = s => /^(0x)?[0-9a-f]+$/i.test(String(s).trim()) ? parseInt(String(s).trim().replace(/^0x/i, ''), 16) : NaN;

function field(label, input, hint) {
  return `<label class="field"><span class="lbl">${esc(label)}</span>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}

function renderInspector() {
  const box = $('#inspector');
  const sel = editor.selection;
  if (sel && sel.kind === 'node') {
    const n = model.nodes.find(x => x.id === sel.id);
    if (n) return renderNode(box, n);
  }
  if (sel && sel.kind === 'link' && model.links[sel.id]) return renderLink(box, model.links[sel.id]);
  renderDevice(box);
}

function renderDevice(box) {
  const d = model.device;
  const mcus = Object.entries(B.MCU).map(([k, m]) => `<option value="${k}"${k === d.mcu ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  box.innerHTML = `
    <h2>Gerät</h2>
    <p class="muted">Kein Block gewählt. Diese Angaben gehen in Firmware und knxprod.</p>
    ${field('Name', `<input data-dev="name" value="${esc(d.name)}">`)}
    ${field('Bestellnummer', `<input data-dev="orderNumber" value="${esc(d.orderNumber)}">`)}
    <div class="row2">
      ${field('Hersteller', `<input data-dev="manufacturer" data-hex="4" value="${hex(d.manufacturer, 4)}">`, '0x00FA = OpenKNX')}
      ${field('Hardware-Nr.', `<input data-dev="hwSerial" value="${esc(d.hwSerial)}">`, 'Hex, 1–4 Ziffern')}
    </div>
    <div class="row2">
      ${field('Applikation', `<input data-dev="appNumber" data-hex="4" value="${hex(d.appNumber, 4)}">`)}
      ${field('Version', `<input data-dev="appVersion" data-hex="2" value="${hex(d.appVersion, 2)}">`, 'nach Änderungen erhöhen')}
    </div>
    <div class="row2">
      ${field('Hardware-Version', `<input data-dev="hwVersion" data-int value="${esc(d.hwVersion)}">`)}
      ${field('Busstrom (mA)', `<input data-dev="busCurrent" data-int value="${esc(d.busCurrent)}">`)}
    </div>
    ${field('MCU', `<select data-dev="mcu">${mcus}</select>`, res.mask ? `Maske ${res.mask.name}` : '')}
    ${field('Pfad zur sblib', `<input data-dev="sblibPath" value="${esc(d.sblibPath)}">`, 'software-arm-lib, relativ zum entpackten Firmware-Ordner')}
    <h3>knx_master.xml <span class="muted">(optional)</span></h3>
    <p class="muted">Die knxprod bringt ihre Ladeprozedur selbst mit und kommt ohne aus.
      Wer sie trotzdem beilegen will (wie es das Manufacturer Tool tut): aus einer
      vorhandenen <code>knx_master.xml</code> oder einer beliebigen <code>.knxprod</code> übernehmen.</p>
    <div class="master ${master ? 'ok' : 'missing'}">${master ? `✓ ${esc(master.name)} <span class="muted">(${Math.round(master.xml.length / 1024)} KB)</span>` : 'nicht gewählt'}</div>
    <div class="btnrow">
      <button id="pick-master">Datei wählen…</button>
      ${master ? '<button id="drop-master" class="ghost">Entfernen</button>' : ''}
    </div>`;
  box.querySelectorAll('[data-dev]').forEach(inp => {
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const k = inp.dataset.dev;
      let v = inp.value;
      if (inp.dataset.hex) v = parseHex(v);
      else if ('int' in inp.dataset) v = parseInt(v, 10);
      inp.classList.toggle('invalid', typeof v === 'number' && !Number.isFinite(v));
      model.device[k] = v;
      update({ keepInspector: true });
    });
  });
  $('#pick-master').addEventListener('click', () => $('#file-master').click());
  const drop = $('#drop-master');
  if (drop) drop.addEventListener('click', () => { master = null; store.set(STORE_MASTER, ''); renderInspector(); renderMessages(); });
}

function renderNode(box, n) {
  const def = B.get(n.type);
  const r = res.byId.get(n.id);
  const pins = B.MCU[model.device.mcu].pins;
  const used = new Map();
  model.nodes.forEach(o => { if (o !== n) M.pinsOf(o).forEach(p => used.set(p, o)); });

  const props = (def.props || []).map(p => {
    const v = n.props[p.id];
    if (p.kind === 'bool')
      return `<label class="check"><input type="checkbox" data-prop="${p.id}"${v ? ' checked' : ''}> ${esc(p.label)}</label>`;
    if (p.kind === 'pin') {
      const opts = (p.pins || pins).map(x => `<option value="${x}"${x === v ? ' selected' : ''}>${x}${used.has(x) ? ` — belegt (${esc(used.get(x).label || used.get(x).id)})` : ''}</option>`).join('');
      return field(p.label, `<select data-prop="${p.id}">${opts}</select>`);
    }
    if (p.kind === 'enum') {
      const opts = p.options.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
      return field(p.label, `<select data-prop="${p.id}">${opts}</select>`);
    }
    return field(p.label, `<input data-prop="${p.id}" value="${esc(v)}">`);
  }).join('');

  const params = r.params.map(p => {
    const e = res.params.find(x => x.r === r && x.def.id === p.id);
    const v = n.params[p.id];
    const input = p.type === 'enum'
      ? `<select data-param="${p.id}">${p.options.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : `<input type="number" data-param="${p.id}" value="${esc(v)}"${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''}>`;
    const where = e.fixed ? 'fest in der Firmware' : `ETS, Offset ${hex(e.offset, 4)}`;
    return `<div class="param">
      ${field(p.unit ? `${p.label} (${p.unit})` : p.label, input)}
      <label class="check small"><input type="checkbox" data-ets="${p.id}"${e.fixed ? '' : ' checked'}> in der ETS einstellbar <span class="muted">· ${where}</span></label>
    </div>`;
  }).join('');

  const kos = res.kos.filter(k => k.r === r).map(k =>
    `<tr><td class="num">${k.number}</td><td>${esc(k.def.text)}</td><td>${k.def.dpt}</td><td class="mono">${k.def.flags}</td></tr>`).join('');

  const conns = [
    ...r.inputs.map(p => {
      const l = res.links.find(x => x.to === r && x.in.id === p.id);
      return `<li>⟵ ${esc(p.label)}: ${l ? esc(`${l.from.title} · ${l.out.label}`) : '<span class="muted">nicht verbunden</span>'}</li>`;
    }),
    ...r.outputs.map(p => {
      const ls = res.links.filter(x => x.from === r && x.out.id === p.id);
      return `<li>⟶ ${esc(p.label)}: ${ls.length ? ls.map(l => esc(`${l.to.title} · ${l.in.label}`)).join(', ') : '<span class="muted">nicht verbunden</span>'}</li>`;
    })
  ].join('');

  box.innerHTML = `
    <div class="insp-head cat-${def.cat}"><span class="swatch"></span><h2>${esc(def.name)}</h2><span class="muted mono">${n.id}</span></div>
    <p class="muted">${esc(def.help || '')}</p>
    ${field('Bezeichnung', `<input data-label value="${esc(n.label)}" placeholder="${esc(def.name)}">`)}
    ${props ? `<h3>Eigenschaften</h3>${props}` : ''}
    ${params ? `<h3>Parameter</h3>${params}` : ''}
    ${kos ? `<h3>Kommunikationsobjekte</h3><table class="kos"><tr><th>Nr.</th><th>Name</th><th>DPT</th><th>Flags</th></tr>${kos}</table>` : ''}
    ${conns ? `<h3>Verbindungen</h3><ul class="conns">${conns}</ul>` : ''}
    <div class="btnrow"><button id="del" class="danger">Block löschen</button></div>`;

  box.querySelector('[data-label]').addEventListener('input', e => { n.label = e.target.value; update({ keepInspector: true }); });
  box.querySelectorAll('[data-prop]').forEach(inp => {
    const p = def.props.find(x => x.id === inp.dataset.prop);
    const text = inp.tagName === 'INPUT' && inp.type !== 'checkbox';
    inp.addEventListener(text ? 'input' : 'change', () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (p.kind === 'enum') v = p.options.find(o => String(o[0]) === inp.value)[0];
      n.props[p.id] = v;
      update({ keepInspector: text });
    });
  });
  box.querySelectorAll('[data-param]').forEach(inp => {
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const v = Number(inp.value);
      n.params[inp.dataset.param] = inp.value === '' ? NaN : v;
      update({ keepInspector: true });
    });
  });
  box.querySelectorAll('[data-ets]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked) delete n.fixed[inp.dataset.ets]; else n.fixed[inp.dataset.ets] = true;
    update();
  }));
  $('#del').addEventListener('click', deleteSelection);
}

function renderLink(box, l) {
  const a = res.byId.get(l.from[0]), b = res.byId.get(l.to[0]);
  const op = a && a.outputs.find(p => p.id === l.from[1]);
  const ip = b && b.inputs.find(p => p.id === l.to[1]);
  box.innerHTML = `
    <h2>Verbindung</h2>
    <p>${esc(a ? a.title : l.from[0])} · ${esc(op ? op.label : l.from[1])}<br>⟶ ${esc(b ? b.title : l.to[0])} · ${esc(ip ? ip.label : l.to[1])}</p>
    <div class="btnrow"><button id="del" class="danger">Verbindung löschen</button></div>`;
  $('#del').addEventListener('click', deleteSelection);
}

/* ---------- Meldungen und Ausgabe ---------- */

function renderMessages() {
  const box = $('#messages');
  const items = [
    ...res.errors.map(e => ({ ...e, cls: 'error' })),
    ...res.warnings.map(w => ({ ...w, cls: 'warn' }))
  ];
  $('#msg-count').textContent = res.errors.length ? `${res.errors.length} Fehler` : items.length ? `${items.length} Hinweise` : 'OK';
  $('#msg-count').className = 'badge ' + (res.errors.length ? 'error' : items.length ? 'warn' : 'ok');
  box.innerHTML = items.length
    ? items.map((m, i) => `<li class="${m.cls}" data-i="${i}">${esc(m.msg)}</li>`).join('')
    : '<li class="ok">Keine Fehler. Firmware und knxprod können erzeugt werden.</li>';
  box.querySelectorAll('li[data-i]').forEach(li => {
    const m = items[+li.dataset.i];
    if (m.node) li.addEventListener('click', () => { editor.select({ kind: 'node', id: m.node }); renderInspector(); });
  });
  document.querySelectorAll('[data-export]').forEach(b => { b.disabled = res.errors.length > 0; });
}

function outputs() {
  const fw = S.firmware.files(res);
  const prod = S.knxprod.files(res, null);
  const all = {};
  Object.entries(fw).forEach(([k, v]) => { all[k] = v; });
  Object.entries(prod).forEach(([k, v]) => { all['knxprod/' + k] = v; });
  return all;
}

function renderOutput() {
  const tabs = $('#out-tabs'), pre = $('#out-code');
  let files;
  try { files = outputs(); }
  catch (e) { tabs.textContent = ''; pre.textContent = `Erzeugen nicht möglich: ${e.message}`; return; }
  if (!(tab in files)) tab = 'src/app_main.cpp';
  tabs.innerHTML = Object.keys(files).map(k =>
    `<button class="tab${k === tab ? ' active' : ''}" data-tab="${esc(k)}">${esc(k.replace(/^knxprod\/M-[0-9A-F]+\//, 'knxprod/'))}</button>`).join('');
  tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderOutput(); }));
  pre.textContent = files[tab];
}

/* ---------- Dateien ---------- */

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const base = () => `${S.firmware.slug(model.device.name)}_${hex(model.device.appVersion, 2).slice(2)}`;

function knxprodBytes() {
  return S.zip.write(S.knxprod.files(res, master && master.xml));
}

function exportFirmware(withProd) {
  const name = base();
  const files = {};
  Object.entries(S.firmware.files(res)).forEach(([k, v]) => { files[`${name}/${k}`] = v; });
  files[`${name}/${name}.sbs.json`] = M.serialize(model);
  // nur ein Ordner auf oberster Ebene, sonst legen Entpacker einen weiteren
  // darum und der relative sblib-Pfad stimmt nicht mehr
  if (withProd) files[`${name}/${name}.knxprod`] = knxprodBytes();
  download(`${name}${withProd ? '' : '_firmware'}.zip`, S.zip.write(files), 'application/zip');
}

async function readMaster(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let xml;
  if (/\.xml$/i.test(file.name)) xml = new TextDecoder().decode(buf);
  else {
    const bytes = await S.zip.read(buf, n => /(^|\/)knx_master\.xml$/i.test(n));
    if (!bytes) throw new Error('Die Datei enthält keine knx_master.xml.');
    xml = new TextDecoder().decode(bytes);
  }
  xml = xml.replace(/^\uFEFF/, '');
  const mv = res.mcu && res.mcu.mask;
  if (mv && !new RegExp(`<MaskVersion\\s[^>]*Id="${mv}"`).test(xml)) throw new Error(`Die knx_master.xml enthält keine Maske ${mv}.`);
  master = { name: file.name, xml };
  if (!store.set(STORE_MASTER, JSON.stringify(master)))
    toast('knx_master.xml ist gewählt, aber zu groß für den Browser-Speicher — nach dem Neuladen erneut wählen.');
}

let toastTimer;
function toast(msg, cls = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
}

/* ---------- Werkzeugleiste ---------- */

function setup() {
  renderPalette();

  const exSel = $('#examples');
  exSel.innerHTML = '<option value="">Beispiel laden…</option>' +
    S.examples.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join('');
  exSel.addEventListener('change', () => {
    if (exSel.value === '') return;
    model = M.parse(JSON.stringify(S.examples[+exSel.value].model));
    exSel.value = '';
    editor.select(null); update(); editor.fit();
  });

  $('#btn-new').addEventListener('click', () => {
    if (model.nodes.length && !$('#btn-new').classList.contains('confirm')) {
      $('#btn-new').classList.add('confirm');
      $('#btn-new').textContent = 'Wirklich leeren?';
      setTimeout(() => { $('#btn-new').classList.remove('confirm'); $('#btn-new').textContent = 'Neu'; }, 3000);
      return;
    }
    $('#btn-new').classList.remove('confirm'); $('#btn-new').textContent = 'Neu';
    model = M.create();
    editor.select(null); update();
  });
  $('#btn-open').addEventListener('click', () => $('#file-open').click());
  $('#file-open').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { model = M.parse(await f.text()); editor.select(null); update(); editor.fit(); toast(`${f.name} geladen`); }
    catch (err) { toast(`Öffnen fehlgeschlagen: ${err.message}`, 'error'); }
  });
  $('#btn-save').addEventListener('click', () => download(`${base()}.sbs.json`, M.serialize(model), 'application/json'));
  $('#btn-fw').addEventListener('click', () => exportFirmware(false));
  $('#btn-prod').addEventListener('click', () => download(`${base()}.knxprod`, knxprodBytes(), 'application/zip'));
  $('#btn-all').addEventListener('click', () => exportFirmware(true));
  $('#btn-fit').addEventListener('click', () => editor.fit());
  $('#btn-device').addEventListener('click', () => { editor.select(null); renderInspector(); });
  $('#out-toggle').addEventListener('click', () => document.body.classList.toggle('out-collapsed'));

  $('#file-master').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await readMaster(f); renderInspector(); renderMessages(); toast('knx_master.xml übernommen', 'ok'); }
    catch (err) { toast(err.message, 'error'); }
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    if (e.key === 'Escape') { editor.select(null); renderInspector(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('#btn-save').click(); }
  });

  update();
  requestAnimationFrame(() => editor.fit());
}

/* Für die Browser-Konsole und den Rauchtest */
SBS.app = {
  get model() { return model; },
  get resolved() { return res; },
  select(sel) { editor.select(sel); renderInspector(); },
  update
};

setup();
})();
