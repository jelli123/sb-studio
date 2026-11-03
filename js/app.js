/* ============================================================
   Oberfläche: Kopfleiste, Palette, Inspektor, Meldungen, Ausgabe,
   Trennstege, Kontextmenüs, Schubladen für schmale Fenster
   ============================================================ */
(function () {
'use strict';
const S = SBS, B = S.blocks, M = S.model, I = S.i18n;
const t = I.t;
const $ = sel => document.querySelector(sel);
const STORE = 'sbs.model', STORE_MASTER = 'sbs.master', STORE_LAYOUT = 'sbs-layout-v1';

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

const narrow = () => window.matchMedia && window.matchMedia('(max-width: 1100px)').matches;

const editor = S.editor.create($('#canvas'), {
  getModel: () => model,
  onSelect: () => renderInspector(),
  onChange: o => update(o),
  onAdd: (type, x, y) => add(type, x, y),
  onRemove: id => removeNode(id),
  onContext: h => canvasMenu(h),
  onOpen: id => { editor.select({ kind: 'node', id }); renderInspector(); openDrawer('side'); },
  trash: () => $('#palette')
});

/* ---------- Ablauf ---------- */

function update(opts = {}) {
  M.normalize(model);
  if (!opts.noRecord) record(opts.merge || (opts.keepInspector ? inputKey() : null));
  res = M.resolve(model);
  editor.render(res);
  if (!opts.keepInspector && !opts.layoutOnly) renderInspector();
  renderMessages();
  renderOutput();
  const name = $('#device-name');
  if (name && document.activeElement !== name) name.value = model.device.name;
  store.set(STORE, M.serialize(model));
}

/* ---------- Rückgängig / Wiederholen ----------
   Schnappschüsse des Modells wie in SB-Project. Tippen in einem Feld wird
   zu einem Schritt zusammengefasst, solange keine Pause über 1,5 s entsteht;
   ein Ziehvorgang des Editors (Verbindung lösen und neu setzen) ist ein
   Schritt. Unveränderte Stände erzeugen keinen Schritt. */
const UNDO_MAX = 50;
const undoStack = [], redoStack = [];
let baseline = null, lastMerge = null, lastAt = 0;

function inputKey() {
  const el = document.activeElement;
  if (!el || !el.dataset) return null;
  const d = el.dataset;
  return 'input:' + JSON.stringify(editor.selection) + (d.dev || d.prop || d.param || ('label' in d ? 'label' : el.id || ''));
}

function record(merge) {
  const snap = M.serialize(model);
  if (baseline === null) { baseline = snap; return; }
  if (snap === baseline) return;
  const same = merge && merge === lastMerge && (merge.startsWith('drag:') || Date.now() - lastAt < 1500);
  if (!same) {
    undoStack.push(baseline);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }
  redoStack.length = 0;
  baseline = snap;
  lastMerge = merge || null;
  lastAt = Date.now();
  syncHistory();
}

function restore() {
  model = M.parse(baseline);
  lastMerge = null;
  const sel = editor.selection;
  if (sel && (sel.kind === 'node' ? !model.nodes.some(n => n.id === sel.id) : !model.links[sel.id])) editor.select(null);
  update({ noRecord: true });
  syncHistory();
}
function undo() {
  if (!undoStack.length) return toast(t('Nichts rückgängig zu machen'));
  redoStack.push(baseline);
  baseline = undoStack.pop();
  restore();
}
function redo() {
  if (!redoStack.length) return toast(t('Nichts zu wiederholen'));
  undoStack.push(baseline);
  baseline = redoStack.pop();
  restore();
}

/* Knöpfe und Tooltips – auch beim Sprachwechsel, sonst blieben die Tooltips
   in der alten Sprache stehen (in SB-Project passiert genau das) */
function syncHistory() {
  const steps = n => n === 1 ? t('{0} Schritt', n) : t('{0} Schritte', n);
  const set = (id, on, label) => {
    const b = $(id);
    if (!b) return;
    b.disabled = !on;
    b.title = label;
    b.setAttribute('aria-label', label);
  };
  set('#btn-undo', undoStack.length > 0,
    undoStack.length ? t('Rückgängig: {0} (Strg+Z)', steps(undoStack.length)) : t('Nichts rückgängig zu machen'));
  set('#btn-redo', redoStack.length > 0,
    redoStack.length ? t('Wiederholen: {0} (Strg+Y)', steps(redoStack.length)) : t('Nichts zu wiederholen'));
}

function add(type, x, y) {
  const n = M.addNode(model, type, x, y);
  editor.select({ kind: 'node', id: n.id });
  closeDrawers();
  update();
  return n;
}

function removeNode(id) {
  M.removeNode(model, id);
  editor.select(null);
  update();
}

function duplicate(id) {
  const src = model.nodes.find(n => n.id === id);
  if (!src) return;
  const n = M.addNode(model, src.type, src.x + 30, src.y + 30);
  n.label = src.label;
  n.props = JSON.parse(JSON.stringify(src.props));
  n.params = JSON.parse(JSON.stringify(src.params));
  n.fixed = JSON.parse(JSON.stringify(src.fixed || {}));
  /* Pins nicht doppelt belegen: den freien Vorschlag von addNode behalten */
  const def = B.get(src.type);
  (def.props || []).filter(p => p.kind === 'pin').forEach(p => {
    const free = (p.pins || B.MCU[model.device.mcu].pins).find(x => !model.nodes.some(o => o !== n && M.pinsOf(o).includes(x)));
    if (free) n.props[p.id] = free;
  });
  editor.select({ kind: 'node', id: n.id });
  update();
}

/* Verbindungen eines Ports (dir in/out) oder des ganzen Blocks lösen */
function unlink(id, port, dir) {
  const hit = l => dir === 'in' ? l.to[0] === id && l.to[1] === port
    : dir === 'out' ? l.from[0] === id && l.from[1] === port
    : l.from[0] === id || l.to[0] === id;
  model.links = model.links.filter(l => !hit(l));
  update();
}

function connect(from, to) {
  model.links = model.links.filter(l => !(l.to[0] === to[0] && l.to[1] === to[1]));
  model.links.push({ from, to });
  update();
}

function deleteSelection() {
  const sel = editor.selection;
  if (!sel) return;
  if (sel.kind === 'node') return removeNode(sel.id);
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
    h.textContent = t(cat);
    box.appendChild(h);
    B.DEFS.filter(d => d.cat === cat).forEach(d => {
      const item = document.createElement('button');
      item.className = `block-item cat-${d.cat}`;
      item.draggable = true;
      item.title = t(d.help || '');
      item.innerHTML = `<span class="swatch"></span><span>${esc(t(d.name))}</span>`;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/x-sbs-block', d.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => addCentered(d.type));
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        openMenu([
          { title: t(d.name) },
          { label: t('Einfügen'), action: () => addCentered(d.type) },
          { label: t('Beschreibung'), action: () => toast(t(d.help || d.name)) }
        ], e.clientX, e.clientY);
      });
      box.appendChild(item);
    });
  });
}

