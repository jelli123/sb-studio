/* Verhaltenstest: erzeugt kleine Geräte, übersetzt app_main.cpp mit dem
   Host-g++ gegen nachgebildete sblib-Teile (millis, Timeout, KOs, User-EEPROM)
   und spielt Telegramme im Millisekundentakt ab. Verglichen werden die
   gesendeten KO-Werte mit Zeitpunkt.

     node test/simulate.js            (braucht g++, ruft compile.sh mit auf)
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
['i18n', 'blocks', 'model', 'runtime-lpc11xx', 'gen-firmware', 'gen-knxprod'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }));
const S = globalThis.SBS;

const STUB = `#pragma once
#include <cstdint>
#include <cstdio>
#include <vector>
extern uint32_t g_ms;
inline uint32_t millis() { return g_ms; }
class Timeout
{
public:
    static const uint32_t STOPPED = 0;
    Timeout() { stop(); }
    void start(unsigned int ms) { if (!ms) stop(); else { timeout = millis() + ms; if (timeout == STOPPED) timeout++; } }
    bool expired() { if (timeout != STOPPED && (int) (millis() - timeout) >= 0) { stop(); return true; } return false; }
    bool started() const { return timeout != STOPPED; }
    bool stopped() const { return timeout == STOPPED; }
    void stop() { timeout = STOPPED; }
private:
    uint32_t timeout;
};
unsigned short floatToDpt9(int value);
int dpt9ToFloat(unsigned short dptValue);
extern const int koBytes[];
struct ComObjects
{
    unsigned value[256] = {};
    std::vector<int> updated;
    static unsigned mask(int ko, unsigned v) { return koBytes[ko] >= 4 ? v : v & ((1u << (8 * koBytes[ko])) - 1); }
    void objectWrite(int ko, unsigned v) { value[ko] = mask(ko, v); std::printf("%u %d %u\\n", (unsigned) g_ms, ko, value[ko]); }
    void objectWriteFloat(int ko, int v) { objectWrite(ko, floatToDpt9(v)); }
    unsigned objectRead(int ko) { return mask(ko, value[ko]); }
    int nextUpdatedObject() { if (updated.empty()) return -1; int k = updated.front(); updated.erase(updated.begin()); return k; }
};
struct UserEeprom
{
    uint8_t mem[0x10000] = {};
    uint8_t getUInt8(unsigned a) { return mem[a]; }
    uint16_t getUInt16(unsigned a) { return (uint16_t) (mem[a] << 8 | mem[a + 1]); }
};
struct BcuBase
{
    ComObjects* comObjects = new ComObjects();
    UserEeprom* userEeprom = new UserEeprom();
    void begin(int, int, int) {}
    void setHardwareType(const uint8_t*, int) {}
};
typedef BcuBase MASK0701;
#define APP_VERSION(a, b, c) static const char* appVersion __attribute__((unused)) = a
inline void waitForInterrupt() {}
`;

const HARNESS = `
uint32_t g_ms;
struct Event { uint32_t t; int ko; unsigned v; };
static const Event events[] = { EVENTS };
const int koBytes[] = { KOBYTES };
int main()
{
    const uint8_t image[] = { IMAGE };
    for (unsigned i = 0; i < sizeof(image); i++) bcu.userEeprom->mem[PARAM_BASE + i] = image[i];
    setup();
    unsigned next = 0;
    for (g_ms = 1; g_ms <= END; g_ms++)
    {
        while (next < sizeof(events) / sizeof(events[0]) && events[next].t == g_ms)
        {
            bcu.comObjects->value[events[next].ko] = events[next].v;
            bcu.comObjects->updated.push_back(events[next].ko);
            next++;
        }
        loop();
    }
}
`;

const range = n => Array.from({ length: n }, (_, i) => i);
const sblib = process.env.SB_PATH_TO_SBLIB_REPO || path.join(root, '..', 'software-arm-incubation', 'software-arm-lib');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sbs-sim-'));
['eibMASK0701.h', 'eib/datapoint_types.h', 'debounce.h', 'digital_pin.h', 'io_pin_names.h', 'timeout.h', 'timer.h', 'version.h']
  .forEach(h => {
    const f = path.join(out, 'inc', 'sblib', h);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '#include "stub.h"\n');
  });
fs.writeFileSync(path.join(out, 'inc', 'stub.h'), STUB);
/* DPT 9 wie in der sblib: echter Header und datapoint_types.cpp */
fs.writeFileSync(path.join(out, 'inc', 'sblib', 'eib', 'datapoint_types.h'),
  `#include "stub.h"\n#include "${path.join(sblib, 'sblib', 'inc', 'sblib', 'eib', 'datapoint_types.h')}"\n`);

