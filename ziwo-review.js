(function (root) {
  'use strict';
  const Z = typeof module !== 'undefined' && module.exports ? require('./ziwo.js') : root.Ziwo;
  const REVIEW_DATES = ['2026-10-04', '2026-10-11'];
  const DAYS = 86400000;
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAYS);
  function validateTable(table, options = {}) {
    const issues = [], rows = [], seen = new Set();
    if (!Array.isArray(table) || table.length < 2 || table.length > Z.MAX_ROWS + 1) {
      return { rows, issues: [{ row: null, day: '', message: `Report must contain a header and 1–${Z.MAX_ROWS.toLocaleString()} daily rows.` }] };
    }
    const header = table[0].map(value => String(value ?? '').replace(/^\uFEFF/, '').trim());
    const missing = Z.COLUMNS.filter(name => !header.includes(name));
    if (missing.length || header.some((name, i) => name && header.indexOf(name) !== i)) {
      return { rows, issues: [{ row: 1, day: '', message: missing.length ? `Missing required columns: ${missing.join('; ')}.` : 'Duplicate column names found.' }] };
    }
    for (let i = 1; i < table.length; i++) {
      const raw = table[i]; if (!raw.some(v => v !== undefined && v !== null && String(v).trim())) continue;
      try {
        const row = Z.normalizeRows([header, raw], options)[0];
        if (seen.has(row.date)) throw new Error(`Duplicate Day ${row.date}. Export one row per day.`);
        seen.add(row.date); rows.push(row);
      } catch (e) { issues.push({ row: i + 1, day: String(raw[header.indexOf('Day')] ?? ''), message: e.message.replace(/^Row 2:\s*/, '') }); }
    }
    if (!rows.length && !issues.length) issues.push({ row: null, day: '', message: 'No daily data rows were found.' });
    return { rows: Object.freeze(rows.sort((a, b) => a.date.localeCompare(b.date))), issues };
  }
  function dataQuality(rows, { from, through, formula = 'inbound', dropThreshold = 10, today = '9999-12-31' }) {
    const scoped = rows.filter(row => row.date >= from && row.date <= through).sort((a, b) => a.date.localeCompare(b.date));
    const missing = []; let next = from;
    for (const row of scoped) {
      if (row.date > next) missing.push({ from: next, through: Z.shiftDate(row.date, -1), count: daysBetween(next, row.date) });
      next = Z.shiftDate(row.date, 1);
    }
    if (next <= through) missing.push({ from: next, through, count: daysBetween(next, through) + 1 });
    const zero = scoped.filter(row => !Z.hasVolume(row));
    const drops = []; let previous = null;
    for (const row of scoped.filter(Z.hasVolume)) {
      const calculated = Z.aggregate([row], formula).sla;
      if (previous) {
        const calculatedDrop = previous.calculated === null || calculated === null ? null : previous.calculated - calculated;
        const reportedDrop = previous.row.reportedSla - row.reportedSla;
        if ((calculatedDrop !== null && calculatedDrop + 1e-9 >= dropThreshold) || reportedDrop + 1e-9 >= dropThreshold) drops.push({ date: row.date, previousDate: previous.row.date, calculatedDrop, reportedDrop, gapDays: daysBetween(previous.row.date, row.date) });
      }
      previous = { row, calculated };
    }
    const noAnswers = scoped.filter(row => row.inbound > 0 && row.answered === 0);
    const investigation = REVIEW_DATES.filter(date => date >= from && date <= through).map(date => ({ date, row: scoped.find(row => row.date === date) || null, requested: true, drop: drops.find(item => item.date === date) || null }));
    for (const drop of drops) if (!investigation.some(item => item.date === drop.date)) investigation.push({ date: drop.date, row: scoped.find(row => row.date === drop.date), requested: false, drop });
    return { noAnswers, investigation: investigation.sort((a,b)=>a.date.localeCompare(b.date)), missing, missingCount: missing.reduce((sum, range) => sum + range.count, 0), zero, futureZero: zero.filter(row => row.date > today), drops, scoped };
  }
  function reconciliation(rows, { formula = 'inbound', threshold = 1 } = {}) {
    const daily = rows.filter(Z.hasVolume).map(row => {
      const calculatedMetrics = Z.aggregate([row], formula);
      const calculated = calculatedMetrics.sla;
      const comparison = Z.compareSla(calculated, row.reportedSla);
      let explanation;
      if (calculated === null) explanation = 'Selected formula has no valid denominator; check the counts.';
      else if (!comparison.mismatch) explanation = 'Matches the selected formula.';
      else if (Math.abs(comparison.difference) <= .005 + 1e-9) explanation = 'Small gap (within half a two-decimal display step): rounding may explain it; verify original display precision and Ziwo configuration.';
      else {
        const alternatives = Object.keys(Z.FORMULAS).filter(key => key !== formula && Z.aggregate([row], key).sla !== null && Math.abs(Z.aggregate([row], key).sla - row.reportedSla) <= .005 + 1e-9);
        explanation = alternatives.length ? `Consistent with ${alternatives.map(key => Z.FORMULAS[key]).join(' OR ')} (within half a two-decimal display step); verify Ziwo settings.` : 'Not explained by available count-based formulas. Check Ziwo threshold, denominator, and reporting scope.';
      }
      return { ...row, calculated, denominator: calculatedMetrics.denominator, ...comparison, significant: comparison.difference !== null && Math.abs(comparison.difference) > 1e-9 && Math.abs(comparison.difference) + 1e-9 >= threshold, explanation };
    });
    return { daily, significant: daily.filter(row => row.significant), rounded: daily.filter(row => row.mismatch && Math.abs(row.difference) <= .005 + 1e-9), unmatched: daily.filter(row => row.difference === null) };
  }
  function dailyPerformance(rows, { formula = 'inbound', targets = Z.DEFAULT_TARGETS, discrepancyThreshold = 1, dropThreshold = 10 } = {}) {
    const active = rows.filter(Z.hasVolume).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const drops = active.length ? dataQuality(active, { from: active[0].date, through: active.at(-1).date, formula, dropThreshold }).drops : [];
    const dropDates = new Set(drops.map(item => item.date));
    return reconciliation(rows, { formula, threshold: discrepancyThreshold }).daily.map(row => {
      const values = Z.aggregate([row], formula);
      return { ...row, offered: values.offered, talk: values.talk, answerRate: values.answerRate, abandonmentRate: values.abandonment, aht: null, unusualDrop: dropDates.has(row.date), noAnswers: row.inbound > 0 && row.answered === 0, requestedInvestigation: REVIEW_DATES.includes(row.date), slaBelow: row.calculated !== null && row.calculated < targets.sla, abandonmentAbove: values.abandonment !== null && values.abandonment > targets.abandonment };
    });
  }
  function previousPeriod(from, through, view = 'daily') {
    if (view === 'mtd') {
      const date = new Date(through + 'T00:00:00Z');
      const endPriorMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
      const day = Math.min(date.getUTCDate(), endPriorMonth.getUTCDate());
      const year = endPriorMonth.getUTCFullYear(), month = String(endPriorMonth.getUTCMonth() + 1).padStart(2, '0');
      return { from: `${year}-${month}-01`, through: `${year}-${month}-${String(day).padStart(2, '0')}`, method: 'Previous calendar month, same day-of-month cutoff (capped at month end).' };
    }
    const count = daysBetween(from, through) + 1;
    return { from: Z.shiftDate(from, -count), through: Z.shiftDate(from, -1), method: 'Immediately preceding period with the same number of calendar days.' };
  }
  function comparePeriods(rows, { from, through, view = 'daily', formula = 'inbound', excluded = [] }) {
    const prior = previousPeriod(from, through, view), omitted = new Set(excluded);
    const period = (start, end) => {
      const records = rows.filter(row => row.date >= start && row.date <= end), included = records.filter(row => !omitted.has(row.date));
      const calendarDays = daysBetween(start, end) + 1;
      return { from: start, through: end, calendarDays, records: records.length, excluded: records.length - included.length, missing: calendarDays - records.length, known: included.length > 0, ...Z.aggregate(included, formula) };
    };
    const current = period(from, through), previous = period(prior.from, prior.through), changes = {};
    for (const key of ['sla', 'abandonment', 'answerRate']) changes[key] = current[key] === null || previous[key] === null ? null : current[key] - previous[key];
    for (const key of ['offered', 'answered', 'abandoned']) changes[key] = !current.known || !previous.known || previous[key] === 0 ? null : (current[key] - previous[key]) / previous[key] * 100;
    return { current, previous, changes, method: prior.method, partial: current.missing > 0 || previous.missing > 0 || current.excluded > 0 || previous.excluded > 0 };
  }
  function management(rows, options) {
    const included = Z.analyze(rows, options), summary = included.summary;
    const daily = dailyPerformance(included.rows, options);
    const quality = dataQuality(rows, { from: included.start, through: options.through, formula: options.formula, today: options.today, dropThreshold: options.dropThreshold || 10 });
    const targets = options.targets || Z.DEFAULT_TARGETS;
    return { ...summary, target: targets.sla, achieved: summary.sla === null ? null : summary.sla >= targets.sla, slaGap: summary.sla === null ? null : summary.sla - targets.sla, below: daily.filter(row=>row.slaBelow).length, above: daily.filter(row=>row.abandonmentAbove).length, activeDays: daily.length, quality };
  }
  function exportTables(performance, settings) {
    const header = ['Day', 'Offered Calls', 'Answered Calls', 'Abandoned Calls', 'Calculated SLA (%)', 'Ziwo Reported SLA (%)', 'SLA Difference (pp)', 'Abandonment Rate (%)', 'Answer Rate (%)', 'Average Talk Time (seconds)', 'Full AHT (seconds)', 'Performance Status', 'SLA Reconciliation'];
    const daily = [header, ...performance.map(row => [row.date, row.offered, row.answered, row.abandoned, row.calculated, row.reportedSla, row.difference, row.abandonmentRate, row.answerRate, row.talk, null, [row.unusualDrop ? 'Unusual SLA drop: investigate' : '', row.noAnswers ? 'WARNING: offered calls with zero answered' : '', row.requestedInvestigation ? 'Requested investigation date' : '', row.slaBelow ? 'Below SLA target' : '', row.abandonmentAbove ? 'Above abandonment target' : ''].filter(Boolean).join('; ') || (row.calculated === null ? 'SLA unavailable' : 'On target'), row.explanation])];
    const metadata = [['Setting', 'Value'], ['Source', settings.source], ['From', settings.from], ['Through', settings.through], ['View', settings.view], ['SLA Formula', Z.FORMULAS[settings.formula] + ' × 100'], ['SLA Target (%)', settings.targets.sla], ['Abandonment Target (%)', settings.targets.abandonment], ['Full AHT Target (seconds)', settings.targets.aht], ['Significant SLA Difference (pp)', settings.discrepancyThreshold], ['Excluded Dates', settings.excluded.length ? `${settings.excluded.length} dates; listed below` : 'None'], ['Full AHT', 'Unavailable: no hold time or after-call work. Never estimated from talk time.'], ['Export Scope', 'All filtered active dates; not just the displayed page. Exclusions and zero-volume omission match the dashboard.'], ['Percentage Units', 'Percentage points: 90 means 90%, not 0.90. Differences are calculated minus reported.']];
    metadata.push(...settings.excluded.map(date => ['Excluded Date', date]));
    return [{ name: 'Daily Performance', rows: daily, decimalColumns: [4,5,6,7,8] }, { name: 'Analysis Settings', rows: metadata, decimalColumns: [1] }];
  }
  root.ZiwoReview = { previousPeriod, comparePeriods, management, REVIEW_DATES, validateTable, dataQuality, reconciliation, dailyPerformance, exportTables };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ZiwoReview;
})(typeof globalThis !== 'undefined' ? globalThis : this);
