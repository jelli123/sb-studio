# SB-Studio – Konzept

SB-Studio ist eine Browser-Anwendung, mit der man die Logik eines KNX-Geräts
aus grafischen Blöcken zusammensetzt. Daraus entstehen zwei Dinge, die
zueinander passen:

1. **Firmware-Projekt** auf Basis der [sblib](../../software-arm-incubation/software-arm-lib/sblib)
   (C++, CMake, Bauskripte `build.sh` / `build.cmd`)
2. **Produktdatenbank** (`.knxprod`) für die Inbetriebnahme mit SB-Project
   oder – nach dem Signieren – mit der ETS

Die erste Ausbaustufe zielt auf den **LPC1115** (Selfbus 4TE-Controller) mit
der Maske **BIM112 (0x0701)**. Für Controller mit **LPC1114/302** (32 KB Flash)
gibt es eine eigene Plattform: gleiche Pins und Maske, Code nur bis 7000h,
weil die sblib das UserEeprom in den letzten Sektor des vorhandenen Flash legt.
Eine Firmware für den LPC1114 läuft unverändert auch auf dem LPC1115. System B (0x07B0) folgt, sobald die sblib es
vollständig umsetzt; der RP2350, sobald die sblib-Portierung aus dem
Parallelprojekt bereitsteht.

## Grundentscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Firmware-Modell | statische Code-Generierung | 64 KB Flash / 8 KB RAM, kein Interpreter nötig, lesbarer Code |
| Editor | Datenfluss-Graph (Knoten + Verbindungen) | passt zu KO → Logik → Ausgang; Blockly ggf. später als Skript-Block |
| Bauen | exportiertes CMake-Projekt + `build.sh` / `build.cmd` | keine Toolchain im Browser, kein eigener Dienst nötig |
| Maske | BIM112 (0x0701), feste Segmente, eigene Ladeprozedur | in der sblib vollständig umgesetzt; braucht keine knx_master.xml |
| Technik | Vanilla-JS ohne Build-Schritt, wie SB-Project | läuft direkt von der Platte (`index.html`) |
| Startup-Code | eigener, ohne NXP-Dateien: `runtime/lpc11xx/` (aus theportapps out8-bcu1), newlib-nano statt libcr | NXP-Code („NXP Confidential“) nicht weitergeben; Compiler weiter aus MCUXpresso, weil die Toolchain-Datei der sblib dessen LinkServer voraussetzt |

## Datenfluss

```
Editor ──► Gerätemodell (JSON, *.sbs.json)
              │
              ▼
           Resolver  ── prüft Pins, Zyklen, Typen, Speichergrenzen
              │         vergibt KO-Nummern (stabil), Parameter-Offsets,
              │         RAM-Adressen der Objektwerte
       ┌──────┴──────┐
       ▼             ▼
  Firmware-Gen.   knxprod-Gen.
  app_main.cpp    Hardware.xml, Catalog.xml,
  app_config.h    M-XXXX_A-….xml (+ knx_master.xml, optional)
  CMakeLists.txt
```

Der Resolver ist die **einzige** Stelle, die KO-Nummern und Parameter-Offsets
festlegt. Beide Generatoren lesen nur sein Ergebnis – so können Firmware und
Produktdatenbank nicht auseinanderlaufen.

## Gerätemodell

```json
{
  "format": "sb-studio/1",
  "device": {
    "name": "Treppenhaus-Taster",
    "orderNumber": "SBS-0001",
    "manufacturer": 250,
    "appNumber": 41728,
    "appVersion": 16,
    "hwSerial": "0001",
    "hwVersion": 0,
    "busCurrent": 10,
    "platform": "4te-lpc1115",
    "sblibPath": "../../software-arm-incubation/software-arm-lib"
  },
  "platforms": [ ],
  "nodes": [
    { "id": "n1", "type": "di", "x": 80, "y": 120, "label": "Taster",
      "props":  { "pin": "IO1", "pullup": true, "invert": true },
      "params": { "debounce": 50 },
      "fixed":  { },
      "kos":    { } }
  ],
  "links": [ { "from": ["n1", "out"], "to": ["n2", "trig"] } ]
}
```

- **props** – Entwurfsentscheidungen, fest in der Firmware (Pin, DPT, Name)
- **params** – Werte, die normalerweise in der ETS einstellbar sind
- **fixed** – je Parameter abschaltbar: `true` = Wert wird fest einkompiliert
  und erscheint nicht in der ETS
