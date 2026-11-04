/* ============================================================
   Oberfläche: Kopfleiste, Palette, Inspektor, Meldungen, Ausgabe,
   Trennstege, Kontextmenüs, Schubladen für schmale Fenster
   ============================================================ */
(function () {
'use strict';
const S = SBS, B = S.blocks, M = S.model, I = S.i18n, MD = S.markdown;
const t = I.t;
const $ = sel => document.querySelector(sel);
const STORE = 'sbs.model', STORE_MASTER = 'sbs.master', STORE_LAYOUT = 'sbs-layout-v1', STORE_LIB = 'sbs.macros';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

/* project ist das Gerät; model der gezeigte Graph – das Projekt oder beim
   Bearbeiten eines Makros dessen Ansicht (Knoten des Makros, Gerät und
   Plattformen vom Projekt). res löst den gezeigten Graphen auf (Editor,
   Inspektor), pres das Projekt (Prüfung, Ausgabe, Export). */
let project = load();
let editing = null;
let model = project;
let res = null, pres = null;

function show(id) {
  editing = id && M.macroOf(project, id) ? id : null;
  model = editing ? M.macroView(project, editing) : project;
}
function setProject(p) { project = p; show(editing); }
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
  onOpen: id => {
    const n = model.nodes.find(x => x.id === id);
    const m = n && n.type === 'macro' && M.macroOf(project, n.props.macro);
    if (m) { enterMacro(m.id); return; }
    editor.select({ kind: 'node', id }); renderInspector(); openDrawer('side');
  },
  trash: () => $('#palette')
});

/* ---------- Ablauf ---------- */

function update(opts = {}) {
  M.normalize(project);
  if (!opts.noRecord) record(opts.merge || (opts.keepInspector ? inputKey() : null));
  pres = M.resolve(project);
  res = editing ? M.resolve(model) : pres;
  editor.render(res);
  renderCrumbs();
  if (!opts.keepInspector && !opts.layoutOnly) renderInspector();
  renderMessages();
  renderOutput();
  if (paletteKey !== availability()) renderPalette();
  if (!opts.keepDialog) refreshPlatform();
  const name = $('#device-name');
  if (name && document.activeElement !== name) name.value = model.device.name;
  store.set(STORE, M.serialize(project));
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
  const snap = M.serialize(project);
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
  setProject(M.parse(baseline));
  lastMerge = null;
  const sel = editor.selection;
  if (sel && sel.kind === 'nodes') pick(sel.ids.filter(id => model.nodes.some(n => n.id === id)));
  else if (sel && (sel.kind === 'node' ? !model.nodes.some(n => n.id === sel.id) : !model.links[sel.id])) editor.select(null);
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
  /* aus der Bibliothek: erst ins Projekt holen */
  if (type.startsWith('lib:')) {
    const e = library().find(x => x.lib === type.slice(4));
    if (!e) return null;
    type = 'macro:' + M.unpackMacro(project, e).id;
  }
  if (type.startsWith('macro:')) {
    const id = type.slice(6);
    if (editing && M.macroUsers(project, editing).has(id)) { toast(t('Ein Makro kann sich nicht selbst enthalten.'), 'warn'); return null; }
    const n = M.addMacro(model, id, x, y);
    editor.select({ kind: 'node', id: n.id });
    closeDrawers();
    update();
    return n;
  }
  const platform = M.platformOf(model);
  const lack = platform && M.unavailable(B.get(type), platform);
  if (lack) { toast(t('Auf {0} nicht verfügbar: {1}', platform.name, lack), 'warn'); return null; }
  const n = M.addNode(model, type, x, y);
  editor.select({ kind: 'node', id: n.id });
  closeDrawers();
  update();
  return n;
}

function removeNode(id) {
  [].concat(id).forEach(x => M.removeNode(model, x));
  editor.select(null);
  update();
}

/* Gewählte Blöcke (einer oder mehrere) */
const chosen = () => { const s = editor.selection; return !s ? [] : s.kind === 'node' ? [s.id] : s.kind === 'nodes' ? s.ids : []; };
const pick = ids => editor.select(ids.length > 1 ? { kind: 'nodes', ids } : ids.length ? { kind: 'node', id: ids[0] } : null);

function selectAll() { pick(model.nodes.map(n => n.id)); renderInspector(); }

/* Auswahl als Makro übernehmen und gleich zeigen, was entstanden ist */
function collapseSelection(ids = chosen()) {
  const c = M.collapse(model, ids);
  if (!c) { toast(t('Makro-Ein- und -Ausgänge bleiben im Makro.'), 'warn'); return; }
  editor.select({ kind: 'node', id: c.inst.id });
  update();
  toast(t('Makro „{0}“ angelegt – „Makro bearbeiten“ öffnet es.', c.macro.name));
}

/* Instanz zurück in einzelne Blöcke, die dann gewählt sind */
function explodeInstance(id) {
  const added = M.explode(model, id);
  if (!added) return;
  pick(added.map(n => n.id));
  update();
  toast(t('Makro aufgelöst: {0} Blöcke. Das Makro selbst bleibt erhalten.', added.length));
}

function duplicate(id) {
  const src = model.nodes.find(n => n.id === id);
  if (!src) return;
  const n = M.addNode(model, src.type, src.x + 30, src.y + 30);
  n.label = src.label;
  n.props = JSON.parse(JSON.stringify(src.props));
  n.params = JSON.parse(JSON.stringify(src.params));
  n.fixed = JSON.parse(JSON.stringify(src.fixed || {}));
  /* Pins nicht doppelt belegen */
  M.freePins(model, n);
  /* Makro: Einstellungen der inneren Blöcke mit, KO-Nummern und Pins neu */
  if (src.type === 'macro') {
    const strip = store => Object.fromEntries(Object.entries(store || {}).map(([k, e]) =>
      [k, Object.assign({}, e, { kos: {}, inner: e.inner && strip(e.inner) })]));
    n.inner = strip(JSON.parse(JSON.stringify(src.inner || {})));
    M.normalize(project);
    M.freeInstancePins(model, n);
  }
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
  if (sel.kind === 'nodes') return removeNode(sel.ids);
  if (sel.kind === 'link') model.links.splice(sel.id, 1);
  editor.select(null);
  update();
}

/* ---------- Hardware-Plattform ----------
   Vordefinierte Plattformen lassen sich ansehen und kopieren, eigene (im
   Modell, model.platforms) im Dialog bearbeiten. Was die Plattform an Pins
   und Bussen bietet, bestimmt die verfügbaren Hardware-Blöcke. */

const GEAR = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M6.9 1.8h2.2l.4 1.8 1.1.6 1.7-.6 1.1 1.9-1.3 1.2v1.3l1.3 1.2-1.1 1.9-1.7-.6-1.1.6-.4 1.8H6.9l-.4-1.8-1.1-.6-1.7.6-1.1-1.9 1.3-1.2V6.7L2.6 5.5l1.1-1.9 1.7.6 1.1-.6z"/><circle cx="8" cy="8" r="2"/></svg>';
const PLATFORM_FORMAT = 'sb-studio-platform/1';

