# Eigene Blöcke

Was nicht mit den vorhandenen Blöcken geht, lässt sich auf zwei Wegen ergänzen:

1. **Skript-Block** (Kategorie „Skript“): eigener C++-Code direkt im Editor,
   ohne SB-Studio selbst zu ändern. Gut für Rechenvorschriften, kleine
   Zustandsautomaten und Sonderfälle in einem Gerät.
2. **Neuer Blocktyp** in [js/blocks.js](../js/blocks.js): ein Block wie die
   eingebauten, mit Pins, Bussen, ETS-Parametern, KOs und Code für beide
   Generatoren (Firmware und knxprod). Lohnt sich, wenn der Block öfter
   gebraucht wird oder Hardware bedient.

Beide erzeugen Code für die sblib; was dort grundsätzlich zur Verfügung
steht, steht am Ende ([Was im erzeugten Code bereitsteht](#was-im-erzeugten-code-bereitsteht)).

---

## 1. Skript-Block

### Einstellungen

| Eigenschaft | Bedeutung |
|---|---|
| Eingänge | 0 … 4 Eingänge E1 … E4 (Zahlen, `int32_t`) |
| Ausgänge | 1 … 4 Ausgänge A1 … A4 |
| Parameter | 0 … 4 KNX-Parameter (16 Bit mit Vorzeichen, in der ETS einstellbar oder fest) |
| Zustand | Code außerhalb der Funktionen: Variablen, Hilfsfunktionen |
| Beim Start | läuft einmal, nachdem die Applikation geladen ist (Parameter sind gelesen) |
| Bei Eingang (k, v) | läuft bei jedem Wert an einem Eingang |
| Zyklisch | läuft in jeder Runde der Hauptschleife (etwa jede Millisekunde) |
| Beschreibung | Markdown, steht als Kommentar im Code und als Hilfe am Block |

Der Code steht in einem eigenen Namensraum (`namespace n7_script { … }`),
Namen stören also keine anderen Blöcke.

### Befehle

| Befehl | Bedeutung |
|---|---|
| `input(k)` | letzter Wert an Eingang Ek (k = 1 … Anzahl), 0 vor dem ersten Wert |
| `emit(k, v)` | gibt `v` an Ausgang Ak aus; die verbundenen Blöcke laufen sofort (direkter Aufruf) |
| `param(k)` | Wert des KNX-Parameters k (1 … Anzahl) |
| `trace("Text", v)` | Zusatzinfo `Zeit Block: Text = v` über den Debug-Block (siehe unten) |
| `k`, `v` | nur in „Bei Eingang“: Nummer des Eingangs (1 …) und sein Wert |
| `E[i]` | die Eingangswerte als Feld (`E[0]` = E1) |

Die Nummern prüft der Editor: `emit(3, …)` bei zwei Ausgängen ist ein
Fehler, ebenso Klammern, die nicht zusammenpassen.

Werte sind immer `int32_t`: `bool` ist 0/1, Temperaturen und andere
DPT-9-Werte kommen in Hundertsteln (21,5 °C = 2150), DPT 14 ebenso.

### Beispiel

```cpp
// Zustand
static Timeout t;
static int32_t last;

// Bei Eingang (k, v)
if (k == 1 && v != last)
{
    last = v;
    trace("neu", v);
    t.start(param(1) * 1000UL);   // Parameter 1: Wartezeit in s
}

// Zyklisch
if (t.expired()) emit(1, last);
```

`trace()` gibt nur etwas aus, wenn ein Debug-Block „Zusatzinfos der Blöcke“
eingeschaltet hat (und der Filter auf den Namen des Skript-Blocks passt), und
nur im Debug-Build. Sonst ist der Aufruf leer und kostet nichts.

Zusätzlich steht alles bereit, was im erzeugten Code allgemein verfügbar ist
(`millis()`, `Timeout`, `digitalWrite()` …, siehe Ende). KOs und Pins
bekommt ein Skript nur über seine Ein- und Ausgänge: dafür KO- oder
Hardware-Blöcke daneben setzen und verbinden.

---

## 2. Neuer Blocktyp in blocks.js

Ein Block ist ein Objekt in `DEFS` in [js/blocks.js](../js/blocks.js). Er
beschreibt den Block im Editor, seine ETS-Teile und erzeugt seinen C++-Code
als Text. Ein kleines vollständiges Beispiel ist der Block „Treppenlicht“
(`type: 'staircase'`), mit Hardware das „Relais“ (`type: 'relay'`).

Danach: Übersetzung in [js/lang-en.js](../js/lang-en.js) für alle neuen Texte
eintragen (`test/i18n.js` meldet fehlende), ein Szenario in
[test/simulate.js](../test/simulate.js) schreiben und `test/compile.sh` laufen lassen.

### 2.1 Angaben am Block

| Feld | Bedeutung |
|---|---|
| `type` | eindeutiger Name, steht in Projektdateien – nicht mehr ändern |
| `cat` | Kategorie in der Palette (`Hardware`, `KNX`, `Logik`, `Zeit`, `Debug` …; neue entstehen von selbst, Farbe in [styles.css](../styles.css) `--cat-…`) |
| `name` | Anzeigename (deutsch, übersetzt über lang-en.js) |
| `help` | Hilfetext (Tooltip, Inspektor) |
| `inputs`, `outputs` | Ports, siehe 2.2 |
| `props` | Eigenschaften, fest in der Firmware, siehe 2.3 |
| `params` | ETS-Parameter, siehe 2.4 |
| `kos` | Kommunikationsobjekte, siehe 2.5 |
| `gen` | Code-Erzeugung, siehe 2.6 |
| `check: n => [[text, [args]]]` | eigene Prüfung; jede Meldung ist ein Fehler (`text` mit `{0}` … wird übersetzt) |
| `resources: n => [[key, text]]` | Betriebsmittel, die nur ein Block haben darf (z. B. `['i2c:44', 'I²C-Adresse 44h']`, `['ratelimit', …]`) |
| `bus` | benötigter Bus (`'i2c'`, `'uart'`, `'spi0'` …), teilbar mit anderen Blöcken |
| `swTimer: n => timer \| null` | Timer ohne Pin (Software-PWM), teilen sich alle Blöcke mit `swTimer` |
| `expander: n => ({ dir, count, chip })` | Block stellt Pins `Name.Q0 …` bereit (Schieberegister); erzeugt `<id>_write(bit, v)` / `<id>_read(bit)` in `gen.lib` |
| `persist: true` | Block bekommt einen Platz im dauerhaften Speicher (`c.persist()`); auch `n => bool`, wenn es von Eigenschaften abhängt. Gelesen wird mit `sbsPersistLoad()` in `setup`, geschrieben über `sbsPersistPending = true` |
| `persistDownloads: n => bool` | der Block braucht den Download-Zähler `sbsPersist[SBS_PERSIST_DL]` (zählt jeden ETS-Download), etwa um Gelerntes nach einem Download zu verwerfen |
| `hidden: true` | nicht in der Palette |
| `macroOnly: true` | nur beim Bearbeiten eines Makros (auch an einzelnen Eigenschaften) |

`inputs`, `outputs`, `params`, `kos` und `resources` dürfen Listen oder
Funktionen des Knotens sein (`n => …`, mit `n.props` als den Eigenschaften),
z. B. hängt die Zahl der Eingänge eines Gatters von einer Eigenschaft ab.

### 2.2 Ports

```js
inputs: [{ id: 'in', type: 'bool', label: 'Schalten' }],
outputs: [{ id: 'out', type: 'num', label: 'Wert', range: '0…255' }]
```

| Feld | Bedeutung |
|---|---|
| `id` | Name im Code (`c.emit('out', …)`, `gen.in(c, 'in')`) |
| `type` | `'bool'` (0/1) oder `'num'` (`int32_t`); verbindet man num → bool, warnt der Editor. Ein `bool`-Ausgang darf nur 0 oder 1 ausgeben – andere Blöcke speichern seine Werte dann als `bool` (`c.store`). Ausnahme sind durchreichende Blöcke mit der Eigenschaft `vtype`; der Generator prüft deren Quellen selbst |
| `label` | Anzeigename; `{ raw: text }` für nicht zu übersetzende Texte |
| `range` | Wertebereich als Text (Tooltip) |
| `optional: true` | unverbunden ist keinen Hinweis wert (`c.linked(id)` sagt es dem Code) |
| `feedback: true` | Rückführung: zählt nicht als Zyklus (der Eingang merkt sich den Wert nur) |
| `any: true` | nimmt bool und Zahl ohne Warnung (Debug-Block) |

### 2.3 Eigenschaften (`props`)

Fest in der Firmware, im Inspektor eingestellt. Gemeinsame Felder: `id`,
`label`, `kind`, `def` (Vorgabe), dazu:

| `kind` | Bedeutung, weitere Felder |
|---|---|
| `bool` | Haken |
| `enum` | Auswahl, `options: [[wert, text], …]`; `switches: true` = schaltet zwischen Varianten (Block verfügbar, wenn eine geht) |
| `int` | Zahl, `min`, `max` (auch `max: n => …`) |
| `text` | einzeiliger Text (`max` Zeichen) |
| `lines` | mehrzeiliger Text, je Zeile ein Eintrag |
| `code` | Codefeld (Skript) |
| `markdown` | Markdown-Text |
| `pin` | Pin der Plattform; `fn: 'in' \| 'out' \| 'adc' \| 'pwm'` oder Liste; `native: true` = nur Pins des Chips (keine Schieberegister-Pins); `timer: 'exclusive'` = PWM braucht den ganzen Timer |
| `bus` | angeschlossener Bus, `buses: ['spi0', …]`, `signals: ['mosi', …]` (nur diese werden belegt); `share: true` = mehrere Blöcke teilen ihn |

`when` an einer Eigenschaft: gilt nur, wenn andere Eigenschaften passen –
`when: { out: 'uart' }` oder `when: p => !!p.hold`. Mehrere Einträge mit
derselben `id` und verschiedenem `when` sind Varianten derselben Eigenschaft.

Häufige fertige Eigenschaften: `VTYPE` (Datentyp bool/Zahl), `SW_TIMER`.

### 2.4 ETS-Parameter (`params`)

```js
params: [
  { id: 'time', label: 'Laufzeit', unit: 's', type: 'u16', def: 120, min: 1, max: 65535 },
  { id: 'mode', label: 'Verhalten', type: 'enum', options: [[0, 'aus'], [1, 'ein']], def: 0 }
]
```

| `type` | Größe | C-Typ |
|---|---|---|
| `u8` | 1 Byte | `uint8_t` |
| `u16` | 2 Byte | `uint16_t` |
| `i16` | 2 Byte | `int16_t` |
| `i32` | 4 Byte | `int32_t` |
| `enum` | 1 Byte | `uint8_t`, mit `options` |

Im Inspektor kann jeder Parameter „fest in der Firmware“ gestellt werden; dann
ist `c.param(id)` eine Zahl im Code statt einer Variablen. Fertige Auswahlen:
`YES_NO`, `REACT` (aus/ein/keine Reaktion). Der Offset im Parametersegment
bleibt stabil, auch wenn sich das Gerät ändert.

### 2.5 Kommunikationsobjekte (`kos`)

```js
kos: n => [{ id: 'obj', text: n.props.name, func: 'Empfangen', dpt: n.props.dpt, flags: 'CWU' }]
```

| Feld | Bedeutung |
|---|---|
| `id` | Name im Code (`c.ko('obj')`, `gen.ko(c, 'obj')`) |
| `text`, `func` | Name und Funktionstext in der ETS |
| `dpt` | Datenpunkttyp, z. B. `'1.001'`, `'9.001'` (Liste: `DPT` in blocks.js) |
| `flags` | `C` Kommunikation, `R` Lesen, `W` Schreiben, `T` Übertragen, `U` Aktualisieren, `I` Lesen beim Start |

Die Nummer vergibt der Editor (stabil, im Inspektor änderbar).

### 2.6 Code erzeugen (`gen`)

Jeder Eintrag ist ein Text oder eine Funktion `c => text` (Kontext `c`,
siehe 2.7), die C++ liefert. Leerer Text oder `null` = nichts.

| Hook | landet in | läuft |
|---|---|---|
| `include` | `#include <…>` (einmal im Code) | – |
| `lib` | Hilfsfunktionen vor allen Blöcken (Text oder Liste; gleiche Texte nur einmal) | – |
| `state` | Zustand des Blocks (globale Variablen, Funktionen) | – |
| `shared` | `setupHardware()`, vor allen `setup` (gleiche Texte einmal: `analogBegin()`, SPI-Takt …) | beim Start |
| `setup` | `setupHardware()`: Pins, Peripherie | beim Start, **Parameter noch nicht gelesen** |
| `init` | `initApplication()` | nach dem Laden der Applikation, Parameter gelesen |
| `in: (c, port) => …` | Funktion des Eingangs, Wert in `v` | bei jedem Wert am Eingang |
| `ko: (c, koId) => …` | `objectUpdated()` | KO vom Bus beschrieben |
| `loop` | `checkPeriodic()` | in jeder Runde der Hauptschleife |

Ablauf in der Firmware: `setup()` → `setupHardware()` (shared, setup);
erste Runde von `loop()` → Parameter lesen, `initApplication()` (init); dann
in jeder Runde empfangene KOs verteilen (ko) und `checkPeriodic()` (loop).
Ein Ausgang ruft die verbundenen Eingänge direkt auf – keine Warteschlange.

### 2.7 Der Kontext `c`

| Aufruf | liefert |
|---|---|
| `c.v('name')` | eindeutiger Name für Zustand und Funktionen des Blocks (`n3_name`). Immer verwenden, nie eigene globale Namen |
| `c.prop('id')` | Wert einer Eigenschaft (in JS, zum Erzeugen) |
| `c.param('id')` | Parameter als C-Ausdruck (Variable oder feste Zahl) |
| `c.emit('port', expr)` | Aufruf aller verbundenen Eingänge mit `expr`; unverbunden `(void) (expr);` |
| `c.linked('port')` | ob ein Ausgang verbunden ist (JS) – Zustand nur anlegen, wenn nötig |
| `c.ko('id')` | KO-Nummer als C-Ausdruck (Makro aus app_config.h) |
| `c.koRead('id')` | Wert des KOs als `int32_t` (DPT 9/14 in Hundertsteln, Vorzeichen erweitert) |
| `c.store('port', …)` | C-Typ, um Werte dieser Eingänge zu speichern: `bool`, wenn alle Quellen nur 0/1 liefern, sonst `int32_t`. Für Zustand wie `static ${c.store('in')} ${c.v('val')};` – spart RAM, besonders in Makros mit vielen Instanzen |
| `c.koStore('id', 'port')` | C-Typ für den letzten Wert eines KO in der Breite seines DPT (`uint8_t`, `int16_t` …; DPT 1 wie `c.store`). Vergleich dann mit `(Typ) v` |
| `c.koWrite('id', expr)` | Anweisung: Wert ins KO schreiben und senden (DPT 9/14 aus Hundertsteln); bei KO-Varianten nur, wenn die Auswahl des Blocks gilt |
| `c.output('pin', pegel)` | Anweisung(en): Pin als Ausgang mit Anfangspegel (auch Schieberegister-Pin) |
| `c.input('pin', pullup)` | Anweisung: Pin als Eingang |
| `c.write('pin', expr)` | Anweisung: Pin setzen (auch Schieberegister-Pin) |
| `c.read('pin')` | Ausdruck: Pin lesen (auch Schieberegister-Pin) |
| `c.pin('pin')` | Pin-Makro (nur Pins des Chips, `native: true`) |
| `c.pinGuard()` | teilt sich der Block einen Pin mit Blöcken, die eine Parameterauswahl ausschließt: Bedingung (C), unter der er arbeitet; sonst `''`. Dann den Pin erst in `init` einrichten und `init`/`loop`/`in` nur unter der Bedingung ausführen (siehe Digitaleingang/-ausgang) |
| `c.gpio('pin')` | was der Pin kann: `{ adc, pwm: [timer, kanal] }` |
| `c.busPin('prop', 'signal')` | GPIO eines Bussignals, z. B. `c.busPin('port', 'mosi')` |
| `c.persist()` | Platz im dauerhaften Speicher (`sbsPersist[…]`, nur mit `persist: true`) |
| `c.trace('was', expr)` | Zusatzinfo `Zeit Block: was = Wert` (siehe 2.8), sonst leer |
| `c.traceWho()` | Blockname als C-Ausdruck für eigene `sbsTrace()`-Aufrufe, `null` ohne Zusatzinfos |
| `c.traceOn` | ob überhaupt ein Debug-Block Zusatzinfos aufnimmt (für Texte in `lib`) |
| `c.title` | Name des Blocks wie im Editor (ASCII, für Texte im Code) |
| `c.id` | Knoten-ID (`n3`) |

Hilfen in blocks.js für den Code-Text: `bool(expr, invert)` (Pegel 0/1),
`indent(code, n)`, `guarded(bedingung, code, block)` (Code nur unter der Bedingung, leer: immer), `range(n)`, `hex2(v)`, `hundredths(f)` (float → Hundertstel),
`changedState(c)` / `onChange(…)` (nur bei Änderung um mindestens ein Delta ausgeben),
`trace(c, was, expr, einrückung)` (wie `c.trace`, mit Zeilenvorschub davor).

### 2.8 Zusatzinfos zur Fehlersuche

An wichtigen Stellen (Zustand ändert sich, Fehler, Hardware schaltet)
sollte ein Block melden, was passiert:

```js
in: c => `bool on = v != 0;\n` +
  `if (on == ${c.v('on')}) return;\n` +
  `${c.v('on')} = on;\n${c.write('pin', 'on')}` +
  trace(c, 'schaltet', 'on'),
```

Erzeugt wird das nur, wenn ein Debug-Block „Zusatzinfos der Blöcke“
einschaltet und sein Filter auf den Blocknamen passt, und nur im Debug-Build
(`#ifdef SBS_TRACE`). Texte in `lib`, die alle Blöcke teilen, prüfen
`c.traceOn` und rufen `sbsTrace("Name", "was", wert)` selbst auf.

### 2.9 Regeln für gemeinsamen Makro-Code

Hat ein Makro mehrere Instanzen (Out8: acht Kanäle), erzeugt der Generator
den Code eines Blocks nur einmal als Struktur (`struct S0_Kanal`) mit einer
Instanz je Kanal. Das klappt nur, wenn der Code jeder Instanz gleich ist.
Dann gilt:

- Alles, was je Instanz verschieden ist (Pins, KO-Nummern, Parameter,
  Speicherplatz, Blockname), nur über `c.*` holen; der Generator ersetzt es
  durch Tabellen je Instanz. Keine eigenen Zahlen oder Namen aus
  `c.prop()` in den Code schreiben, die je Instanz anders sein können.
- `state` nur aus einfachen Variablen und Funktionen (`static int32_t x;`,
  `static Timeout t;`, `static bool b = true;`). Nicht möglich sind
  `const`/`constexpr`, Namensräume, `#…` und Objekte mit Konstruktor-Argumenten
  – dann wird der Block flach (eigener Code je Instanz) erzeugt, was korrekt,
  aber größer ist.
- `lib` steht außerhalb der Struktur und muss für alle gleich sein.
- Einzelne `bool`-Felder (nicht `volatile`, kein Array, kein `= true`)
  werden zu Bitfeldern (`bool x : 1;`), acht teilen sich ein Byte. Davon
  keine Adresse nehmen (`&x`) und keine Referenz bilden. Die Felder werden
  nach Ausrichtung umsortiert; ihre Reihenfolge darf keine Rolle spielen.
- KNX-Parameter liest der gemeinsame Code bei jedem Gebrauch aus dem
  UserEeprom (`c.param()` liefert dann einen Funktionsaufruf). In
  zeitkritischen Schleifen einmal in eine lokale Variable holen.

`test/simulate.js` führt jedes Szenario mit gemeinsamem und mit flachem Code
aus und vergleicht beide.

---

## Was im erzeugten Code bereitsteht

Eingebunden sind immer die Maske (`bcu`), `datapoint_types.h`, `debounce.h`,
`digital_pin.h`, `io_pin_names.h`, `timeout.h`, `timer.h`. Damit:

| Name | Bedeutung |
|---|---|
| `millis()` | Millisekunden seit dem Start (`uint32_t`, läuft nach 49 Tagen über – Differenzen bilden) |
| `delay(ms)`, `delayMicroseconds(us)` | warten (blockiert die Hauptschleife, nur ganz kurz einsetzen) |
| `Timeout t; t.start(ms); t.expired(); t.stop(); t.started(); t.stopped()` | Zeitgeber ohne Blockieren |
| `Debouncer` | Entprellen eines Eingangs |
| `pinMode(pin, OUTPUT \| INPUT \| INPUT_ANALOG …)`, `digitalWrite(pin, v)`, `digitalRead(pin)` | GPIO, Pins als `PIO0_7` usw. |
| `analogRead(kanal)` | A/D-Wandler (nach `analogBegin()`, Header `sblib/analog_pin.h` über `include`) |
| `bcu.comObjects->objectRead(nr)`, `objectWrite(nr, v)`, `objectWriteFloat(nr, v)`, `requestObjectRead(nr)` | KOs direkt (lieber `c.koRead`/`c.koWrite`) |
| `dpt9ToFloat(raw)` | DPT 9 → Hundertstel |
| `paramU8(off)`, `paramU16(off)`, `paramI32(off)` | Parameter lesen (lieber `c.param`) |
| `bcu.enableGroupTelSend(on)`, `bcu.setGroupTelRateLimit(n)` | Senden anhalten, Telegrammrate |

Je nach Blöcken im Gerät kommen dazu: `sbsPersist[]`, `sbsPersistSave()`
(dauerhafter Speicher), `dpt14FromHundredths()` / `dpt14ToHundredths()`
(DPT 14), `sbsTrace()` (Zusatzinfos, nur Debug-Build), `serial` (UART).

Weitere sblib-Header (I²C, SPI, Sensoren) bindet ein Block über `gen.include`
ein; sie stehen dann auch einem Skript im selben Gerät zur Verfügung.