- **platforms** – eigene Hardware-Plattformen (siehe unten); `device.platform`
  nennt eine vordefinierte oder eine davon. Ältere Dateien mit `device.mcu`
  und Pins wie `PIN_IO1` werden beim Laden umgesetzt.
- **kos** – vom Resolver vergebene KO-Nummern; sie bleiben beim Umbau des
  Graphen erhalten, damit Gruppenadressen in bestehenden Projekten stimmen
- **macros** – Makros: `{ id, name, help, nodes, links }`, ein eigener Graph,
  dessen Ports die Blöcke `macro_in`/`macro_out` sind (Name, bool/Zahl,
  Reihenfolge von oben nach unten). Eine Instanz ist ein Knoten
  `{ type: "macro", props: { macro: "m1" }, inner }`; `inner[id]` hält je
  innerem Block, was die Instanz anders hat (`props` – Pins/Busse,
  `params`, `fixed`, `kos`), bei verschachtelten Makros weiter in
  `inner[id].inner`. Der Resolver löst Instanzen vorab auf (`expand`):
  innere Knoten heißen `<Instanz>_<Knoten>`, Makro-Ein-/Ausgänge reichen den
  Wert weiter, KO-Namen und ETS-Parameterblöcke tragen den Instanznamen voran.
  Firmware und knxprod sehen nur gewöhnliche Knoten; `res.view` ist der
  gezeigte Graph mit der Instanz als einem Block, Meldungen zeigen auf sie.
  Ein Makro mit `lib` (Kennung über Projekte hinweg) kann in der Bibliothek
  des Browsers liegen (localStorage `sbs.macros`, Einträge
  `{ format: "sb-studio-macro/1", lib, name, help, macros }`, `macros[0]` ist
  das Makro, dahinter die enthaltenen). Beim Einfügen wird ein Makro mit
  gleicher `lib`, das schon im Projekt ist, genommen statt neu angelegt.

## Blockdefinition

Jeder Block bringt alles mit, was beide Generatoren brauchen
([js/blocks.js](../js/blocks.js)):

```js
{
  type: 'staircase', cat: 'Logik', name: 'Treppenlicht',
  inputs:  [{ id: 'trig', type: 'bool', label: 'Auslöser' }],
  outputs: [{ id: 'out',  type: 'bool', label: 'Licht' }],
  props:   [],                                      // fest in der Firmware
  params:  [{ id: 'time', label: 'Laufzeit', unit: 's', type: 'u16', def: 120 }],
  kos:     [],                                      // Kommunikationsobjekte
  gen: {
    state: c => `static Timeout ${c.v('t')};`,      // globale Variablen
    setup: c => '',                                 // Hardware-Init in setup()
    init:  c => '',                                 // nach Laden der Applikation
    loop:  c => `if (${c.v('t')}.expired()) { … ${c.emit('out', '0')} }`,
    in:    (c, port) => `…`,                        // Eingang empfängt v
    ko:    (c, ko) => `…`                           // KO wurde vom Bus beschrieben
  }
}
```

Weitere Angaben, wo ein Block sie braucht:

- `gen.include` – zusätzliche sblib-Header; `gen.shared` – Initialisierung,
  die mehrere Blöcke teilen (`analogBegin()`, ein PWM-Timer). Beides steht
  nur einmal im Code, auch wenn mehrere Blöcke es liefern.
- `optional: true` an einem Eingang – unverbunden ist kein Hinweis wert
  (Zähler: Abwärts/Rücksetzen, Taktgeber: Freigabe); `c.linked('en')`
  sagt dem Code, ob der Eingang verbunden ist.
- `fn` an einer Pin-Eigenschaft – verlangte Pin-Funktion: `in`, `out`,
  `adc`, `pwm` oder mehrere (`['in', 'out']` für 1-Wire). Für digitale
  Pins steht im Code `c.output('pin', pegel)` (Setup), `c.input('pin',
  pullup)`, `c.write('pin', ausdruck)` und `c.read('pin')` – das bedient
  auch Pins eines Schieberegisters. `c.pin('pin')` (Makro aus
  `app_config.h`) und `c.gpio('pin')` (A/D-Kanal, PWM-Timer) gibt es nur
  für Pins des Chips; Eigenschaften, die so einen brauchen, tragen
  `native: true` (Software-PWM der Relais, Pins der Schieberegister selbst).