function platformSelect() {
  const cur = model.device.platform;
  const opt = (id, p) => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(p.name)}</option>`;
  return `<select data-platform>
    ${M.platformOf(model) ? '' : `<option value="${esc(cur)}" selected>${esc(t('unbekannt ({0})', cur))}</option>`}
    <optgroup label="${esc(t('Vordefiniert'))}">${Object.entries(B.PLATFORMS).map(([id, p]) => opt(id, p)).join('')}</optgroup>
    ${model.platforms.length ? `<optgroup label="${esc(t('Eigene'))}">${model.platforms.map(p => opt(p.id, p)).join('')}</optgroup>` : ''}
    <option value="">${esc(t('Neue Plattform (Kopie der gewählten)…'))}</option>
  </select>`;
}

/* Eigene Plattform als Kopie anlegen und gleich bearbeiten */
function copyPlatform(src) {
  const ids = new Set(model.platforms.map(p => p.id));
  let n = 1;
  while (ids.has('custom-' + n)) n++;
  const p = JSON.parse(JSON.stringify({
    id: 'custom-' + n, name: t('{0} (Kopie)', src.name), chip: src.chip, prog: src.prog || '',
    pins: src.pins || [], buses: src.buses || {}, from: src.builtin ? src.id : src.from
  }));
  model.platforms.push(p);
  model.device.platform = p.id;
  update();
  openPlatform();
}

function addPlatform(p) {
  model.platforms.push(p);
  model.device.platform = p.id;
  update();
  openPlatform();
}

function deletePlatform(id) {
  const p = model.platforms.find(x => x.id === id);
  if (!p) return;
  model.platforms = model.platforms.filter(x => x !== p);
  if (model.device.platform === id) model.device.platform = B.PLATFORMS[p.from] ? p.from : Object.keys(B.PLATFORMS)[0];
  $('#platform-dlg').close();
  update();
  toast(t('Plattform „{0}“ gelöscht — Rückgängig holt sie zurück.', p.name));
}

function exportPlatform(p) {
  const { id, builtin, ...data } = p;
  download(`${S.firmware.slug(p.name)}.sbs-platform.json`,
    JSON.stringify({ format: PLATFORM_FORMAT, platform: data }, null, 2), 'application/json');
}

async function importPlatform(file) {
  const j = JSON.parse(await file.text());
  const p = j && j.format === PLATFORM_FORMAT && j.platform;
  if (!p || typeof p.chip !== 'string' || !Array.isArray(p.pins)) throw new Error(t('Keine Plattform-Datei von SB-Studio.'));
  const ids = new Set(model.platforms.map(x => x.id));
  let n = 1;
  while (ids.has('custom-' + n)) n++;
  addPlatform(M.cleanBuses({ name: String(p.name || file.name), chip: p.chip, prog: p.prog || '', buses: p.buses || {},
                pins: p.pins.map(x => ({ name: String(x.name || ''), gpio: String(x.gpio || ''), fn: [].concat(x.fn || []) })),
                id: 'custom-' + n }));
}

function openPlatform() {
  const d = $('#platform-dlg');
  renderPlatform();
  if (!d.open) d.showModal();
}

/* GPIO mit dem, was er kann – für Auswahllisten */
function gpioLabel(chip, g) {
  const info = chip.gpio[g] || {};
  const can = [info.adc, B.pwmOf(chip, g) && 'PWM', info.note].filter(Boolean);
  return can.length ? `${g} (${can.join(', ')})` : g;
}
/* Pin eines Bussignals; beim KNX-Bus mit der Timerfunktion */
function sigLabel(chip, bus, sig, g) {
  const info = chip.gpio[g] || {};
  if (bus === 'knx') {
    const f = sig === 'rx' ? (info.cap || []).map(x => B.timerFn(x, 'CAP')) : (info.mat || []).map(x => B.timerFn(x, 'MAT'));
    if (f.length) return `${g} (${f.join(', ')})`;
  }
  return g;
}

function renderPlatform() {
  const dlg = $('#platform-dlg');
  const p = M.platformOf(model);
  if (!p) { dlg.close(); return; }
  const own = p.builtin ? null : model.platforms.find(x => x.id === p.id);
  const dis = own ? '' : ' disabled';
  const chip = M.chipOf(p);
  const gpios = chip ? Object.keys(chip.gpio) : [];
  const usedBy = new Map();
  pres.pins.forEach(x => usedBy.set(x.name, (usedBy.get(x.name) || []).concat(nodeName(x.node))));
  const gpioSelect = (attr, v, none) => `<select ${attr}${dis}>
    ${none ? `<option value=""${v ? '' : ' selected'}>${esc(t('keine'))}</option>` : ''}
    ${v && !gpios.includes(v) ? `<option value="${esc(v)}" selected>${esc(v)} — ${esc(t('ungültig'))}</option>` : ''}
    ${gpios.map(g => `<option value="${g}"${g === v ? ' selected' : ''}>${esc(chip ? gpioLabel(chip, g) : g)}</option>`).join('')}
  </select>`;

  const rows = p.pins.map((x, i) => {
    const can = chip ? B.pinFns(chip, x.gpio) : [];
    return `<tr data-i="${i}">
      <td><input data-pin-name value="${esc(x.name)}" aria-label="${esc(t('Name'))}" spellcheck="false"${dis}></td>
      <td>${gpioSelect('data-pin-gpio aria-label="GPIO"', x.gpio)}</td>
      ${Object.keys(B.PIN_FN).map(f => `<td class="c"><input type="checkbox" data-pin-fn="${f}" aria-label="${esc(t(B.PIN_FN[f]))}"${(x.fn || []).includes(f) ? ' checked' : ''}${own && can.includes(f) ? '' : ' disabled'}></td>`).join('')}
      <td class="used">${esc((usedBy.get(x.name) || []).join(', '))}</td>
      <td>${own ? `<button type="button" class="ghost" data-pin-del title="${esc(t('Pin entfernen'))}" aria-label="${esc(t('Pin entfernen'))}">✕</button>` : ''}</td>
    </tr>`;
  }).join('');

  /* KNX und SB-Debug belegen ihre Pins immer, die übrigen Busse erst, wenn
     ein Block sie nutzt. Ein Signal mit nur einem möglichen Pin steht als Text da. */
  const buses = chip ? Object.entries(chip.buses).map(([b, sigs]) => {
    const on = p.buses && p.buses[b];
    const info = B.BUS_INFO[b] || {};
    const state = info.required ? t('immer vorhanden') : info.always ? t('belegt, wenn angeschlossen') : t('belegt, wenn genutzt');
    return `<div class="bus${info.always ? ' always' : ''}">
      <label class="check"><input type="checkbox" data-bus="${b}"${on ? ' checked' : ''}${own && !info.required ? '' : ' disabled'}> <b>${esc(B.BUS_NAMES[b] || b)}</b> <span class="muted">${esc(state)}</span></label>
      ${Object.entries(sigs).map(([s, allowed]) => {
        const v = on ? on[s] : b === 'knx' ? chip.knx[s] : allowed[0];
        const mark = info.always ? `<em class="${(info.shared || []).includes(s) ? 'shared' : 'fixed'}">${esc((info.shared || []).includes(s) ? t('mitbenutzbar') : t('fest belegt'))}</em>` : '';
        const input = allowed.length === 1 && allowed[0] === v
          ? `<code>${esc(sigLabel(chip, b, s, v))}</code>`
          : `<select data-bus-sig="${b}" data-sig="${s}"${own && on ? '' : ' disabled'}>
          ${allowed.includes(v) ? '' : `<option value="${esc(v)}" selected>${esc(v)} — ${esc(t('ungültig'))}</option>`}
          ${allowed.map(g => `<option value="${g}"${g === v ? ' selected' : ''}>${esc(sigLabel(chip, b, s, g))}</option>`).join('')}</select>`;
        return `<label class="sig"><span>${s.toUpperCase()}</span>${input}${mark}</label>`;
      }).join('')}
    </div>`;
  }).join('') : '';

  dlg.innerHTML = `<form method="dialog" class="plat">
    <header>
      <h2>${esc(t('Hardware-Plattform'))}</h2>
      <button value="close" class="ghost" title="${esc(t('Schließen'))}" aria-label="${esc(t('Schließen'))}">✕</button>
    </header>
    <div class="plat-body">
      ${own ? '' : `<p class="note">${esc(t('Vordefinierte Plattform – nur zum Ansehen. Zum Anpassen eine eigene Kopie anlegen.'))}</p>`}
      <div class="row3">
        ${field(t('Name'), `<input data-plat="name" value="${esc(p.name)}" spellcheck="false"${dis}>`)}
        ${field(t('Chip'), `<select data-plat="chip"${dis}>${Object.entries(B.CHIP).map(([k, c]) => `<option value="${k}"${k === p.chip ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`,
          chip ? esc(t('{0} KB Flash für Code, Maske {1}', chip.flashEnd / 1024, B.MASK[chip.mask].name)) : '')}
        ${field(t('Programmiertaste/-LED'), gpioSelect('data-plat="prog"', p.prog, true), esc(t('sblib-Vorgabe: {0}', chip ? chip.progDefault : '–')))}
      </div>
      <h3>${esc(t('Pins'))}</h3>
      <div class="table-wrap"><table class="pins">
        <thead><tr><th>${esc(t('Name'))}</th><th>GPIO</th>${Object.values(B.PIN_FN).map(f => `<th class="c">${esc(t(f))}</th>`).join('')}<th>${esc(t('Verwendet von'))}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${own ? `<button type="button" data-pin-add>${esc(t('+ Pin'))}</button>` : ''}
      <h3>${esc(t('Busse'))}</h3>
      <p class="hint">${esc(t('KNX und SB-Debug belegen ihre Pins immer, die übrigen Busse erst, wenn ein Block sie nutzt. Die sblib bedient den KNX-Bus derzeit nur an RX PIO1_8 / TX PIO1_9. Ein SPI-Bus hat kein festes SSEL: jedes Gerät am Bus bekommt ein eigenes Chip-Select als Ausgangspin an seinem Block.'))}</p>
      <div class="buses">${buses}</div>
      <ul class="plat-msgs"></ul>
    </div>
    <footer>
      <button type="button" data-plat-copy>${esc(t('Als eigene Plattform kopieren'))}</button>
      ${own ? `<button type="button" data-plat-export>${esc(t('Exportieren'))}</button>` : ''}
      <button type="button" data-plat-import>${esc(t('Importieren…'))}</button>
      ${own ? `<button type="button" class="danger" data-plat-delete>${esc(t('Löschen'))}</button>` : ''}
      <span class="spacer"></span>
      <button value="close" class="primary">${esc(t('Fertig'))}</button>
    </footer>
  </form>`;
  renderPlatformMsgs();

  const q = s => dlg.querySelector(s), qa = s => dlg.querySelectorAll(s);
  const row = el => +el.closest('tr').dataset.i;
  q('[data-plat-copy]').addEventListener('click', () => copyPlatform(p));
  q('[data-plat-import]').addEventListener('click', () => $('#file-platform').click());
  if (!own) return;
  const changed = () => update({ keepInspector: true });
  const typed = key => { update({ keepInspector: true, keepDialog: true, merge: key }); renderPlatformMsgs(); };
  q('[data-plat-export]').addEventListener('click', () => exportPlatform(own));
  q('[data-plat-delete]').addEventListener('click', () => deletePlatform(own.id));
  q('[data-plat="name"]').addEventListener('input', e => { own.name = e.target.value; typed('platform:name'); });
  q('[data-plat="chip"]').addEventListener('change', e => { own.chip = e.target.value; changed(); });
  q('[data-plat="prog"]').addEventListener('change', e => { own.prog = e.target.value; changed(); });
  qa('[data-pin-name]').forEach(inp => inp.addEventListener('input', () => {
    const pin = own.pins[row(inp)], old = pin.name;
    pin.name = inp.value;
    /* Blöcke an diesem Pin wandern mit, auch in Makros und den Instanzen */
    const pinIds = new Set(B.DEFS.flatMap(d => (d.props || []).filter(pp => pp.kind === 'pin').map(pp => pp.id)));
    const move = props => Object.keys(props || {}).forEach(k => { if (pinIds.has(k) && props[k] === old) props[k] = pin.name; });
    const walk = store => Object.values(store || {}).forEach(e => { move(e.props); walk(e.inner); });
    [project, ...project.macros].forEach(g => g.nodes.forEach(n => {
      if (n.type === 'macro') walk(n.inner);
      else if (B.get(n.type)) (B.get(n.type).props || []).forEach(pp => {
        if (pp.kind === 'pin' && n.props[pp.id] === old) n.props[pp.id] = pin.name;
      });
    }));
    typed('platform:pin:' + row(inp));
  }));
  qa('[data-pin-gpio]').forEach(sel => sel.addEventListener('change', () => {
    const pin = own.pins[row(sel)];
    pin.gpio = sel.value;
    const can = B.pinFns(M.chipOf(own), pin.gpio);
    pin.fn = (pin.fn || []).filter(f => can.includes(f));
    changed();
  }));
  qa('[data-pin-fn]').forEach(box => box.addEventListener('change', () => {
    const pin = own.pins[row(box)], f = box.dataset.pinFn;
    pin.fn = Object.keys(B.PIN_FN).filter(k => k === f ? box.checked : (pin.fn || []).includes(k));
    changed();
  }));
  qa('[data-pin-del]').forEach(b => b.addEventListener('click', () => { own.pins.splice(row(b), 1); changed(); }));
  q('[data-pin-add]').addEventListener('click', () => {
    const c = M.chipOf(own);
    const taken = new Set(own.pins.map(x => x.gpio).concat(own.prog, M.busPins(own).filter(b => !b.shared).map(b => b.gpio)));
    const gpio = c ? Object.keys(c.gpio).find(g => !taken.has(g)) || Object.keys(c.gpio)[0] : '';
    let n = own.pins.length + 1;
    while (own.pins.some(x => x.name === 'P' + n)) n++;
    own.pins.push({ name: 'P' + n, gpio, fn: ['in', 'out'] });
    changed();
    const inputs = dlg.querySelectorAll('[data-pin-name]');
    if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
  });
  qa('[data-bus]').forEach(box => box.addEventListener('change', () => {
    const b = box.dataset.bus, sigs = M.chipOf(own).buses[b];
    own.buses = own.buses || {};
    if (box.checked) own.buses[b] = Object.fromEntries(Object.entries(sigs).map(([s, a]) => [s, b === 'knx' ? M.chipOf(own).knx[s] : a[0]]));
    else delete own.buses[b];
    changed();
  }));
  qa('[data-bus-sig]').forEach(sel => sel.addEventListener('change', () => {
    own.buses[sel.dataset.busSig][sel.dataset.sig] = sel.value;
    changed();
  }));
}

/* Prüfung der Plattform im Dialog; die Meldungen stehen auch in der Prüfung */
function renderPlatformMsgs() {
  const ul = $('#platform-dlg .plat-msgs');
  const p = M.platformOf(model);
  if (!ul || !p) return;
  const msgs = p.builtin ? [] : M.checkPlatform(p);
  ul.innerHTML = msgs.map(m => `<li class="error">${esc(m)}</li>`).join('') ||
    (p.builtin ? '' : `<li class="ok">${esc(t('Plattform in Ordnung.'))}</li>`);
}

/* Nach Rückgängig, Sprachwechsel …: Dialog neu aufbauen, Fokus behalten */
function refreshPlatform() {
  const dlg = $('#platform-dlg');
  if (!dlg || !dlg.open) return;
  const a = document.activeElement;
  let sel = null;
  if (a && dlg.contains && dlg.contains(a) && a.attributes) {
    const attr = [...a.attributes].find(x => x.name.startsWith('data-'));
    const tr = a.closest('tr');
    if (attr) sel = (tr ? `tr[data-i="${tr.dataset.i}"] ` : '') + `[${attr.name}${attr.value ? `="${attr.value}"` : ''}]`;
  }
  renderPlatform();
  const back = sel && dlg.querySelector(sel);
  if (back) back.focus();
}

/* ---------- Palette ---------- */

/* Was auf der Plattform fehlt, je Blocktyp – ändert es sich, wird die
   Palette neu aufgebaut */
let paletteKey = null;
function lackOf(d) {
  const platform = M.platformOf(model);
  return platform ? M.unavailable(d, platform) : '';
}
const availability = () => I.lang() + '|' + B.DEFS.map(lackOf).join('|') + '|' + editing + '|' +
  project.macros.map(m => m.id + ':' + m.name + ':' + (m.lib || '')).join(',') + '|' + libraryChoices().map(e => e.lib + ':' + e.name).join(',');
/* Bibliothekseinträge, die das Projekt noch nicht hat. Ein Projekt-Makro
   ohne Bezug zur Bibliothek (z. B. aus einem Beispiel), das inhaltlich einem
   Eintrag gleicht, wird mit ihm verknüpft – sonst stünde es doppelt in der
   Liste und Einfügen holte eine zweite Kopie ins Projekt. */
function libraryChoices() {
  const lib = library();
  project.macros.forEach(m => {
    if (m.lib && lib.some(e => e.lib === m.lib)) return;
    const e = lib.find(x => !project.macros.some(o => o.lib === x.lib) && M.sameMacro(project, m.id, x));
    if (e) m.lib = e.lib;
  });
  const have = new Set(project.macros.map(m => m.lib).filter(Boolean));
  return lib.filter(e => !have.has(e.lib));
}
const listed = d => !d.hidden && (!d.macroOnly || editing);
/* Makros, die hier eingefügt werden dürfen (nicht in sich selbst) */
function macroChoices() {
  const blocked = editing ? M.macroUsers(project, editing) : new Set();
  return project.macros.filter(m => !blocked.has(m.id));
}

function renderPalette() {
  const box = $('#palette');
  box.textContent = '';
  paletteKey = availability();
  const platform = M.platformOf(model);
  B.CATS.forEach(cat => {
    const sec = document.createElement('section');
    sec.className = 'pcat';
    box.appendChild(sec);
    const h = document.createElement('h3');
    h.textContent = t(cat);
    sec.appendChild(h);
    if (cat === 'Makro') {
      macroChoices().forEach(m => {
        const item = document.createElement('button');
        item.className = 'block-item cat-Makro';
        item.draggable = true;
        item.title = MD.plain(m.help) || t(B.get('macro').help);
        item.innerHTML = `<span class="swatch"></span><span>${esc(m.name)}</span>`;
        item.addEventListener('dragstart', e => {
          e.dataTransfer.setData('application/x-sbs-block', 'macro:' + m.id);
          e.dataTransfer.effectAllowed = 'copy';
        });
        item.addEventListener('click', () => addCentered('macro:' + m.id));
        item.addEventListener('contextmenu', e => {
          e.preventDefault();
          const lib = libEntry(m);
          openMenu([
            { title: m.name },
            { label: t('Einfügen'), action: () => addCentered('macro:' + m.id) },
            { label: t('Makro bearbeiten'), action: () => enterMacro(m.id) },
            '-',
            { label: lib ? t('Bibliothek aktualisieren') : t('In Bibliothek speichern'), disabled: !!lib && M.sameMacro(project, m.id, lib), action: () => saveToLibrary(m.id) },
            { label: t('Exportieren…'), action: () => exportMacro(M.packMacro(project, m.id)) }
          ].concat(lib ? ['-', { label: t('Aus der Bibliothek löschen'), danger: true, action: () => dropFromLibrary(lib) }] : []), e.clientX, e.clientY);
        });
        sec.appendChild(item);
      });
      libraryChoices().forEach(en => {
        const item = document.createElement('button');
        item.className = 'block-item cat-Makro lib';
        item.draggable = true;
        item.title = (en.help ? MD.plain(en.help) + '\n' : '') + t('Aus der Bibliothek – Einfügen holt es ins Projekt.');
        item.innerHTML = `<span class="swatch"></span><span>${esc(en.name)}</span><span class="tag">${esc(t('Bibliothek'))}</span>`;
        item.addEventListener('dragstart', e => {
          e.dataTransfer.setData('application/x-sbs-block', 'lib:' + en.lib);
          e.dataTransfer.effectAllowed = 'copy';
        });
        item.addEventListener('click', () => addCentered('lib:' + en.lib));
        item.addEventListener('contextmenu', e => {
          e.preventDefault();
          openMenu([
            { title: en.name },
            { label: t('Einfügen'), action: () => addCentered('lib:' + en.lib) },
            { label: t('Exportieren…'), action: () => exportMacro(en) },
            '-',
            { label: t('Aus der Bibliothek löschen'), danger: true, action: () => dropFromLibrary(en) }
          ], e.clientX, e.clientY);
        });
        sec.appendChild(item);
      });
      const add = document.createElement('button');
      add.className = 'block-item new-macro';
      add.textContent = t('+ Neues Makro');
      add.title = t(B.get('macro').help);
      add.addEventListener('click', newMacro);
      sec.appendChild(add);
      const imp = document.createElement('button');
      imp.className = 'block-item new-macro';
      imp.textContent = t('Makro importieren…');
      imp.title = t('Makro-Datei (.sbs-macro.json) in die Bibliothek übernehmen');
      imp.addEventListener('click', () => $('#file-macro').click());
      sec.appendChild(imp);
    }
    B.DEFS.filter(d => d.cat === cat && listed(d)).forEach(d => {
      const item = document.createElement('button');
      const lack = lackOf(d);
      const why = lack ? t('Auf {0} nicht verfügbar: {1}', platform.name, lack) : '';
      item.className = `block-item cat-${d.cat}${lack ? ' off' : ''}`;
      item.draggable = !lack;
      item.title = why || t(d.help || '');
      item.setAttribute('aria-disabled', lack ? 'true' : 'false');
      item.innerHTML = `<span class="swatch"></span><span>${esc(t(d.name))}</span>`;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/x-sbs-block', d.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => lack ? toast(why, 'warn') : addCentered(d.type));
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        openMenu([
          { title: t(d.name) },
          { label: t('Einfügen'), disabled: !!lack, action: () => addCentered(d.type) },
          { label: t('Beschreibung'), action: () => toast(t(d.help || d.name)) }
        ], e.clientX, e.clientY);
      });
      sec.appendChild(item);
    });
    foldCategory(sec);
  });
}

