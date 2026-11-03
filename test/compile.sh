#!/bin/sh
# Übersetzungstest ohne ARM-Toolchain: erzeugt die Beispiele und prüft
# app_main.cpp mit dem Host-g++ gegen die sblib-Header (CPU-Emulation),
# Start-up-Code und Stubs gegen die CMSIS-Header.
#
#   SB_PATH_TO_SBLIB_REPO=../software-arm-incubation/software-arm-lib test/compile.sh
#
# NODE überschreibt den Node-Aufruf (z. B. Electron mit ELECTRON_RUN_AS_NODE=1).
set -e
cd "$(dirname "$0")/.."
: "${SB_PATH_TO_SBLIB_REPO:=../software-arm-incubation/software-arm-lib}"
: "${NODE:=node}"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

$NODE test/run.js "$OUT"
for main in "$OUT"/*/src/app_main.cpp; do
    echo "g++ $main"
    g++ -std=c++17 -fsyntax-only -Wall -Wextra -Werror \
        -D__LPC11XX__ -DIAP_EMULATION \
        -I"$SB_PATH_TO_SBLIB_REPO/sblib/inc" -I"$SB_PATH_TO_SBLIB_REPO/test/sblib/cpu-emu" \
        "$main"
done
# Start-up-Code und Stubs: einmal reicht, sie sind in jedem Export gleich
for f in "$OUT"/$(ls "$OUT" | head -1)/src/startup_lpc11xx.cpp "$OUT"/$(ls "$OUT" | head -1)/src/libc_stubs.cpp; do
    echo "g++ $f"
    g++ -std=c++17 -fsyntax-only -Wall -Wextra -Werror \
        -D__LPC11XX__ -D__NEWLIB__ \
        -I"$SB_PATH_TO_SBLIB_REPO/vendor/CMSIS_CORE_LPC11xx/inc" -I"$SB_PATH_TO_SBLIB_REPO/sblib/inc" \
        "$f"
done
echo "Übersetzung in Ordnung"
# Verhalten: erzeugte Logik am PC ausführen (Tasten, Dimmer …)
$NODE test/simulate.js