- `expander: n => ({ dir: 'out' | 'in', count, chip })` am Block – der Block
  stellt Pins `Name.Q0 …` bereit (74HC595, 74HC165), die andere Blöcke wie
  Pins der Plattform wählen. Er erzeugt `<id>_write(bit, v)` bzw.
  `<id>_read(bit)` in `gen.lib` und überträgt das Abbild in seiner Schleife.
  Nur auf oberster Ebene (nicht in Makros); beim Umbenennen folgen die Pins.
  Der 74HC595 gibt /OE als Pin oder als PWM frei (20 kHz auf einem
  Timer-Match-Pin, Timer exklusiv; Eingang „Freigabe /OE“ 0…255) und liest
  die Kette auf Wunsch über QH* zurück (MISO oder Pin, Ausgang
  „Kettenfehler“, mindestens jede Sekunde).
- `bus` – benötigter Bus (`i2c`, `uart`, `spi0`, `spi1`), von mehreren
  Blöcken teilbar (I²C-Sensoren)
- Eigenschaft `kind: 'bus'` mit `buses` und `signals` – der Block wählt
  einen angeschlossenen Bus, hat ihn für sich und belegt nur die genannten
  Signale (NeoPixel: `['spi0', 'spi1']`, nur MOSI); im Code
  `c.busPin('port', 'mosi')`. Mit `share: true` teilen sich solche Blöcke
  den Bus (Schieberegister mit eigenem Latch-Pin; SCK/MOSI gemeinsam, MISO
  nur einer), ein Block ohne `share` duldet keinen anderen. `kind: 'int'` mit `min`/`max` für Zahlen
  (`max` auch als Funktion des Knotens). `kind: 'code'` ist ein mehrzeiliges
  Codefeld (Skript-Block; Tab rückt ein).
- `when: { method: 'timer' }` an einer Eigenschaft – gilt nur bei dieser
  Auswahl (Inspektor, Pinbelegung, Prüfung). Eine Enum-Eigenschaft mit
  `switches: true` wählt zwischen Varianten: der Block ist verfügbar, wenn
  eine geht, und `freePins` stellt auf eine machbare um (NeoPixel: SPI
  ohne Timer-Pin, Timer-Interrupt ohne SPI). `when` darf auch eine Funktion
  `p => bool` der Eigenschaften sein (Textliste: nur so viele Felder wie Anzahl).
- `check: n => [[msg, [args]]]` am Block – eigene Prüfung im Resolver, jede
  Meldung wird übersetzt und als Fehler gezeigt (Text: zu lang, Zeichen fehlt
  im Zeichensatz).
- `timer: 'exclusive'` an einer PWM-Pin-Eigenschaft – der Block braucht den
  ganzen Timer (eigener Interrupt); PWM-Blöcke am selben Timer sind ein Fehler.
- `swTimer: n => tm | null` am Block – Timer ohne Pin (Software-PWM der Relais,
  20 kHz, Pulsdichte, bis 8 Kanäle): Blöcke mit swTimer teilen ihn sich, für
  PWM-Pins und NeoPixel ist er belegt.
- `gen.lib` – Hilfsfunktionen, die mehrere Blöcke teilen (einmal im Code,
  vor dem Zustand der Blöcke)
- `resources` – Betriebsmittel, die nur ein Block belegen darf, z. B.
  `[['i2c:44', 'I²C-Adresse 44h']]`; der Resolver meldet Doppelbelegung

`inputs`, `outputs`, `params`, `kos` und `resources` dürfen auch Funktionen des Knotens
sein (z. B. hängt der Porttyp eines KO-Blocks vom gewählten DPT ab, die Zahl
der Eingänge eines UND-Gatters von einer Eigenschaft).

### Laufzeitmodell der erzeugten Firmware

- Werte im Graphen sind `int32_t`. `bool` = 0/1, DPT 9 in Hundertsteln
  (wie `dpt9ToFloat()` der sblib).
- Jeder Eingang wird zu einer Funktion `static void n3_in_trig(int32_t v)`.
  Ein Ausgang ruft alle verbundenen Eingangsfunktionen direkt auf – ohne
  Warteschlange, ohne Heap.