function addCentered(type) {
  const c = editor.center();
  const k = model.nodes.length % 5;
  add(type, c.x + k * 20, c.y + k * 20);
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
    <h2>${esc(t('Gerät'))}</h2>
    <p class="muted">${esc(t('Kein Block gewählt. Diese Angaben gehen in Firmware und knxprod.'))}</p>
    ${field(t('Name'), `<input data-dev="name" value="${esc(d.name)}">`)}
    ${field(t('Bestellnummer'), `<input data-dev="orderNumber" value="${esc(d.orderNumber)}">`)}
    <div class="row2">
      ${field(t('Hersteller'), `<input data-dev="manufacturer" data-hex="4" value="${hex(d.manufacturer, 4)}">`, esc(t('0x00FA = OpenKNX')))}
      ${field(t('Hardware-Nr.'), `<input data-dev="hwSerial" value="${esc(d.hwSerial)}">`, esc(t('Hex, 1–4 Ziffern')))}
    </div>
    <div class="row2">
      ${field(t('Applikation'), `<input data-dev="appNumber" data-hex="4" value="${hex(d.appNumber, 4)}">`)}
      ${field(t('Version'), `<input data-dev="appVersion" data-hex="2" value="${hex(d.appVersion, 2)}">`, esc(t('nach Änderungen erhöhen')))}
    </div>
    <div class="row2">
      ${field(t('Hardware-Version'), `<input data-dev="hwVersion" data-int value="${esc(d.hwVersion)}">`)}
      ${field(t('Busstrom (mA)'), `<input data-dev="busCurrent" data-int value="${esc(d.busCurrent)}">`)}
    </div>
    ${field(t('MCU'), `<select data-dev="mcu">${mcus}</select>`, res.mask ? esc(t('Maske {0}', res.mask.name)) : '')}
    ${field(t('Pfad zur sblib'), `<input data-dev="sblibPath" value="${esc(d.sblibPath)}">`, esc(t('software-arm-lib, relativ zum entpackten Firmware-Ordner')))}
    <h3>knx_master.xml <span class="muted">(${esc(t('optional'))})</span></h3>
    <p class="muted">${esc(t('Die knxprod bringt ihre Ladeprozedur selbst mit und kommt ohne aus. Wer sie trotzdem beilegen will (wie es das Manufacturer Tool tut): aus einer vorhandenen knx_master.xml oder einer beliebigen .knxprod übernehmen.'))}</p>
    <div class="master ${master ? 'ok' : 'missing'}">${master ? `✓ ${esc(master.name)} <span class="muted">(${Math.round(master.xml.length / 1024)} KB)</span>` : esc(t('nicht gewählt'))}</div>
    <div class="btnrow">
      <button id="pick-master">${esc(t('Datei wählen…'))}</button>
      ${master ? `<button id="drop-master" class="ghost">${esc(t('Entfernen'))}</button>` : ''}
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
      return `<label class="check"><input type="checkbox" data-prop="${p.id}"${v ? ' checked' : ''}> ${esc(t(p.label))}</label>`;
    if (p.kind === 'pin') {
      const opts = (p.pins || pins).map(x => `<option value="${x}"${x === v ? ' selected' : ''}>${x}${used.has(x) ? ` — ${esc(t('belegt ({0})', used.get(x).label || t(B.get(used.get(x).type).name)))}` : ''}</option>`).join('');
      return field(t(p.label), `<select data-prop="${p.id}">${opts}</select>`);
    }
    if (p.kind === 'enum') {
      const opts = p.options.map(([k, txt]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t(txt))}</option>`).join('');
      return field(t(p.label), `<select data-prop="${p.id}">${opts}</select>`);
    }
    return field(t(p.label), `<input data-prop="${p.id}" value="${esc(v)}">`);
  }).join('');

  const params = r.params.map(p => {
    const e = res.params.find(x => x.r === r && x.def.id === p.id);
    const v = n.params[p.id];
    const input = p.type === 'enum'
      ? `<select data-param="${p.id}">${p.options.map(([k, txt]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t(txt))}</option>`).join('')}</select>`
      : `<input type="number" inputmode="numeric" data-param="${p.id}" value="${esc(v)}"${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''}>`;
    const where = e.fixed ? t('fest in der Firmware') : t('ETS, Offset {0}', hex(e.offset, 4));
    return `<div class="param">
      ${field(p.unit ? `${t(p.label)} (${t(p.unit)})` : t(p.label), input)}
      <label class="check small"><input type="checkbox" data-ets="${p.id}"${e.fixed ? '' : ' checked'}> ${esc(t('in der ETS einstellbar'))} <span class="muted">· ${esc(where)}</span></label>
    </div>`;
  }).join('');

  const kos = res.kos.filter(k => k.r === r).map(k =>
    `<tr><td class="num">${k.number}</td><td>${esc(k.def.text)}</td><td>${k.def.dpt}</td><td class="mono">${k.def.flags}</td></tr>`).join('');

  const notLinked = `<span class="muted">${esc(t('nicht verbunden'))}</span>`;
  const conns = [
    ...r.inputs.map(p => {
      const l = res.links.find(x => x.to === r && x.in.id === p.id);
      return `<li>⟵ ${esc(t(p.label))}: ${l ? esc(`${l.from.node.label || t(l.from.def.name)} · ${t(l.out.label)}`) : notLinked}</li>`;
    }),
    ...r.outputs.map(p => {
      const ls = res.links.filter(x => x.from === r && x.out.id === p.id);
      return `<li>⟶ ${esc(t(p.label))}: ${ls.length ? ls.map(l => esc(`${l.to.node.label || t(l.to.def.name)} · ${t(l.in.label)}`)).join(', ') : notLinked}</li>`;
    })
  ].join('');

  box.innerHTML = `
    <div class="insp-head cat-${def.cat}"><span class="swatch"></span><h2>${esc(t(def.name))}</h2>
      <span class="muted mono" title="${esc(t('Interne Kennung des Blocks. Daraus entstehen die Namen im erzeugten Code (z. B. {0}_in_…, KO_{1}_…); sie bleibt beim Umbau gleich.', n.id, n.id.toUpperCase()))}">${n.id}</span></div>
    <p class="muted">${esc(t(def.help || ''))}</p>
    ${field(t('Bezeichnung'), `<input data-label value="${esc(n.label)}" placeholder="${esc(t(def.name))}">`)}
    ${props ? `<h3>${esc(t('Eigenschaften'))}</h3>${props}` : ''}
    ${params ? `<h3>${esc(t('Parameter'))}</h3>${params}` : ''}
    ${kos ? `<h3>${esc(t('Kommunikationsobjekte'))}</h3><table class="kos"><tr><th>${esc(t('Nr.'))}</th><th>${esc(t('Name'))}</th><th>DPT</th><th>${esc(t('Flags'))}</th></tr>${kos}</table>` : ''}
    ${conns ? `<h3>${esc(t('Verbindungen'))}</h3><ul class="conns">${conns}</ul>` : ''}
    <div class="btnrow">
      <button id="dup">${esc(t('Duplizieren'))}</button>
      <button id="del" class="danger">${esc(t('Block löschen'))}</button>
    </div>`;

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
  $('#dup').addEventListener('click', () => duplicate(n.id));
}

