/* Mitgelieferte Beispiele. Als JS statt JSON, damit sie auch über file://
   ladbar sind (fetch ist dort gesperrt). */
SBS.examples = [
  { name: 'Treppenhaus-Taster', model: {
    "format": "sb-studio/1",
    "device": {
      "name": "Treppenhaus-Taster",
      "orderNumber": "SBS-TH-01",
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
      { "id": "n1", "type": "di", "x": 60, "y": 80, "label": "Taster",
        "props": { "pin": "PIN_IO1", "pullup": true, "invert": true },
        "params": { "debounce": 50 }, "fixed": {}, "kos": {} },
      { "id": "n2", "type": "ko_in", "x": 60, "y": 230, "label": "Bewegung",
        "props": { "name": "Bewegungsmelder", "dpt": "1.001", "readInit": false },
        "params": {}, "fixed": {}, "kos": {} },
      { "id": "n3", "type": "or", "x": 320, "y": 140, "label": "",
        "props": { "count": 2, "invert": false },
        "params": {}, "fixed": {}, "kos": {} },
      { "id": "n4", "type": "staircase", "x": 540, "y": 140, "label": "Treppenlicht",
        "props": {}, "params": { "time": 180, "offEarly": 0 }, "fixed": {}, "kos": {} },
      { "id": "n5", "type": "do", "x": 800, "y": 60, "label": "Relais",
        "props": { "pin": "PIN_IO2", "invert": false, "initial": false },
        "params": {}, "fixed": {}, "kos": {} },
      { "id": "n6", "type": "ko_out", "x": 800, "y": 220, "label": "Status",
        "props": { "name": "Licht Status", "dpt": "1.001" },
        "params": { "mode": 0, "cycle": 0 }, "fixed": { "mode": true }, "kos": {} },
      { "id": "n7", "type": "ko_in", "x": 60, "y": 400, "label": "Temperatur",
        "props": { "name": "Außentemperatur", "dpt": "9.001", "readInit": true },
        "params": {}, "fixed": {}, "kos": {} },
      { "id": "n8", "type": "threshold", "x": 320, "y": 400, "label": "Frost",
        "props": {}, "params": { "thr": 300, "hyst": 50 }, "fixed": {}, "kos": {} },
      { "id": "n9", "type": "not", "x": 540, "y": 400, "label": "",
        "props": {}, "params": {}, "fixed": {}, "kos": {} },
      { "id": "n10", "type": "ko_out", "x": 800, "y": 400, "label": "Frostalarm",
        "props": { "name": "Frostalarm", "dpt": "1.001" },
        "params": { "mode": 0, "cycle": 600 }, "fixed": {}, "kos": {} }
    ],
    "links": [
      { "from": ["n1", "out"], "to": ["n3", "i0"] },
      { "from": ["n2", "out"], "to": ["n3", "i1"] },
      { "from": ["n3", "out"], "to": ["n4", "trig"] },
      { "from": ["n4", "out"], "to": ["n5", "in"] },
      { "from": ["n4", "out"], "to": ["n6", "in"] },
      { "from": ["n7", "out"], "to": ["n8", "in"] },
      { "from": ["n8", "out"], "to": ["n9", "in"] },
      { "from": ["n9", "out"], "to": ["n10", "in"] }
    ]
  }
  },
  { name: 'Licht-Taster', model: {
    "format": "sb-studio/1",
    "device": {
      "name": "Licht-Taster", "orderNumber": "SBS-LT-01", "manufacturer": 250,
      "appNumber": 41729, "appVersion": 16, "hwSerial": "0002", "hwVersion": 0,
      "busCurrent": 10, "mcu": "lpc1115",
      "sblibPath": "../../software-arm-incubation/software-arm-lib"
    },
    "nodes": [
      { "id": "n1", "type": "di", "x": 60, "y": 60, "label": "Taster",
        "props": { "pin": "PIN_IO1", "pullup": true, "invert": true }, "params": { "debounce": 30 } },
      { "id": "n2", "type": "toggle", "x": 300, "y": 60, "label": "" },
      { "id": "n3", "type": "ko_out", "x": 560, "y": 40, "label": "Schalten",
        "props": { "name": "Licht schalten", "dpt": "1.001" }, "params": { "mode": 1, "cycle": 0 } },
      { "id": "n4", "type": "ko_in", "x": 60, "y": 200, "label": "Status",
        "props": { "name": "Licht Status", "dpt": "1.001", "readInit": true } },
      { "id": "n5", "type": "do", "x": 560, "y": 200, "label": "Status-LED",
        "props": { "pin": "PIN_INFO", "invert": false, "initial": false } },
      { "id": "n6", "type": "di", "x": 60, "y": 330, "label": "Fensterkontakt",
        "props": { "pin": "PIN_IO2", "pullup": true, "invert": false }, "params": { "debounce": 200 },
        "fixed": { "debounce": true } },
      { "id": "n7", "type": "and", "x": 300, "y": 330, "label": "Lüften",
        "props": { "count": 2, "invert": false } },
      { "id": "n8", "type": "delay", "x": 560, "y": 330, "label": "",
        "params": { "on": 60, "off": 0 } },
      { "id": "n9", "type": "ko_out", "x": 800, "y": 330, "label": "Heizung sperren",
        "props": { "name": "Heizung sperren", "dpt": "1.001" } },
      { "id": "n10", "type": "start", "x": 60, "y": 480, "label": "" },
      { "id": "n11", "type": "const", "x": 300, "y": 480, "label": "Sollwert",
        "params": { "value": 2100 } },
      { "id": "n12", "type": "ko_out", "x": 560, "y": 480, "label": "Sollwert",
        "props": { "name": "Sollwert Komfort", "dpt": "9.001" } },
      { "id": "n13", "type": "xor", "x": 800, "y": 160, "label": "Abweichung",
        "props": { "count": 3, "invert": true } }
    ],
    "links": [
      { "from": ["n1", "out"], "to": ["n2", "trig"] },
      { "from": ["n2", "out"], "to": ["n3", "in"] },
      { "from": ["n4", "out"], "to": ["n2", "set"] },
      { "from": ["n4", "out"], "to": ["n5", "in"] },
      { "from": ["n6", "out"], "to": ["n7", "i0"] },
      { "from": ["n4", "out"], "to": ["n7", "i1"] },
      { "from": ["n7", "out"], "to": ["n8", "in"] },
      { "from": ["n8", "out"], "to": ["n9", "in"] },
      { "from": ["n10", "out"], "to": ["n11", "trig"] },
      { "from": ["n11", "out"], "to": ["n12", "in"] },
      { "from": ["n2", "out"], "to": ["n13", "i0"] },
      { "from": ["n4", "out"], "to": ["n13", "i1"] },
      { "from": ["n6", "out"], "to": ["n13", "i2"] }
    ]
  }
  }
];