- Logikblöcke geben bei **jedem** Eingangsereignis aus; ob gesendet wird
  (nur bei Änderung, zyklisch …), entscheidet der KO-Ausgang.
- Zyklen im Graphen sind verboten (Rekursion ohne Abbruch).

### Ablauf in der Firmware

```
setup()          Hardware-Pins initialisieren, bcu.begin(…)
loop() 1. Mal    Parameter ab PARAM_BASE lesen, init-Code der Blöcke
loop()           KO-Updates verteilen, loop-Code der Blöcke, waitForInterrupt()
loop_noapp()     nichts (keine Applikation geladen)
```

Parameter liegen in einem festen Segment ab `PARAM_BASE` (4800h); die
Firmware liest sie mit `paramU8/paramU16` (Big Endian, wie die ETS sie
schreibt). Die KO-Tabelle findet die sblib selbst: Das Task-Segment der
Applikation nennt ihre Adresse (`commsTabAddr`).

### Hardware-Plattform

Die Plattform beschreibt die Platine, nicht nur die MCU
([js/blocks.js](../js/blocks.js), `CHIP` und `PLATFORMS`):

- **Chip** – Flash/RAM, Maske und je GPIO, was er kann (A/D-Kanal,
  Timer-Match- und Capture-Kanäle), dazu die möglichen Pins je Bussignal.
  Quelle: UM10398 Tab. 160 (LPC1100L, LPC1114/302) und Tab. 170
  (LPC1100XL, LPC1115/303); die XL-Reihe hat zusätzlich Timer an Port 2/3
  und weitere Lagen für UART und SPI1.
- **Plattform** – Chip, Pins (Name → GPIO, erlaubte Funktionen),
  angeschlossene Busse mit ihren Pins, Programmiertaste. Busse:
  **KNX** (immer vorhanden, RX = Capture-, TX = Match-Pin desselben Timers;
  die sblib legt ihn in `BcuBase` fest auf timer16_1, RX PIO1_8, TX PIO1_9 –
  andere Pins meldet die Prüfung), **SB-Debug** (RESET PIO0_0, SWDIO
  PIO1_3, SWCLK PIO0_10, ISP_EN PIO0_1 fest belegt; ISP_TXD PIO1_7 und
  ISP_RXD PIO1_6 mitbenutzbar, UM10398 Kap. 26.3.1), I²C, UART, SPI0, SPI1. Vordefiniert:
  4TE-Controller mit LPC1115 und mit LPC1114/302 (Belegung aus
  `sblib/hardware/gpio_lpc11xx.h`). Eigene Plattformen entstehen als Kopie
  im Dialog hinter dem Zahnrad, liegen im Gerätemodell und lassen sich als
  `.sbs-platform.json` aus- und einlesen.
- Die Plattform bestimmt die **verfügbaren Hardware-Blöcke**: fehlt ein Pin
  mit der verlangten Funktion oder der Bus, ist der Block in der Palette
  ausgegraut, ein vorhandener wird beanstandet.
- **Belegung**: jeder GPIO gehört einem Block. KNX und SB-Debug belegen
  ihre Pins immer, die übrigen Busse, sobald ein Block sie nutzt (I²C-Sensor
  gegen Digitaleingang an PIO0_4). Ein Match-Kanal kann beim XL an zwei Pins
  liegen (CT16B0_MAT0 an PIO0_8 und PIO3_0) und gehört ebenfalls nur einem
  PWM-Block.
- **Firmware**: je Pin-Eigenschaft ein Makro in `app_config.h`
  (`#define PIN_N1_PIN PIO2_2 //!< IO1 (Taster)`). Weicht die
  Programmiertaste von PIN_PROG (PIO2_0) ab, ruft `setup()` vor
  `bcu.begin()` `bcu.setProgPin()` auf.