/* Lange Kategorien zeigen nur die ersten Einträge und darunter „…“; mit
   der Maus darüber (oder Antippen von „…“, Tastaturfokus) klappt sie auf */
const PALETTE_SHOWN = 4;
function foldCategory(sec) {
  const items = [...sec.querySelectorAll('.block-item:not(.new-macro)')];
  if (items.length <= PALETTE_SHOWN + 1) return;
  items.slice(PALETTE_SHOWN).forEach(x => x.classList.add('more'));
  const dots = document.createElement('button');
  dots.type = 'button';
  dots.className = 'block-item pcat-more';
  dots.innerHTML = `<span class="swatch"></span><span>…</span><span class="tag">${esc(t('{0} weitere', items.length - PALETTE_SHOWN))}</span>`;
  dots.title = t('{0} weitere', items.length - PALETTE_SHOWN);
  dots.addEventListener('click', () => sec.classList.add('pinned'));
  items[PALETTE_SHOWN - 1].after(dots);
  /* Kurz verweilen, bevor sie aufklappt – Scrollen durch die Liste soll
     nicht jede Kategorie öffnen */
  let timer = 0;
  sec.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => sec.classList.add('open'), PALETTE_HOVER_MS); });
  sec.addEventListener('mouseleave', () => { clearTimeout(timer); sec.classList.remove('open', 'pinned'); });
}
const PALETTE_HOVER_MS = 350;

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
  if (sel && sel.kind === 'nodes') return renderSelection(box, sel.ids);
  if (sel && sel.kind === 'node') {
    const n = model.nodes.find(x => x.id === sel.id);
    if (n) return n.type === 'macro' ? renderInstance(box, n) : renderNode(box, n);
  }
  if (sel && sel.kind === 'link' && model.links[sel.id]) return renderLink(box, model.links[sel.id]);
  if (editing) return renderMacro(box, M.macroOf(project, editing));
  renderDevice(box);
}