let failed = 0;

/* build(m) liefert Knoten; events: [ms, KO-Knoten, Wert]; expect: [ms, KO-Knoten, Wert] */
function scenario(name, build, events, expect, end) {
  const m = S.model.create();
  const add = (type, props, params) => {
    const n = S.model.addNode(m, type, 0, 0);
    Object.assign(n.props, props || {});
    S.model.normalize(m);
    Object.assign(n.params, params || {});
    return n;
  };
  const link = (a, ap, b, bp) => m.links.push({ from: [a.id, ap], to: [b.id, bp] });
  const nodes = build(add, link);
  const res = S.model.resolve(m);
  if (res.errors.length) { failed++; console.error(`  FEHLER ${name}:`, res.errors.map(e => e.msg).join('; ')); return; }
  const koOf = n => res.kos.find(k => k.r.node === n).number;
  const files = S.firmware.files(res);
  const dir = path.join(out, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app_config.h'), files['src/app_config.h']);
  const image = S.knxprod.paramImage(res);
  fs.writeFileSync(path.join(dir, 'main.cpp'), files['src/app_main.cpp'] + HARNESS
    .replace('EVENTS', events.map(([t, n, v]) => `{ ${t}, ${koOf(nodes[n])}, ${v} }`).join(', ') || '{ 0, 0, 0 }')
    .replace('KOBYTES', range(Math.max(0, ...res.kos.map(k => k.number)) + 1).map(i => { const k = res.kos.find(x => x.number === i); return k ? S.blocks.OBJ_SIZE[k.dpt.size].bytes : 1; }).join(', '))
    .replace('IMAGE', image.join(', ') || '0')
    .replace('END', end || 3000));
  const exe = path.join(dir, 'sim');
  try {
    execFileSync('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', '-I', path.join(out, 'inc'),
      '-o', exe, path.join(dir, 'main.cpp'), path.join(sblib, 'sblib', 'src', 'eib', 'datapoint_types.cpp')], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { failed++; console.error(`  FEHLER ${name}: g++\n${e.stderr}`); return; }
  const got = execFileSync(exe).toString().trim().split('\n').filter(Boolean);
  const want = expect.map(([t, n, v]) => `${t} ${koOf(nodes[n])} ${v}`);
  const ok = got.length === want.length && got.every((l, i) => l === want[i]);
  if (!ok) { failed++; console.error(`  FEHLER ${name}:\n    erwartet ${want.join(' | ')}\n    erhalten ${got.join(' | ')}`); }
  else console.log(`${name}: ${got.length} Telegramme wie erwartet`);
}

/* Taste über ein KO (1 = gedrückt); Ausgänge auf KOs „bei jedem Ereignis“ */
const KEY = { dpt: '1.001' };
const EVERY = { mode: 1 };

scenario('Tastenauswertung', (add, link) => {
  const k = add('ko_in', KEY), p = add('press', {}, { long: 500, dbl: 300 });
  const o = ['short', 'long', 'end', 'dbl'].map(port => { const x = add('ko_out', {}, EVERY); link(p, port, x, 'in'); return x; });
  link(k, 'out', p, 'in');
  return { k, short: o[0], long: o[1], end: o[2], dbl: o[3] };
}, [
  [100, 'k', 1], [200, 'k', 0],                 // kurz → nach 300 ms Wartezeit
  [1000, 'k', 1], [1100, 'k', 0], [1200, 'k', 1], [1250, 'k', 0],   // doppelt
  [2000, 'k', 1], [2700, 'k', 0]                // lang, dann losgelassen
], [
  [500, 'short', 1], [1250, 'dbl', 1], [2500, 'long', 1], [2700, 'end', 1]
]);

scenario('Dimmtaste zweiflächig', (add, link) => {
  const up = add('ko_in', KEY), dn = add('ko_in', KEY), d = add('dimkey', { keys: 'two' }, { long: 400 });
  const sw = add('ko_out', {}, EVERY), dim = add('ko_out', { dpt: '3.007' }, EVERY);
  link(up, 'out', d, 'k'); link(dn, 'out', d, 'k2'); link(d, 'sw', sw, 'in'); link(d, 'dim', dim, 'in');
  return { up, dn, sw, dim };
}, [
  [100, 'up', 1], [150, 'up', 0],               // kurz: ein
  [500, 'up', 1], [1500, 'up', 0],              // lang: heller, Stopp
  [2000, 'dn', 1], [2050, 'dn', 0],             // kurz: aus
  [2200, 'dn', 1], [2700, 'dn', 0]              // lang: dunkler, Stopp
], [
  [150, 'sw', 1], [900, 'dim', 9], [1500, 'dim', 8], [2050, 'sw', 0], [2600, 'dim', 1], [2700, 'dim', 0]
]);

scenario('Dimmtaste einflächig', (add, link) => {
  const k = add('ko_in', KEY), d = add('dimkey', { keys: 'one' }, { long: 400 });
  const sw = add('ko_out', {}, EVERY), dim = add('ko_out', { dpt: '3.007' }, EVERY);
  link(k, 'out', d, 'k'); link(d, 'sw', sw, 'in'); link(d, 'dim', dim, 'in');
  return { k, sw, dim };
}, [
  [100, 'k', 1], [600, 'k', 0],                 // aus → lang: heller
  [1000, 'k', 1], [1500, 'k', 0],               // an → lang: dunkler
  [2000, 'k', 1], [2050, 'k', 0]                // kurz: umschalten → aus
], [
  [500, 'dim', 9], [600, 'dim', 8], [1400, 'dim', 1], [1500, 'dim', 0], [2050, 'sw', 0]
]);

scenario('Jalousietaste', (add, link) => {
  const up = add('ko_in', KEY), dn = add('ko_in', KEY), j = add('blindkey', { keys: 'two' }, { long: 400, hold: 1 });
  const mv = add('ko_out', { dpt: '1.008' }, EVERY), st = add('ko_out', { dpt: '1.007' }, EVERY);
  link(up, 'out', j, 'k'); link(dn, 'out', j, 'k2'); link(j, 'move', mv, 'in'); link(j, 'step', st, 'in');
  return { up, dn, mv, st };
}, [
  [100, 'dn', 1], [800, 'dn', 0],               // lang ab, Totmann: Stopp beim Loslassen
  [1000, 'up', 1], [1100, 'up', 0]              // kurz: Lamelle auf
], [
  [500, 'mv', 1], [800, 'st', 1], [1100, 'st', 0]
]);

scenario('Dimmer linear', (add, link) => {
  const v = add('ko_in', { dpt: '5.001' }), sw = add('ko_in', KEY), dim = add('ko_in', { dpt: '3.007' });
  const r = add('ramp', { curve: 'lin' }, { time: 2550, onVal: 0, soft: 1, every: 1 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY), on = add('ko_out', {}, EVERY);
  link(v, 'out', r, 'val'); link(sw, 'out', r, 'sw'); link(dim, 'out', r, 'dim'); link(r, 'out', o, 'in'); link(r, 'on', on, 'in');
  return { v, sw, dim, o, on };
}, [
  [10, 'v', 100],                               // 100 Schritte à 11 ms
  [2000, 'sw', 0],                              // aus mit Rampe
  [4000, 'sw', 1],                              // ein: letzter Wert 100
  [6000, 'dim', 9], [6110, 'dim', 0]            // heller, nach 10 Schritten Stopp
], [
  [11, 'on', 1], [1100, 'o', 100], [3090, 'o', 0], [3090, 'on', 0], [4001, 'on', 1], [5090, 'o', 100], [6110, 'o', 110]
], 7000);

/* Logarithmisch: Zielwert → erste Stufe, deren Tabellenwert reicht (26 liegt genau auf Stufe 129) */
scenario('Dimmer logarithmisch', (add, link) => {
  const v = add('ko_in', { dpt: '5.001' });
  const r = add('ramp', { curve: 'log' }, { time: 0, every: 1 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY);
  link(v, 'out', r, 'val'); link(r, 'out', o, 'in');
  return { v, o };
}, [[10, 'v', 255], [20, 'v', 26], [30, 'v', 0]], [[10, 'o', 255], [20, 'o', 26], [30, 'o', 0]], 100);

scenario('Speicher', (add, link) => {
  const v = add('ko_in', { dpt: '5.001' }), t = add('ko_in', KEY), l = add('latch', { vtype: 'num' }, { change: 1 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY);
  link(v, 'out', l, 'in'); link(t, 'out', l, 'trig'); link(l, 'out', o, 'in');
  return { v, t, o };
}, [[100, 'v', 10], [200, 't', 1], [300, 'v', 20], [400, 'v', 30], [500, 't', 1], [600, 't', 1], [700, 't', 0]],
   [[200, 'o', 10], [500, 'o', 30]], 1000);

scenario('Impulsteiler', (add, link) => {
  const p = add('ko_in', KEY), r = add('ko_in', KEY), d = add('divider', {}, { n: 3, mode: 1 });
  const o = add('ko_out', {}, EVERY);
  link(p, 'out', d, 'in'); link(r, 'out', d, 'reset'); link(d, 'out', o, 'in');
  return { p, r, o };
}, [100, 200, 300, 400, 500, 600, 700, 800].map(t => [t, 'p', 1]).concat([[850, 'r', 1]], [900, 1000, 1100].map(t => [t, 'p', 1])),
   [[300, 'o', 1], [600, 'o', 0], [1100, 'o', 1]], 1200);

/* DPT-Umrechnung: Vorzeichen, DPT 9 ↔ DPT 14 (21,5 °C = 0x0C33 bzw. 0x41AC0000), RGB zerlegen */
scenario('DPT-Umrechnung', (add, link) => {
  const pair = (from, to) => { const i = add('ko_in', { dpt: from }), o = add('ko_out', { dpt: to }, EVERY); link(i, 'out', o, 'in'); return [i, o]; };
  const [s8, s16] = pair('6.010', '8.001'), [s16b, s32] = pair('8.001', '13.001');
  const [f9, f14] = pair('9.001', '14.056'), [f14b, f9b] = pair('14.056', '9.001');
  const c = add('ko_in', { dpt: '232.600' }), rgb = add('rgb'), r = add('ko_out', { dpt: '5.001' }, EVERY), b = add('ko_out', { dpt: '5.001' }, EVERY);
  link(c, 'out', rgb, 'in'); link(rgb, 'r', r, 'in'); link(rgb, 'b', b, 'in');
  return { s8, s16, s16b, s32, f9, f14, f14b, f9b, c, r, b };
}, [[10, 's8', 255], [20, 's16b', 0x8000], [30, 'f9', 0x0C33], [40, 'f14b', 0x41AC0000], [50, 'c', 0x123456]],
   [[10, 's16', 65535], [20, 's32', 4294934528], [30, 'f14', 0x41AC0000], [40, 'f9b', 0x0C33], [50, 'r', 0x12], [50, 'b', 0x56]], 100);

scenario('Gleitender Mittelwert', (add, link) => {
  const i = add('ko_in', { dpt: '7.001' }), a = add('avg', { n: 4 }), o = add('ko_out', { dpt: '7.001' }, EVERY);
  link(i, 'out', a, 'in'); link(a, 'out', o, 'in');
  return { i, o };
}, [10, 20, 30, 40, 50].map((v, k) => [100 * (k + 1), 'i', v]),
   [[100, 'o', 10], [200, 'o', 15], [300, 'o', 20], [400, 'o', 25], [500, 'o', 35]], 600);

/* 100 je Sekunde: nach 1 s 100; Rücksetzen mitten im Takt zählt ab dort; Halten friert ein */
scenario('Integrator', (add, link) => {
  const i = add('ko_in', { dpt: '7.001' }), h = add('ko_in', KEY), r = add('ko_in', KEY);
  const g = add('integ', {}, { sample: 1000, base: 0, delta: 0 }), o = add('ko_out', { dpt: '13.001' }, EVERY);
  link(i, 'out', g, 'in'); link(h, 'out', g, 'hold'); link(r, 'out', g, 'reset'); link(g, 'out', o, 'in');
  return { i, h, r, o };
}, [[1, 'i', 100], [2500, 'r', 1], [3200, 'h', 1]],
   [[1001, 'o', 100], [2001, 'o', 200], [2500, 'o', 0], [3001, 'o', 50]], 4500);

/* +10 in einer Sekunde = 600 je Minute */
scenario('Differentiator', (add, link) => {
  const i = add('ko_in', { dpt: '7.001' }), d = add('diff', {}, { sample: 1000, base: 1, delta: 0 });
  const o = add('ko_out', { dpt: '8.001' }, EVERY);
  link(i, 'out', d, 'in'); link(d, 'out', o, 'in');
  return { i, o };
}, [[10, 'i', 2000], [1500, 'i', 2010]], [[1001, 'o', 0], [2001, 'o', 600], [3001, 'o', 0]], 3500);

/* P: Kp 1 (100 je 100 Fehler), Begrenzung auf 0 */
scenario('PID-Regler P', (add, link) => {
  const x = add('ko_in', { dpt: '7.001' }), p = add('pid', {}, { kp: 100, ti: 0, td: 0, w0: 2100, delta: 1, sample: 1000 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY);
  link(x, 'out', p, 'x'); link(p, 'out', o, 'in');
  return { x, o };
}, [[10, 'x', 2000], [1500, 'x', 2050], [2500, 'x', 2200]], [[1001, 'o', 100], [2001, 'o', 50], [3001, 'o', 0]], 3500);

/* PI: je Schritt +10, Anti-Windup hält genau am Maximum 255 */
scenario('PID-Regler PI', (add, link) => {
  const x = add('ko_in', { dpt: '7.001' }), p = add('pid', {}, { kp: 100, ti: 10, td: 0, w0: 2100, delta: 1, sample: 1000 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY);
  link(x, 'out', p, 'x'); link(p, 'out', o, 'in');
  return { x, o };
}, [[10, 'x', 2000]], Array.from({ length: 16 }, (_, k) => [1001 + 1000 * k, 'o', k < 15 ? 110 + 10 * k : 255]), 18500);

/* PDT1: Td 10 s, T1 1 s – Istwertsprung +10 bremst um 50, klingt je Schritt auf die Hälfte ab */
scenario('PID-Regler PDT1', (add, link) => {
  const x = add('ko_in', { dpt: '7.001' }), p = add('pid', {}, { kp: 100, ti: 0, td: 10, t1: 10, w0: 2100, delta: 1, sample: 1000 });
  const o = add('ko_out', { dpt: '5.001' }, EVERY);
  link(x, 'out', p, 'x'); link(p, 'out', o, 'in');
  return { x, o };
}, [[10, 'x', 2000], [1500, 'x', 2010]],
   [[1001, 100], [2001, 40], [3001, 65], [4001, 78], [5001, 84], [6001, 87], [7001, 88], [8001, 89], [9001, 90]].map(([t, v]) => [t, 'o', v]), 10500);

/* Zeitschaltuhr: täglich 7:00 = 1, 22:00 = 0. Gestellt Montag 6:59:58 – nachgeholt
   wird 22:00 vom Vortag (0), zwei Sekunden später schaltet 7:00 (1). */
const dpt10 = (wd, h, m, s) => wd << 21 | h << 16 | m << 8 | s;
scenario('Zeitschaltuhr', (add, link) => {
  const c = add('ko_in', { dpt: '10.001' }), z = add('timeswitch'), o = add('ko_out', {}, EVERY);
  link(c, 'out', z, 'time'); link(z, 'out', o, 'in');
  return { c, o };
}, [[10, 'c', dpt10(1, 6, 59, 58)]], [[10, 'o', 0], [2010, 'o', 1]], 3000);

/* Ohne Wochentag zählen nur tägliche Zeiten: Mo–Fr 7:00 schaltet nicht */
scenario('Zeitschaltuhr ohne Wochentag', (add, link) => {
  const c = add('ko_in', { dpt: '10.001' }), z = add('timeswitch', {}, { days0: 31 }), o = add('ko_out', {}, EVERY);
  link(c, 'out', z, 'time'); link(z, 'out', o, 'in');
  return { c, o };
}, [[10, 'c', dpt10(0, 6, 59, 58)]], [[10, 'o', 0]], 3000);

/* Werktags: Samstag 6:59:58 – Mo–Fr 7:00 schaltet nicht, Sonntag 7:00 (täglich, Wert 5) über einen Tag später */
scenario('Zeitschaltuhr Wochentage', (add, link) => {
  const c = add('ko_in', { dpt: '10.001' }), z = add('timeswitch', { slots: 3, vtype: 'num' }, { days0: 31, catchup: 0, days2: 64, h2: 7, v2: 5 });
  const o = add('ko_out', { dpt: '5.010' }, EVERY);
  link(c, 'out', z, 'time'); link(z, 'out', o, 'in');
  return { c, o };
}, [[10, 'c', dpt10(6, 6, 59, 58)]], [[10 + 54002 * 1000, 'o', 0], [10 + 86402 * 1000, 'o', 5]], 86410 * 1000);

/* Uhr mit Datum: DPT 11.001 = Tag, Monat, Jahr (2-stellig) */
const dpt11 = (y, m, d) => d << 16 | m << 8 | (y % 100);
const clock = (props, params, date, time, expect, end) => (name) => scenario(name, (add, link) => {
  const c = add('ko_in', { dpt: '10.001' }), dt = add('ko_in', { dpt: '11.001' });
  const z = add('timeswitch', Object.assign({ vtype: 'num' }, props), params);
  const o = add('ko_out', { dpt: '5.010' }, EVERY), hol = props.holidays ? add('ko_out', {}, EVERY) : null;
  link(c, 'out', z, 'time'); link(dt, 'out', z, 'date'); link(z, 'out', o, 'in');
  if (hol) link(z, 'hol', hol, 'in');
  return { c, dt, o, hol };
}, [[10, 'dt', date], [20, 'c', time]], expect, end || 3000);

/* UTC-Zeitgeber, Zeitzone +60 min: im Juli 4:59:58 UTC = 6:59:58 Sommerzeit, im Januar 5:59:58 UTC = 6:59:58 */
clock({}, { utc: 1 }, dpt11(2026, 7, 1), dpt10(3, 4, 59, 58), [[20, 'o', 0], [2020, 'o', 1]])('Uhr UTC Sommerzeit');
clock({}, { utc: 1 }, dpt11(2026, 1, 15), dpt10(4, 5, 59, 58), [[20, 'o', 0], [2020, 'o', 1]])('Uhr UTC Winterzeit');
/* Umstellung am 29.3.2026: 0:59:59 UTC = 1:59:59 MEZ, eine Sekunde später 3:00:00 MESZ */
clock({}, { utc: 1, h0: 3 }, dpt11(2026, 3, 29), dpt10(7, 0, 59, 58), [[20, 'o', 0], [2020, 'o', 1]])('Uhr Umstellung Sommerzeit');
/* Astro Berlin, 21.6.2026: Sonnenaufgang 4:43 MESZ */
clock({ astro: true }, { lat: 5252, lng: 1340, ref0: 1, catchup: 0 }, dpt11(2026, 6, 21), dpt10(7, 4, 42, 58), [[2020, 'o', 1]])('Uhr Sonnenaufgang');
/* Ostermontag 6.4.2026 wie Sonntag: Mo–Fr 7:00 (1) schweigt, So 7:00 (5) schaltet */
clock({ holidays: true }, { days0: 31, days1: 64, h1: 7, v1: 5, catchup: 0 }, dpt11(2026, 4, 6), dpt10(1, 6, 59, 58),
  [[20, 'hol', 1], [2020, 'o', 5]])('Uhr Ostermontag');
/* Buß- und Bettag 18.11.2026 (regional), um Mitternacht vorbei */
clock({ holidays: true }, { hRepent: 1, catchup: 0 }, dpt11(2026, 11, 18), dpt10(3, 23, 59, 58),
  [[20, 'hol', 1], [2020, 'hol', 0]])('Uhr Buß- und Bettag');

fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} Fehler` : '\nVerhalten wie erwartet');
process.exit(failed ? 1 : 0);
