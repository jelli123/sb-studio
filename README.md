# SB-Studio

Grafischer Editor für KNX-Geräte auf Basis der Selfbus-[sblib](https://github.com/selfbus/software-arm-lib):
Logik aus Blöcken zusammensetzen, daraus **Firmware** (CMake-Projekt) und
passende **Produktdatenbank** (`.knxprod`) erzeugen, das Gerät mit
SB-Project oder der ETS in Betrieb nehmen.

> **Frühe Entwicklungsstufe.** Erzeugte Firmware ist übersetzbar, aber noch
> nicht am Gerät erprobt. Konzept und Etappen: [docs/KONZEPT.md](docs/KONZEPT.md).

## Starten

`index.html` im Browser öffnen – kein Server, kein Build-Schritt. Der
Arbeitsstand wird im Browser gespeichert; mit „Speichern“ als `.sbs.json`.

## Bedienung

- Blöcke aus der linken Liste auf die Fläche ziehen (oder anklicken)
- Ausgang (rechts am Block) auf einen Eingang (links) ziehen verbindet;
  vom Eingang wegziehen löst die Verbindung
- Block zurück in die Liste ziehen oder Entf löscht ihn
- Block anklicken: Eigenschaften, KNX-Parameter, Kommunikationsobjekte rechts.
  Jeder Parameter lässt sich als „als KNX-Parameter einstellbar“ oder fest einkompiliert
  führen
- Leere Fläche anklicken oder ⚙ neben dem Gerätenamen: Geräteeinstellungen
  (Hersteller, Applikationsnummer, Hardware-Plattform, Pfad zur sblib,
  optional `knx_master.xml`)
- Hardware-Plattform: vordefiniert 4TE-Controller (LPC1115 oder LPC1114/302).
  ⚙ daneben zeigt Pins (Name → GPIO, Eingang/Ausgang/Analog/PWM), Busse
  (KNX, SB-Debug, I²C, UART, SPI) und Programmiertaste; als Kopie lässt sich eine eigene
  Plattform anlegen, bearbeiten, exportieren und importieren. Blöcke, für
  die der Plattform Pins oder Busse fehlen, sind in der Liste ausgegraut
- **Rechtsklick** (Finger: lange antippen) öffnet ein Menü: auf einem Block
  Eigenschaften, Umbenennen, Duplizieren, Verbindungen lösen, Löschen; auf einem
  Port Verbinden ohne Ziehen; auf der freien Fläche Block einfügen, Zoom
- Rückgängig/Wiederholen über die Pfeile neben dem Gerätenamen, Strg+Z und
  Strg+Y (Strg+Umschalt+Z) oder das Menü der Fläche; Tippen in einem Feld zählt
  als ein Schritt
- „Beispiel laden…“: Treppenhaus-Taster, Licht-Taster, Raumsensor,
  Out8 Energy Storage (wie ABB SA/S 8.16.2.1) und Tasterinterface 4f LED
  (wie MDT BE-04001.01, Eingang oder LED-Ausgang am selben Pin)
- Unten die erzeugten Dateien zur Ansicht, rechts unten die Prüfung mit
  geschätztem Flash und RAM des Chips (sblib eingerechnet). Die
  Trennstege zwischen den Bereichen lassen sich ziehen (Doppelklick: zurück)
- Kopfleiste: Sprache (Deutsch/Englisch) und Darstellung (hell, dunkel,
  automatisch) wie in SB-Project
- Tablet/Handy: Blockliste (links) und Eigenschaften (rechts) als Schubladen
  über die Knöpfe in der Kopfleiste, Datei und Export im Menü ⋮;
  zwei Finger zoomen

## Export

| Knopf | Ergebnis |
|---|---|
| Firmware | ZIP mit `CMakeLists.txt`, `build.sh`, `build.cmd`, `src/` |
| knxprod | Produktdatenbank (unsigniert) |
| Alles exportieren | beides in einem ZIP |

Bauen der Firmware: siehe `README.md` im exportierten Ordner. Kurz:

```sh
MCUXPRESSO_TOOLCHAIN_PATH=/usr/local/mcuxpressoide-25.6.136/ide/tools ./build.sh
```

### Debug-Ausgaben

Der Block **Debug-Ausgabe** gibt Werte aus dem laufenden Programm als Zeilen
`Zeit(ms) Block: Name = Wert` aus. Übersetzt wird er nur im Debug-Build
(`./build.sh Debug`, im Release mit `-DSBS_DEBUG=ON`), sonst kostet er nichts.

- **UART am SB-Debug** (ISP-TXD, PIO1_7 = IO14): USB-Seriell-Adapter am
  SB-Debug-Anschluss, z. B. `picocom -b 115200 /dev/ttyUSB0`. IO14 ist dann
  belegt.
- **SWD (RTT)**: Ringpuffer im RAM (256 Byte, Zeichen gehen verloren, wenn
  er voll ist), den der Debugger ohne Anhalten liest, z. B.
  `pyocd rtt -t lpc1114`, OpenOCD `rtt setup`/`rtt server` oder der
  J-Link RTT Viewer.

**Zusatzinfos der Blöcke** (Auswahl am Debug-Block: aus, alle Blöcke oder
nur Blöcke, deren Name einen Filterbegriff enthält, z. B. `Ausgang A`):
Die Blöcke melden dann selbst wichtige Ereignisse über dieselbe Ausgabe –
empfangene KOs, Relais schaltet bzw. pulst, Haltestrom, Kettenfehler des
Schieberegisters, Busspannungsausfall, Sichern und Laden des dauerhaften
Speichers (mit Flash-Seite), aktive Prioritätsstufe, Treppenlicht-Phase,
Schwellwert-Bereich, Preset, Schaltzeit, Startwert und Sensorwerte bzw.
-fehler. Im Release steht davon nichts im Code; im Debug-Build kostet
„alle Blöcke“ bei großen Geräten viel Flash (Out8: etwa doppelt so viel
Code), der Filter hält das klein. Eigene Blöcke melden sich mit
`c.trace('was', ausdruck)`.

Was in eigenem Code (Skript-Block) und in neuen Blocktypen alles zur
Verfügung steht – Befehle, Hooks, Kontext `c`, sblib-Funktionen –, steht in
[docs/BLOECKE.md](docs/BLOECKE.md).

Maske ist BIM112 (0x0701). Die knxprod bringt ihre Ladeprozedur selbst mit
und braucht keine `knx_master.xml`; wer sie beilegen will, wählt sie in den
Geräteeinstellungen.

## Aufbau

| Datei | Inhalt |
|---|---|
| [js/i18n.js](js/i18n.js), [js/lang-en.js](js/lang-en.js) | Sprachumschaltung (deutscher Text als Schlüssel), englische Tabelle |
| [js/blocks.js](js/blocks.js) | Blockbibliothek, DPTs, Chips und Hardware-Plattformen |
| [js/model.js](js/model.js) | Gerätemodell, Resolver (KO-Nummern, Parameter-Layout, Prüfungen) |
| [js/gen-firmware.js](js/gen-firmware.js) | C++/CMake-Generator für die sblib |
| [js/gen-knxprod.js](js/gen-knxprod.js) | knxprod-Generator |
| [js/editor.js](js/editor.js) | SVG-Graph-Editor |
| [js/app.js](js/app.js) | Oberfläche |
| [js/examples.js](js/examples.js) | Beispiele |
| [runtime/lpc11xx/](runtime/lpc11xx/) | Start-up-Code, `_sbrk`/`abort`, Linkerskript ohne NXP-Dateien – nach Änderungen `node tools/embed-runtime.js` |

## Tests

```sh
node test/run.js                 # Generatoren, Konsistenz Firmware ↔ knxprod
node test/ui-smoke.js            # Oberfläche ohne Browser (Laufzeitfehler, Menüs, Englisch)
node test/i18n.js                # jede Übersetzung vorhanden, Platzhalter passen
test/compile.sh                  # erzeugten C++-Code mit g++ gegen die sblib prüfen
node test/simulate.js            # erzeugte Logik am PC ausführen (Teil von compile.sh)
node test/sb-project.js          # knxprod mit SB-Project importieren, Downloadplan prüfen
```

## Lizenz

GPL-3.0, wie sblib und SB-Project.