| Funktion | LPC111x | Anmerkung |
|---|---|---|
| A/D (10 Bit) | PIO0_11 AD0, PIO1_0…PIO1_4 AD1…AD5, PIO1_10 AD6, PIO1_11 AD7 | `analogBegin()` einmal; PIO1_3 ist SWDIO |
| PWM 1 kHz | timer16_0: PIO0_8/PIO0_9; timer32_0: PIO1_6/PIO1_7/PIO0_11; timer32_1: PIO1_1/PIO1_2/PIO1_4; nur XL auch PIO3_0/PIO3_1 (timer16_0), PIO2_5/PIO2_6/PIO2_8 (timer32_0) | MAT2 = Periode; timer16_1 belegt der Bus |
| KNX | RX CT16B1_CAP0 PIO1_8, TX CT16B1_MAT0 PIO1_9 | fest in der sblib |
| SB-Debug | RESET PIO0_0, SWDIO PIO1_3, SWCLK PIO0_10, ISP_EN PIO0_1; ISP_TXD PIO1_7, ISP_RXD PIO1_6 | ISP-Pins mitbenutzbar |
| I²C | SCL PIO0_4, SDA PIO0_5 (fest in der sblib) | SHT4x 44h, BH1750 23h/5Ch |
| UART | RXD PIO1_6, TXD PIO1_7; nur LPC1115 (XL) auch PIO2_7/2_8, PIO3_1/3_0, PIO3_4/3_5 | beim 4TE-LPC1115 RX/TX = PIO3_1/PIO3_0 |
| SPI0 / SPI1 | SCK0 PIO0_6 (PIO0_10, PIO2_11), MISO0 PIO0_8, MOSI0 PIO0_9; SPI1 SCK1 PIO2_1, MISO1 PIO2_2, MOSI1 PIO2_3, nur XL auch SCK1 PIO3_2, MISO1 PIO1_10, MOSI1 PIO1_9 | ohne SSEL: Chip-Select/Latch ist ein Ausgangspin am Block; 4TE: SCK0 an IO8 (PIO2_11) wie auf den App-Platinen; NeoPixel, 74HC595, 74HC165 |

### Speicher bei BIM112

Grenzen aus der sblib (`MASK0701`): User-EEPROM 3F00h–4AFFh, User-RAM
05FCh–08FFh (darin eigene Felder um 065Ch und 3 Byte Schatten am Ende).

| Adresse | Inhalt | Geladen über |
|---|---|---|
| 4000h, 513 Byte | Adresstabelle (Anzahl, PA, bis 255 GA) | LSM 1 |
| 4201h, 511 Byte | Assoziationstabelle (bis 255 Paare) | LSM 2 |
| 4400h | KO-Tabelle: Anzahl, Zeiger auf RAM-Flags, je KO Wertzeiger/Konfiguration/Typ (4 Byte) | LSM 3, Task-Segment |
| 4800h–4AFFh | Parameter | LSM 3 |
| 0700h | RAM-Flags (ein Halbbyte je KO), danach die Objektwerte | LSM 3 |

KO-Nummern beginnen bei 0. Die KO-Tabelle reicht bis zur höchsten Nummer;
die ETS bzw. SB-Project setzen Flags und Priorität beim Laden aus dem
Projekt, die Wertzeiger stehen fest in der knxprod.

## Produktdatenbank

- Herstellernummer einstellbar, Vorgabe 0x00FA (OpenKNX/Selfbus – Nutzung
  mit der Community abstimmen)
- Ids nach dem Schema der ETS: `M-00FA_A-A300-10-0000` usw.; der Hash-Teil ist
  `0000` und wird beim Signieren ersetzt
- `LoadProcedureStyle="ProductProcedure"`: die Applikation bringt die
  vollständige Ladeprozedur selbst mit (Entladen, `LdCtrlAbsSegment`,
  `LdCtrlTaskSegment`, Neustart) – wie die BIM112-Applikationen von Selfbus
  (z. B. `misc/MultiSensorAktor`)
- **knx_master.xml** wird dafür nicht gebraucht: SB-Project nimmt die
  Ladeprozedur aus der Applikation und spricht die Load State Machines über
  den Speicher an 0104h an, wie die sblib es erwartet. Wer sie beilegen will
  (wie das Manufacturer Tool), wählt sie in den Geräteeinstellungen; ihr
  Schema (Namensraum) wird dann übernommen.
- Unsigniert lässt sich die Datei in SB-Project importieren. Für die ETS muss
  sie signiert werden (ETS-DLLs unter Windows, z. B. mit dem OpenKNXproducer
  oder dem Kaenx-Creator) – Etappe 5.

## Etappen

