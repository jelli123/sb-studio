/* ============================================================
   Firmware-Generator: sblib-Applikation für LPC1115 / BIM112
   Ergebnis ist ein CMake-Projekt mit build.sh und build.cmd.
   ============================================================ */
SBS.firmware = (function () {
'use strict';

const indent = (code, n = 1) => code.split('\n').map(l => l ? '    '.repeat(n) + l : l).join('\n');
const hex = (v, w) => '0x' + Number(v).toString(16).toUpperCase().padStart(w, '0');
const cstr = s => '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?') + '"';
/* Zusammengesetzte Texte ([Vorlage, Teile …], siehe i18n) deutsch ausschreiben;
   { raw } ist Text des Nutzers (Port eines Makros) */
const text = s => Array.isArray(s) ? String(s[0]).replace(/\{(\d+)\}/g, (m, i) => text(s[+i + 1]))
  : s && typeof s === 'object' && 'raw' in s ? String(s.raw) : String(s);
const comment = s => text(s).replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');

/* Projektname für Dateien und CMake: nur ASCII, keine Leerzeichen */
function slug(name) {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'sb-studio-device';
}

/* Kontext, über den ein Block seinen Code erzeugt (siehe blocks.js) */
function context(res, r) {
  const id = r.node.id;
  const ko = koId => {
    const k = res.kos.find(x => x.r === r && x.def.id === koId);
    if (!k) throw new Error(`${r.title}: KO ${koId} fehlt.`);
    return k;
  };
  return {
    id,
    v: name => `${id}_${name}`,
    prop: pid => r.node.props[pid],
    /* Pin-Eigenschaft: Makro aus app_config.h und was der GPIO kann. Nur für
       Pins des Chips (native); allgemein gehen output/input/write/read, die
       auch Pins eines Schieberegisters bedienen. */
    pin: pid => {
      const p = pinOf(res, r, pid);
      if (p.ext) throw new Error(`${r.title}: ${p.name} ist ein Schieberegister-Pin.`);
      return p.macro;
    },
    gpio: pid => pinOf(res, r, pid).info,
    output: (pid, level) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_write(${p.ext.bit}, ${level}); // ${p.name}`
        : `pinMode(${p.macro}, OUTPUT);\ndigitalWrite(${p.macro}, ${level});`;
    },
    input: (pid, pullup) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `// ${p.name}: liest der Schieberegister-Block` : `pinMode(${p.macro}, INPUT${pullup ? ' | PULL_UP' : ''});`;
    },
    write: (pid, expr) => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_write(${p.ext.bit}, ${expr});` : `digitalWrite(${p.macro}, ${expr});`;
    },
    read: pid => {
      const p = pinOf(res, r, pid);
      return p.ext ? `${p.ext.id}_read(${p.ext.bit})` : `digitalRead(${p.macro})`;
    },
    /* Bus-Eigenschaft: GPIO eines Signals (z. B. MOSI des gewählten SPI) */
    busPin: (pid, signal) => {
      const u = res.busUses.find(x => x.node === r.node && x.prop === pid);
      if (!u || !u.pins[signal]) throw new Error(`${r.title}: ${pid} ${signal} fehlt.`);
      return u.pins[signal];
    },
    param: pid => {
      const p = res.params.find(x => x.r === r && x.def.id === pid);
      if (!p) throw new Error(`${r.title}: Parameter ${pid} fehlt.`);
      return p.fixed ? String(p.value) : `${id}_p_${pid}`;
    },
    ko: koId => ko(koId).macro,
    koRead: koId => {
      const k = ko(koId), raw = `bcu.comObjects->objectRead(${k.macro})`;
      if (k.dpt.float) return `dpt9ToFloat(${raw})`;
      if (k.dpt.float4) return `dpt14ToHundredths(${raw})`;
      return `(int32_t) ${k.dpt.signed ? `(${SIGNED[k.dpt.signed]}) ` : ''}${raw}`;
    },
    koWrite: (koId, expr) => {
      const k = ko(koId);
      if (k.dpt.float) return `bcu.comObjects->objectWriteFloat(${k.macro}, ${expr});`;
      if (k.dpt.float4) return `bcu.comObjects->objectWrite(${k.macro}, dpt14FromHundredths(${expr}));`;
      return `bcu.comObjects->objectWrite(${k.macro}, (unsigned int) (${expr}));`;
    },
    /* Unverbundener Ausgang: Wert verwerfen, damit keine unbenutzte
       Variable übrig bleibt */
    linked: port => res.links.some(l => l.to === r && l.in.id === port),
    emit: (port, expr) => res.links
      .filter(l => l.from === r && l.out.id === port)
      .map(l => `${inputFn(l.to, l.in.id)}(${expr});`).join(' ') || `(void) (${expr});`
  };
}

function pinOf(res, r, pid) {
  const p = res.pins.find(x => x.node === r.node && x.prop === pid);
  if (!p) throw new Error(`${r.title}: Pin ${pid} fehlt.`);
  return p;
}

const SIGNED = { 1: 'int8_t', 2: 'int16_t', 4: 'int32_t' };
/* DPT 14 (IEEE 754, 4 Byte) ↔ Hundertstel wie bei DPT 9 */
const DPT14_LIB =
  '/* DPT 14: 4-Byte-Gleitkomma ↔ Hundertstel (wie dpt9ToFloat() der sblib) */\n' +
  'static unsigned int dpt14FromHundredths(int32_t v)\n' +
  '{\n' +
  '    float f = v / 100.0f;\n' +
  '    uint32_t u;\n' +
  '    memcpy(&u, &f, sizeof(u));\n' +
  '    return u;\n' +
  '}\n\n' +
  'static int32_t dpt14ToHundredths(uint32_t u)\n' +
  '{\n' +
  '    float f;\n' +
  '    memcpy(&f, &u, sizeof(f));\n' +
  '    f *= 100.0f;\n' +
  '    if (f > 2147483520.0f) return INT32_MAX;\n' +
  '    if (f < -2147483520.0f) return INT32_MIN;\n' +
  '    return (int32_t) (f < 0 ? f - 0.5f : f + 0.5f);\n' +
  '}';
const inputFn = (r, port) => `${r.node.id}_in_${port}`;

function appConfig(res) {
  const d = res.device;
  const out = [];
  out.push('/* Erzeugt von SB-Studio — nicht von Hand ändern. */');
  out.push('#ifndef APP_CONFIG_H_', '#define APP_CONFIG_H_', '');
  out.push(`#define MANUFACTURER ${hex(d.manufacturer, 4)} //!< Herstellernummer`);
  out.push(`#define DEVICETYPE   ${hex(d.appNumber, 4)} //!< Applikationsnummer`);
  out.push(`#define APPVERSION   ${hex(d.appVersion, 2)}   //!< Applikationsversion`);
  out.push('', '// Kommunikationsobjekte');
  res.kos.forEach(k => out.push(`#define ${k.macro.padEnd(20)} ${String(k.number).padStart(3)} //!< ${comment(k.def.text)} (${k.def.dpt}, ${k.r.title})`));
  if (res.pins.some(p => !p.ext)) {
    out.push('', `// Pins (Plattform ${comment(res.platform.name)}, ${res.mcu.name})`);
    res.pins.filter(p => !p.ext).forEach(p => {
      const r = res.byId.get(p.node.id);
      out.push(`#define ${p.macro.padEnd(20)} ${p.gpio.padEnd(7)} //!< ${comment(p.name)} (${r.title})`);
    });
  }
  out.push('', `// Parameter: Offset ab PARAM_BASE (${hex(res.layout.params.addr, 4)}, Segment der Applikation)`);
  res.params.filter(p => !p.fixed).forEach(p =>
    out.push(`#define PARAM_${p.name.toUpperCase().padEnd(20)} ${hex(p.offset, 4)} //!< ${p.size} Byte, ${comment(p.def.label)} (${p.r.title})`));
  out.push(`#define PARAM_BASE         ${hex(res.layout.params.addr, 4)}`);
  out.push(`#define PARAM_SEGMENT_SIZE ${hex(res.segmentSize, 4)}`);
  out.push('', '#endif /* APP_CONFIG_H_ */', '');
  return out.join('\n');
}

