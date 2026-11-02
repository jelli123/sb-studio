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
gibt es ein eigenes MCU-Profil: gleiche Pins und Maske, Code nur bis 7000h,
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
    "mcu": "lpc1115",
    "sblibPath": "../../software-arm-incubation/software-arm-lib"
  },
  "nodes": [
    { "id": "n1", "type": "di", "x": 80, "y": 120, "label": "Taster",
      "props":  { "pin": "PIN_IO1", "pullup": true, "invert": true },
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
- **kos** – vom Resolver vergebene KO-Nummern; sie bleiben beim Umbau des
  Graphen erhalten, damit Gruppenadressen in bestehenden Projekten stimmen

## Blockdefinition

Jeder Block bringt alles mit, was beide Generatoren brauchen
([js/blocks.js](../js/blocks.js)):

```js
{
  type: 'staircase', cat: 'Logik', name: 'Treppenlicht', mcu: ['lpc1115'],
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
- `pins` an einer Pin-Eigenschaft – nur diese Pins sind erlaubt (A/D, PWM)
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

### Pins mit Sonderfunktion (4TE-Controller)

| Funktion | Pins | Anmerkung |
|---|---|---|
| A/D (10 Bit) | IO9 = AD1, IO10 = AD2, IO11 = AD3, IO12 = AD5 | `analogBegin()` einmal |
| PWM 1 kHz | IO6, IO7 (timer16_0 MAT0/1), IO10, IO11, IO12 (timer32_1 MAT0/1/3) | MAT2 = Periode; timer16_1 belegt der Bus |
| I²C | PIO0_4/PIO0_5 (fest in der sblib) | SHT4x 44h, BH1750 23h/5Ch |

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
   DS18x20 (1-Wire), Rechnen, Vergleichen, Skalieren, Szene;
   ⬜ Zeitschaltuhr (3-Byte-KOs für DPT 10/11), Skript-Block
8. ⬜ Bootloader-Variante (Linkerskript mit Versatz, Firmware-Update über den Bus)
9. ⬜ RP2350 (nach sblib-Portierung): MCU-Profil + Pinliste, Blöcke je MCU
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