1. ✅ Gerätemodell, Blockformat, Konzept
2. ✅ Editor (Palette, Canvas, Eigenschaften), Speichern/Laden, Autosave
3. ✅ Firmware-Generator LPC1115 / BIM112, CMake + Bauskripte
4. ✅ knxprod-Generator (unsigniert), Import und Downloadplan mit SB-Project geprüft
5. ⬜ Test am Gerät: bauen, flashen, mit SB-Project programmieren
6. ⬜ Signieren für die ETS, Herstellernummer klären
7. 🔶 Weitere Blöcke: ✅ Analogeingang, PWM mit Dimmzeit, SHT4x, BH1750,
   DS18x20 (1-Wire), Rechnen, Vergleichen, Skalieren, Szene, NeoPixel
   (WS2812/SK6812 über SPI oder Timer-Interrupt, 1…8 einzeln, RGB/HSV),
   Tor/Sperre, Auswahl, Flanke, RS-Flipflop, Zähler, Taktgeber,
   PWM-Kennlinie linear/logarithmisch, Tastenauswertung (kurz/lang/doppelt),
   Dimmtaste (DPT 3.007), Jalousietaste (DPT 1.008/1.007), Dimmer/Rampe
   (linear/logarithmisch), Speicher, Impulsteiler, RGB-Farbe; Objekte
   2/4 Bit, 3/4 Byte mit DPT 2, 5.003, 6, 7.005, 8, 10/11 (roh), 12, 13,
   14 (Hundertstel), 20.102, 232.600; gleitender Mittelwert, Integrator,
   Differentiator, PID-Regler (PIDT1, Anti-Windup), Zeitschaltuhr (DPT 10.001,
   bis 8 Schaltzeiten, Wochentage, Datum DPT 11.001, UTC mit Zeitzone und
   EU-Sommerzeit, Astro, Feiertage bundesweit + regional), Text senden/empfangen
   (DPT 16.000/16.001, 14 Byte), Relais (Haltestrom per Software-PWM) und
   bistabiles Relais (eine Spule mit H-Brücke oder Kondensator in Reihe, zwei
   Spulen), Schieberegister 74HC595/74HC165 als Pin-Erweiterung (SPI oder
   GPIO, bis 4 in Kette, /OE als PWM, Kettenprüfung über QH*; Out8 mit
   Energy-Storage-Addon als Beispiel, in8 24 V), Spannungsausgleich
   (Tastverhältnis nach Speicherspannung, Freigabe der bistabilen Relais), Skript-Block (eigener C++-Code mit
   input/emit/param in eigenem Namensraum), Makros (Blockgruppen mit eigenen
   Pins, Parametern und KOs je Instanz, verschachtelbar; Mehrfachauswahl →
   „Als Makro übernehmen“, KO-Nummern bleiben; „Makro auflösen“; Bibliothek
   im Browser für alle Projekte, Export/Import als .sbs-macro.json); Verhaltenstest
   test/simulate.js
8. ⬜ Bootloader-Variante (Linkerskript mit Versatz, Firmware-Update über den Bus)
9. 🔶 Hardware-Plattformen: ✅ Chip-Tabelle LPC111x, eigene Plattformen
   (Pins, Funktionen, Busse, Programmiertaste), Blöcke je Plattform;
   ⬜ UART-/SPI-Blöcke, RP2350 als Chip (nach sblib-Portierung)
10. ⬜ Integration in SB-Project (Gerät direkt in den Katalog übernehmen)

## Offene Punkte

- System B (0x07B0) wieder aufnehmen, sobald die Relativ-Allokation der
  sblib (`PropertiesSYSTEMB::handleDataRelativeAllocation`) fertig ist. Das
  Maskenprofil in `blocks.js` (`MASK`) ist dafür die Stelle. Muster:
  OpenKNX `knx-demo-tp` (MergedProcedure mit `LdCtrlRelSegment LsmIdx=4`
  und `LdCtrlWriteRelMem ObjIdx=4`, KO-Nummern ab 1, Parameterbasis aus
  `userEeprom->eibObjAddr()`).
- Die Ladeprozedur prüft die Hardware-Kennung nicht (`LdCtrlCompareProp`
  auf PID 78) – eine knxprod lässt sich so auch auf ein fremdes BIM112-Gerät
  laden. Nachziehen, sobald die Kennung der Hardware festgelegt ist.
- KO-Nummern sind stabil, Parameter-Offsets noch nicht – nach Änderungen am
  Graphen die Applikationsversion erhöhen.
- Undo/Redo im Editor fehlt noch.