function appMain(res) {
  const d = res.device;
  const B = SBS.blocks;
  const ctx = new Map(res.nodes.map(r => [r, context(res, r)]));
  const gen = (r, key, ...args) => {
    const f = r.def.gen && r.def.gen[key];
    return f ? (f(ctx.get(r), ...args) || '').trim() : '';
  };
  /* DPT 14 braucht die Umrechnung und memcpy() */
  const float4 = res.kos.some(k => k.dpt.float4);
  /* Was mehrere Blöcke brauchen (Header, gemeinsame Initialisierung eines
     Timers …), steht nur einmal im Code */
  const once = key => [...new Set(res.nodes.flatMap(r => {
    const f = r.def.gen && r.def.gen[key];
    const v = typeof f === 'function' ? f(ctx.get(r)) : f;
    return (Array.isArray(v) ? v : [v]).filter(Boolean).map(x => x.trim());
  }))];
  const section = key => res.nodes
    .map(r => { const c = gen(r, key); return c ? `// ${comment(r.title)}\n${c}` : ''; })
    .filter(Boolean).join('\n');

  const name8 = slug(d.name).toUpperCase().replace(/-/g, '').slice(0, 8).padEnd(8, ' ');
  const out = [];
  out.push(
    '/*',
    ` * ${comment(d.name)} — Firmware für ${comment(res.platform.name)} (${res.mcu.name}), Maske ${res.mask.name}`,
    ' *',
    ' * Erzeugt von SB-Studio. Änderungen am Gerät bitte im Editor vornehmen',
    ' * und neu erzeugen, sonst gehen sie beim nächsten Export verloren.',
    ' *',
    ' * This program is free software; you can redistribute it and/or modify',
    ' * it under the terms of the GNU General Public License version 3 as',
    ' * published by the Free Software Foundation.',
    ' */',
    '',
    `#include <${res.mask.header}>`,
    '#include <sblib/eib/datapoint_types.h>',
    '#include <sblib/debounce.h>',
    '#include <sblib/digital_pin.h>',
    '#include <sblib/io_pin_names.h>',
    '#include <sblib/timeout.h>',
    '#include <sblib/timer.h>',
    '#include <sblib/version.h>',
    ...once('include').concat(float4 ? ['cstring'] : []).map(h => `#include <${h}>`),
    '#include "app_config.h"',
    '',
    `APP_VERSION(${cstr(name8)}, ${cstr(d.appVersion >> 4)}, ${cstr(d.appVersion & 0x0F)});`,
    '',
    `${res.mask.sblib} bcu = ${res.mask.sblib}();`,
    '',
    'static const uint8_t hardwareVersion[6] = { 0, 0, 0, 0, 0, 0 };',
    '',
    '/* Parameter liegen in einem festen Segment des User-EEPROM, das die',
    '   Ladeprozedur der knxprod beschreibt. */',
    'static uint8_t paramU8(uint32_t offset) { return bcu.userEeprom->getUInt8(PARAM_BASE + offset); }',
    'static uint16_t paramU16(uint32_t offset) { return bcu.userEeprom->getUInt16(PARAM_BASE + offset); }',
    ...(res.params.some(p => !p.fixed && p.def.type === 'i32')
      ? ['static int32_t paramI32(uint32_t offset) { return (int32_t) ((uint32_t) paramU16(offset) << 16 | paramU16(offset + 2)); }'] : []),
    ''
  );

  const etsParams = res.params.filter(p => !p.fixed);
  if (etsParams.length) {
    out.push('// ETS-Parameter');
    etsParams.forEach(p => out.push(`static ${B.PTYPE[p.def.type].ctype} ${p.r.node.id}_p_${p.def.id}; //!< ${comment(p.def.label)} (${comment(p.r.title)})`));
    out.push('');
  }

  const inputs = res.nodes.flatMap(r => r.inputs.map(p => [r, p]));
  if (inputs.length) {
    out.push('// Eingänge der Blöcke');
    inputs.forEach(([r, p]) => out.push(`static void ${inputFn(r, p.id)}(int32_t v);`));
    out.push('');
  }

  /* Hilfsfunktionen, die mehrere Blöcke teilen (einmal im Code) */
  const lib = (float4 ? [DPT14_LIB] : []).concat(once('lib'));
  if (lib.length) out.push('// Hilfsfunktionen der Blöcke', lib.join('\n\n'), '');

  const state = section('state');
  if (state) out.push('// Zustand der Blöcke', state, '');

  inputs.forEach(([r, p]) => {
    const body = gen(r, 'in', p.id);
    out.push(`// ${comment(r.title)}: ${comment(p.label)}`);
    out.push(`static void ${inputFn(r, p.id)}(${body ? '' : '[[maybe_unused]] '}int32_t v)`, '{');
    if (body) out.push(indent(body));
    out.push('}', '');
  });

  out.push('static void loadParams()', '{');
  etsParams.forEach(p => {
    const t = B.PTYPE[p.def.type];
    const cast = p.def.type === 'i16' ? '(int16_t) ' : '';
    out.push(`    ${p.r.node.id}_p_${p.def.id} = ${cast}${t.read}(PARAM_${p.name.toUpperCase()});`);
  });
  out.push('}', '');

  const fn = (name, body, args = 'void') => {
    out.push(`static void ${name}(${args})`, '{');
    if (body) out.push(indent(body));
    out.push('}', '');
  };
  fn('setupHardware', [once('shared').join('\n'), section('setup')].filter(Boolean).join('\n'));
  fn('initApplication', section('init'));

  const cases = res.kos.map(k => {
    const body = gen(k.r, 'ko', k.def.id);
    return body ? `case ${k.macro}:\n${indent(body)}\n    break;` : '';
  }).filter(Boolean);
  fn('objectUpdated', cases.length ? `switch (objno)\n{\n${indent(cases.concat('default:\n    break;').join('\n'))}\n}` : '',
     cases.length ? 'int objno' : '[[maybe_unused]] int objno');
  fn('checkPeriodic', section('loop'));

  out.push(
    '/**',
    ' * Wird von der sblib beim Start aufgerufen.',
    ' */',
    'BcuBase* setup()',
    '{',
    /* Programmiertaste/-LED: die sblib nimmt sonst PIN_PROG (PIO2_0) */
    ...(res.platform.prog === res.mcu.progDefault ? [] : res.platform.prog
      ? [`    bcu.setProgPin(${res.platform.prog});`]
      : ['    bcu.setProgPin(0); // keine Programmiertaste']),
    '    bcu.begin(MANUFACTURER, DEVICETYPE, APPVERSION);',
    '    bcu.setHardwareType(hardwareVersion, sizeof(hardwareVersion));',
    '    setupHardware();',
    '    return (&bcu);',
    '}',
    '',
    '/**',
    ' * Hauptschleife, solange eine Applikation geladen ist.',
    ' */',
    'void loop()',
    '{',
    '    static bool initialized = false;',
    '    if (!initialized)',
    '    {',
    '        loadParams();',
    '        initApplication();',
    '        initialized = true;',
    '    }',
    '',
    '    int objno;',
    '    while ((objno = bcu.comObjects->nextUpdatedObject()) >= 0)',
    '        objectUpdated(objno);',
    '',
    '    checkPeriodic();',
    '',
    '    // Bis zu 1 ms schlafen, wenn nichts zu tun ist',
    '    waitForInterrupt();',
    '}',
    '',
    '/**',
    ' * Hauptschleife, solange keine Applikation geladen ist.',
    ' */',
    'void loop_noapp()',
    '{',
    '}',
    ''
  );
  return out.join('\n');
}