function renderLink(box, l) {
  const a = res.byId.get(l.from[0]), b = res.byId.get(l.to[0]);
  const op = a && a.outputs.find(p => p.id === l.from[1]);
  const ip = b && b.inputs.find(p => p.id === l.to[1]);
  const name = r => r.node.label || t(r.def.name);
  box.innerHTML = `
    <h2>${esc(t('Verbindung'))}</h2>
    <p>${esc(a ? name(a) : l.from[0])} · ${esc(op ? t(op.label) : l.from[1])}<br>⟶ ${esc(b ? name(b) : l.to[0])} · ${esc(ip ? t(ip.label) : l.to[1])}</p>
    <div class="btnrow"><button id="del" class="danger">${esc(t('Verbindung löschen'))}</button></div>`;
  $('#del').addEventListener('click', deleteSelection);
}

/* ---------- Meldungen und Ausgabe ---------- */

function renderMessages() {
  const box = $('#messages');
  const items = [
    ...res.errors.map(e => ({ ...e, cls: 'error' })),
    ...res.warnings.map(w => ({ ...w, cls: 'warn' }))
  ];
  const count = $('#msg-count');
  count.textContent = res.errors.length ? t('{0} Fehler', res.errors.length) : items.length ? t('{0} Hinweise', items.length) : 'OK';
  count.className = 'badge ' + (res.errors.length ? 'error' : items.length ? 'warn' : 'ok');
  const dot = $('#side-badge');
  if (dot) { dot.hidden = !items.length; dot.className = 'dot' + (res.errors.length ? '' : ' warn'); }
  box.innerHTML = items.length
    ? items.map((m, i) => `<li class="${m.cls}" data-i="${i}">${esc(m.msg)}</li>`).join('')
    : `<li class="ok">${esc(t('Keine Fehler. Firmware und knxprod können erzeugt werden.'))}</li>`;
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
  catch (e) { tabs.textContent = ''; pre.textContent = t('Erzeugen nicht möglich: {0}', e.message); return; }
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
  if (res.errors.length) return toast(t('Erst die Fehler beheben (siehe Prüfung).'), 'error');
  const name = base();
  const files = {};
  Object.entries(S.firmware.files(res)).forEach(([k, v]) => { files[`${name}/${k}`] = v; });
  files[`${name}/${name}.sbs.json`] = M.serialize(model);
  // nur ein Ordner auf oberster Ebene, sonst legen Entpacker einen weiteren
  // darum und der relative sblib-Pfad stimmt nicht mehr
  if (withProd) files[`${name}/${name}.knxprod`] = knxprodBytes();
  download(`${name}${withProd ? '' : '_firmware'}.zip`, S.zip.write(files), 'application/zip');
}