/* Mehrere Blöcke gewählt */
function renderSelection(box, ids) {
  const list = ids.map(id => model.nodes.find(n => n.id === id)).filter(Boolean);
  const ports = list.filter(n => n.type === 'macro_in' || n.type === 'macro_out').length;
  box.innerHTML = `
    <h2>${esc(t('{0} Blöcke gewählt', list.length))}</h2>
    <p class="muted">${esc(t('Umschalt-, Strg- oder ⌘-Klick nimmt Blöcke dazu oder heraus, Umschalt + Ziehen auf der Fläche zieht einen Rahmen, Strg+A wählt alle. Ziehen an einem gewählten Block verschiebt alle.'))}</p>
    <ul class="conns">${list.map(n => `<li>${esc(nodeName(n))} <span class="muted mono">${n.id}</span></li>`).join('')}</ul>
    ${ports ? `<p class="muted">${esc(t('Makro-Ein- und -Ausgänge bleiben im Makro.'))}</p>` : ''}
    <div class="btnrow">
      <button id="collapse" class="primary"${list.length > ports ? '' : ' disabled'}>${esc(t('Als Makro übernehmen'))}</button>
      <button id="del" class="danger">${esc(t('{0} Blöcke löschen', list.length))}</button>
    </div>`;
  $('#collapse').addEventListener('click', () => collapseSelection(ids));
  $('#del').addEventListener('click', deleteSelection);
}

/* ---------- Makros ----------
   Bearbeiten zeigt den Graphen des Makros statt des Geräts; die Leiste über
   der Zeichenfläche führt zurück. Prüfung und Ausgabe bleiben beim Gerät. */

function enterMacro(id) { show(id); editor.select(null); update(); editor.fit(); closeDrawers(); }
function leaveMacro() { show(null); editor.select(null); update(); editor.fit(); }

function newMacro() {
  const m = M.createMacro(project);
  enterMacro(m.id);
  const inp = $('#inspector [data-macro-name]');
  if (inp) { inp.focus(); inp.select(); }
}

/* Bibliothek im Browser, für alle Projekte: Einträge von M.packMacro */
function library() {
  try {
    const l = JSON.parse(store.get(STORE_LIB) || '[]');
    return Array.isArray(l) ? l.filter(e => e && e.lib && Array.isArray(e.macros) && e.macros.length) : [];
  } catch (e) { return []; }
}
function setLibrary(list, quiet) {
  list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (store.set(STORE_LIB, JSON.stringify(list))) return true;
  if (!quiet) toast(t('Die Bibliothek ließ sich im Browser nicht speichern.'), 'error');
  return false;
}
const libEntry = m => m && m.lib ? library().find(e => e.lib === m.lib) || null : null;

function saveToLibrary(id) {
  const e = M.packMacro(project, id);
  if (!e) return;
  e.saved = new Date().toISOString();
  if (setLibrary(library().filter(x => x.lib !== e.lib).concat(e)))
    toast(t('Makro „{0}“ in der Bibliothek gespeichert – es steht jetzt in jedem Projekt zur Wahl.', e.name));
  update({ keepInspector: true });
  renderInspector();
}
function loadFromLibrary(id) {
  const e = libEntry(M.macroOf(project, id));
  if (!e) return;
  M.unpackMacro(project, e, true);
  update();
  toast(t('Stand der Bibliothek geladen – Rückgängig holt den alten zurück.'));
}
let libDelArmed = '';
function dropFromLibrary(e) {
  if (libDelArmed !== e.lib) {
    libDelArmed = e.lib;
    setTimeout(() => { if (libDelArmed === e.lib) libDelArmed = ''; }, 3000);
    toast(t('Noch einmal wählen, um „{0}“ aus der Bibliothek zu löschen. Projekte, die es nutzen, behalten ihre Kopie.', e.name), 'warn');
    return;
  }
  libDelArmed = '';
  setLibrary(library().filter(x => x.lib !== e.lib));
  renderPalette();
  renderInspector();
  toast(t('„{0}“ aus der Bibliothek gelöscht.', e.name));
}
function exportMacro(e) {
  const { saved, ...data } = e;
  download(`${S.firmware.slug(e.name)}.sbs-macro.json`, JSON.stringify(data, null, 2), 'application/json');
}
/* Makro-Datei: in die Bibliothek, ohne Bibliothek ins Projekt */
function importMacro(text, name) {
  const e = JSON.parse(text);
  M.unpackMacro(M.create(), e);
  e.lib = e.macros[0].lib = e.lib || e.macros[0].lib || ('L' + Date.now().toString(36));
  e.name = String(e.macros[0].name || name);
  e.saved = new Date().toISOString();
  if (setLibrary(library().filter(x => x.lib !== e.lib).concat(e), true)) {
    renderPalette();
    toast(t('Makro „{0}“ in die Bibliothek übernommen.', e.name));
  } else {
    M.unpackMacro(project, e);
    update();
    toast(t('Makro „{0}“ ins Projekt übernommen.', e.name));
  }
}

