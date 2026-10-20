(function (root) {
  'use strict';
  // Standards-compliant OOXML in a stored ZIP. Text is always literal inline text, never an Excel formula.
  const encoder = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  const escape = value => clean(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  function column(index) { let name = ''; for (let i = index + 1; i > 0; i = Math.floor((i - 1) / 26)) name = String.fromCharCode(65 + (i - 1) % 26) + name; return name; }
  function join(chunks) { const output = new Uint8Array(chunks.reduce((size, bytes) => size + bytes.length, 0)); let offset = 0; for (const bytes of chunks) { output.set(bytes, offset); offset += bytes.length; } return output; }
  function zip(files) {
    const local = [], directory = []; let offset = 0;
    for (const [name, content] of files) {
      const filename = encoder.encode(name), bytes = encoder.encode(content), crc = crc32(bytes);
      const head = new Uint8Array(30), h = new DataView(head.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 0x5021, true);
      h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, filename.length, true);
      const central = new Uint8Array(46), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 0x5021, true);
      c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true);
      local.push(head, filename, bytes); directory.push(central, filename); offset += head.length + filename.length + bytes.length;
    }
    const centralBytes = join(directory), tail = new Uint8Array(22), end = new DataView(tail.buffer);
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, centralBytes.length, true); end.setUint32(16, offset, true);
    return join([...local, centralBytes, tail]);
  }
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  function workbook(sheets) {
    if (!sheets.length || sheets.length > 30) throw new Error('Provide 1–30 worksheets.');
    const files = [];
    const sheetEntries = sheets.map((sheet, index) => {
      if (!sheet.name || sheet.name.length > 31 || /[\\/*?:\[\]]/.test(sheet.name) || sheets.slice(0, index).some(s => s.name.toLowerCase() === sheet.name.toLowerCase())) throw new Error('Invalid or duplicate Excel worksheet name.');
      if (!sheet.rows.length || sheet.rows.length > 50000) throw new Error('Worksheet requires a header and at most 50,000 rows.');
      const width = Math.max(...sheet.rows.map(row => row.length));
      if (width > 256) throw new Error('Too many Excel columns.');
      const rows = sheet.rows.map((row, r) => `<row r="${r + 1}">${row.map((value, col) => {
        const ref = `${column(col)}${r + 1}`, style = r === 0 ? 1 : (sheet.rowStyles?.[r] === 3 && sheet.decimalColumns?.includes(col) ? 4 : sheet.rowStyles?.[r]) || (sheet.decimalColumns?.includes(col) ? 2 : (typeof value === 'number' && !Number.isInteger(value) ? 2 : 0));
        if (value === null || value === undefined) return `<c r="${ref}" s="${style}"/>`;
        if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite value in export.'); return `<c r="${ref}" s="${style}"><v>${value}</v></c>`; }
        if (String(value).length > 32767) throw new Error('An export cell exceeds Excel’s 32,767-character limit.');
        return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
      }).join('')}</row>`).join('');
      files.push([`xl/worksheets/sheet${index + 1}.xml`, `${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${column(width - 1)}${sheet.rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${width}" width="24" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${column(width - 1)}${sheet.rows.length}"/></worksheet>`]);
      return `<sheet name="${escape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
    }).join('');
    files.push(['[Content_Types].xml', `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
    files.push(['_rels/.rels', `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
    files.push(['xl/workbook.xml', `${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`]);
    files.push(['xl/_rels/workbook.xml.rels', `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/styles.xml', `${declaration}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FFAD4936"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF148478"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF0E9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
    return zip(files);
  }
  root.ZiwoExcel = { workbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ZiwoExcel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