function exportProd() {
  if (res.errors.length) return toast(t('Erst die Fehler beheben (siehe Prüfung).'), 'error');
  download(`${base()}.knxprod`, knxprodBytes(), 'application/zip');
}

const save = () => download(`${base()}.sbs.json`, M.serialize(model), 'application/json');

function loadExample(i) {
  model = M.parse(JSON.stringify(S.examples[i].model));
  editor.select(null); update(); editor.fit();
}

async function readMaster(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let xml;
  if (/\.xml$/i.test(file.name)) xml = new TextDecoder().decode(buf);
  else {
    const bytes = await S.zip.read(buf, n => /(^|\/)knx_master\.xml$/i.test(n));
    if (!bytes) throw new Error(t('Die Datei enthält keine knx_master.xml.'));
    xml = new TextDecoder().decode(bytes);
  }
  xml = xml.replace(/^\uFEFF/, '');
  const mv = res.mcu && res.mcu.mask;
  if (mv && !new RegExp(`<MaskVersion\\s[^>]*Id="${mv}"`).test(xml)) throw new Error(t('Die knx_master.xml enthält keine Maske {0}.', mv));
  master = { name: file.name, xml };
  if (!store.set(STORE_MASTER, JSON.stringify(master)))
    toast(t('knx_master.xml ist gewählt, aber zu groß für den Browser-Speicher — nach dem Neuladen erneut wählen.'));
}