/* Instanzen eines Makros im Projekt und in anderen Makros */
const instancesOf = id => [project, ...project.macros].reduce((k, g) => k + g.nodes.filter(n => n.type === 'macro' && n.props.macro === id).length, 0);

function renderCrumbs() {
  const bar = $('#crumbs');
  if (!bar) return;
  const m = editing && M.macroOf(project, editing);
  bar.hidden = !m;
  if (!m) return;
  const k = instancesOf(m.id);
  bar.innerHTML = `<button type="button" class="ghost" data-crumb-up>${esc(project.device.name || t('Gerät'))}</button>
    <span class="sep">›</span><b>${esc(t('Makro „{0}“', m.name))}</b>
    <span class="muted">${esc(k === 1 ? t('1 Instanz') : t('{0} Instanzen', k))}</span>
    <span class="spacer"></span><button type="button" class="primary" data-crumb-done>${esc(t('Fertig'))}</button>`;
  bar.querySelector('[data-crumb-up]').addEventListener('click', leaveMacro);
  bar.querySelector('[data-crumb-done]').addEventListener('click', leaveMacro);
}

/* Ohne Auswahl beim Bearbeiten: das Makro selbst */
let macroDelArmed = 0;
function renderMacro(box, m) {
  const ports = type => m.nodes.filter(x => x.type === type).sort((a, b) => a.y - b.y)
    .map(x => `<li>${esc(x.props.name)} <span class="muted">${esc(t(B.portType({ type: x.props.vtype })))}</span></li>`).join('')
    || `<li class="muted">${esc(t('keine'))}</li>`;
  const k = instancesOf(m.id);
  const lib = libEntry(m), same = !!lib && M.sameMacro(project, m.id, lib);
  box.innerHTML = `
    <div class="insp-head cat-Makro"><span class="swatch"></span><h2>${esc(t('Makro'))}</h2><span class="muted mono">${esc(m.id)}</span></div>
    <p class="muted">${esc(t('Blöcke hier gelten für jede Instanz. Ports entstehen aus Makro-Eingang und Makro-Ausgang (Blockliste, Kategorie Makro). Pins, Parameter und KO-Nummern stellt jede Instanz für sich ein; die Werte hier sind die Vorgabe.'))}</p>
    ${field(t('Name'), `<input data-macro-name value="${esc(m.name)}">`)}
    ${field(t('Beschreibung (Markdown)'), `<textarea class="md-src" data-macro-help rows="${Math.max(4, Math.min(16, String(m.help || '').split('\n').length + 1))}">${esc(m.help || '')}</textarea>`,
      esc(t('Steht als Notiz im Makro (frei verschiebbar), in den Eigenschaften jeder Instanz und als Hinweis in der Blockliste.')))}
    <div class="md md-preview" data-macro-preview>${MD.render(m.help || '')}</div>
    <label class="check"><input type="checkbox" data-macro-channel${m.channel !== false ? ' checked' : ''}> ${esc(t('Eigener Kanal'))}</label>
    <p class="muted small">${esc(t('Jede Instanz wird in der Produktdatenbank ein Kanal mit eigener Parameterseite (in einem anderen Makro: eine Seite in dessen Kanal), so zeigt sie z. B. die ETS. Aus: Parameter und KOs stehen auf der Seite darüber, etwa bei Hilfsmakros.'))}</p>
    <h3>${esc(t('Eingänge'))}</h3><ul class="conns">${ports('macro_in')}</ul>
    <h3>${esc(t('Ausgänge'))}</h3><ul class="conns">${ports('macro_out')}</ul>
    <p class="muted">${esc(k === 1 ? t('1 Instanz') : t('{0} Instanzen', k))}</p>
    <h3>${esc(t('Bibliothek'))}</h3>
    <p class="muted">${esc(!lib ? t('Nicht in der Bibliothek. Dort steht es in jedem Projekt dieses Browsers zur Wahl.')
      : same ? t('In der Bibliothek, gleicher Stand.')
      : t('In der Bibliothek mit anderem Stand (gespeichert {0}).', lib.saved ? new Date(lib.saved).toLocaleString(I.lang()) : '?'))}</p>
    <div class="btnrow">
      <button id="lib-save"${same ? ' disabled' : ''}>${esc(lib ? t('Bibliothek aktualisieren') : t('In Bibliothek speichern'))}</button>
      ${lib && !same ? `<button id="lib-load">${esc(t('Stand der Bibliothek laden'))}</button>` : ''}
      <button id="macro-export">${esc(t('Exportieren…'))}</button>
      ${lib ? `<button id="lib-drop" class="danger">${esc(t('Aus der Bibliothek löschen'))}</button>` : ''}
    </div>
    <div class="btnrow">
      <button id="macro-done" class="primary">${esc(t('Fertig'))}</button>
      <button id="macro-del" class="danger">${esc(t('Makro löschen'))}</button>
    </div>`;
  box.querySelector('[data-macro-name]').addEventListener('input', e => { m.name = e.target.value; update({ keepInspector: true }); });
  box.querySelector('[data-macro-channel]').addEventListener('change', e => { m.channel = e.target.checked; update({ keepInspector: true }); });
  box.querySelector('[data-macro-help]').addEventListener('input', e => {
    M.helpNote(m, e.target.value);
    box.querySelector('[data-macro-preview]').innerHTML = MD.render(m.help);
    update({ keepInspector: true });
  });
  $('#macro-done').addEventListener('click', leaveMacro);
  $('#lib-save').addEventListener('click', () => saveToLibrary(m.id));
  if (lib && !same) $('#lib-load').addEventListener('click', () => loadFromLibrary(m.id));
  $('#macro-export').addEventListener('click', () => exportMacro(M.packMacro(project, m.id)));
  if (lib) $('#lib-drop').addEventListener('click', () => dropFromLibrary(lib));
  $('#macro-del').addEventListener('click', () => {
    if (k && Date.now() - macroDelArmed > 3000) {
      macroDelArmed = Date.now();
      toast(t('Das Makro hat {0} Instanzen – zum Löschen samt Instanzen noch einmal klicken.', k), 'warn');
      return;
    }
    macroDelArmed = 0;
    M.deleteMacro(project, m.id);
    show(null); editor.select(null); update(); editor.fit();
    toast(t('Makro „{0}“ gelöscht — Rückgängig holt es zurück.', m.name));
  });
}

