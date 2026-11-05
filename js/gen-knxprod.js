/* ============================================================
   knxprod-Generator (unsigniert)
   Hardware.xml, Catalog.xml und das Applikationsprogramm für BIM112
   (MV-0701) mit eigener Ladeprozedur (ProductProcedure) in feste
   Segmente — nach dem Muster der Selfbus-BIM112-Applikationen. Die
   knx_master.xml wird dafür nicht gebraucht; wer sie hat, legt sie bei.
   ============================================================ */
SBS.knxprod = (function () {
'use strict';

const NS_DEFAULT = 'http://knx.org/xml/project/20';
const LANG = 'de-DE';

const hex = (v, w) => Number(v).toString(16).toUpperCase().padStart(w, '0');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* Zeichen außerhalb von [A-Za-z0-9] kodiert die ETS in Ids als .XX */
const idPart = s => String(s).replace(/[^A-Za-z0-9]/g, ch => '.' + hex(ch.charCodeAt(0), 2));

const FLAGS = { C: 'CommunicationFlag', R: 'ReadFlag', W: 'WriteFlag', T: 'TransmitFlag', U: 'UpdateFlag', I: 'ReadOnInitFlag' };

function ids(dev) {
  const m = `M-${hex(dev.manufacturer, 4)}`;
  const appTail = `${hex(dev.appNumber, 4)}-${hex(dev.appVersion, 2)}-0000`;
  const app = `${m}_A-${appTail}`;
  const hw = `${m}_H-${idPart(String(dev.hwSerial).toUpperCase())}-${Number(dev.hwVersion) || 0}`;
  const prod = `${hw}_P-${idPart(dev.orderNumber)}`;
  const h2p = `${hw}_HP-${appTail}`;
  const seg = a => `${app}_AS-${hex(a, 4)}`;
  return { m, app, hw, prod, h2p, seg,
           cat: `${h2p}_CI-${idPart(dev.orderNumber)}-1`, section: `${m}_CS-1` };
}

const head = ns => `<?xml version="1.0" encoding="utf-8"?>\n<KNX xmlns="${ns}" CreatedBy="SB-Studio" ToolVersion="0.1">`;

function hardware(res, ns) {
  const d = res.device, i = ids(d);
  return `${head(ns)}
  <ManufacturerData>
    <Manufacturer RefId="${i.m}">
      <Hardware>
        <Hardware Id="${i.hw}" Name="${esc(d.name)}" SerialNumber="${esc(d.hwSerial)}" VersionNumber="${Number(d.hwVersion) || 0}" BusCurrent="${Number(d.busCurrent) || 10}" HasIndividualAddress="true" HasApplicationProgram="true">
          <Products>
            <Product Id="${i.prod}" Text="${esc(d.name)}" OrderNumber="${esc(d.orderNumber)}" IsRailMounted="false" DefaultLanguage="${LANG}" />
          </Products>
          <Hardware2Programs>
            <Hardware2Program Id="${i.h2p}" MediumTypes="MT-0">
              <ApplicationProgramRef RefId="${i.app}" />
            </Hardware2Program>
          </Hardware2Programs>
        </Hardware>
      </Hardware>
    </Manufacturer>
  </ManufacturerData>
</KNX>
`;
}

function catalog(res, ns) {
  const d = res.device, i = ids(d);
  return `${head(ns)}
  <ManufacturerData>
    <Manufacturer RefId="${i.m}">
      <Catalog>
        <CatalogSection Id="${i.section}" Name="SB-Studio" Number="1" DefaultLanguage="${LANG}">
          <CatalogItem Id="${i.cat}" Name="${esc(d.name)}" Number="1" ProductRefId="${i.prod}" Hardware2ProgramRefId="${i.h2p}" DefaultLanguage="${LANG}" />
        </CatalogSection>
      </Catalog>
    </Manufacturer>
  </ManufacturerData>
</KNX>
`;
}

/* Konfigurationsoktett der KO-Tabelle (03/05/01 4.18.3.1.2): Bit 7
   Aktualisieren, 6 Senden, 4 Schreiben, 3 Lesen, 2 Kommunikation, 1–0
   Priorität (3 = niedrig). Die ETS und SB-Project setzen es beim Laden
   aus den Flags des Projekts neu; hier steht die Vorgabe. */
function configByte(flags) {
  const f = c => flags.includes(c);
  return (f('U') ? 0x80 : 0) | (f('T') ? 0x40 : 0) | (f('W') ? 0x10 : 0)
    | (f('R') ? 0x08 : 0) | (f('C') ? 0x04 : 0) | 0x03;
}

/* KO-Tabelle der BCU2/BIM112: Anzahl, Zeiger auf die RAM-Flags, dann je
   Objekt Wertzeiger, Konfiguration, Typ. Zeiger in Big Endian, wie die
   sblib sie liest. */
function comTable(lay) {
  const b = [lay.comTab.count, lay.flags >> 8, lay.flags & 0xFF];
  lay.objects.forEach(o => b.push(o.ram >> 8, o.ram & 0xFF, o.ko ? configByte(o.ko.def.flags) : 0, o.type));
  return b;
}

/* Bezeichnung als Text; Arrays [Vorlage, Teile …] wie bei t(), aber deutsch */
const de = s => s && typeof s === 'object' && !Array.isArray(s) ? String(s.raw)
  : Array.isArray(s) ? String(s[0]).replace(/\{(\d+)\}/g, (m, i) => de(s[+i + 1])) : String(s);

/* Vorgabewerte der ETS-Parameter, Big Endian wie getUInt16() */
function paramImage(res) {
  const b = new Array(res.layout.params.size).fill(0);
  res.params.filter(p => !p.fixed).forEach(p => {
    for (let i = 0; i < p.size; i++) b[p.offset + i] = (p.value >>> (8 * (p.size - 1 - i))) & 0xFF;   // big endian
  });
  return b;
}

const base64 = bytes => btoa(String.fromCharCode.apply(null, bytes));

function application(res, ns) {
  const d = res.device, i = ids(d), B = SBS.blocks, mk = res.mask, lay = res.layout;
  const ets = res.params.filter(p => !p.fixed);
  const L = [];
  const add = (n, s) => L.push('  '.repeat(n) + s);

  /* Parametertypen je Knoten und Parameter: so bleiben Grenzen und
     Aufzählungen genau, wie der Block sie definiert. */
  const ptId = p => `${i.app}_PT-${p.name}`;
  const pId = (p, k) => `${i.app}_P-${k + 1}`;
  const oId = k => `${i.app}_O-${k.number}`;
  /* Varianten einer Nummer (alt > 0) bekommen eigene Refs mit Größe und DPT */
  const rId = k => `${oId(k)}_R-${k.alt ? 10000 * k.alt + k.number : k.number}`;

  const segAddr = { addr: mk.addrTab.addr, assoc: mk.assocTab.addr, com: lay.comTab.addr,
                    params: lay.params.addr, ram: lay.ram.addr };
  const seg = key => i.seg(segAddr[key]);

  add(0, head(ns));
  add(1, '<ManufacturerData>');
  add(2, `<Manufacturer RefId="${i.m}">`);
  add(3, '<ApplicationPrograms>');
  add(4, `<ApplicationProgram Id="${i.app}" ApplicationNumber="${d.appNumber}" ApplicationVersion="${d.appVersion}" ProgramType="ApplicationProgram" MaskVersion="${res.mcu.mask}" Name="${esc(d.name)}" LoadProcedureStyle="ProductProcedure" PeiType="0" DefaultLanguage="${LANG}" DynamicTableManagement="false" Linkable="false" MinEtsVersion="5.0">`);
  add(5, '<Static>');
  add(6, '<Code>');
  add(7, `<AbsoluteSegment Id="${seg('addr')}" Address="${mk.addrTab.addr}" Size="${mk.addrTab.size}" MemoryType="EEPROM" />`);
  add(7, `<AbsoluteSegment Id="${seg('assoc')}" Address="${mk.assocTab.addr}" Size="${mk.assocTab.size}" MemoryType="EEPROM" />`);
  add(7, `<AbsoluteSegment Id="${seg('com')}" Address="${lay.comTab.addr}" Size="${lay.comTab.size}" MemoryType="EEPROM">`);
  add(8, `<Data>${base64(comTable(lay))}</Data>`);
  add(7, '</AbsoluteSegment>');
  add(7, `<AbsoluteSegment Id="${seg('params')}" Address="${lay.params.addr}" Size="${lay.params.size}" MemoryType="EEPROM">`);
  add(8, `<Data>${base64(paramImage(res))}</Data>`);
  add(7, '</AbsoluteSegment>');
  add(7, `<AbsoluteSegment Id="${seg('ram')}" Address="${lay.ram.addr}" Size="${lay.ram.size}" MemoryType="RAM" />`);
  add(6, '</Code>');

  if (ets.length) {
    add(6, '<ParameterTypes>');
    ets.forEach(p => {
      const t = B.PTYPE[p.def.type];
      add(7, `<ParameterType Id="${ptId(p)}" Name="${esc(p.name)}">`);
      if (p.def.type === 'enum') {
        add(8, `<TypeRestriction Base="Value" SizeInBit="${t.size * 8}">`);
        p.def.options.forEach(([v, text]) =>
          add(9, `<Enumeration Text="${esc(de(text))}" Value="${v}" Id="${ptId(p)}_EN-${v}" />`));
        add(8, '</TypeRestriction>');
      } else {
        const min = p.def.min !== undefined ? p.def.min : t.min;
        const max = p.def.max !== undefined ? p.def.max : t.max;
        const kind = p.def.type === 'i16' || p.def.type === 'i32' ? 'signedInt' : 'unsignedInt';
        add(8, `<TypeNumber SizeInBit="${t.size * 8}" Type="${kind}" minInclusive="${min}" maxInclusive="${max}" />`);
      }
      add(7, '</ParameterType>');
    });
    add(6, '</ParameterTypes>');

    add(6, '<Parameters>');
    ets.forEach((p, k) => {
      const text = p.def.unit ? `${de(p.def.label)} (${p.def.unit})` : de(p.def.label);
      add(7, `<Parameter Id="${pId(p, k)}" Name="${esc(p.name)}" ParameterType="${ptId(p)}" Text="${esc(text)}" Value="${p.value}">`);
      add(8, `<Memory CodeSegment="${seg('params')}" Offset="${p.offset}" BitOffset="0" />`);
      add(7, '</Parameter>');
    });
    add(6, '</Parameters>');

    add(6, '<ParameterRefs>');
    ets.forEach((p, k) => add(7, `<ParameterRef Id="${pId(p, k)}_R-${k + 1}" RefId="${pId(p, k)}" />`));
    add(6, '</ParameterRefs>');
  }

  if (res.kos.length) {
    add(6, `<ComObjectTable CodeSegment="${seg('com')}" Offset="0">`);
    res.kos.filter(k => !k.alt).forEach(k => {
      const f = k.def.flags;
      const flags = Object.entries(FLAGS).map(([c, a]) => `${a}="${f.includes(c) ? 'Enabled' : 'Disabled'}"`).join(' ');
      add(7, `<ComObject Id="${oId(k)}" Name="${esc(k.def.text)}" Text="${esc(k.def.text)}" Number="${k.number}" FunctionText="${esc(k.def.func)}" ObjectSize="${k.dpt.size}" ${flags} DatapointType="${k.dpt.dpst}" />`);
    });
    add(6, '</ComObjectTable>');
    add(6, '<ComObjectRefs>');
    const multi = new Set(res.kos.filter(k => k.alt).map(k => k.number));
    res.kos.forEach(k => {
      if (!multi.has(k.number)) { add(7, `<ComObjectRef Id="${rId(k)}" RefId="${oId(k)}" />`); return; }
      const f = k.def.flags;
      const flags = Object.entries(FLAGS).map(([c, a]) => `${a}="${f.includes(c) ? 'Enabled' : 'Disabled'}"`).join(' ');
      add(7, `<ComObjectRef Id="${rId(k)}" RefId="${oId(k)}" Text="${esc(k.def.text)}" FunctionText="${esc(k.def.func)}" ObjectSize="${k.dpt.size}" ${flags} DatapointType="${k.dpt.dpst}" />`);
    });
    add(6, '</ComObjectRefs>');
  }

  add(6, `<AddressTable CodeSegment="${seg('addr')}" Offset="0" MaxEntries="${mk.addrTab.max}" />`);
  add(6, `<AssociationTable CodeSegment="${seg('assoc')}" Offset="0" MaxEntries="${mk.assocTab.max}" />`);

  /* Ladeprozedur: Load State Machines 1 Adresstabelle, 2 Assoziationen,
     3 Applikation. Das Task-Segment der Applikation nennt der sblib die
     KO-Tabelle (MASK0701: commsTabAddr). Memory-Type 3 = EEPROM, 2 = RAM. */
  const abs = (lsm, a, size, eeprom) =>
    add(8, `<LdCtrlAbsSegment LsmIdx="${lsm}" SegType="0" Address="${a}" Size="${size}" Access="${eeprom ? 255 : 0}" MemType="${eeprom ? 3 : 2}" SegFlags="${eeprom ? 128 : 0}" />`);
  const table = (lsm, a, size) => {
    add(8, `<LdCtrlLoad LsmIdx="${lsm}" />`);
    abs(lsm, a, size, true);
    add(8, `<LdCtrlTaskSegment LsmIdx="${lsm}" Address="${a}" />`);
    add(8, `<LdCtrlLoadCompleted LsmIdx="${lsm}" />`);
  };
  add(6, '<LoadProcedures>');
  add(7, '<LoadProcedure>');
  add(8, '<LdCtrlConnect />');
  [1, 2, 3].forEach(n => add(8, `<LdCtrlUnload LsmIdx="${n}" />`));
  table(1, mk.addrTab.addr, mk.addrTab.size);
  table(2, mk.assocTab.addr, mk.assocTab.size);
  add(8, '<LdCtrlLoad LsmIdx="3" />');
  abs(3, lay.ram.addr, lay.ram.size, false);
  abs(3, lay.comTab.addr, lay.comTab.size, true);
  abs(3, lay.params.addr, lay.params.size, true);
  add(8, `<LdCtrlTaskSegment LsmIdx="3" Address="${lay.comTab.addr}" />`);
  add(8, '<LdCtrlLoadCompleted LsmIdx="3" />');
  add(8, '<LdCtrlRestart />');
  add(8, '<LdCtrlDisconnect />');
  add(7, '</LoadProcedure>');
  add(6, '</LoadProcedures>');
  add(6, '<Options />');
  add(5, '</Static>');

  /* Dynamic: Blöcke außerhalb von Makros auf der Seite „Allgemein“, jede
     Makro-Instanz ein Kanal (verschachtelte eine Seite darin). Je Block eine
     Zwischenüberschrift; Bedingungen auf ETS-Auswahlen werden choose/when. */
  add(5, '<Dynamic>');
  const refOf = p => { const k = ets.indexOf(p); return `${pId(p, k)}_R-${k + 1}`; };
  const general = [], chans = new Map();
  res.nodes.filter(r => !r.etsHidden).forEach(r => {
    if (!ets.some(p => p.r === r) && !res.kos.some(k => k.r === r)) return;
    const n = r.node;
    if (!n._chan) { general.push({ r, prefix: '' }); return; }
    if (!chans.has(n._chan.id)) chans.set(n._chan.id, { name: n._chan.name, pages: new Map() });
    const pg = n._page || n._chan, pages = chans.get(n._chan.id).pages;
    if (!pages.has(pg.id)) pages.set(pg.id, { id: pg.id, name: pg.name, nodes: [] });
    pages.get(pg.id).nodes.push({ r, prefix: pg.prefix });
  });
  let pb = 0, ps = 0;
  const cKey = c => refOf(c.param) + '=' + c.values.join(' ');
  const condKey = (r, skip) => (r.guard || r.cond || []).slice(skip).map(cKey).join('&');
  const items = (list, d, skip) => {
    const isOpt = x => x.r.def.type === 'option';
    const sorted = list.filter(isOpt).concat(list.filter(x => !isOpt(x)));
    for (let k = 0; k < sorted.length;) {
      const key = condKey(sorted[k].r, skip), cond = (sorted[k].r.guard || sorted[k].r.cond || []).slice(skip);
      let j = k;
      while (j < sorted.length && condKey(sorted[j].r, skip) === key) j++;
      cond.forEach((c, x) => {
        add(d + 2 * x, `<choose ParamRefId="${refOf(c.param)}">`);
        add(d + 2 * x + 1, `<when test="${c.values.join(' ')}">`);
      });
      const e = d + 2 * cond.length;
      sorted.slice(k, j).forEach(({ r, prefix }) => {
        const own = ets.filter(p => p.r === r);
        const title = prefix && r.title.startsWith(prefix + ': ') ? r.title.slice(prefix.length + 2) : r.title;
        if (own.length && !isOpt({ r })) add(e, `<ParameterSeparator Id="${i.app}_PS-${++ps}" Text="${esc(title)}" />`);
        own.forEach(p => add(e, `<ParameterRefRef RefId="${refOf(p)}" />`));
        res.kos.filter(o => o.r === r).forEach(o => add(e, `<ComObjectRefRef RefId="${rId(o)}" />`));
      });
      cond.slice().reverse().forEach((c, x) => {
        const lvl = d + 2 * (cond.length - 1 - x);
        add(lvl + 1, '</when>');
        add(lvl, '</choose>');
      });
      k = j;
    }
  };
  /* Bedingungen, die für alles auf der Seite gelten (gebundene Makro-
     Instanz), blenden die ganze Seite aus statt eine leere zu zeigen */
  const page = (d, name, text, list) => {
    let pre = list[0].r.guard || list[0].r.cond || [];
    list.forEach(({ r }) => {
      const c = r.guard || r.cond || [];
      let k = 0;
      while (k < pre.length && k < c.length && cKey(pre[k]) === cKey(c[k])) k++;
      pre = pre.slice(0, k);
    });
    pre.forEach((c, x) => {
      add(d + 2 * x, `<choose ParamRefId="${refOf(c.param)}">`);
      add(d + 2 * x + 1, `<when test="${c.values.join(' ')}">`);
    });
    const e = d + 2 * pre.length;
    add(e, `<ParameterBlock Id="${i.app}_PB-${++pb}" Name="${esc(name)}" Text="${esc(text)}">`);
    items(list, e + 1, pre.length);
    add(e, '</ParameterBlock>');
    pre.slice().reverse().forEach((c, x) => {
      const lvl = d + 2 * (pre.length - 1 - x);
      add(lvl + 1, '</when>');
      add(lvl, '</choose>');
    });
  };
  if (general.length || !chans.size) {
    add(6, '<ChannelIndependentBlock>');
    if (general.length) page(7, 'General', 'Allgemein', general);
    else add(7, `<ParameterBlock Id="${i.app}_PB-${++pb}" Name="General" Text="Allgemein" />`);
    add(6, '</ChannelIndependentBlock>');
  }
  let ch = 0;
  chans.forEach(c => {
    ch++;
    add(6, `<Channel Id="${i.app}_CH-${ch}" Name="Ch${ch}" Number="${ch}" Text="${esc(c.name)}">`);
    c.pages.forEach(p => page(7, p.id, p.name, p.nodes));
    add(6, '</Channel>');
  });
  add(5, '</Dynamic>');
  add(4, '</ApplicationProgram>');
  add(3, '</ApplicationPrograms>');
  add(2, '</Manufacturer>');
  add(1, '</ManufacturerData>');
  add(0, '</KNX>');
  return L.join('\n') + '\n';
}

/* Liegt eine knx_master.xml bei, deren Namensraum übernehmen, damit alle
   Teile dasselbe Schema haben (die ETS prüft das beim Import). */
function namespaceOf(masterXml) {
  const m = masterXml && /<KNX[^>]*\sxmlns="([^"]+)"/.exec(masterXml.slice(0, 4000));
  return m ? m[1] : NS_DEFAULT;
}

/* Dateien der knxprod: { Pfad: Text } */
function files(res, masterXml) {
  const ns = namespaceOf(masterXml);
  const i = ids(res.device);
  const out = {};
  if (masterXml) out['knx_master.xml'] = masterXml;
  out[`${i.m}/Hardware.xml`] = hardware(res, ns);
  out[`${i.m}/Catalog.xml`] = catalog(res, ns);
  out[`${i.m}/${i.app}.xml`] = application(res, ns);
  return out;
}

return { files, ids, application, comTable, paramImage, namespaceOf, NS_DEFAULT };
})();