let toastTimer;
function toast(msg, cls = '') {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast show ' + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

/* ---------- Kontextmenü ----------
   Einträge: { label, action, key, danger, disabled, sub: [...] }, { title }
   oder '-' für eine Linie. Ein Untermenü ersetzt den Inhalt (mit „Zurück“) –
   das geht mit Maus, Tastatur und Finger gleich. */

let menuReturn = null;
function openMenu(items, x, y, back) {
  const box = $('#ctx');
  if (!back) menuReturn = document.activeElement;
  box.innerHTML = '';
  const list = back ? [{ label: '‹ ' + t('Zurück'), action: back, keep: true }, '-', ...items] : items;
  list.forEach(it => {
    if (it === '-') return box.appendChild(document.createElement('hr'));
    if (it.title) {
      const h = document.createElement('div');
      h.className = 'ctx-title'; h.textContent = it.title;
      return box.appendChild(h);
    }
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.disabled = !!it.disabled;
    if (it.danger) b.className = 'danger';
    b.innerHTML = `<span>${esc(it.label)}</span>${it.sub ? '<span class="sub">›</span>' : it.key ? `<span class="key">${esc(it.key)}</span>` : ''}`;
    b.addEventListener('click', () => {
      if (it.sub) return openMenu(it.sub, x, y, () => openMenu(items, x, y, back));
      if (!it.keep) closeMenu();
      it.action();
    });
    box.appendChild(b);
  });
  box.hidden = false;
  /* Im Fenster halten */
  const r = box.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  box.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  const first = box.querySelector('button:not(:disabled)');
  if (first) first.focus({ preventScroll: true });
}

function closeMenu() {
  const box = $('#ctx');
  if (box.hidden) return;
  box.hidden = true;
  if (menuReturn && menuReturn.focus) menuReturn.focus({ preventScroll: true });
}

/* Blockauswahl nach Kategorien, für „Block einfügen“ */
const blockMenu = place => B.CATS.map(cat => ({
  label: t(cat),
  sub: B.DEFS.filter(d => d.cat === cat).map(d => ({ label: t(d.name), action: () => place(d.type) }))
}));

const nodeName = n => n.label || t(B.get(n.type).name);

function canvasMenu(h) {
  const items = [];
  if (h.kind === 'node' || h.kind === 'port') {
    const n = model.nodes.find(x => x.id === h.id);
    const r = res.byId.get(h.id);
    items.push({ title: nodeName(n) });
    if (h.kind === 'port') {
      const port = (h.dir === 'in' ? r.inputs : r.outputs).find(p => p.id === h.port);
      const linked = model.links.filter(l => h.dir === 'in' ? l.to[0] === h.id && l.to[1] === h.port : l.from[0] === h.id && l.from[1] === h.port);
      /* Verbinden ohne Ziehen – vor allem für Finger */
      const others = res.nodes.filter(o => o.node.id !== h.id);
      const targets = h.dir === 'out'
        ? others.flatMap(o => o.inputs.map(p => ({ label: `${nodeName(o.node)} · ${t(p.label)}`, action: () => connect([h.id, h.port], [o.node.id, p.id]) })))
        : others.flatMap(o => o.outputs.map(p => ({ label: `${nodeName(o.node)} · ${t(p.label)}`, action: () => connect([o.node.id, p.id], [h.id, h.port]) })));
      items.push({ title: `${h.dir === 'in' ? t('Eingang') : t('Ausgang')}: ${t(port.label)}` });
      items.push({ label: h.dir === 'out' ? t('Verbinden mit') : t('Verbinden von'), sub: targets, disabled: !targets.length });
      items.push({ label: linked.length > 1 ? t('{0} Verbindungen lösen', linked.length) : t('Verbindung lösen'), disabled: !linked.length,
                   action: () => unlink(h.id, h.port, h.dir) });
      items.push('-');
    }
    items.push(
      { label: t('Eigenschaften'), action: () => { editor.select({ kind: 'node', id: h.id }); renderInspector(); openDrawer('side'); } },
      { label: t('Umbenennen'), action: () => { editor.select({ kind: 'node', id: h.id }); renderInspector(); openDrawer('side');
          const inp = $('#inspector [data-label]'); if (inp) { inp.focus(); inp.select(); } } },
      { label: t('Duplizieren'), key: t('Strg+D'), action: () => duplicate(h.id) },
      { label: t('Alle Verbindungen lösen'), disabled: !model.links.some(l => l.from[0] === h.id || l.to[0] === h.id),
        action: () => unlink(h.id) },
      '-',
      { label: t('Löschen'), key: t('Entf'), danger: true, action: () => removeNode(h.id) }
    );
  } else if (h.kind === 'link') {
    items.push({ title: t('Verbindung') },
      { label: t('Löschen'), key: t('Entf'), danger: true, action: () => { model.links.splice(h.id, 1); editor.select(null); update(); } });
  } else {
    items.push(
      { label: t('Block hier einfügen'), sub: blockMenu(type => add(type, h.x - 92, h.y - 13)) },
      '-',
      { label: t('Rückgängig'), key: t('Strg+Z'), disabled: !undoStack.length, action: undo },
      { label: t('Wiederholen'), key: t('Strg+Y'), disabled: !redoStack.length, action: redo },
      '-',
      { label: t('Alles einpassen'), action: () => editor.fit() },
      { label: t('Vergrößern'), key: '+', action: () => editor.zoom(1.25) },
      { label: t('Verkleinern'), key: '−', action: () => editor.zoom(0.8) },
      '-',
      { label: t('Geräteeinstellungen'), action: showDevice }
    );
  }
  openMenu(items, h.clientX, h.clientY);
}

function showDevice() { editor.select(null); renderInspector(); openDrawer('side'); }

/* ---------- Schubladen (schmale Fenster) ---------- */

function openDrawer(which) {
  if (!narrow()) return;
  document.body.classList.toggle('open-palette', which === 'palette');
  document.body.classList.toggle('open-side', which === 'side');
  $('#scrim').hidden = false;
}
function closeDrawers() {
  document.body.classList.remove('open-palette', 'open-side');
  $('#scrim').hidden = true;
}
function toggleDrawer(which) {
  if (document.body.classList.contains('open-' + which)) closeDrawers(); else openDrawer(which);
}

/* ---------- Trennstege ----------
   Breite der Spalten und Höhe von Ausgabe und Prüfung, wie in SB-Project:
   ziehen, Pfeiltasten, Doppelklick setzt zurück. Gemerkt im Browser. */

const SIZES = {
  left:   { v: '--col-left',  def: 200, min: 140, max: 420, axis: 'x', sign: 1 },
  right:  { v: '--col-right', def: 340, min: 260, max: 640, axis: 'x', sign: -1 },
  output: { v: '--out-h',     def: 260, min: 60,  max: 900, axis: 'y', sign: -1 },
  msgs:   { v: '--msgs-h',    def: 200, min: 40,  max: 900, axis: 'y', sign: -1 }
};
let sizes = {};
try { sizes = JSON.parse(store.get(STORE_LAYOUT) || '{}') || {}; } catch (e) { sizes = {}; }

function setSize(edge, px) {
  const s = SIZES[edge];
  px = Math.round(Math.min(s.max, Math.max(s.min, px)));
  sizes[edge] = px;
  document.documentElement.style.setProperty(s.v, px + 'px');
}
const getSize = edge => sizes[edge] || SIZES[edge].def;

function setupResizers() {
  Object.keys(SIZES).forEach(edge => setSize(edge, getSize(edge)));
  document.querySelectorAll('.resizer').forEach(bar => {
    const edge = bar.dataset.edge, s = SIZES[edge];
    bar.addEventListener('pointerdown', e => {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('dragging');
      document.body.classList.add('resizing');
      document.body.style.cursor = s.axis === 'x' ? 'col-resize' : 'row-resize';
      const start = getSize(edge), from = s.axis === 'x' ? e.clientX : e.clientY;
      const move = ev => setSize(edge, start + s.sign * ((s.axis === 'x' ? ev.clientX : ev.clientY) - from));
      const up = () => {
        bar.classList.remove('dragging');
        document.body.classList.remove('resizing');
        document.body.style.cursor = '';
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        store.set(STORE_LAYOUT, JSON.stringify(sizes));
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('dblclick', () => { setSize(edge, s.def); store.set(STORE_LAYOUT, JSON.stringify(sizes)); });
    bar.addEventListener('keydown', e => {
      const keys = s.axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const d = (e.key === keys[1] ? 1 : -1) * (e.shiftKey ? 40 : 12);
      setSize(edge, getSize(edge) + s.sign * d);
      store.set(STORE_LAYOUT, JSON.stringify(sizes));
    });
  });
}

/* ---------- Sprache und Darstellung ---------- */

const THEME_LABEL = { system: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
const THEME_ICON = {
  system: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="3.1"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M12.95 3.05l-1.13 1.13M4.18 11.82l-1.13 1.13"/></svg>',
  dark: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13 9.8A5.6 5.6 0 0 1 6.2 3a5.6 5.6 0 1 0 6.8 6.8z"/></svg>'
};
const theme = () => window.SBSTheme;

function syncThemeButton() {
  const btn = $('#btn-theme'), th = theme();
  if (!btn || !th) return;
  const mode = th.mode(), label = m => t(THEME_LABEL[m]);
  btn.innerHTML = THEME_ICON[mode];
  btn.title = t('Darstellung: {0}', label(mode)) + (mode === 'system' ? ' ' + t('(gerade {0})', label(th.resolved())) : '')
    + ' ' + t('— klicken für {0}', label(th.next()));
  btn.setAttribute('aria-label', btn.title);
}

function renderExamples() {
  const exSel = $('#examples');
  exSel.innerHTML = `<option value="">${esc(t('Beispiel laden…'))}</option>` +
    S.examples.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join('');
}

/* Menü ⋮ der schmalen Kopfleiste */
function moreMenu() {
  const btn = $('#btn-more').getBoundingClientRect();
  const exp = res.errors.length > 0;
  openMenu([
    { title: t('Datei') },
    { label: t('Neues Gerät'), action: newDevice },
    { label: t('Öffnen…'), action: () => $('#file-open').click() },
    { label: t('Speichern'), action: save },
    { label: t('Beispiel laden…'), sub: S.examples.map((e, i) => ({ label: e.name, action: () => loadExample(i) })) },
    '-',
    { title: t('Export') },
    { label: t('Firmware'), disabled: exp, action: () => exportFirmware(false) },
    { label: 'knxprod', disabled: exp, action: exportProd },
    { label: t('Alles exportieren'), disabled: exp, action: () => exportFirmware(true) },
    '-',
    { label: t('Alles einpassen'), action: () => editor.fit() },
    { label: t('Sprache'), sub: Object.entries(I.LANGS).map(([code, name]) => ({ label: (code === I.lang() ? '✓ ' : '') + name, action: () => I.set(code) })) },
    { label: t('Darstellung'), sub: ['system', 'light', 'dark'].map(m => ({ label: (theme() && theme().mode() === m ? '✓ ' : '') + t(THEME_LABEL[m]), action: () => { theme().set(m); syncThemeButton(); } })) }
  ], btn.right - 220, btn.bottom + 4);
}

let newArmed = 0;
function newDevice() {
  if (model.nodes.length && Date.now() - newArmed > 3000) {
    newArmed = Date.now();
    toast(t('Noch einmal „Neues Gerät“ wählen, um den Graphen zu leeren.'), 'warn');
    return;
  }
  newArmed = 0;
  model = M.create();
  editor.select(null); update();
}

/* ---------- Werkzeugleiste ---------- */

function setup() {
  renderPalette();
  renderExamples();
  setupResizers();

  const exSel = $('#examples');
  exSel.addEventListener('change', () => {
    if (exSel.value === '') return;
    const i = +exSel.value;
    exSel.value = '';
    loadExample(i);
  });

  const nameInp = $('#device-name');
  nameInp.addEventListener('input', () => { model.device.name = nameInp.value; update({ keepInspector: true }); renderInspector(); });

  $('#btn-new').addEventListener('click', newDevice);
  $('#btn-open').addEventListener('click', () => $('#file-open').click());
  $('#file-open').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { model = M.parse(await f.text()); editor.select(null); update(); editor.fit(); toast(t('{0} geladen', f.name)); }
    catch (err) { toast(t('Öffnen fehlgeschlagen: {0}', err.message), 'error'); }
  });
  $('#btn-save').addEventListener('click', save);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-fw').addEventListener('click', () => exportFirmware(false));
  $('#btn-prod').addEventListener('click', exportProd);
  $('#btn-all').addEventListener('click', () => exportFirmware(true));
  $('#btn-fit').addEventListener('click', () => editor.fit());
  $('#btn-device').addEventListener('click', showDevice);
  $('#btn-palette').addEventListener('click', () => toggleDrawer('palette'));
  $('#btn-side').addEventListener('click', () => toggleDrawer('side'));
  $('#btn-more').addEventListener('click', moreMenu);
  $('#scrim').addEventListener('click', closeDrawers);
  $('#out-toggle').addEventListener('click', () => document.body.classList.toggle('out-collapsed'));
  /* Auf schmalen Fenstern zuerst ohne Ausgabe, die Zeichenfläche ist knapp */
  if (narrow()) document.body.classList.add('out-collapsed');

  $('#file-master').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await readMaster(f); renderInspector(); renderMessages(); toast(t('knx_master.xml übernommen'), 'ok'); }
    catch (err) { toast(err.message, 'error'); }
  });

  /* Sprache */
  const langSel = $('#ui-lang');
  langSel.innerHTML = Object.entries(I.LANGS).map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join('');
  langSel.value = I.lang();
  langSel.addEventListener('change', () => I.set(langSel.value));
  I.onChange(() => {
    langSel.value = I.lang();
    renderPalette(); renderExamples(); syncThemeButton(); syncHistory();
    update();
  });
  I.applyStatic();

  /* Darstellung */
  syncThemeButton();
  $('#btn-theme').addEventListener('click', () => { theme().set(theme().next()); syncThemeButton(); });
  window.addEventListener('sbs-theme', syncThemeButton);

  /* Menü schließen: Klick daneben, Escape, Fenster ändert sich */
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctx')) closeMenu(); }, true);
  window.addEventListener('resize', () => { closeMenu(); if (!narrow()) closeDrawers(); });
  $('#ctx').addEventListener('keydown', e => {
    const btns = [...$('#ctx').querySelectorAll('button:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); closeDrawers(); }
    if (e.target.closest('input, select, textarea, #ctx')) return;
    const sel = editor.selection;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    if (e.key === 'Escape') { editor.select(null); renderInspector(); }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const c = $('#canvas').getBoundingClientRect();
      canvasMenu({ kind: sel && sel.kind === 'node' ? 'node' : sel && sel.kind === 'link' ? 'link' : 'canvas',
                   id: sel && sel.id, clientX: c.left + c.width / 2, clientY: c.top + c.height / 2,
                   x: editor.center().x, y: editor.center().y });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    /* In Eingabefeldern bleibt Strg+Z dem Feld (siehe oben) */
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && sel && sel.kind === 'node') { e.preventDefault(); duplicate(sel.id); }
    if (e.key === '+' || e.key === '=') editor.zoom(1.25);
    if (e.key === '-') editor.zoom(0.8);
  });

  update();
  syncHistory();
  requestAnimationFrame(() => editor.fit());
}

/* Für die Browser-Konsole und den Rauchtest */
SBS.app = {
  get model() { return model; },
  get resolved() { return res; },
  select(sel) { editor.select(sel); renderInspector(); },
  menu: canvasMenu, moreMenu, undo, redo,
  get history() { return { undo: undoStack.length, redo: redoStack.length }; },
  update
};

setup();
})();