/* Instanz: Makro, Pins und Parameter der Blöcke darin, KOs */
function renderInstance(box, n) {
  const r = res.view.byId.get(n.id);
  const m = n._m;
  const inner = res.nodes.filter(x => x.node._owner === n.id);
  const innerName = x => x.node._prefix && x.title.startsWith(x.node._prefix + ': ') ? x.title.slice(x.node._prefix.length + 2) : x.title;
  const blocked = editing ? M.macroUsers(project, editing) : new Set();
  const choices = project.macros.filter(x => !blocked.has(x.id) || x.id === n.props.macro);
  const sel = `<select data-macro>${m ? '' : `<option value="" selected>${esc(t('fehlt ({0})', n.props.macro))}</option>`}
    ${choices.map(x => `<option value="${esc(x.id)}"${x.id === n.props.macro ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;

  const owner = new Map(res.pins.map(p => [p.name, p.node]));
  const pins = inner.flatMap(x => B.activeProps(x.def, x.node.props).filter(p => p.kind === 'pin').map(p => {
    const v = x.node.props[p.id];
    const list = M.pinOptions(model, p);
    const taken = name => { const o = owner.get(name); return o && o !== x.node ? ` — ${esc(t('belegt ({0})', nodeName(o)))}` : ''; };
    const opts = (list.some(q => q.name === v) ? '' : `<option value="${esc(v)}" selected>${esc(v)} — ${esc(t('nicht verfügbar'))}</option>`) +
      list.map(q => `<option value="${esc(q.name)}"${q.name === v ? ' selected' : ''}>${esc(q.name)} · ${esc(pinWhere(q))}${taken(q.name)}</option>`).join('');
    return field(`${innerName(x)} · ${t(p.label)}`, `<select data-ipin="${esc(x.node.id)}" data-pid="${p.id}">${opts}</select>`);
  })).join('');

  const params = inner.filter(x => x.params.length).map(x => `<h4>${esc(innerName(x))}</h4>` + x.params.map(p => {
    const e = res.params.find(q => q.r === x && q.def.id === p.id);
    const v = x.node.params[p.id];
    const input = p.type === 'enum'
      ? `<select data-iparam="${esc(x.node.id)}" data-pid="${p.id}">${p.options.map(([k, txt]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t(txt))}</option>`).join('')}</select>`
      : `<input type="number" inputmode="numeric" data-iparam="${esc(x.node.id)}" data-pid="${p.id}" value="${esc(v)}"${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''}>`;
    const where = e.fixed ? t('fest in der Firmware') : t('Parameter, Offset {0}', hex(e.offset, 4));
    return `<div class="param">
      ${field(p.unit ? `${t(p.label)} (${t(p.unit)})` : t(p.label), input)}
      <label class="check small"><input type="checkbox" data-iets="${esc(x.node.id)}" data-pid="${p.id}"${e.fixed ? '' : ' checked'}> ${esc(t('als KNX-Parameter einstellbar'))} <span class="muted">· ${esc(where)}</span></label>
    </div>`;
  }).join('')).join('');

  const kos = res.kos.filter(k => k.r.node._owner === n.id).map(k =>
    `<tr><td class="num">${k.number}</td><td>${esc(k.def.text)}</td><td>${k.def.dpt}</td><td class="mono">${k.def.flags}</td></tr>`).join('');

  const notLinked = `<span class="muted">${esc(t('nicht verbunden'))}</span>`;
  const other = id => { const o = res.view.byId.get(id); return o ? o.node.label || t(o.def.name) : id; };
  const portName = (id, dir, pid) => { const o = res.view.byId.get(id); const q = o && (dir === 'out' ? o.outputs : o.inputs).find(x => x.id === pid); return q ? t(q.label) : pid; };
  const conns = [
    ...r.inputs.map(p => {
      const ls = model.links.filter(l => l.to[0] === n.id && l.to[1] === p.id);
      return `<li>⟵ ${esc(t(p.label))} <span class="muted">${esc(t(B.portType(p)))}</span>: ${ls.length ? ls.map(l => esc(`${other(l.from[0])} · ${portName(l.from[0], 'out', l.from[1])}`)).join(', ') : notLinked}</li>`;
    }),
    ...r.outputs.map(p => {
      const ls = model.links.filter(l => l.from[0] === n.id && l.from[1] === p.id);
      return `<li>⟶ ${esc(t(p.label))} <span class="muted">${esc(t(B.portType(p)))}</span>: ${ls.length ? ls.map(l => esc(`${other(l.to[0])} · ${portName(l.to[0], 'in', l.to[1])}`)).join(', ') : notLinked}</li>`;
    })
  ].join('');

  box.innerHTML = `
    <div class="insp-head cat-Makro"><span class="swatch"></span><h2>${esc(m ? m.name : t('Makro'))}</h2><span class="muted mono">${n.id}</span></div>
    ${m && m.help ? `<div class="md insp-md">${MD.render(m.help)}</div>` : `<p class="muted">${esc(t(B.get('macro').help))}</p>`}
    ${field(t('Bezeichnung'), `<input data-label value="${esc(n.label)}" placeholder="${esc(m ? m.name : t('Makro'))}">`, esc(t('Steht vor KO-Namen und Parametern dieser Instanz.')))}
    ${field(t('Makro'), sel)}
    <div class="btnrow"><button id="macro-edit" ${m ? '' : 'disabled'}>${esc(t('Makro bearbeiten'))}</button>
      <button id="macro-explode" ${m ? '' : 'disabled'} title="${esc(t('Ersetzt die Instanz durch die Blöcke des Makros, mit ihren Pins, Parametern und KO-Nummern.'))}">${esc(t('Makro auflösen'))}</button></div>
    ${pins ? `<h3>${esc(t('Pins'))}</h3>${pins}` : ''}
    ${params ? `<h3>${esc(t('Parameter'))}</h3>${params}` : ''}
    ${kos ? `<h3>${esc(t('Kommunikationsobjekte'))}</h3><table class="kos"><tr><th>${esc(t('Nr.'))}</th><th>${esc(t('Name'))}</th><th>DPT</th><th>${esc(t('Flags'))}</th></tr>${kos}</table>` : ''}
    ${etsWhen(n)}
    ${conns ? `<h3>${esc(t('Verbindungen'))}</h3><ul class="conns">${conns}</ul>` : ''}
    <div class="btnrow">
      <button id="dup">${esc(t('Duplizieren'))}</button>
      <button id="del" class="danger">${esc(t('Block löschen'))}</button>
    </div>`;

  bindEtsWhen(box, n);
  const store = id => inner.find(x => x.node.id === id).node._store;
  box.querySelector('[data-label]').addEventListener('input', e => { n.label = e.target.value; update({ keepInspector: true }); });
  box.querySelector('[data-macro]').addEventListener('change', e => {
    if (!e.target.value) return;
    n.props.macro = e.target.value;
    n.inner = {};
    M.normalize(project);
    M.freeInstancePins(model, n);
    update();
  });
  $('#macro-edit').addEventListener('click', () => m && enterMacro(m.id));
  $('#macro-explode').addEventListener('click', () => m && explodeInstance(n.id));
  box.querySelectorAll('[data-ipin]').forEach(inp => inp.addEventListener('change', () => {
    store(inp.dataset.ipin).props[inp.dataset.pid] = inp.value;
    update();
  }));
  box.querySelectorAll('[data-iparam]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
    store(inp.dataset.iparam).params[inp.dataset.pid] = inp.value === '' ? NaN : Number(inp.value);
    update({ keepInspector: true });
  }));
  box.querySelectorAll('[data-iets]').forEach(inp => inp.addEventListener('change', () => {
    store(inp.dataset.iets).fixed[inp.dataset.pid] = !inp.checked;
    update();
  }));
  $('#del').addEventListener('click', deleteSelection);
  $('#dup').addEventListener('click', () => duplicate(n.id));
}

function renderDevice(box) {
  const d = model.device;
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
    ${field(t('Hardware-Plattform'), `<span class="with-btn">${platformSelect()}<button type="button" id="btn-platform" class="icon" title="${esc(t('Pins und Busse der Plattform'))}" aria-label="${esc(t('Pins und Busse der Plattform'))}">${GEAR}</button></span>`,
      res.mcu && res.mask ? esc(t('{0} · Maske {1}', res.mcu.name, res.mask.name)) : '')}
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
  box.querySelector('[data-platform]').addEventListener('change', e => {
    if (e.target.value === '') { copyPlatform(M.platformOf(model) || B.PLATFORMS[Object.keys(B.PLATFORMS)[0]]); return; }
    model.device.platform = e.target.value;
    update();
  });
  $('#btn-platform').addEventListener('click', e => { e.preventDefault(); openPlatform(); });
  $('#pick-master').addEventListener('click', () => $('#file-master').click());
  const drop = $('#drop-master');
  if (drop) drop.addEventListener('click', () => { master = null; store.set(STORE_MASTER, ''); renderInspector(); renderMessages(); });
}

/* In der ETS sichtbar: Bindung an eine ETS-Auswahl im selben Graphen */
const optionNodes = n => model.nodes.filter(o => o.type === 'option' && o.id !== n.id);
const optionChoices = o => String(o.props.choices || '').split('\n').map(s => s.trim()).filter(Boolean);
function etsWhen(n) {
  const opts = optionNodes(n);
  if (!opts.length && !n.when) return '';
  const on = n.when && opts.find(o => o.id === n.when.on);
  const sel = `<select data-when-on><option value="">${esc(t('immer'))}</option>${opts.map(o =>
    `<option value="${esc(o.id)}"${on === o ? ' selected' : ''}>${esc(t('bei „{0}“', o.label || o.props.name))}</option>`).join('')}</select>`;
  const checks = on ? `<div class="when-values">${optionChoices(on).map((c, i) =>
    `<label class="check"><input type="checkbox" data-when-v="${i}"${n.when.values.includes(i) ? ' checked' : ''}> ${esc(c)}</label>`).join('')}</div>` : '';
  return `<h3>${esc(t('Sichtbarkeit der Parameter'))}</h3>${field(t('Sichtbar'), sel,
    esc(n.type === 'macro' ? t('Gilt für alle Parameter und KOs der Instanz.') : t('Bindet Parameter und KOs des Blocks an eine Parameterauswahl: Im Parameterdialog (z. B. der ETS) erscheinen sie nur bei den gewählten Einträgen. Die Firmware arbeitet unabhängig davon; was nicht wirken soll, schaltet der Ausgang der Auswahl ab (Auswahl, Tor).')))}${checks}`;
}
function bindEtsWhen(box, n) {
  const sel = box.querySelector('[data-when-on]');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const o = optionNodes(n).find(x => x.id === sel.value);
    if (!o) delete n.when;
    else n.when = { on: o.id, values: optionChoices(o).length > 1 ? [1] : [0] };
    update();
  });
  box.querySelectorAll('[data-when-v]').forEach(inp => inp.addEventListener('change', () => {
    n.when.values = [...box.querySelectorAll('[data-when-v]')].filter(x => x.checked).map(x => +x.dataset.whenV);
    update({ keepInspector: true });
  }));
}

/* GPIO oder Stelle im Schieberegister (74HC595 IC1 QA) */
const pinWhere = x => x.ext ? x.ext.where : x.gpio;

function renderNode(box, n) {
  const def = B.get(n.type);
  const r = res.view.byId.get(n.id);
  const used = new Map();
  model.nodes.forEach(o => { if (o !== n) M.pinsOf(o).forEach(p => used.set(p, o)); });

  const props = B.activeProps(def, n.props).filter(p => !p.macroOnly || editing).map(p => {
    const v = n.props[p.id];
    if (p.kind === 'markdown')
      return field(t(p.label), `<textarea class="md-src" data-prop="${p.id}" rows="${Math.max(4, Math.min(16, String(v).split('\n').length + 1))}">${esc(v)}</textarea>`) +
        `<div class="md md-preview" data-preview="${p.id}">${MD.render(v)}</div>`;
    if (p.kind === 'bool')
      return `<label class="check"><input type="checkbox" data-prop="${p.id}"${v ? ' checked' : ''}> ${esc(t(p.label))}</label>`;
    if (p.kind === 'pin') {
      const list = M.pinOptions(model, p);
      const opts = (list.some(x => x.name === v) ? '' : `<option value="${esc(v)}" selected>${esc(v)} — ${esc(t('nicht verfügbar'))}</option>`) +
        list.map(x => `<option value="${esc(x.name)}"${x.name === v ? ' selected' : ''}>${esc(x.name)} · ${esc(pinWhere(x))}${used.has(x.name) ? ` — ${esc(t('belegt ({0})', used.get(x.name).label || t(B.get(used.get(x.name).type).name)))}` : ''}</option>`).join('');
      return field(t(p.label), `<select data-prop="${p.id}">${opts}</select>`);
    }
    if (p.kind === 'bus') {
      /* angeschlossene Busse der Plattform mit den Pins, die der Block belegt */
      const platform = M.platformOf(model);
      const list = B.busesFor(platform, p);
      const pinsOf = b => p.signals.map(x => {
        const g = platform.buses[b][x], pin = platform.pins.find(q => q.gpio === g);
        return `${x.toUpperCase()} ${g}${pin ? ` (${pin.name})` : ''}`;
      }).join(', ');
      const opts = (list.includes(v) ? '' : `<option value="${esc(v)}" selected>${esc(B.BUS_NAMES[v] || v)} — ${esc(t('nicht verfügbar'))}</option>`) +
        list.map(b => `<option value="${b}"${b === v ? ' selected' : ''}>${esc(B.BUS_NAMES[b])} · ${esc(pinsOf(b))}</option>`).join('');
      return field(t(p.label), `<select data-prop="${p.id}">${opts}</select>`);
    }
    if (p.kind === 'lines')
      return field(t(p.label), `<textarea data-prop="${p.id}" rows="${Math.max(3, Math.min(12, String(v).split('\n').length + 1))}">${esc(v)}</textarea>`);
    if (p.kind === 'code')
      return field(t(p.label), `<textarea class="code" data-prop="${p.id}" rows="${Math.max(3, Math.min(14, String(v).split('\n').length + 1))}" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(v)}</textarea>`);
    if (p.kind === 'int')
      return field(t(p.label), `<input type="number" inputmode="numeric" data-prop="${p.id}" value="${esc(v)}" min="${p.min}" max="${B.maxOf(p, n)}">`);
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
    const where = e.fixed ? t('fest in der Firmware') : t('Parameter, Offset {0}', hex(e.offset, 4));
    return `<div class="param">
      ${field(p.unit ? `${t(p.label)} (${t(p.unit)})` : t(p.label), input)}
      <label class="check small"><input type="checkbox" data-ets="${p.id}"${e.fixed ? '' : ' checked'}> ${esc(t('als KNX-Parameter einstellbar'))} <span class="muted">· ${esc(where)}</span></label>
    </div>`;
  }).join('');

  const kos = res.kos.filter(k => k.r === r).map(k =>
    `<tr><td class="num">${k.number}</td><td>${esc(k.def.text)}</td><td>${k.def.dpt}</td><td class="mono">${k.def.flags}</td></tr>`).join('');

  const notLinked = `<span class="muted">${esc(t('nicht verbunden'))}</span>`;
  const conns = [
    ...r.inputs.map(p => {
      const l = res.links.find(x => x.to === r && x.in.id === p.id);
      return `<li>⟵ ${esc(t(p.label))} <span class="muted">${esc(t(B.portType(p)))}</span>: ${l ? esc(`${l.from.node.label || t(l.from.def.name)} · ${t(l.out.label)}`) : notLinked}</li>`;
    }),
    ...r.outputs.map(p => {
      const ls = res.links.filter(x => x.from === r && x.out.id === p.id);
      return `<li>⟶ ${esc(t(p.label))} <span class="muted">${esc(t(B.portType(p)))}</span>: ${ls.length ? ls.map(l => esc(`${l.to.node.label || t(l.to.def.name)} · ${t(l.in.label)}`)).join(', ') : notLinked}</li>`;
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
    ${r.params.length || r.kos.length ? etsWhen(n) : ''}
    ${conns ? `<h3>${esc(t('Verbindungen'))}</h3><ul class="conns">${conns}</ul>` : ''}
    <div class="btnrow">
      <button id="dup">${esc(t('Duplizieren'))}</button>
      <button id="del" class="danger">${esc(t('Block löschen'))}</button>
    </div>`;

  bindEtsWhen(box, n);
  box.querySelector('[data-label]').addEventListener('input', e => { n.label = e.target.value; update({ keepInspector: true }); });
  box.querySelectorAll('[data-prop]').forEach(inp => {
    const p = def.props.find(x => x.id === inp.dataset.prop);
    /* Einträge (ETS-Auswahl) erst beim Verlassen übernehmen: davon hängen
       Parameter und Sichtbarkeit ab, die dann neu gezeichnet werden */
    const text = p.kind !== 'lines' && (inp.tagName === 'TEXTAREA' || (inp.tagName === 'INPUT' && inp.type !== 'checkbox'));
    /* Code: Tab rückt ein statt den Fokus zu wechseln */
    if (inp.tagName === 'TEXTAREA' && p.kind === 'code') inp.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      inp.setRangeText('    ', inp.selectionStart, inp.selectionEnd, 'end');
      inp.dispatchEvent(new Event('input'));
    });
    inp.addEventListener(text ? 'input' : 'change', () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (p.kind === 'enum') v = p.options.find(o => String(o[0]) === inp.value)[0];
      if (p.kind === 'int') v = inp.value === '' ? NaN : Number(inp.value);
      /* Schieberegister umbenannt: Pins, die es nutzen, folgen */
      if (def.expander && p.id === 'name' && n.props.name !== v) M.renameExpander(model, n.props.name, v);
      /* Beschreibung des Makros: nur eine Notiz; abgewählt ist sie leer */
      if (def.note && p.id === 'desc' && editing) {
        const m = M.macroOf(project, editing);
        if (v) m.nodes.forEach(o => { if (o.type === 'note' && o !== n) o.props.desc = false; });
        else m.help = '';
      }
      n.props[p.id] = v;
      if (p.kind === 'markdown') { const pv = box.querySelector(`[data-preview="${p.id}"]`); if (pv) pv.innerHTML = MD.render(v); }
      if (p.switches) M.freePins(model, n);
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
  const a = res.view.byId.get(l.from[0]), b = res.view.byId.get(l.to[0]);
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
    ...pres.errors.map(e => ({ ...e, cls: 'error' })),
    ...pres.warnings.map(w => ({ ...w, cls: 'warn' }))
  ];
  const count = $('#msg-count');
  count.textContent = pres.errors.length ? t('{0} Fehler', pres.errors.length) : items.length ? t('{0} Hinweise', items.length) : 'OK';
  count.className = 'badge ' + (pres.errors.length ? 'error' : items.length ? 'warn' : 'ok');
  const dot = $('#side-badge');
  if (dot) { dot.hidden = !items.length; dot.className = 'dot' + (pres.errors.length ? '' : ' warn'); }
  box.innerHTML = items.length
    ? items.map((m, i) => `<li class="${m.cls}" data-i="${i}">${esc(m.msg)}</li>`).join('')
    : `<li class="ok">${esc(t('Keine Fehler. Firmware und knxprod können erzeugt werden.'))}</li>`;
  box.querySelectorAll('li[data-i]').forEach(li => {
    const m = items[+li.dataset.i];
    /* Meldungen gelten dem Gerät: aus einem Makro erst zurück */
    if (m.node) li.addEventListener('click', () => {
      if (editing) { show(null); update(); editor.fit(); }
      editor.select({ kind: 'node', id: m.node }); renderInspector();
    });
  });
  document.querySelectorAll('[data-export]').forEach(b => { b.disabled = pres.errors.length > 0; });
}

function outputs() {
  const fw = S.firmware.files(pres);
  const prod = S.knxprod.files(pres, null);
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
  return S.zip.write(S.knxprod.files(pres, master && master.xml));
}

function exportFirmware(withProd) {
  if (pres.errors.length) return toast(t('Erst die Fehler beheben (siehe Prüfung).'), 'error');
  const name = base();
  const files = {};
  Object.entries(S.firmware.files(pres)).forEach(([k, v]) => { files[`${name}/${k}`] = v; });
  files[`${name}/${name}.sbs.json`] = M.serialize(project);
  // nur ein Ordner auf oberster Ebene, sonst legen Entpacker einen weiteren
  // darum und der relative sblib-Pfad stimmt nicht mehr
  if (withProd) files[`${name}/${name}.knxprod`] = knxprodBytes();
  download(`${name}${withProd ? '' : '_firmware'}.zip`, S.zip.write(files), 'application/zip');
}

function exportProd() {
  if (pres.errors.length) return toast(t('Erst die Fehler beheben (siehe Prüfung).'), 'error');
  download(`${base()}.knxprod`, knxprodBytes(), 'application/zip');
}

const save = () => download(`${base()}.sbs.json`, M.serialize(project), 'application/json');

/* Eigene Plattformen und Makros bleiben, wie beim neuen Gerät */
function loadExample(i) {
  const own = { platforms: project.platforms };
  const p = M.parse(JSON.stringify(S.examples[i].model));
  p.platforms = own.platforms;
  show(null); setProject(p);
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
  sub: (cat === 'Makro' ? macroChoices().map(m => ({ label: m.name, action: () => place('macro:' + m.id) }))
    .concat(libraryChoices().map(e => ({ label: `${e.name} · ${t('Bibliothek')}`, action: () => place('lib:' + e.lib) }))) : [])
    .concat(B.DEFS.filter(d => d.cat === cat && listed(d)).map(d => ({ label: t(d.name), disabled: !!lackOf(d), action: () => place(d.type) })))
})).filter(c => c.sub.length);