function cmake(res) {
  const name = slug(res.device.name);
  const ver = `${res.device.appVersion >> 4}.${res.device.appVersion & 0x0F}`;
  return `# Erzeugt von SB-Studio — nicht von Hand ändern.
cmake_minimum_required(VERSION 3.28)
project(${name} LANGUAGES C CXX VERSION ${ver})

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(SB_PATH_TO_SBLIB_REPO "${res.device.sblibPath}" CACHE STRING "Pfad zum software-arm-lib-Repository, absolut oder relativ zu diesem Projekt")
cmake_path(ABSOLUTE_PATH SB_PATH_TO_SBLIB_REPO BASE_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}" NORMALIZE OUTPUT_VARIABLE SBLIB_REPO_DIR)

set(SBLPC_DIR "\${SBLIB_REPO_DIR}/vendor/CMSIS_CORE_LPC11xx")
set(SBLIB_PATH "\${SBLIB_REPO_DIR}/sblib")

if(NOT CMAKE_CROSSCOMPILING)
    message(FATAL_ERROR "Nur für ARM: mit -DCMAKE_TOOLCHAIN_FILE=<sblib>/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake konfigurieren (siehe build.sh / build.cmd).")
endif()
foreach(dir SBLPC_DIR SBLIB_PATH)
    if(NOT EXISTS "\${\${dir}}")
        message(FATAL_ERROR "\${dir} nicht gefunden: \${\${dir}} — SB_PATH_TO_SBLIB_REPO prüfen.")
    endif()
endforeach()

add_compile_definitions(
    __LPC11XX__
    $<$<CONFIG:Release>:NDEBUG>
    $<$<CONFIG:Debug>:DEBUG>
)

set(TARGET_ARM \${PROJECT_NAME}_arm)

# Speicher ${res.mcu.name}: Flash bis zum letzten Sektor (dort liegt das UserEeprom der sblib).
# Ohne Bootloader – die Variante für den Selfbus-Bootloader folgt später.
set(SBS_FLASH_ORIGIN "0x0")
set(SBS_FLASH_LENGTH "${hex(res.mcu.flashEnd, 4)}")
set(SBS_RAM_ORIGIN "0x10000000")
set(SBS_RAM_LENGTH "${hex(res.mcu.ram, 4)}")
set(SBS_LD_VARIANT "\${TARGET_ARM}")
set(LINKER_SCRIPT "\${CMAKE_CURRENT_BINARY_DIR}/linkscripts/\${TARGET_ARM}.ld")
configure_file(linkscripts/lpc1115.ld.in "\${LINKER_SCRIPT}" @ONLY)

# Start-up-Code und C-Bibliotheks-Stubs ohne NXP-Dateien (newlib-nano statt libcr)
add_executable(\${TARGET_ARM}
    src/app_main.cpp
    src/app_config.h
    src/startup_lpc11xx.cpp
    src/libc_stubs.cpp
)
set_target_properties(\${TARGET_ARM} PROPERTIES SUFFIX ".axf" LINK_DEPENDS "\${LINKER_SCRIPT}")

add_subdirectory(\${SBLIB_PATH} sblib)
add_subdirectory(\${SBLPC_DIR} CMSIS_CORE_LPC11xx)
target_include_directories(\${TARGET_ARM} PRIVATE \${SBLPC_DIR}/inc \${SBLIB_PATH}/inc)
target_compile_definitions(\${TARGET_ARM} PRIVATE __USE_CMSIS=CMSIS_CORE_LPC11xx __NEWLIB__ CORE_M0 CPP_USE_HEAP)
target_link_libraries(\${TARGET_ARM} PUBLIC sblib_arm CMSIS_CORE_LPC11xx_arm)

target_link_options(\${TARGET_ARM} PRIVATE
    # Mit LTO (Release) die Handler global halten, sonst ist DEFINED() im Linkerskript falsch
    # und die Prüfsumme für das Boot-ROM (__valid_user_code_checksum) stimmt nicht.
    -Wl,--undefined=NMI_Handler
    -Wl,--undefined=HardFault_Handler
    -T "\${LINKER_SCRIPT}"
    -Xlinker -Map=$<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.map
)

add_custom_command(TARGET \${TARGET_ARM} POST_BUILD
    COMMAND \${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:\${TARGET_ARM}> $<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.hex
    COMMAND \${CMAKE_OBJCOPY} -O binary $<TARGET_FILE:\${TARGET_ARM}> $<TARGET_FILE_DIR:\${TARGET_ARM}>/\${TARGET_ARM}.bin
    COMMAND \${CMAKE_SIZE} $<TARGET_FILE:\${TARGET_ARM}>
)
`;
}

