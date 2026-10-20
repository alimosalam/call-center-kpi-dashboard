(function (root) {
  'use strict';
  const COLUMNS = Object.freeze(['Day', 'Inbound Calls', 'SLA', 'Abandoned Calls', 'Average Talk Time for Queue Calls', 'Answered Queue Calls', 'Calls landed in IVR', 'Calls landed in Queue', 'Average Waiting Time in Queue', 'Answered Calls Before SLA Threshold', 'Abandoned Calls Before SLA Threshold']);
  const COUNT_FIELDS = { 'Inbound Calls': 'inbound', 'Abandoned Calls': 'abandoned', 'Answered Queue Calls': 'answered', 'Calls landed in IVR': 'ivr', 'Calls landed in Queue': 'queue', 'Answered Calls Before SLA Threshold': 'before', 'Abandoned Calls Before SLA Threshold': 'earlyAbandoned' };
  const FORMULAS = Object.freeze({ inbound: 'Answered before SLA ÷ inbound calls', 'inbound-adjusted': 'Answered before SLA ÷ (inbound calls − abandoned before SLA)', queue: 'Answered before SLA ÷ calls landed in queue', 'queue-adjusted': 'Answered before SLA ÷ (queue calls − abandoned before SLA)' });
  const DEFAULT_TARGETS = Object.freeze({ sla: 90, abandonment: 5, aht: 260 });
  const MAX_ROWS = 20000;
  function fail(message) { throw new Error(message); }
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    // Ziwo exports may use commas, semicolons, or tabs. Delimiter detection ignores quoted text.
    const first = text.split(/\r?\n/, 1)[0];
    const counts = { ',': 0, ';': 0, '\t': 0 }; let quoted = false;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && first[i] in counts) counts[first[i]]++;
    }
    const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = [], cell = '', state = 'plain';
    const endCell = () => { row.push(cell); cell = ''; state = 'plain'; };
    const endRow = () => { endCell(); rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) fail(`Maximum ${MAX_ROWS.toLocaleString()} report rows supported.`); };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (state === 'quoted') {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else state = 'closed'; }
        else cell += c;
      } else if (c === delimiter) endCell();
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else if (c === '"') { if (cell || state === 'closed') fail('Invalid CSV quoting. Export the report again.'); state = 'quoted'; }
      else { if (state === 'closed' && c.trim()) fail('Unexpected text after a quoted CSV value.'); if (state !== 'closed') cell += c; }
    }
    if (state === 'quoted') fail('Unclosed quote in CSV report.');
    if (row.length || cell || state === 'closed') endRow();
    return rows;
  }
  function numeric(value, label, integer = false) {
    if (typeof value === 'string') {
      value = value.trim();
      // Accept correctly grouped thousands, never guess decimal-comma notation.
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) value = value.replaceAll(',', '');
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) fail(`${label}: expected a non-negative number.`);
      value = Number(value);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) fail(`${label}: expected a non-negative ${integer ? 'whole number' : 'number'} within the safe range.`);
    return value;
  }
  function duration(value, label, excelTime = false) {
    if (excelTime && typeof value === 'number') return numeric(value, label) * 86400;
    if (typeof value === 'string') {
      value = value.trim();
      const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(value);
      if (clock) {
        const hours = Number(clock[1] || 0), minutes = Number(clock[2]), seconds = Number(clock[3]);
        if ((clock[1] && minutes >= 60) || seconds >= 60) fail(`${label}: invalid time; use HH:MM:SS, MM:SS, or seconds.`);
        return hours * 3600 + minutes * 60 + seconds;
      }
      if (/^\d+(?:\.\d+)?\s*(?:s|sec|seconds)$/i.test(value)) return numeric(value.replace(/\s*(s|sec|seconds)$/i, ''), label);
    }
    return numeric(value, label);
  }
  const iso = date => date.toISOString().slice(0, 10);
  function parseDate(value, format = 'dmy') {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 1 || value > 2958465 || value === 60) fail('Day: invalid Excel date serial.');
      return iso(new Date(Date.UTC(1899, 11, 31) + (value - (value > 60 ? 1 : 0)) * 86400000));
    }
    if (typeof value !== 'string') fail('Day: expected a date.');
    value = value.trim(); let y, m, d, match;
    if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value))) [, y, m, d] = match;
    else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value))) {
      y = match[3]; [d, m] = format === 'mdy' ? [match[2], match[1]] : [match[1], match[2]];
    } else fail('Day: use YYYY-MM-DD, DD/MM/YYYY (default), or select MM/DD/YYYY before upload.');
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (Number(y) < 1900 || Number(y) > 9999 || date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) fail(`Day: invalid date ${value}.`);
    return iso(date);
  }
  function normalizeRows(table, options = {}) {
    if (!Array.isArray(table) || table.length < 2) fail('The report needs a header row and at least one data row.');
    if (table.length > MAX_ROWS + 1) fail(`Maximum ${MAX_ROWS.toLocaleString()} report rows supported.`);
    const header = table[0].map(v => String(v ?? '').replace(/^\uFEFF/, '').trim());
    const missing = COLUMNS.filter(c => !header.includes(c));
    if (missing.length) fail(`Missing required columns: ${missing.join('; ')}.`);
    if (header.some((c, i) => c && header.indexOf(c) !== i)) fail('Duplicate column names found.');
    const index = Object.fromEntries(COLUMNS.map(c => [c, header.indexOf(c)]));
    const rows = [], seen = new Set();
    for (let r = 1; r < table.length; r++) {
      const raw = table[r];
      if (!raw.some(v => v !== null && v !== undefined && String(v).trim() !== '')) continue;
      if (raw.length > header.length && raw.slice(header.length).some(v => String(v ?? '').trim())) fail(`Row ${r + 1}: more values than column headers.`);
      const cell = key => raw[index[key]];
      try {
        const date = parseDate(cell('Day'), options.dateFormat);
        if (seen.has(date)) fail(`Duplicate Day ${date}. Export one row per day rather than combining overlapping reports.`);
        const item = { date, original: Object.freeze(Object.fromEntries(header.map((key, i) => [key, raw[i] ?? '']))) };
        for (const [column, key] of Object.entries(COUNT_FIELDS)) item[key] = numeric(cell(column), column, true);
        const slaCell = cell('SLA');
        // CSV/plain Excel numbers are percentage points; only Excel percentage-formatted cells use fractions.
        item.reportedSla = typeof slaCell === 'string' && slaCell.trim().endsWith('%') ? numeric(slaCell.trim().slice(0, -1), 'SLA') : numeric(slaCell, 'SLA') * (raw.percentCells?.has(index.SLA) ? 100 : 1);
        if (item.reportedSla > 100) fail('SLA: percentage must be between 0 and 100.');
        item.talk = duration(cell('Average Talk Time for Queue Calls'), 'Average Talk Time for Queue Calls', raw.timeCells?.has(index['Average Talk Time for Queue Calls']));
        item.wait = duration(cell('Average Waiting Time in Queue'), 'Average Waiting Time in Queue', raw.timeCells?.has(index['Average Waiting Time in Queue']));
        if (item.answered > item.inbound || item.queue > item.inbound || item.ivr > item.inbound) fail('Answered, queue, and IVR counts cannot exceed inbound calls.');
        if (item.answered > item.queue) fail('Answered queue calls cannot exceed calls landed in queue.');
        if (item.abandoned > item.inbound - item.answered) fail('Answered plus abandoned calls cannot exceed inbound calls.');
        if (item.before > item.answered) fail('Answered before SLA cannot exceed answered queue calls.');
        if (item.earlyAbandoned > item.abandoned) fail('Abandoned before SLA cannot exceed abandoned calls.');
        if (!item.answered && item.talk) fail('Average talk time must be zero when answered queue calls are zero.');
        if (!item.queue && item.wait) fail('Average queue waiting time must be zero when queue calls are zero.');
        if (!Number.isFinite(item.talk) || item.talk > Number.MAX_SAFE_INTEGER || !Number.isFinite(item.wait) || item.wait > Number.MAX_SAFE_INTEGER) fail('Duration exceeds the supported range.');
        seen.add(date); rows.push(Object.freeze(item));
      } catch (error) { fail(`Row ${r + 1}: ${error.message}`); }
    }
    if (!rows.length) fail('No daily data rows were found.');
    return Object.freeze(rows.sort((a, b) => a.date.localeCompare(b.date)));
  }
  const hasVolume = row => row.inbound > 0;
  const shiftDate = (value, amount) => { const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + amount); return iso(date); };
  function weekStart(value) { const day = new Date(value + 'T00:00:00Z').getUTCDay(); return shiftDate(value, -((day + 6) % 7)); }
  function aggregate(rows, formula = 'inbound') {
    if (!(formula in FORMULAS)) fail('Unknown SLA formula.');
    const sums = { inbound: 0, answered: 0, abandoned: 0, queue: 0, before: 0, earlyAbandoned: 0, talkTotal: 0 };
    for (const row of rows.filter(hasVolume)) {
      for (const key of ['inbound', 'answered', 'abandoned', 'queue', 'before', 'earlyAbandoned']) {
        sums[key] += row[key]; if (!Number.isSafeInteger(sums[key])) fail('Combined counts exceed the safe numeric range.');
      }
      sums.talkTotal += row.talk * row.answered;
      if (!Number.isFinite(sums.talkTotal) || sums.talkTotal > Number.MAX_SAFE_INTEGER) fail('Combined talk duration exceeds the safe numeric range.');
    }
    const basis = formula.startsWith('inbound') ? sums.inbound : sums.queue;
    const denominator = basis - (formula.endsWith('-adjusted') ? sums.earlyAbandoned : 0);
    // Do not clamp an invalid denominator or a >100% formula into a plausible result.
    const formulaInvalid = denominator < sums.before || denominator < 0;
    return { ...sums, offered: sums.inbound, denominator, sla: denominator > 0 && !formulaInvalid ? sums.before / denominator * 100 : null, formulaInvalid, answerRate: sums.inbound ? sums.answered / sums.inbound * 100 : null, abandonment: sums.inbound ? sums.abandoned / sums.inbound * 100 : null, talk: sums.answered ? sums.talkTotal / sums.answered : null, aht: null };
  }
  function compareSla(calculated, reported) {
    if (calculated === null || reported === null) return { difference: null, mismatch: false };
    const difference = calculated - reported;
    return { difference, mismatch: Math.abs(difference) > 1e-9 };
  }
  function analyze(rows, { from = '', through = '9999-12-31', view = 'daily', excluded = [], formula = 'inbound' } = {}) {
    const start = view === 'mtd' ? through.slice(0, 7) + '-01' : from;
    const omitted = new Set(excluded);
    const eligible = rows.filter(row => row.date >= start && row.date <= through && !omitted.has(row.date) && hasVolume(row));
    const groups = new Map();
    for (const row of eligible) {
      const key = view === 'weekly' ? weekStart(row.date) : row.date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return { summary: aggregate(eligible, formula), rows: eligible, groups: [...groups].map(([date, values]) => ({ date, ...aggregate(values, formula), reportedSla: values.length === 1 ? values[0].reportedSla : null })), start, zeroDays: rows.filter(row => row.date >= start && row.date <= through && !hasVolume(row)).length };
  }
  function sampleTable(today) {
    const result = [COLUMNS.slice()];
    for (let i = -35; i <= 2; i++) {
      const zero = i > 0 || i === -12, inbound = zero ? 0 : 100 + ((i + 35) % 5) * 20;
      const abandoned = zero ? 0 : i === -2 ? 12 : 4;
      const answered = inbound - abandoned - (zero ? 0 : 2);
      const before = zero ? 0 : i === -4 ? 0 : Math.floor(answered * .97);
      result.push([shiftDate(today, i), inbound, zero ? '0%' : `${(before / inbound * 100).toFixed(2)}%`, abandoned, zero ? '00:00:00' : `00:0${3 + (i + 35) % 2}:30`, answered, inbound, inbound, zero ? '00:00:00' : '00:00:18', before, Math.min(abandoned, 2)]);
    }
    return result;
  }
  const api = { COLUMNS, FORMULAS, DEFAULT_TARGETS, MAX_ROWS, parseCSV, normalizeRows, numeric, duration, parseDate, hasVolume, shiftDate, weekStart, aggregate, compareSla, analyze, sampleTable };
  root.Ziwo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