const nodeName = n => n.label || t(B.get(n.type).name);

function canvasMenu(h) {
  const items = [];
  const many = chosen();
  if ((h.kind === 'node' || h.kind === 'port') && many.length > 1 && many.includes(h.id)) {
    items.push({ title: t('{0} Blöcke gewählt', many.length) },
      { label: t('Als Makro übernehmen'), action: () => collapseSelection(many) },
      { label: t('Aus der Auswahl nehmen'), action: () => { pick(many.filter(x => x !== h.id)); renderInspector(); } },
      { label: t('Alle Verbindungen lösen'), action: () => { model.links = model.links.filter(l => !many.includes(l.from[0]) && !many.includes(l.to[0])); update(); } },
      '-',
      { label: t('{0} Blöcke löschen', many.length), key: t('Entf'), danger: true, action: () => removeNode(many) });
    return openMenu(items, h.clientX, h.clientY);
  }
  if (h.kind === 'node' || h.kind === 'port') {
    const n = model.nodes.find(x => x.id === h.id);
    const r = res.view.byId.get(h.id);
    items.push({ title: nodeName(n) });
    if (h.kind === 'port') {
      const port = (h.dir === 'in' ? r.inputs : r.outputs).find(p => p.id === h.port);
      const linked = model.links.filter(l => h.dir === 'in' ? l.to[0] === h.id && l.to[1] === h.port : l.from[0] === h.id && l.from[1] === h.port);
      /* Verbinden ohne Ziehen – vor allem für Finger */
      const others = res.view.nodes.filter(o => o.node.id !== h.id);
      const targets = h.dir === 'out'
        ? others.flatMap(o => o.inputs.map(p => ({ label: `${nodeName(o.node)} · ${t(p.label)}`, action: () => connect([h.id, h.port], [o.node.id, p.id]) })))
        : others.flatMap(o => o.outputs.map(p => ({ label: `${nodeName(o.node)} · ${t(p.label)}`, action: () => connect([o.node.id, p.id], [h.id, h.port]) })));
      items.push({ title: `${h.dir === 'in' ? t('Eingang') : t('Ausgang')}: ${t(port.label)} · ${t(B.portType(port))}` });
      items.push({ label: h.dir === 'out' ? t('Verbinden mit') : t('Verbinden von'), sub: targets, disabled: !targets.length });
      items.push({ label: linked.length > 1 ? t('{0} Verbindungen lösen', linked.length) : t('Verbindung lösen'), disabled: !linked.length,
                   action: () => unlink(h.id, h.port, h.dir) });
      items.push('-');
    }
    if (n.type === 'macro' && n._m) items.push({ label: t('Makro bearbeiten'), action: () => enterMacro(n._m.id) },
      { label: t('Makro auflösen'), action: () => explodeInstance(n.id) }, '-');
    /* Vor allem für Finger: lang antippen, dann hinzufügen */
    const before = (h.before || []).filter(x => x !== h.id && model.nodes.some(o => o.id === x));
    if (before.length && h.kind === 'node') items.push({ label: t('Zur Auswahl hinzufügen'), action: () => { pick(before.concat(h.id)); renderInspector(); } }, '-');
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
    if (editing) items.push({ label: t('Makro verlassen'), action: leaveMacro }, '-');
    items.push(
      { label: t('Block hier einfügen'), sub: blockMenu(type => add(type, h.x - 92, h.y - 13)) },
      { label: t('Neues Makro'), action: newMacro },
      { label: t('Makro importieren…'), action: () => $('#file-macro').click() },
      '-',
      { label: t('Rückgängig'), key: t('Strg+Z'), disabled: !undoStack.length, action: undo },
      { label: t('Wiederholen'), key: t('Strg+Y'), disabled: !redoStack.length, action: redo },
      '-',
      { label: t('Alle auswählen'), key: t('Strg+A'), disabled: !model.nodes.length, action: selectAll },
      { label: t('Alles einpassen'), action: () => editor.fit() },
      { label: t('Vergrößern'), key: '+', action: () => editor.zoom(1.25) },
      { label: t('Verkleinern'), key: '−', action: () => editor.zoom(0.8) },
      '-',
      { label: editing ? t('Makro-Einstellungen') : t('Geräteeinstellungen'), action: showDevice }
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
  const exp = pres.errors.length > 0;
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
  if ((project.nodes.length || project.macros.length) && Date.now() - newArmed > 3000) {
    newArmed = Date.now();
    toast(t('Noch einmal „Neues Gerät“ wählen, um Graph und Makros des Projekts zu leeren. Makros aus der Bibliothek bleiben dort zur Wahl.'), 'warn');
    return;
  }
  newArmed = 0;
  /* Eigene Plattformen und die gewählte bleiben; Makros nicht – für andere
     Projekte sind sie in der Bibliothek */
  const keep = { platforms: project.platforms, platform: project.device.platform };
  const p = M.create();
  p.platforms = keep.platforms;
  p.device.platform = keep.platform;
  show(null); setProject(p);
  editor.select(null); update();
  toast(t('Neues Gerät – Rückgängig holt das alte zurück.'));
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
    try {
      const text = await f.text();
      if (JSON.parse(text).format === M.MACRO_FORMAT) return importMacro(text, f.name);
      const p = M.parse(text); show(null); setProject(p); editor.select(null); update(); editor.fit(); toast(t('{0} geladen', f.name));
    }
    catch (err) { toast(t('Öffnen fehlgeschlagen: {0}', err.message), 'error'); }
  });
  $('#btn-save').addEventListener('click', save);
  $('#file-macro').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { importMacro(await f.text(), f.name); }
    catch (err) { toast(t('Öffnen fehlgeschlagen: {0}', err.message), 'error'); }
  });
  $('#platform-dlg').addEventListener('close', () => renderInspector());
  $('#file-platform').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await importPlatform(f); toast(t('{0} geladen', f.name)); }
    catch (err) { toast(t('Öffnen fehlgeschlagen: {0}', err.message), 'error'); }
  });
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
    if (e.target.closest('input, select, textarea, #ctx, dialog')) return;
    const sel = editor.selection;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    if (e.key === 'Escape') { if (!sel && editing) leaveMacro(); else { editor.select(null); renderInspector(); } }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const c = $('#canvas').getBoundingClientRect();
      canvasMenu({ kind: sel && (sel.kind === 'node' || sel.kind === 'nodes') ? 'node' : sel && sel.kind === 'link' ? 'link' : 'canvas',
                   id: sel && (sel.kind === 'nodes' ? sel.ids[0] : sel.id), clientX: c.left + c.width / 2, clientY: c.top + c.height / 2,
                   x: editor.center().x, y: editor.center().y });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    /* In Eingabefeldern bleibt Strg+Z dem Feld (siehe oben) */
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && sel && sel.kind === 'node') { e.preventDefault(); duplicate(sel.id); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
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
  get project() { return project; },
  get resolved() { return res; },
  get editing() { return editing; },
  enterMacro, leaveMacro, newMacro, add, duplicate, collapseSelection, selectAll, explodeInstance,
  library, saveToLibrary, loadFromLibrary, dropFromLibrary, importMacro,
  select(sel) { editor.select(sel); renderInspector(); },
  menu: canvasMenu, moreMenu, undo, redo,
  platform: openPlatform, copyPlatform,
  get history() { return { undo: undoStack.length, redo: redoStack.length }; },
  update
};

setup();
})();