function buildSh(res) {
  return `#!/bin/sh
# Baut die Firmware. Erzeugt von SB-Studio.
#
# Voraussetzungen: CMake >= 3.28, Ninja, MCUXpresso IDE >= 11.9 (arm-none-eabi)
#
#   MCUXPRESSO_TOOLCHAIN_PATH=/usr/local/mcuxpressoide-25.6.136/ide/tools ./build.sh [Release|Debug]
#
# SB_PATH_TO_SBLIB_REPO überschreibt den Pfad zum software-arm-lib-Repository.
set -e
cd "$(dirname "$0")"

: "\${SB_PATH_TO_SBLIB_REPO:=${res.device.sblibPath}}"
if [ -z "$MCUXPRESSO_TOOLCHAIN_PATH" ]; then
    echo "MCUXPRESSO_TOOLCHAIN_PATH ist nicht gesetzt, z. B. /usr/local/mcuxpressoide-25.6.136/ide/tools" >&2
    exit 1
fi
if [ ! -d "$SB_PATH_TO_SBLIB_REPO/sblib" ]; then
    echo "sblib nicht gefunden unter $SB_PATH_TO_SBLIB_REPO — SB_PATH_TO_SBLIB_REPO setzen." >&2
    exit 1
fi
SBLIB=$(cd "$SB_PATH_TO_SBLIB_REPO" && pwd)
BUILD_TYPE=\${1:-Release}

cmake -S . -B "build/$BUILD_TYPE" -G Ninja \\
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \\
    -DSB_PATH_TO_SBLIB_REPO="$SBLIB" \\
    -DCMAKE_TOOLCHAIN_FILE="$SBLIB/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake"
cmake --build "build/$BUILD_TYPE"

echo "Fertig: build/$BUILD_TYPE/${slug(res.device.name)}_arm.hex"
`;
}

