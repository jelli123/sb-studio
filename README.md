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
- Block anklicken: Eigenschaften, ETS-Parameter, Kommunikationsobjekte rechts.
  Jeder Parameter lässt sich als „in der ETS einstellbar“ oder fest einkompiliert
  führen
- Leere Fläche anklicken: Geräteeinstellungen (Hersteller, Applikationsnummer,
  Pfad zur sblib, optional `knx_master.xml`)
- Unten die erzeugten Dateien zur Ansicht, rechts unten die Prüfung

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

Maske ist BIM112 (0x0701). Die knxprod bringt ihre Ladeprozedur selbst mit
und braucht keine `knx_master.xml`; wer sie beilegen will, wählt sie in den
Geräteeinstellungen.

## Aufbau

| Datei | Inhalt |
|---|---|
| [js/blocks.js](js/blocks.js) | Blockbibliothek, DPTs, MCU-Profile |
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
node test/ui-smoke.js            # Oberfläche ohne Browser (Laufzeitfehler)
test/compile.sh                  # erzeugten C++-Code mit g++ gegen die sblib prüfen
node test/sb-project.js          # knxprod mit SB-Project importieren, Downloadplan prüfen
```

## Lizenz

GPL-3.0, wie sblib und SB-Project.
