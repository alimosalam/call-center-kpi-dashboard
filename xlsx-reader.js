(function (root) {
  'use strict';
  // Small, local OOXML reader: no dependencies, network requests, formula evaluation, or macros.
  const MAX_FILE = 10 * 1024 * 1024, MAX_EXPANDED = 50 * 1024 * 1024;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const error = message => { throw new Error(message); };
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function xml(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) error('XML document types/entities are not supported.');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) error('Invalid XML in XLSX workbook.');
    return doc;
  }
  const elements = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const first = (node, name) => elements(node, name)[0];
  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    if (bytes.length > MAX_FILE) error('File is too large. Maximum upload size is 10 MB.');
    if (bytes.length < 22) error('Not a valid XLSX file.');
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
    }
    if (end < 0) error('Invalid XLSX ZIP directory. Encrypted/legacy XLS files are not supported.');
    const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count === 65535 || offset === 0xffffffff) error('Multipart/ZIP64 workbooks are not supported.');
    if (count > 2000 || offset + size > end) error('Workbook ZIP directory exceeds supported limits.');
    const entries = new Map(); let pos = offset, total = 0;
    for (let i = 0; i < count; i++) {
      if (pos + 46 > offset + size || view.getUint32(pos, true) !== 0x02014b50) error('Damaged workbook ZIP directory.');
      const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true), packed = view.getUint32(pos + 20, true), expanded = view.getUint32(pos + 24, true);
      const length = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
      if (pos + 46 + length + extra + comment > offset + size) error('Damaged workbook entry.');
      const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + length));
      total += expanded;
      if (flags & 1) error('Password-protected workbooks are not supported. Save an unencrypted XLSX or CSV.');
      if (total > MAX_EXPANDED || expanded > 20 * 1024 * 1024) error('Expanded workbook is too large. Export a smaller reporting period.');
      if (entries.has(name)) error('Duplicate ZIP entries in workbook.');
      entries.set(name, { flags, method, crc, packed, expanded, local });
      pos += 46 + length + extra + comment;
    }
    return async name => {
      const entry = entries.get(name);
      if (!entry) error(`Missing XLSX component: ${name}.`);
      const { local, packed, expanded, method, crc } = entry;
      if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) error('Invalid workbook ZIP entry.');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      if (start + packed > offset) error('Truncated workbook ZIP entry.');
      const data = bytes.slice(start, start + packed); let output;
      if (method === 0) output = data;
      else if (method === 8) {
        let stream;
        try { stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
        catch { error('This browser cannot read compressed XLSX. Use a current Chrome, Edge, Firefox, or Safari, or upload CSV.'); }
        const reader = stream.getReader(), chunks = []; let length = 0;
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > expanded || length > MAX_EXPANDED) { await reader.cancel(); error('Workbook decompression exceeds declared size.'); } chunks.push(value); }
        } catch (e) { error(`Cannot decompress XLSX: ${e.message}`); }
        output = new Uint8Array(length); let at = 0; for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; }
      } else error('Unsupported workbook compression. Save as standard XLSX or CSV.');
      if (output.length !== expanded || crc32(output) !== crc) error('Workbook integrity check failed. Re-export the report.');
      return decoder.decode(output);
    };
  }
  function resolveTarget(target) {
    if (!target || /\\|:|\?|#/.test(target)) error('Invalid workbook worksheet path.');
    const parts = (target.startsWith('/') ? target.slice(1) : 'xl/' + target).split('/'), resolved = [];
    for (const part of parts) { if (part === '..') { if (!resolved.length) error('Invalid worksheet path.'); resolved.pop(); } else if (part && part !== '.') resolved.push(part); }
    return resolved.join('/');
  }
  async function readWorkbook(buffer) {
    const read = await unzip(buffer);
    const workbook = xml(await read('xl/workbook.xml'));
    const relationships = xml(await read('xl/_rels/workbook.xml.rels'));
    const rels = new Map(elements(relationships, 'Relationship').filter(r => r.getAttribute('TargetMode') !== 'External').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
    const date1904 = ['1', 'true'].includes(first(workbook, 'workbookPr')?.getAttribute('date1904'));
    const sheets = elements(workbook, 'sheet').map(sheet => ({ name: sheet.getAttribute('name'), path: resolveTarget(rels.get(sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))) }));
    if (!sheets.length || sheets.length > 30) error('Workbook must have between 1 and 30 worksheets.');
    let strings = [], styles = [];
    // Components are optional; missing ones use plain numeric/string values.
    try { strings = elements(xml(await read('xl/sharedStrings.xml')), 'si').map(si => elements(si, 't').map(t => t.textContent).join('')); }
    catch (e) { if (!e.message.startsWith('Missing XLSX component:')) throw e; }
    try {
      const doc = xml(await read('xl/styles.xml'));
      const custom = new Map(elements(doc, 'numFmt').map(n => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode')]));
      styles = [...(first(doc, 'cellXfs')?.children || [])].map(xf => {
        const id = Number(xf.getAttribute('numFmtId'));
        const code = (custom.get(id) || '').replace(/"[^"]*"|\\./g, '').toLowerCase();
        return { percent: [9, 10].includes(id) || code.includes('%'), time: [18, 19, 20, 21, 45, 46, 47].includes(id) || (!/[yd]/.test(code) && /[hs]/.test(code)), date: [14, 15, 16, 17, 22].includes(id) || /[yd]/.test(code) };
      });
    } catch (e) { if (!e.message.startsWith('Missing XLSX component:')) throw e; }
    async function readSheet(index) {
      const sheet = sheets[index]; if (!sheet) error('Select a valid worksheet.');
      const doc = xml(await read(sheet.path)), output = [];
      for (const row of elements(doc, 'row')) {
        if (output.length > root.Ziwo.MAX_ROWS) error('Workbook exceeds 20,000 daily rows.');
        const values = []; values.timeCells = new Set(); values.percentCells = new Set();
        let next = 0;
        for (const cell of elements(row, 'c')) {
          const ref = /^([A-Z]+)\d+$/.exec(cell.getAttribute('r') || '');
          const col = ref ? [...ref[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : next;
          if (col >= 256) error('Workbook exceeds the supported 256 columns.');
          next = col + 1;
          if (first(cell, 'f')) error(`Formula cell ${cell.getAttribute('r') || ''} is not supported. Export values only to avoid stale results.`);
          const type = cell.getAttribute('t'), raw = first(cell, 'v')?.textContent;
          const style = styles[Number(cell.getAttribute('s') || 0)] || {};
          let value = '';
          if (type === 's') { const n = Number(raw); if (!Number.isInteger(n) || n < 0 || n >= strings.length) error('Invalid shared string reference.'); value = strings[n]; }
          else if (type === 'inlineStr') value = elements(cell, 't').map(t => t.textContent).join('');
          else if (type === 'e') error(`Excel error in cell ${cell.getAttribute('r')}. Correct the workbook before uploading.`);
          else if (type === 'str') value = raw || '';
          else if (type === 'd') { if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.0+)?Z?)?$/.test(raw || '')) error('Unsupported Excel date value. Use date-only cells.'); value = raw.slice(0, 10); }
          else if (type === 'b') error('Boolean cells are not valid report values.');
          else if (raw !== undefined && raw !== '') {
            value = Number(raw); if (!Number.isFinite(value)) error('Invalid numeric workbook cell.');
            if (style.date && date1904) value += 1462;
            if (style.time) values.timeCells.add(col);
            if (style.percent) values.percentCells.add(col);
          }
          values[col] = value;
        }
        if (values.some(v => v !== '')) output.push(values);
      }
      return output;
    }
    return { sheets: sheets.map(s => s.name), readSheet };
  }
  root.ZiwoXlsx = { readWorkbook, MAX_FILE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