function buildCmd(res) {
  const p = String(res.device.sblibPath).replace(/\//g, '\\');
  return `@echo off
rem Baut die Firmware. Erzeugt von SB-Studio.
rem
rem Voraussetzungen: CMake >= 3.28, Ninja, MCUXpresso IDE >= 11.9 (arm-none-eabi)
rem
rem   set MCUXPRESSO_TOOLCHAIN_PATH=C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools
rem   build.cmd [Release^|Debug]
rem
rem SB_PATH_TO_SBLIB_REPO ueberschreibt den Pfad zum software-arm-lib-Repository.
setlocal
cd /d "%~dp0"

if "%SB_PATH_TO_SBLIB_REPO%"=="" set "SB_PATH_TO_SBLIB_REPO=${p}"
if "%MCUXPRESSO_TOOLCHAIN_PATH%"=="" (
    echo MCUXPRESSO_TOOLCHAIN_PATH ist nicht gesetzt, z. B. C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools 1>&2
    exit /b 1
)
if not exist "%SB_PATH_TO_SBLIB_REPO%\\sblib" (
    echo sblib nicht gefunden unter %SB_PATH_TO_SBLIB_REPO% - SB_PATH_TO_SBLIB_REPO setzen. 1>&2
    exit /b 1
)
for %%I in ("%SB_PATH_TO_SBLIB_REPO%") do set "SBLIB=%%~fI"
set "SBLIB=%SBLIB:\\=/%"
set "BUILD_TYPE=%~1"
if "%BUILD_TYPE%"=="" set "BUILD_TYPE=Release"

cmake -S . -B "build/%BUILD_TYPE%" -G Ninja "-DCMAKE_BUILD_TYPE=%BUILD_TYPE%" "-DSB_PATH_TO_SBLIB_REPO=%SBLIB%" "-DCMAKE_TOOLCHAIN_FILE=%SBLIB%/cmake/toolchains/arm-none-eabi_mcuxpresso.cmake" || exit /b 1
cmake --build "build/%BUILD_TYPE%" || exit /b 1

echo Fertig: build\\%BUILD_TYPE%\\${slug(res.device.name)}_arm.hex
`;
}

function readme(res) {
  const d = res.device;
  const rows = res.kos.map(k => `| ${k.number} | ${k.def.text} | ${k.def.dpt} | ${k.def.flags} | ${k.r.title} |`);
  return `# ${d.name}

Firmware für ${res.mcu.name}, Maske ${res.mask.name}, erzeugt von SB-Studio.

| | |
|---|---|
| Hersteller | ${hex(d.manufacturer, 4)} |
| Applikation | ${hex(d.appNumber, 4)}, Version ${hex(d.appVersion, 2)} |
| Bestellnummer | ${d.orderNumber} |

## Bauen

Voraussetzungen: CMake ≥ 3.28, Ninja, MCUXpresso IDE ≥ 11.9 und das
Repository software-arm-lib (sblib). Der Pfad dazu ist auf
\`${d.sblibPath}\` voreingestellt und lässt sich mit
\`SB_PATH_TO_SBLIB_REPO\` überschreiben.

\`\`\`sh
MCUXPRESSO_TOOLCHAIN_PATH=/usr/local/mcuxpressoide-25.6.136/ide/tools ./build.sh
\`\`\`

\`\`\`bat
set MCUXPRESSO_TOOLCHAIN_PATH=C:\\nxp\\MCUXpressoIDE_25.6.136\\ide\\tools
build.cmd
\`\`\`

Ergebnis: \`build/Release/${slug(d.name)}_arm.hex\` (Flashen z. B. mit LinkServer
oder Flash Magic). Die Firmware wird ohne Bootloader gelinkt; der Code
reicht bis ${res.mcu.flashEnd.toString(16).toUpperCase()}h, der letzte Flash-Sektor gehört dem UserEeprom der sblib.

## Start-up-Code

Ohne NXP-Dateien: \`src/startup_lpc11xx.cpp\` (Vektortabelle, Reset-Handler,
Daten- und BSS-Initialisierung; Apache-2.0, auf Basis von CMSIS
\`startup_ARMCM0.c\`), \`src/libc_stubs.cpp\` (\`_sbrk\`, \`abort\` für
newlib-nano; GPL-3.0) und \`linkscripts/lpc1115.ld.in\` mit GNU-Symbolen.
Übernommen aus theportapps (out8-bcu1, Branch \`lpc/own-startup\`).

## Kommunikationsobjekte

| Nr. | Name | DPT | Flags | Block |
|---|---|---|---|---|
${rows.join('\n')}

Die zugehörige Produktdatenbank (\`.knxprod\`) liegt bei „Alles exportieren“
in diesem Ordner, sonst als eigene Datei.
`;
}

const GITIGNORE = `# Bauergebnisse von build.sh / build.cmd
build/

# Editoren und Betriebssysteme
.vscode/
.idea/
*.swp
*~
.DS_Store
Thumbs.db
`;

function files(res) {
  const runtime = SBS.runtime && SBS.runtime.lpc11xx;
  // ohne Start-up-Code ließe sich das Projekt nicht linken
  if (!runtime) throw new Error('js/runtime-lpc11xx.js nicht geladen — Seite neu laden (Strg+Umschalt+R)');
  return {
    ...runtime,
    'CMakeLists.txt': cmake(res),
    'build.sh': buildSh(res),
    'build.cmd': buildCmd(res).replace(/\n/g, '\r\n'),
    'README.md': readme(res),
    '.gitignore': GITIGNORE,
    'src/app_config.h': appConfig(res),
    'src/app_main.cpp': appMain(res)
  };
}

return { files, appMain, appConfig, cmake, slug };
})();
