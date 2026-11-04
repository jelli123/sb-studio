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
#include <cstring>
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
    /* Text: gespiegelt wie in der sblib, ausgegeben in Telegrammreihenfolge */
    uint8_t bytes[256][14] = {};
    uint8_t* objectValuePtr(int ko) { return bytes[ko]; }
    void objectWrite(int ko, const uint8_t* b)
    {
        std::printf("%u %d \\"", (unsigned) g_ms, ko);
        for (int i = 0; i < 14; i++) bytes[ko][i] = b[i];
        for (int i = 13; i >= 0 && bytes[ko][i]; i--)
            std::printf(bytes[ko][i] >= 0x20 && bytes[ko][i] < 0x7F ? "%c" : "\\\\x%02X", bytes[ko][i]);
        std::printf("\\"\\n");
    }
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
    void enableGroupTelSend(bool e) { std::printf("%u send %d\\n", (unsigned) g_ms, (int) e); }
};
typedef BcuBase MASK0701;
#define APP_VERSION(a, b, c) static const char* appVersion __attribute__((unused)) = a
inline void waitForInterrupt() {}
/* Pins: Schreiben aus dem Programm wird bei Änderung ausgegeben („ms Pp_b Wert“),
   aus einem Timer-Interrupt nur als Anteil high je 100 ms („ms Pp_b ~Prozent“) */
${[0,1,2,3].map(p => [...Array(12).keys()].map(b => `#define PIO${p}_${b} ${p * 32 + b}`).join("\n")).join("\n")}
enum { INPUT = 0, OUTPUT = 1, PULL_UP = 2, OUTPUT_MATCH = 4, INPUT_ANALOG = 8 };
inline void pinMode(int, int) {}
inline int digitalPinToPort(uint32_t pin) { return (pin >> 5) & 3; }
inline uint32_t digitalPinToBitMask(uint32_t pin) { return 1u << (pin & 31); }
extern bool g_isr;
extern int g_level[4][32], g_high[4][32], g_isrWrites[4][32];
struct LPC_GPIO_TypeDef
{
    int n;
    struct Bits
    {
        LPC_GPIO_TypeDef* g;
        struct Ref
        {
            int n; uint32_t mask;
            void operator=(uint32_t v)
            {
                for (int b = 0; b < 32; b++) if (mask >> b & 1)
                {
                    int lv = (v >> b) & 1;
                    if (g_isr) g_isrWrites[n][b]++;
                    else if (lv != g_level[n][b]) std::printf("%u P%d_%d %d\\n", (unsigned) g_ms, n, b, lv);
                    g_level[n][b] = lv;
                }
            }
        };
        Ref operator[](uint32_t mask) { return Ref { g->n, mask }; }
    } MASKED_ACCESS { this };
};
extern LPC_GPIO_TypeDef* const gpioPorts[4];
inline void digitalWrite(uint32_t pin, bool v) { gpioPorts[digitalPinToPort(pin)]->MASKED_ACCESS[digitalPinToBitMask(pin)] = v ? digitalPinToBitMask(pin) : 0; }
inline bool digitalRead(uint32_t pin) { return g_level[digitalPinToPort(pin)][pin & 31]; }
/* Timer: nur so viel, dass der erzeugte Code übersetzt; den Interrupt ruft der Simulator */
enum class InterruptPriority : uint8_t { highest, high, medium, low };
enum { TIMER_MATCH_MAT0, TIMER_MATCH_MAT1, TIMER_MATCH_MAT2, TIMER_MATCH_MAT3 };
enum { INTERRUPT = 1, RESET = 2, STOP = 4, CLEAR = 8 };
struct Timer
{
    void begin() const {}
    void prescaler(unsigned) const {}
    void matchMode(int, int) const {}
    void match(int, unsigned) const {}
    void start() const {}
    void interrupts() const {}
    void setIRQPriority(InterruptPriority) const {}
};
inline const Timer timer16_0, timer32_0, timer32_1;
struct LPC_TMR_TypeDef { volatile uint32_t IR, TCR, EMR, MR0, MR1, MR2, MR3; };
inline LPC_TMR_TypeDef g_tmr[4];
#define LPC_TMR16B0 (&g_tmr[0])
#define LPC_TMR32B0 (&g_tmr[2])
#define LPC_TMR32B1 (&g_tmr[3])
inline uint32_t SystemCoreClock = 48000000;
/* A/D-Wandler: Werte setzt der Simulator (Ereignis „AD7“) */
enum { AD0, AD1, AD2, AD3, AD4, AD5, AD6, AD7 };
inline int g_adc[8];
inline void analogBegin() {}
inline int analogRead(int ch) { return g_adc[ch]; }
/* Flash mit Seitenlöschen wie IAP der sblib; der Simulator sichert ihn
   zwischen zwei Läufen (Neustart) */
inline uint8_t g_flash[0x10000];
#define FLASH_BASE_ADDRESS g_flash
constexpr uint16_t FLASH_SECTOR_SIZE = 0x1000;
constexpr uint16_t FLASH_PAGE_SIZE = 0x100;
enum IAP_Status { IAP_SUCCESS = 0 };
inline unsigned int iapFlashSize() { return sizeof(g_flash); }
inline unsigned int iapPageOfAddress(const uint8_t* a) { return (unsigned) (a - g_flash) / FLASH_PAGE_SIZE; }
inline IAP_Status iapErasePage(unsigned int page)
{
    std::printf("%u flash %u\\n", (unsigned) g_ms, page);
    memset(g_flash + page * FLASH_PAGE_SIZE, 0xFF, FLASH_PAGE_SIZE);
    return IAP_SUCCESS;
}
inline IAP_Status iapProgram(uint8_t* rom, const uint8_t* ram, unsigned int size)
{
    for (unsigned i = 0; i < size; i++) rom[i] &= ram[i];
    return IAP_SUCCESS;
}
`;

const HARNESS = `
uint32_t g_ms;
bool g_isr;
int g_level[4][32], g_high[4][32], g_isrWrites[4][32];
static LPC_GPIO_TypeDef g_gpio[4] = { { 0 }, { 1 }, { 2 }, { 3 } };
LPC_GPIO_TypeDef* const gpioPorts[4] = { &g_gpio[0], &g_gpio[1], &g_gpio[2], &g_gpio[3] };
extern "C" void TIMER16_0_IRQHandler() __attribute__((weak));
extern "C" void TIMER32_0_IRQHandler() __attribute__((weak));
extern "C" void TIMER32_1_IRQHandler() __attribute__((weak));
struct Event { uint32_t t; int ko; unsigned v; const char* txt; };
static const Event events[] = { EVENTS };
const int koBytes[] = { KOBYTES };
int main(int argc, char** argv)
{
    /* Flash: leer bzw. aus dem vorigen Lauf */
    memset(g_flash, 0xFF, sizeof(g_flash));
    FILE* ff = argc > 1 ? std::fopen(argv[1], "rb") : nullptr;
    if (ff) { if (std::fread(g_flash, 1, sizeof(g_flash), ff)) {} std::fclose(ff); }
    const uint8_t image[] = { IMAGE };
    for (unsigned i = 0; i < sizeof(image); i++) bcu.userEeprom->mem[PARAM_BASE + i] = image[i];
    /* über volatile Zeiger: schwache Symbole ohne Definition sind 0 */
    void (* volatile irqs[])() = { TIMER16_0_IRQHandler, TIMER32_0_IRQHandler, TIMER32_1_IRQHandler };
    bool anyIrq = false;
    for (auto f : irqs) anyIrq = anyIrq || f;
    setup();
    unsigned next = 0;
    for (g_ms = 1; g_ms <= END; g_ms++)
    {
        while (argc < 3 && next < sizeof(events) / sizeof(events[0]) && events[next].t == g_ms)
        {
            if (events[next].ko <= -100) { g_adc[-100 - events[next].ko] = (int) events[next].v; next++; continue; }
            bcu.comObjects->value[events[next].ko] = events[next].v;
            for (int i = 0; events[next].txt && i < 14; i++)   // Telegramm → gespiegelt
                bcu.comObjects->bytes[events[next].ko][13 - i] = (uint8_t) (i < (int) strlen(events[next].txt) ? events[next].txt[i] : 0);
            bcu.comObjects->updated.push_back(events[next].ko);
            next++;
        }
        loop();
        /* Timer-Interrupts: 20 je ms (20 kHz), Pegel nach jedem Aufruf zählen */
        if (anyIrq)
        for (int k = 0; k < 20; k++)
        {
            g_isr = true;
            for (auto f : irqs) if (f) f();
            g_isr = false;
            for (int p = 0; p < 4; p++) for (int b = 0; b < 32; b++) g_high[p][b] += g_level[p][b];
        }
        if (g_ms % 100 == 0 && anyIrq)
        {
            for (int p = 0; p < 4; p++) for (int b = 0; b < 32; b++)
            {
                if (g_isrWrites[p][b]) std::printf("%u P%d_%d ~%d\\n", (unsigned) g_ms, p, b, g_high[p][b] / 20);
                g_isrWrites[p][b] = g_high[p][b] = 0;
            }
        }
    }
    ff = argc > 1 ? std::fopen(argv[1], "wb") : nullptr;
    if (ff) { std::fwrite(g_flash, 1, sizeof(g_flash), ff); std::fclose(ff); }
}
`;

const range = n => Array.from({ length: n }, (_, i) => i);
const sblib = process.env.SB_PATH_TO_SBLIB_REPO || path.join(root, '..', 'software-arm-incubation', 'software-arm-lib');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sbs-sim-'));
['eibMASK0701.h', 'eib/datapoint_types.h', 'debounce.h', 'digital_pin.h', 'io_pin_names.h', 'timeout.h', 'timer.h', 'version.h',
 'analog_pin.h', 'internal/iap.h']
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

/* build(m) liefert Knoten; events: [ms, KO-Knoten, Wert]; expect: [ms, KO-Knoten oder Pin „P2_6“, Wert] */
/* restart: erwartete Telegramme eines zweiten Laufs ohne Ereignisse, mit dem
   Flash des ersten (Neustart nach Busspannungsausfall) */
function scenario(name, build, events, expect, end, restart) {
  const m = S.model.create();
  const add = (type, props, params) => {
    const n = S.model.addNode(m, type, 0, 0);
    Object.assign(n.props, props || {});
    S.model.normalize(m);
    Object.assign(n.params, params || {});
    return n;
  };
  const link = (a, ap, b, bp) => m.links.push({ from: [a.id, ap], to: [b.id, bp] });
  const nodes = build(add, link, m);
  const res = S.model.resolve(m);
  if (res.errors.length) { failed++; console.error(`  FEHLER ${name}:`, res.errors.map(e => e.msg).join('; ')); return; }
  /* auch KOs in Makro-Instanzen: { id: '<Instanz>_<Knoten>' } */
  const koOf = n => res.kos.find(k => k.r.node === n || k.r.node.id === n.id).number;
  /* Makros mit mehreren Instanzen teilen sich den Code; zum Vergleich auch flach */
  const run = flat => {
    res.shareCode = !flat;
    const files = S.firmware.files(res);
    const dir = path.join(out, name + (flat ? '-flach' : ''));
    if (!flat && /^struct S\d+_/m.test(files['src/app_main.cpp'])) shared = true;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app_config.h'), files['src/app_config.h']);
    const image = S.knxprod.paramImage(res);
    fs.writeFileSync(path.join(dir, 'main.cpp'), files['src/app_main.cpp'] + HARNESS
      .replace('EVENTS', events.map(([t, n, v]) => typeof v === 'string' ? `{ ${t}, ${koOf(nodes[n])}, 0, "${v}" }`
        : `{ ${t}, ${/^AD\d$/.test(n) ? -100 - Number(n[2]) : koOf(nodes[n])}, ${v}, nullptr }`).join(', ') || '{ 0, 0, 0, nullptr }')
      .replace('KOBYTES', range(Math.max(0, ...res.kos.map(k => k.number)) + 1).map(i => { const k = res.kos.find(x => x.number === i); return k ? S.blocks.OBJ_SIZE[k.dpt.size].bytes : 1; }).join(', '))
      .replace('IMAGE', image.join(', ') || '0')
      .replace('END', end || 3000));
    const exe = path.join(dir, 'sim');
    try {
      execFileSync('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', '-I', path.join(out, 'inc'),
        '-o', exe, path.join(dir, 'main.cpp'), path.join(sblib, 'sblib', 'src', 'eib', 'datapoint_types.cpp')], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) { failed++; console.error(`  FEHLER ${name}${flat ? ' (flach)' : ''}: g++\n${e.stderr}`); return null; }
    const flash = path.join(dir, 'flash.bin');
    fs.rmSync(flash, { force: true });
    const lines = args => execFileSync(exe, args).toString().trim().split('\n').filter(Boolean);
    return restart ? lines([flash]).concat('Neustart', lines([flash, 'restart'])) : lines([flash]);
  };
  let shared = false;
  const got = run(false);
  if (!got) return;
  const fmt = ([t, n, v]) => `${t} ${nodes[n] ? koOf(nodes[n]) : n} ${typeof v === 'string' && v[0] !== '~' ? `"${v}"` : v}`;
  const want = expect.map(fmt).concat(restart ? ['Neustart', ...restart.map(fmt)] : []);
  const ok = got.length === want.length && got.every((l, i) => l === want[i]);
  if (!ok) { failed++; console.error(`  FEHLER ${name}:\n    erwartet ${want.join(' | ')}\n    erhalten ${got.join(' | ')}`); }
  else console.log(`${name}: ${got.length} Telegramme wie erwartet${shared ? ' (Makro-Code gemeinsam)' : ''}`);
  if (shared && ok) {
    const flat = run(true);
    if (flat && flat.join('|') !== got.join('|')) { failed++; console.error(`  FEHLER ${name}: flach anders\n    ${flat.join(' | ')}`); }
  }
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

/* Text senden: Liste nach Nummer, 0 = leer; Zahl mit Vor-/Nachtext und Umlaut (ISO 8859-1),
   auf 14 Zeichen gekürzt; Bytes über 0x7E gibt der Simulator als \\xNN aus */
scenario('Text senden', (add, link) => {
  const i = add('ko_in', { dpt: '5.010' }), l = add('text_out', { count: 3, t2: 'Automatik' });
  const w = add('ko_in', { dpt: '9.001' }), f = add('text_out', { mode: 'value', dpt: '16.001', pre: 'Küche ', post: ' °C' });
  link(i, 'out', l, 'in'); link(w, 'out', f, 'in');
  return { i, l, w, f };
}, [[10, 'i', 2], [20, 'i', 3], [30, 'i', 0], [40, 'w', 0x0C33], [50, 'w', 0x860C]],
   [[10, 'l', 'Ein'], [20, 'l', 'Automatik'], [30, 'l', ''], [40, 'f', 'K\\xFCche 21,50 \\xB0C'], [50, 'f', 'K\\xFCche -5,00 \\xB0C']], 100);

/* Text empfangen: Nummer des passenden Texts, Groß/klein egal */
scenario('Text empfangen', (add, link) => {
  const r = add('text_in', { count: 3, t2: 'Party', icase: true }), o = add('ko_out', { dpt: '5.010' }, EVERY);
  link(r, 'out', o, 'in');
  return { r, o };
}, [[10, 'r', 'Ein'], [20, 'r', 'PARTY'], [30, 'r', 'Kino']], [[10, 'o', 2], [20, 'o', 3], [30, 'o', 0]], 100);

/* Skript: Mittelwert zweier Eingänge an A1, Zähler im Takt von Parameter 1 (ETS) an A2 */
scenario('Skript', (add, link) => {
  const a = add('ko_in', { dpt: '7.001' }), b = add('ko_in', { dpt: '7.001' });
  const s = add('script', { outs: 2, nparams: 1,
    state: 'static Timeout t;\nstatic int32_t n;',
    init: 't.start(param(1));',
    in: '// k = Eingang, v = Wert\nif (k == 2 && v == 0) return;\nemit(1, (input(1) + input(2)) / 2);',
    loop: 'if (t.expired())\n{\n    t.start(param(1));\n    emit(2, ++n);\n}' }, { p0: 1000 });
  const o1 = add('ko_out', { dpt: '7.001' }, EVERY), o2 = add('ko_out', { dpt: '5.010' }, EVERY);
  link(a, 'out', s, 'i0'); link(b, 'out', s, 'i1'); link(s, 'o0', o1, 'in'); link(s, 'o1', o2, 'in');
  return { a, b, o1, o2 };
}, [[100, 'a', 10], [200, 'b', 30], [300, 'b', 0]], [[100, 'o1', 5], [200, 'o1', 20], [1001, 'o2', 1], [2001, 'o2', 2]], 2500);

/* Relais: Anzug 200 ms voll, dann Software-PWM 40 % (Anteil high je 100 ms);
   kurzes Ein unter der Anzugszeit bleibt voll */
scenario("Relais Haltestrom", (add, link) => {
  const i = add("ko_in", KEY), r = add("relay", { hold: true }, { pull: 200, duty: 40 });
  link(i, "out", r, "in");
  return { i };
}, [[100, "i", 1], [1000, "i", 0], [1500, "i", 1], [1550, "i", 0]],
   [[100, "P0_7", 1], [300, "P0_7", "~99"], ...[400, 500, 600, 700, 800, 900].map(t => [t, "P0_7", "~40"]),
    [1000, "P0_7", 0], [1000, "P0_7", "~39"], [1500, "P0_7", 1], [1550, "P0_7", 0]], 1700);

/* Bistabil: Befehle während der Startverzögerung warten; zwei Relais pulsen nacheinander
   (b nach Pause von a); gleicher Befehl pulst nicht erneut; b ein/aus während a pulst: bleibt aus */
scenario("Relais bistabil", (add, link) => {
  const a = add("ko_in", KEY), ra = add("bistable", {}, {});
  const rb = add("bistable", { coils: "one", pinOn: "IO4", pinOff: "IO5" }, { init: 1 });
  link(a, "out", ra, "in");
  const b = add("ko_in", KEY); link(b, "out", rb, "in");
  return { a, b };
}, [[100, "a", 1], [1000, "a", 1], [1100, "a", 0], [1105, "b", 1], [1110, "b", 0]],
   [[502, "P0_7", 1], [552, "P0_7", 0], [653, "P0_2", 1], [703, "P0_2", 0], [1100, "P2_10", 1], [1150, "P2_10", 0]], 1600);

/* Kondensator in Reihe: Pegel = Zustand. „Aus“ nach dem Start bei leerem Kondensator
   geht nur über laden (kurz ein) und entladen; gleicher Befehl ändert nichts */
scenario("Relais bistabil Kondensator", (add, link) => {
  const i = add("ko_in", KEY), r = add("bistable", { coils: "cap" }, { init: 1, pulse: 100, pause: 100 });
  link(i, "out", r, "in");
  return { i };
}, [[1000, "i", 1], [1050, "i", 0], [1500, "i", 0]],
   [[502, "P0_7", 1], [703, "P0_7", 0], [1000, "P0_7", 1], [1201, "P0_7", 0]], 1600);

/* Spannungsausgleich aus Standardblöcken wie im Beispiel Out8 Energy Storage:
   Rohwert → U − 1 V in 0,1 V, 30600 ÷ U (A fest, 32-Bit-Parameter aus der ETS),
   höchstens 255; Freigabe ab 12,0 V, weg unter 11,0 V; Relais pulst erst dann */
scenario("Spannungsausgleich", (add, link) => {
  const u = add("ko_in", { dpt: "7.001" });
  const sc = add("scale", { clamp: false }, { inMin: 0, inMax: 1023, outMin: -10, outMax: 419 });
  const dv = add("math", { op: "div", fixed: "a" }, { k: 30600 }), mn = add("math", { op: "min", fixed: "b" }, { k: 255 });
  const th = add("threshold", {}, { thr: 120, hyst: 10 });
  const duty = add("ko_out", { dpt: "5.010" }, EVERY), ok = add("ko_out", {}, EVERY);
  const a = add("ko_in", KEY), r = add("bistable", { useEn: true });
  link(u, "out", sc, "in"); link(sc, "out", dv, "b"); link(dv, "out", mn, "a"); link(mn, "out", duty, "in");
  link(sc, "out", th, "in"); link(th, "out", ok, "in");
  link(a, "out", r, "in"); link(th, "out", r, "en");
  return { u, a, duty, ok };
}, [[100, "u", 200], [200, "a", 1], [800, "u", 600], [900, "u", 280], [1000, "a", 0], [1200, "u", 600]],
   [[100, "duty", 255], [100, "ok", 0],                    // 8,4 V: voll, keine Freigabe
    [800, "duty", 126], [800, "ok", 1], [800, "P0_7", 1],  // 25,2 V → 24,1 V nach Verlust: 30600 ÷ 241
    [850, "P0_7", 0],
    [900, "duty", 255], [900, "ok", 0],                    // 11,7 V: Aus-Befehl wartet
    [1200, "duty", 126], [1200, "ok", 1], [1200, "P2_10", 1], [1250, "P2_10", 0]], 1400);

/* Median aus 3: ein Ausreißer (900) schlägt nicht durch, ein echter Sprung schon */
scenario("Median", (add, link) => {
  const i = add("ko_in", { dpt: "7.001" }), m = add("avg", { n: 3, mode: "median" }), o = add("ko_out", { dpt: "7.001" }, EVERY);
  link(i, "out", m, "in"); link(m, "out", o, "in");
  return { i, o };
}, [[10, "i", 100], [20, "i", 100], [30, "i", 900], [40, "i", 100], [50, "i", 200], [60, "i", 200]],
   [[10, "o", 100], [20, "o", 100], [30, "o", 100], [40, "o", 100], [50, "o", 200], [60, "o", 200]], 100);

/* Makro „Kanal“: Umschalter mit Status-KO je Instanz; Ausgang von Kanal 1 nach außen */
scenario("Makro", (add, link, m) => {
  const M = S.model, mac = M.createMacro(m, "Kanal"), v = M.macroView(m, mac.id);
  const [mi, mo] = v.nodes;
  const tg = M.addNode(v, "toggle", 200, 60), st = M.addNode(v, "ko_out", 400, 160);
  M.normalize(m);
  st.params.mode = 1;
  v.links.push({ from: [mi.id, "out"], to: [tg.id, "trig"] }, { from: [tg.id, "out"], to: [mo.id, "in"] }, { from: [tg.id, "out"], to: [st.id, "in"] });
  const a = M.addMacro(m, mac.id, 0, 0), b = M.addMacro(m, mac.id, 0, 200);
  const t1 = add("ko_in", KEY), t2 = add("ko_in", KEY), o = add("ko_out", {}, EVERY);
  link(t1, "out", a, mi.id); link(t2, "out", b, mi.id); link(a, mo.id, o, "in");
  M.normalize(m);
  return { t1, t2, o, sa: { id: a.id + "_" + st.id }, sb: { id: b.id + "_" + st.id } };
}, [[10, "t1", 1], [20, "t2", 1], [30, "t1", 1]],
   [[10, "o", 1], [10, "sa", 1], [20, "sb", 1], [30, "o", 0], [30, "sa", 0]], 100);

/* Makro mit KNX-Parameter je Instanz: Einschaltverzögerung 1 s bzw. 2 s,
   Ausgänge an verschiedene KOs außerhalb (gemeinsamer Code wählt per Instanz) */
scenario("Makro je Instanz", (add, link, m) => {
  const M = S.model, mac = M.createMacro(m, "Verzögert"), v = M.macroView(m, mac.id);
  const [mi, mo] = v.nodes;
  const dl = M.addNode(v, "delay", 200, 60);
  M.normalize(m);
  v.links.push({ from: [mi.id, "out"], to: [dl.id, "in"] }, { from: [dl.id, "out"], to: [mo.id, "in"] });
  const a = M.addMacro(m, mac.id, 0, 0), b = M.addMacro(m, mac.id, 0, 200);
  a.inner = { [dl.id]: { params: { on: 1 } } };
  b.inner = { [dl.id]: { params: { on: 2 } } };
  const t = add("ko_in", KEY), o1 = add("ko_out", {}, EVERY), o2 = add("ko_out", {}, EVERY);
  link(t, "out", a, mi.id); link(t, "out", b, mi.id); link(a, mo.id, o1, "in"); link(b, mo.id, o2, "in");
  M.normalize(m);
  return { t, o1, o2 };
}, [[100, "t", 1], [3000, "t", 0]],
   [[1100, "o1", 1], [2100, "o2", 1], [3000, "o1", 0], [3000, "o2", 0]], 4000);

/* Treppenlicht 2 s mit Warnung über Ausgang und kurzes Aus (0,7 s), Vorwarnzeit 1 s */
scenario("Treppenlicht Warnung", (add, link) => {
  const t = add("ko_in", KEY), st = add("staircase", {}, { time: 2, warn: 3, warnTime: 1 });
  const o = add("ko_out", {}, EVERY), w = add("ko_out", {}, EVERY);
  link(t, "out", st, "trig"); link(st, "out", o, "in"); link(st, "warn", w, "in");
  return { t, o, w };
}, [[100, "t", 1]],
   [[100, "o", 1], [2100, "w", 1], [2100, "o", 0], [2800, "o", 1], [3800, "w", 0], [3800, "o", 0]], 4000);

/* Treppenlicht 1 s, bis zu 3-fach aufpumpen: vier Auslöser → 3 s ab dem letzten */
scenario("Treppenlicht Aufpumpen", (add, link) => {
  const t = add("ko_in", KEY), st = add("staircase", {}, { time: 1, pump: 3 }), o = add("ko_out", {}, EVERY);
  link(t, "out", st, "trig"); link(st, "out", o, "in");
  return { t, o };
}, [[100, "t", 1], [200, "t", 1], [300, "t", 1], [400, "t", 1]],
   [[100, "o", 1], [3400, "o", 0]], 4000);

/* Taktgeber: zwei Ein-Impulse, danach ein */
scenario("Taktgeber Anzahl", (add, link) => {
  const ck = add("clock", {}, { on: 100, off: 100, count: 2, after: 1 }), o = add("ko_out", {}, EVERY);
  link(ck, "out", o, "in");
  return { o };
}, [], [[2, "o", 1], [102, "o", 0], [202, "o", 1]], 1000);

/* Busspannung (AD7, 1023 ≙ 33,33 V): 29 V, ab 100 ms 15 V → Ausfall nach
   20 ms, ab 500 ms wieder 29 V → Wiederkehr nach 1,5 s; 10 ms Einbruch ohne Folgen */
scenario("Busspannung", (add, link) => {
  const b = add("vbus"), o = add("ko_out", {}, EVERY);
  link(b, "fail", o, "in");
  return { o };
}, [[1, "AD7", 890], [100, "AD7", 460], [500, "AD7", 890], [3000, "AD7", 460], [3010, "AD7", 890]],
   [[119, "send", 0], [119, "o", 1], [1999, "send", 1], [1999, "o", 0]], 4000);

/* Dauerhaft speichern: Sichern schreibt die nächste der vier Seiten (ab 0xEC00);
   nach dem Neustart kommt der zuletzt gesicherte Wert */
scenario("Dauerhaft speichern", (add, link) => {
  const t = add("ko_in", KEY), sv = add("ko_in", KEY), p = add("persist"), o = add("ko_out", {}, EVERY);
  link(t, "out", p, "in"); link(sv, "out", p, "save"); link(p, "out", o, "in");
  return { t, sv, o };
}, [[10, "t", 1], [20, "sv", 1], [30, "t", 0], [40, "sv", 0], [50, "sv", 1]],
   [[10, "o", 1], [20, "flash", 236], [30, "o", 0], [50, "flash", 237]], 100,
   [[1, "o", 0]]);

/* Überwachung: Auslösewert 1, Zeit 1 s – jedes Telegramm mit 0 startet sie neu */
scenario("Überwachung", (add, link) => {
  const i = add("ko_in", KEY), w = add("watchdog", {}, { trig: 1, time: 1 }), o = add("ko_out", {}, EVERY);
  link(i, "out", w, "in"); link(w, "out", o, "in");
  return { i, o };
}, [[100, "i", 0], [500, "i", 1], [600, "i", 0]],
   [[100, "o", 0], [500, "o", 1], [600, "o", 0], [1600, "o", 1]], 2000);

/* Priorität: Stufe 1 (1 Bit, ein) vor Stufe 2 (Zwangsführung 2 Bit); danach normaler Wert */
scenario("Priorität", (add, link) => {
  const n = add("ko_in", KEY), p1 = add("ko_in", KEY), z = add("ko_in", { dpt: "2.001" });
  const pr = add("priority", { levels: 2, mode1: "dpt2" }, { pos0: 1, pos1: 4, end: 3 });
  const o = add("ko_out", {}, EVERY), a = add("ko_out", {}, EVERY);
  link(n, "out", pr, "in"); link(p1, "out", pr, "a0"); link(z, "out", pr, "a1");
  link(pr, "out", o, "in"); link(pr, "act", a, "in");
  return { n, p1, z, o, a };
}, [[10, "n", 1], [20, "n", 0], [30, "p1", 1], [40, "n", 1], [50, "z", 3], [60, "p1", 0], [70, "z", 2], [80, "z", 0]],
   [[10, "o", 1], [20, "o", 0], [30, "a", 1], [30, "o", 1], [60, "o", 1], [70, "o", 0], [80, "a", 0], [80, "o", 1]], 100);

/* Auswahl nach Nummer von einer Parameterauswahl (Eintrag 2): erst ausgeben,
   wenn der gewählte Wert da ist; Zusammenführen gibt jeden Wert weiter */
scenario("Auswahl nach Nummer", (add, link) => {
  const opt = add("option", { choices: "a\nb\nc" }, { sel: 2 });
  const sel = add("select", { vtype: "num", count: 3 });
  const v = [0, 1, 2].map(() => add("ko_in", { dpt: "7.001" }));
  const o = add("ko_out", { dpt: "7.001" }, EVERY);
  link(opt, "out", sel, "cond"); v.forEach((x, k) => link(x, "out", sel, "i" + k)); link(sel, "out", o, "in");
  const a = add("ko_in", KEY), b = add("ko_in", KEY), mg = add("merge", { vtype: "bool", count: 2 }), mo = add("ko_out", {}, EVERY);
  link(a, "out", mg, "i0"); link(b, "out", mg, "i1"); link(mg, "out", mo, "in");
  return { v0: v[0], v1: v[1], v2: v[2], o, a, b, mo };
}, [[10, "v0", 5], [20, "v2", 7], [30, "v1", 9], [40, "a", 1], [50, "b", 0], [60, "a", 1]],
   [[20, "o", 7], [40, "mo", 1], [50, "mo", 0], [60, "mo", 1]], 100);

fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} Fehler` : '\nVerhalten wie erwartet');
process.exit(failed ? 1 : 0);
