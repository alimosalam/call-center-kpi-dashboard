(function () {
  'use strict';
  const z = id => document.getElementById(id);
  const state = { rows: [], excluded: new Set(), workbook: null, source: '', metric: 'sla', page: 0, chartPage: 0, ticket: 0, lastFile: null, rangeFrom: '', validation: null, analysis: null, performancePage: 0, performance: [], dropThreshold: 10, discrepancyThreshold: 1, approvals: new Map(), approvalDates: [] };
  const PAGE = 50, CHART_PAGE = 90;
  const delta = DashboardFormat.pp;
  const rate = DashboardFormat.fixed;
  const fmt = (n, decimals = 1) => n === null || n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  window.DashboardTargets = { ...Ziwo.DEFAULT_TARGETS };
  function workspace(report) {
    z('report-workspace').hidden = !report; z('manual-workspace').hidden = report;
    z('manual-tab').setAttribute('aria-pressed', String(!report)); z('report-tab').setAttribute('aria-pressed', String(report));
  }
  z('manual-tab').addEventListener('click', () => workspace(false));
  z('report-tab').addEventListener('click', () => workspace(true));
  z('ziwo-upload').addEventListener('click', () => { workspace(true); z('ziwo-file').click(); });
  function error(message) { z('ziwo-error').textContent = message; z('ziwo-error').hidden = !message; }
  function setRows(rows, source) {
    // Check the entire report for overflow before replacing the current, valid dataset.
    Ziwo.aggregate(rows);
    state.validation = null; state.performancePage = 0;
    state.rows = rows; state.source = source; state.excluded = new Set(); state.page = 0;
    state.approvals = new Map(); state.approvalDates = []; z('approval-records').replaceChildren();
    syncApprovalDates();
    z('approval-feedback').textContent = '';
    state.rangeFrom = rows[0].date;
    z('ziwo-from').value = rows[0].date;
    const active = rows.filter(Ziwo.hasVolume);
    z('ziwo-through').value = active.length ? active[active.length - 1].date : rows[rows.length - 1].date;
    z('report-content').hidden = false;
    error(''); renderReport(true);
  }
  function status() { z('ziwo-status').textContent = `${state.source} · ${state.rows.length.toLocaleString()} original daily records retained in this tab. Uploading another valid report replaces this analysis. Nothing is saved remotely.`; }
  async function importFile(file) {
    const ticket = ++state.ticket;
    workspace(true); error('');
    z('ziwo-status').textContent = `Reading ${file.name} locally…`;
    try {
      if (file.size > ZiwoXlsx.MAX_FILE) throw new Error('Maximum upload size is 10 MB. Export a smaller report.');
      const extension = file.name.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx'].includes(extension)) throw new Error('Choose a CSV or XLSX report. Legacy XLS files are not supported.');
      if (extension === 'csv') {
        const buffer = await file.arrayBuffer();
        const table = Ziwo.parseCSV(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
        if (ticket !== state.ticket) return;
        const rows = validatedRows(table, { dateFormat: z('ziwo-date-format').value });
        setRows(rows, file.name); state.lastFile = file; state.workbook = null; z('ziwo-sheet-label').hidden = true;
      } else {
        const workbook = await ZiwoXlsx.readWorkbook(await file.arrayBuffer());
        if (ticket !== state.ticket) return;
        state.workbook = workbook; state.lastFile = file;
        z('ziwo-sheet').replaceChildren(...workbook.sheets.map((name, i) => new Option(name, String(i))));
        z('ziwo-sheet-label').hidden = false;
        let table, selected = 0, firstError;
        for (let i = 0; i < workbook.sheets.length; i++) {
          try {
            const candidate = await workbook.readSheet(i);
            if (candidate[0] && Ziwo.COLUMNS.every(c => candidate[0].some(v => String(v ?? '').trim() === c))) { table = candidate; selected = i; break; }
          } catch (e) { firstError ||= e; }
        }
        if (ticket !== state.ticket) return;
        if (!table) { if (firstError) throw firstError; throw new Error('No worksheet has all required Ziwo column headers in its first row. Select a worksheet or re-export the report.'); }
        z('ziwo-sheet').value = String(selected);
        setRows(validatedRows(table, { dateFormat: z('ziwo-date-format').value }), `${file.name} / ${workbook.sheets[selected]}`);
      }
    } catch (e) {
      if (ticket !== state.ticket) return;
      recordInvalid(e, file.name);
      error(`${e.message}${state.rows.length ? ' Your previous valid analysis is unchanged.' : ''}`);
      if (state.rows.length) status(); else z('ziwo-status').textContent = 'Report not loaded. Correct the file and try again.';
    }
  }
  z('ziwo-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) importFile(file); event.target.value = ''; });
  z('ziwo-sheet').addEventListener('change', async () => {
    const workbook = state.workbook, selected = Number(z('ziwo-sheet').value), ticket = ++state.ticket;
    try {
      const table = await workbook.readSheet(selected); if (ticket !== state.ticket) return;
      setRows(validatedRows(table, { dateFormat: z('ziwo-date-format').value }), `${state.lastFile.name} / ${workbook.sheets[selected]}`);
    } catch (e) { if (ticket === state.ticket) { recordInvalid(e, `${state.lastFile.name} / ${workbook.sheets[selected]}`); error(`${e.message} Previous valid data is unchanged.`); } }
  });
  z('ziwo-date-format').addEventListener('change', () => { if (state.lastFile) importFile(state.lastFile); });
  z('ziwo-sample').addEventListener('click', () => {
    ++state.ticket; state.lastFile = null; state.workbook = null; z('ziwo-sheet-label').hidden = true;
    setRows(Ziwo.normalizeRows(Ziwo.sampleTable(today())), 'Ziwo sample · synthetic demonstration data');
  });
  const settings = () => ({ from: z('ziwo-from').value, through: z('ziwo-through').value, view: z('ziwo-view').value, formula: z('ziwo-formula').value, excluded: [] });
  function card(title, value, unit, note, good) {
    const color = good === null || good === undefined ? 'info' : good ? 'good' : 'bad';
    const badge = good === null || good === undefined ? 'Informational' : good ? 'On target' : 'Needs attention';
    return `<article class="kpi ${color}"><h3>${title}</h3><div class="metric">${value}<span>${unit}</span></div><div class="card-status"><span class="badge ${color}">${badge}</span></div><p class="formula">${note}</p></article>`;
  }
  function renderReport(resetChart = false) {
    if (!state.rows.length) return;
    const options = settings(), targets = window.DashboardTargets;
    z('ziwo-from').disabled = options.view === 'mtd';
    let analysis;
    try {
      if (!options.through || (options.view !== 'mtd' && (!options.from || options.from > options.through))) throw new Error('Choose valid From and Through dates, with From no later than Through.');
      analysis = Ziwo.analyze(state.rows, options);
    } catch (e) {
      z('adjusted-kpis').replaceChildren(); z('approval-impact').replaceChildren(); z('simulation-scope').textContent = 'Choose a valid reporting range.'; z('export-adjusted').disabled = true;
      state.analysis = null; state.performance = []; z('export-performance').disabled = true; z('performance-records').replaceChildren(); z('performance-scope').textContent = 'Correct the date range to display and export results.';
      z('management-values').replaceChildren(); z('period-comparison').replaceChildren(); z('management-warnings').textContent = 'Choose a valid reporting range.';
      z('quality-scope').textContent = 'Quality checks paused: choose a valid date range. Original report data is still retained.'; z('quality-cards').replaceChildren();
      for (const id of ['quality-missing', 'quality-zero', 'quality-drops', 'quality-no-answers', 'quality-investigation', 'reconciliation-explanations']) z(id).replaceChildren();
      z('reconciliation-summary').textContent = 'Reconciliation paused until the analysis date range is valid.'; z('reconciliation-dates').textContent = ''; z('show-discrepancies').disabled = true;
      z('ziwo-comparison').textContent = 'Choose a valid date range to compare daily SLA values.';
      error(e.message); z('ziwo-summary').replaceChildren(); z('ziwo-trend').replaceChildren(); z('ziwo-point').textContent = 'Correct the analysis settings to display results.';
      return;
    }
    state.analysis = analysis;
    error(''); status();
    const { summary: s, groups } = analysis;
    if (options.view === 'mtd') z('ziwo-from').value = analysis.start;
    const comparisons = analysis.rows.map(row => Ziwo.compareSla(Ziwo.aggregate([row], options.formula).sla, row.reportedSla));
    const different = comparisons.filter(item => item.mismatch).length, unavailable = comparisons.filter(item => item.difference === null).length;
    z('ziwo-comparison').classList.toggle('has-differences', different > 0);
    z('ziwo-comparison').textContent = `${different} of ${analysis.rows.length} included daily dates differ from the original Ziwo SLA${unavailable ? `; ${unavailable} cannot be compared with this formula` : ''}. Highlighted table cells show calculated − reported SLA in percentage points (pp). Small gaps may reflect Ziwo rounding. Comparison is daily only; reported percentages are never averaged into an overall SLA.`;
    z('ziwo-range').textContent = `${analysis.start} → ${options.through} · ${analysis.rows.length} active dates`;
    z('ziwo-formula-note').textContent = `${Ziwo.FORMULAS[options.formula]} × 100. Overall numerator = ${fmt(s.before, 0)}; denominator = ${fmt(s.denominator, 0)}. Reported Ziwo daily SLA is retained separately; percentages are never averaged.${s.formulaInvalid ? ' This formula has an inconsistent denominator for these counts; SLA is unavailable.' : ''}`;
    z('ziwo-summary').innerHTML = [
      card('Offered calls', fmt(s.offered, 0), '', 'Σ Inbound Calls'),
      card('Answered calls', fmt(s.answered, 0), '', 'Σ Answered Queue Calls'),
      card('Abandoned calls', fmt(s.abandoned, 0), '', 'Σ Abandoned Calls'),
      card('Overall SLA · calculated', rate(s.sla), '%', 'From summed counts · selected formula', s.sla === null ? null : s.sla >= targets.sla),
      card('Abandonment rate', rate(s.abandonment), '%', `Abandoned ÷ inbound · target ≤ ${rate(targets.abandonment)}%`, s.abandonment === null ? null : s.abandonment <= targets.abandonment),
      card('Answer rate', rate(s.answerRate), '%', 'Answered queue ÷ inbound'),
      card('Weighted average talk time', fmt(s.talk), 'sec', 'Weighted by answered queue calls · no AHT target'),
      card('Full average handling time', '—', 'sec', `Not in this report · AHT target ≤ ${targets.aht} sec`)
    ].join('');
    // Explicit target in the SLA card, including configurable value.
    z('ziwo-summary').children[3].querySelector('.formula').textContent = `From summed counts · target ≥ ${rate(targets.sla)}%`;
    if (resetChart) state.chartPage = Math.max(0, Math.ceil(groups.length / CHART_PAGE) - 1);
    state.chartPage = Math.min(state.chartPage, Math.max(0, Math.ceil(groups.length / CHART_PAGE) - 1));
    renderChart(groups, options);
    renderTable(analysis);
    renderQuality(analysis);
    renderReview(analysis);
    renderPerformance(analysis);
    renderManagement(analysis);
    syncApprovalDates(); renderApprovalRecords(); renderAdjusted();
  }
  for (const id of ['ziwo-from', 'ziwo-through', 'ziwo-view', 'ziwo-formula']) z(id).addEventListener('change', () => {
    if (id === 'ziwo-from') state.rangeFrom = z('ziwo-from').value;
    if (id === 'ziwo-view' && z('ziwo-view').value !== 'mtd') z('ziwo-from').value = state.rangeFrom;
    state.performancePage = 0; renderReport(true);
  });
  for (const key of ['sla', 'abandonment', 'aht']) z(`target-${key}`).addEventListener('input', () => {
    const values = Object.fromEntries(['sla', 'abandonment', 'aht'].map(k => [k, z(`target-${k}`).valueAsNumber]));
    const invalid = Object.entries(values).some(([k, value]) => !Number.isFinite(value) || value < 0 || value > (k === 'aht' ? Number.MAX_SAFE_INTEGER : 100));
    z('target-error').hidden = !invalid;
    z('target-error').textContent = invalid ? 'Targets must be non-negative numbers. Percentage targets cannot exceed 100%. The last valid targets are still active.' : '';
    if (!invalid) { state.performancePage = 0; window.DashboardTargets = values; document.dispatchEvent(new Event('targetschange')); renderReport(); }
  });
  function renderTable(analysis) {
    const excluded = [...state.excluded].sort();
    z('ziwo-excluded').textContent = excluded.length ? `Proposed simulation exclusions (${excluded.length}): ${excluded.join(', ')}. Official dates remain included; original rows are retained.` : 'No proposed simulation exclusions. Official results include all valid dates.';
    z('ziwo-zero-note').textContent = `${analysis.zeroDays} zero-volume dates in this range automatically omitted from calculations and trends, including future placeholders. Active days with 0% SLA are included. All original dates remain in this table.`;
    const start = state.page * PAGE;
    z('ziwo-records').innerHTML = state.rows.slice(start, start + PAGE).map(row => {
      const excludedDay = state.excluded.has(row.date), active = Ziwo.hasVolume(row), inRange = row.date >= analysis.start && row.date <= z('ziwo-through').value;
      const result = Ziwo.aggregate([row], z('ziwo-formula').value);
      const comparison = Ziwo.compareSla(result.sla, row.reportedSla);
      const slaBelow = result.sla !== null && result.sla < window.DashboardTargets.sla;
      const abandonAbove = result.abandonment !== null && result.abandonment > window.DashboardTargets.abandonment;
      const warning = active && row.answered === 0 ? ' · WARNING: offered calls but zero answered; investigate' : '';
      const reviewFlag = ZiwoReview.REVIEW_DATES.includes(row.date) ? ' · requested SLA investigation' : '';
      const label = (excludedDay ? 'Official: included · simulation: excluded' : !active ? 'Zero volume · omitted' : !inRange ? 'Outside range' : 'Included') + warning + reviewFlag;
      return `<tr class="${excludedDay ? 'excluded-row' : ''} ${comparison.mismatch ? 'sla-mismatch' : ''}"><td><input type="checkbox" data-date="${row.date}" aria-label="Include ${row.date} in simulation" ${excludedDay ? '' : 'checked'}></td><th scope="row">${row.date}</th><td>${fmt(row.inbound, 0)}</td><td>${fmt(row.answered, 0)}</td><td>${fmt(row.abandoned, 0)}</td><td class="reported-sla">${rate(row.reportedSla)}%</td><td class="calculated-sla ${slaBelow ? 'target-breach' : ''}">${rate(result.sla)}${result.sla === null ? '' : '%'}</td><td class="sla-difference">${delta(comparison.difference)}${comparison.mismatch ? ' · differs' : ''}</td><td class="${abandonAbove ? 'target-breach' : ''}">${rate(result.abandonment)}${result.abandonment === null ? '' : '%'}</td><td>${fmt(row.talk)}</td><td>${label}</td></tr>`;
    }).join('');
    z('ziwo-page').textContent = `${start + 1}–${Math.min(start + PAGE, state.rows.length)} of ${state.rows.length} original rows`;
    z('ziwo-prev').disabled = state.page === 0; z('ziwo-next').disabled = start + PAGE >= state.rows.length;
  }
  z('ziwo-records').addEventListener('change', event => {
    const date = event.target.dataset.date; if (!date) return;
    if (event.target.checked) state.excluded.delete(date); else state.excluded.add(date);
    renderReport();
  });
  z('ziwo-restore').addEventListener('click', () => { state.excluded.clear(); renderReport(); });
  z('ziwo-prev').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); renderReport(); });
  z('ziwo-next').addEventListener('click', () => { state.page = Math.min(Math.ceil(state.rows.length / PAGE) - 1, state.page + 1); renderReport(); });
  document.querySelectorAll('[data-trend]').forEach(button => button.addEventListener('click', () => { state.metric = button.dataset.trend; renderReport(); }));
  function validatedRows(table, options) {
    const result = ZiwoReview.validateTable(table, options);
    if (result.issues.length) {
      const first = result.issues[0], issue = new Error(`${result.issues.length} validation issue(s). ${first.row ? `Row ${first.row}: ` : ''}${first.message}`);
      issue.issues = result.issues; throw issue;
    }
    return result.rows;
  }
  function recordInvalid(issue, source) {
    state.validation = { source, issues: issue.issues || [{ row: null, day: '', message: issue.message }] };
    renderQuality(state.analysis);
    if (state.analysis) renderManagement(state.analysis);
  }
  function list(id, values, empty) {
    const nodes = (values.length ? values : [empty]).map(text => { const item = document.createElement('li'); item.textContent = text; return item; });
    z(id).replaceChildren(...nodes);
  }
  function renderQuality(analysis) {
    z('ziwo-quality').hidden = false;
    const quality = analysis ? ZiwoReview.dataQuality(state.rows, { from: analysis.start, through: z('ziwo-through').value, formula: z('ziwo-formula').value, dropThreshold: state.dropThreshold, today: today() }) : null;
    const issues = state.validation?.issues || [];
    z('quality-scope').textContent = analysis ? `Checks original rows for ${analysis.start} to ${z('ziwo-through').value}, before proposed simulation exclusions. ${state.validation ? 'Validation issues below refer to the latest rejected upload, not the current valid analysis.' : 'All imported rows passed value and structure validation.'}` : state.rows.length ? 'A valid report is retained; select a valid analysis range. Rejected-upload issues are listed separately below.' : 'No valid report is available for date or SLA checks. Review the rejected upload below.';
    z('quality-cards').innerHTML = [
      ['Missing calendar dates', quality ? fmt(quality.missingCount, 0) : '—', 'Absent dates are not assumed to have zero calls.'],
      ['Zero-call days', quality ? fmt(quality.zero.length, 0) : '—', quality ? `${quality.futureZero.length} future placeholder(s) in range · ${state.rows.filter(row => !Ziwo.hasVolume(row)).length} zero-call dates in original report` : 'Requires a valid report.'],
      ['Invalid rows / structure', fmt(issues.length, 0), state.validation ? 'Latest upload rejected · valid analysis preserved' : 'Validated on import · no invalid rows accepted'],
      ['Unusual SLA drops', quality ? fmt(quality.drops.length, 0) : '—', `At least ${rate(state.dropThreshold)} pp versus previous active observation`],
      ['Calls offered, none answered', quality ? fmt(quality.noAnswers.length, 0) : '—', 'Warning only · retained in calculations and cannot be removed from official results by simulation controls'],
      ['Investigation flags', quality ? fmt(quality.investigation.length, 0) : '—', 'Automatic drops and specifically requested review dates']
    ].map(([title, value, note]) => `<article class="quality-card"><h3>${title}</h3><strong>${value}</strong><p>${note}</p></article>`).join('');
    const missing = quality?.missing || [];
    list('quality-missing', missing.slice(0, 100).map(range => range.count === 1 ? range.from : `${range.from} → ${range.through} (${range.count} dates)`), 'No missing calendar dates in this selection.');
    if (missing.length > 100) listAppend('quality-missing', `${missing.length - 100} additional missing ranges; narrow the selected interval to inspect them.`);
    list('quality-zero', (quality?.zero || []).slice(0, 100).map(row => `${row.date}${row.date > today() ? ' · future zero-volume placeholder' : ' · zero offered calls'} · retained, omitted from performance averages/trends`), 'No zero-call rows in this selection.');
    if ((quality?.zero.length || 0) > 100) listAppend('quality-zero', 'Showing the first 100 zero-call dates; use original records below for all dates.');
    const movement = value => value === null ? 'unavailable' : `${fmt(Math.abs(value), 2)} pp ${value >= 0 ? 'down' : 'up'}`;
    list('quality-drops', (quality?.drops || []).slice(0, 100).map(row => `${row.date} vs ${row.previousDate}: calculated ${movement(row.calculatedDrop)}; reported ${movement(row.reportedDrop)}${row.gapDays > 1 ? ` · observations ${row.gapDays} calendar days apart` : ''}`), 'No unusual SLA drops at this threshold.');
    if ((quality?.drops.length || 0) > 100) listAppend('quality-drops', 'Showing the first 100 drops; narrow the date range for more detail.');
    list('quality-no-answers', (quality?.noAnswers || []).map(row => `${row.date}: ${row.inbound} offered, 0 answered. Retained in all calculations unless you manually exclude it; talk time is unavailable.`), 'No dates with offered calls and zero answered calls in this range.');
    list('quality-investigation', (quality?.investigation || []).map(item => `${item.date}: ${item.requested ? 'Requested investigation date' : 'Automatic unusual-drop flag'} · ${!item.row ? 'no record in this report; cannot confirm a drop' : !Ziwo.hasVolume(item.row) ? 'zero-call record; cannot evaluate active-day SLA' : item.drop ? 'unusual SLA drop detected; investigate counts and Ziwo configuration' : 'review flagged; no automatic threshold-sized drop confirmed in this selection'}. No official exclusion.`), 'No requested or automatic investigation flags in this range.');
    z('quality-invalid').hidden = !state.validation;
    z('quality-invalid-source').textContent = state.validation ? `Rejected file: ${state.validation.source}${state.rows.length ? ` · current valid analysis: ${state.source}` : ''}` : '';
    list('quality-issues', issues.slice(0, 100).map(issue => `${issue.row ? `Row ${issue.row}` : 'Report'}${issue.day ? ` (${issue.day})` : ''}: ${issue.message}`), 'No validation issues.');
    if (issues.length > 100) listAppend('quality-issues', `${issues.length - 100} more invalid rows. Correct the first issues and re-upload to inspect the remainder.`);
  }
  function listAppend(id, text) { const item = document.createElement('li'); item.textContent = text; z(id).append(item); }
  function renderReview(analysis) {
    const review = ZiwoReview.reconciliation(analysis.rows, { formula: z('ziwo-formula').value, threshold: state.discrepancyThreshold });
    z('reconciliation-summary').textContent = `${review.significant.length} significant discrepant date(s) at |calculated − reported| ≥ ${rate(state.discrepancyThreshold)} pp. ${review.rounded.length} small gap(s) are within half a two-decimal display step (check source precision before attributing them to rounding); ${review.unmatched.length} date(s) have no valid calculated SLA. Original Ziwo percentages are preserved.`;
    z('reconciliation-dates').textContent = review.significant.length ? `Significant dates: ${review.significant.slice(0, 25).map(row => `${row.date} (${delta(row.difference)})`).join('; ')}${review.significant.length > 25 ? '. More dates are available using the significant-dates table filter.' : '.'}` : 'No significant discrepancies in the included date selection.';
    list('reconciliation-explanations', review.significant.slice(0, 25).map(row => `${row.date}: calculated ${rate(row.calculated)}%, Ziwo ${rate(row.reportedSla)}%, difference ${delta(row.difference)}. Counts: ${row.before} answered before SLA / ${row.denominator} selected denominator; inbound ${row.inbound}, queue ${row.queue}, early abandoned ${row.earlyAbandoned}. ${row.explanation}`), 'No significant gaps to investigate. Small displayed differences may be rounding; all daily values remain available in the table.');
    z('show-discrepancies').disabled = !review.significant.length;
  }
  function renderPerformance(analysis) {
    const all = ZiwoReview.dailyPerformance(analysis.rows, { formula: z('ziwo-formula').value, targets: window.DashboardTargets, discrepancyThreshold: state.discrepancyThreshold, dropThreshold: state.dropThreshold });
    const filter = z('performance-filter').value;
    state.performance = all.filter(row => filter === 'attention' ? row.slaBelow || row.abandonmentAbove || row.noAnswers || row.requestedInvestigation || row.unusualDrop : filter === 'discrepancies' ? row.significant : true);
    const count = state.performance.length;
    state.performancePage = Math.min(state.performancePage, Math.max(0, Math.ceil(count / PAGE) - 1));
    const start = state.performancePage * PAGE;
    z('performance-records').innerHTML = state.performance.slice(start, start + PAGE).map(row => {
      const flags = [row.unusualDrop ? 'Unusual SLA drop: investigate' : '', row.noAnswers ? 'WARNING: offered calls with zero answered' : '', row.requestedInvestigation ? 'Requested SLA investigation' : '', row.slaBelow ? 'Below SLA target' : '', row.abandonmentAbove ? 'Above abandonment target' : ''].filter(Boolean);
      return `<tr><th scope="row">${row.date}</th><td>${fmt(row.offered, 0)}</td><td>${fmt(row.answered, 0)}</td><td>${fmt(row.abandoned, 0)}</td><td class="${row.slaBelow ? 'target-breach' : ''}">${rate(row.calculated)}${row.calculated === null ? '' : '%'}${row.slaBelow ? ' · below target' : ''}</td><td>${rate(row.reportedSla)}%</td><td class="${row.significant ? 'significant-gap' : ''}">${delta(row.difference)}</td><td class="${row.abandonmentAbove ? 'target-breach' : ''}">${rate(row.abandonmentRate)}%${row.abandonmentAbove ? ' · above target' : ''}</td><td>${fmt(row.talk, 2)}</td><td>${flags.join(' · ') || (row.calculated === null ? 'SLA unavailable' : 'On target')}</td></tr>`;
    }).join('');
    if (!count) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 10; cell.textContent = 'No daily results match the current filters.'; row.append(cell); z('performance-records').append(row); }
    z('performance-scope').textContent = `${count} of ${all.length} included active dates · SLA target ≥ ${rate(window.DashboardTargets.sla)}%; abandonment ≤ ${rate(window.DashboardTargets.abandonment)}% · export includes all matching pages.`;
    z('performance-page').textContent = count ? `${start + 1}–${Math.min(start + PAGE, count)} of ${count} filtered dates` : '0 filtered dates';
    z('performance-prev').disabled = state.performancePage === 0; z('performance-next').disabled = start + PAGE >= count;
    z('export-performance').disabled = !count; z('performance-export-status').textContent = '';
  }
  for (const [id, field, errorId] of [['quality-drop', 'dropThreshold', 'quality-setting-error'], ['sla-significant', 'discrepancyThreshold', 'reconciliation-setting-error']]) z(id).addEventListener('input', () => {
    const value = z(id).valueAsNumber, valid = Number.isFinite(value) && value > 0 && value <= 100;
    z(errorId).hidden = valid; z(errorId).textContent = valid ? '' : 'Enter a threshold greater than 0 and at most 100 percentage points. The last valid threshold remains active.';
    if (valid) { state[field] = value; state.performancePage = 0; if (state.analysis) renderReport(); else if (state.validation) renderQuality(null); }
  });
  z('performance-filter').addEventListener('change', () => { state.performancePage = 0; if (state.analysis) renderPerformance(state.analysis); });
  z('show-discrepancies').addEventListener('click', () => { z('performance-filter').value = 'discrepancies'; state.performancePage = 0; renderPerformance(state.analysis); z('performance-title').scrollIntoView({ block: 'start' }); });
  z('performance-prev').addEventListener('click', () => { state.performancePage--; renderPerformance(state.analysis); });
  z('performance-next').addEventListener('click', () => { state.performancePage++; renderPerformance(state.analysis); });
  z('export-performance').addEventListener('click', () => {
    if (!state.analysis || !state.performance.length) return;
    try {
      const options = { ...settings(), from: state.analysis.start, source: state.source, targets: window.DashboardTargets, discrepancyThreshold: state.discrepancyThreshold };
      const tables = ZiwoReview.exportTables(state.performance, options);
      tables[1].rows.push(['Official Inclusion Policy', 'All valid active dates included. Simulation choices and manually recorded approval statuses do not change official KPIs.']);
      tables.push(ZiwoApprovals.exportSheets(state.approvals, state.excluded, 'OFFICIAL PERFORMANCE'));
      tables[1].rows.push(['Daily Table Filter', z('performance-filter').selectedOptions[0].textContent]);
      tables[0].rowStyles = [1, ...state.performance.map(row => row.slaBelow || row.abandonmentAbove || row.noAnswers || row.requestedInvestigation || row.unusualDrop ? 3 : 0)];
      const bytes = ZiwoExcel.workbook(tables), blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `ziwo-daily-${options.from}-to-${options.through}.xlsx`; link.hidden = true; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      z('performance-export-status').textContent = `Downloaded ${state.performance.length} official filtered daily rows with approval records. No simulation exclusions were applied. Full AHT is blank; no data was sent to a server.`;
    } catch (e) { z('performance-export-status').textContent = `Export failed: ${e.message}`; }
  });
  function renderManagement(analysis) {
    const options = { ...settings(), targets: window.DashboardTargets, today: today(), dropThreshold: state.dropThreshold };
    const result = ZiwoReview.management(state.rows, options), q = result.quality;
    z('management-values').innerHTML = [
      ['Overall SLA · calculated', `${rate(result.sla)}%`],
      ['SLA target achievement', result.achieved === null ? 'Unavailable' : result.achieved ? 'On target' : 'Below target'],
      ['Gap to SLA target', delta(result.slaGap)],
      ['Abandonment rate', `${rate(result.abandonment)}%`],
      ['Weighted Average Talk Time', `${fmt(result.talk, 2)} sec`],
      ['Days below SLA target', `${result.below} / ${result.activeDays}`],
      ['Days above abandonment target', `${result.above} / ${result.activeDays}`]
    ].map(([label, value]) => `<div class="management-stat"><h3>${label}</h3><strong>${value}</strong></div>`).join('');
    z('management-note').textContent = `OFFICIAL PERFORMANCE: all valid active dates in range; approval statuses and simulation exclusions have no effect. SLA minimum ${rate(options.targets.sla)}%, abandonment maximum ${rate(options.targets.abandonment)}%. Ziwo-reported SLA remains separate; it is not averaged. Full AHT is unavailable and is never estimated from talk time.`;
    z('management-warnings').textContent = `Data quality review (original dates before exclusions): ${q.missingCount} missing calendar date(s), ${q.zero.length} zero-call day(s), ${q.noAnswers.length} day(s) with offered calls but zero answered, ${q.drops.length} unusual SLA drop(s), ${q.investigation.length} investigation flag(s). ${state.validation ? `${state.validation.issues.length} validation issue(s) in the most recent rejected upload; current valid analysis retained.` : 'Imported values passed validation.'}`;
    const comparison = ZiwoReview.comparePeriods(state.rows, { ...options, from: analysis.start });
    z('comparison-periods').textContent = `Selected: ${comparison.current.from} → ${comparison.current.through} (${comparison.current.calendarDays} calendar days). Previous: ${comparison.previous.from} → ${comparison.previous.through} (${comparison.previous.calendarDays} calendar days). ${comparison.method}`;
    const periodValue = (period, key, isRate) => !period.known ? '—' : isRate ? `${rate(period[key])}%` : fmt(period[key], 0);
    z('period-comparison').innerHTML = [['SLA · calculated','sla',true],['Abandonment rate','abandonment',true],['Answer rate','answerRate',true],['Offered calls','offered',false],['Answered calls','answered',false],['Abandoned calls','abandoned',false]].map(([label,key,isRate])=>`<tr><th scope="row">${label}</th><td>${periodValue(comparison.current,key,isRate)}</td><td>${periodValue(comparison.previous,key,isRate)}</td><td>${isRate ? delta(comparison.changes[key]) : comparison.changes[key] === null ? '—' : `${comparison.changes[key] > 0 ? '+' : ''}${rate(comparison.changes[key])}%`}</td><td>${isRate ? 'percentage points' : 'volume percentage change'}</td></tr>`).join('');
    z('comparison-coverage').textContent = `${comparison.partial ? 'PARTIAL COVERAGE / EXCLUSIONS: comparisons use observed included data, not complete-period estimates. ' : 'Both periods have complete calendar-date coverage. '}Selected: ${comparison.current.records}/${comparison.current.calendarDays} dates supplied, ${comparison.current.excluded} manually excluded. Previous: ${comparison.previous.records}/${comparison.previous.calendarDays} supplied, ${comparison.previous.excluded} excluded. Missing records are not assumed zero. A missing baseline or zero prior call volume gives an unavailable change. Upload a longer report if previous-period data is missing.`;
    z('comparison-coverage').classList.toggle('coverage-warning', comparison.partial);
  }
  function syncApprovalDates() {
    if (!state.rows.length) return;
    const dates = ZiwoApprovals.flaggedDates(state.rows, state.dropThreshold, z('ziwo-formula').value);
    for (const date of dates) if (!state.approvals.has(date)) state.approvals.set(date, ZiwoApprovals.record('Pending Approval', ZiwoReview.REVIEW_DATES.includes(date) ? 'Client approval is pending. Keep included in official KPIs.' : ''));
    state.approvalDates = [...state.approvals.keys()].sort();
  }
  function renderApprovalRecords() {
    const existing = new Set(state.rows.map(row => row.date));
    const retained = new Map([...z('approval-records').children].map(row => [row.dataset.approvalDate, row]));
    z('approval-records').replaceChildren(...state.approvalDates.map(date => {
      if (retained.has(date)) { const row = retained.get(date); const proposal = row.querySelector('[data-proposal-date]'); proposal.checked = state.excluded.has(date); return row; }
      const record = state.approvals.get(date), row = document.createElement('tr'); row.dataset.approvalDate = date;
      const cell = text => { const item = document.createElement('td'); if (text) item.textContent = text; row.append(item); return item; };
      cell(date); cell(existing.has(date) ? 'Present · officially included in range' : 'Not in imported report');
      const select = document.createElement('select'); select.setAttribute('aria-label', `Approval status ${date}`); select.dataset.approvalStatus = date;
      for (const status of ZiwoApprovals.STATUSES) select.add(new Option(status, status)); select.value = record.status; cell().append(select);
      const reason = document.createElement('textarea'); reason.value = record.reason; reason.maxLength = 2000; reason.rows = 2; reason.setAttribute('aria-label', `Approval reason ${date}`); reason.dataset.approvalReason = date; cell().append(reason);
      const proposed = document.createElement('input'); proposed.type = 'checkbox'; proposed.checked = state.excluded.has(date); proposed.disabled = !existing.has(date); proposed.dataset.proposalDate = date; proposed.setAttribute('aria-label', `Propose simulation exclusion ${date}`); cell().append(proposed);
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save record'; save.dataset.saveApproval = date; save.setAttribute('aria-label', `Save approval record ${date}`); cell().append(save);
      return row;
    }));
  }
  z('approval-records').addEventListener('click', event => {
    const date = event.target.dataset.saveApproval; if (!date) return;
    const row = event.target.closest('tr');
    try {
      state.approvals.set(date, ZiwoApprovals.record(row.querySelector('select').value, row.querySelector('textarea').value));
      z('approval-feedback').textContent = `${date}: saved manually as ${state.approvals.get(date).status}. This is not proof of client approval; official results are unchanged.`;
    } catch (e) { z('approval-feedback').textContent = e.message; }
  });
  z('approval-records').addEventListener('change', event => {
    const date = event.target.dataset.proposalDate; if (!date) return;
    if (event.target.checked) state.excluded.add(date); else state.excluded.delete(date);
    renderTable(state.analysis); renderAdjusted();
  });
  function renderAdjusted() {
    if (!state.analysis) return;
    const result = ZiwoApprovals.performance(state.rows, settings(), state.excluded), s = result.adjusted.summary;
    const effective = result.official.rows.filter(row => state.excluded.has(row.date)).map(row => row.date);
    z('simulation-scope').textContent = `SIMULATION ONLY. Proposed excluded active dates in this range: ${effective.join(', ') || 'none'}. Selection is independent of the recorded approval status and is not authorization. Official dates are not removed. ${state.excluded.size} total proposed date(s) retained across views.`;
    z('adjusted-kpis').innerHTML = [card('Simulated offered calls',fmt(s.offered,0),'','Not official'),card('Simulated answered calls',fmt(s.answered,0),'','Not official'),card('Simulated abandoned calls',fmt(s.abandoned,0),'','Not official'),card('Simulated overall SLA',rate(s.sla),'%','From adjusted summed counts · not official'),card('Simulated abandonment',rate(s.abandonment),'%','Not official'),card('Simulated answer rate',rate(s.answerRate),'%','Not official'),card('Simulated weighted talk time',fmt(s.talk,2),'sec','Not full AHT · not official'),card('Full AHT','—','sec','Unavailable · never estimated')].join('');
    z('approval-impact').innerHTML = [['SLA','sla'],['Abandonment rate','abandonment']].map(([label,key]) => `<tr><th scope="row">${label}</th><td>${rate(result.official.summary[key])}%</td><td>${rate(s[key])}%</td><td>${delta(result.impact[key])}</td></tr>`).join('');
    z('export-adjusted').disabled = !result.adjusted.rows.length;
    z('simulation-export-status').textContent = '';
  }
  z('export-adjusted').addEventListener('click', () => {
    if (!state.analysis) return;
    try {
      const analysis = ZiwoApprovals.performance(state.rows, settings(), state.excluded).adjusted;
      const options = {...settings(),from:analysis.start,excluded:[...state.excluded],source:state.source,targets:window.DashboardTargets,discrepancyThreshold:state.discrepancyThreshold};
      const performance = ZiwoReview.dailyPerformance(analysis.rows, options);
      const sheets = ZiwoReview.exportTables(performance, options); sheets[0].name = 'SIMULATION ONLY Adjusted';
      sheets[1].rows.push(['IMPORTANT', 'ADJUSTED SIMULATION ONLY. Not official performance. Approval statuses are manually entered and not proof of client approval.']);
      sheets.push(ZiwoApprovals.exportSheets(state.approvals, state.excluded, 'ADJUSTED SIMULATION ONLY'));
      const bytes = ZiwoExcel.workbook(sheets), url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link = document.createElement('a'); link.href=url; link.download=`SIMULATION-ONLY-ziwo-${analysis.start}-to-${options.through}.xlsx`; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      z('simulation-export-status').textContent = `Downloaded ${performance.length} simulated daily rows. This workbook does not replace official results.`;
    } catch(e) { z('simulation-export-status').textContent=`Simulation export failed: ${e.message}`; }
  });
  const NS = 'http://www.w3.org/2000/svg';
  function svgElement(tag, attributes = {}, text) { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); if (text !== undefined) node.textContent = text; return node; }
  let chartGroups = [], chartOptions;
  function renderChart(groups, options) {
    chartGroups = groups; chartOptions = options;
    const chart = z('ziwo-trend'); chart.replaceChildren();
    const metric = state.metric, targets = window.DashboardTargets;
    document.querySelectorAll('[data-trend]').forEach(button => { const selected = button.dataset.trend === metric; button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('secondary', !selected); });
    const series = metric === 'volume' ? [['Offered', 'offered', '#148478'], ['Answered', 'answered', '#4c78aa'], ['Abandoned', 'abandoned', '#d76c56']] : metric === 'sla' ? [['Calculated SLA', 'sla', '#148478'], ...(options.view === 'weekly' ? [] : [['Ziwo SLA (reported)', 'reportedSla', '#7a63a7']])] : metric === 'abandonment' ? [['Abandonment rate', 'abandonment', '#d76c56']] : [['Weighted talk seconds · not AHT', 'talk', '#4c78aa']];
    z('ziwo-chart-legend').replaceChildren(...series.map(([label, , color]) => { const span = document.createElement('span'); const dot = document.createElement('i'); dot.className = 'dot'; dot.style.background = color; span.append(dot, document.createTextNode(label)); return span; }));
    const rows = groups.slice(state.chartPage * CHART_PAGE, (state.chartPage + 1) * CHART_PAGE);
    z('ziwo-chart-prev').disabled = state.chartPage === 0; z('ziwo-chart-next').disabled = (state.chartPage + 1) * CHART_PAGE >= groups.length;
    z('ziwo-chart-window').textContent = groups.length ? `Points ${state.chartPage * CHART_PAGE + 1}–${state.chartPage * CHART_PAGE + rows.length} of ${groups.length}` : 'No active dates in this selection';
    z('ziwo-point').textContent = rows.length ? 'Select a point for the exact values. Zero-volume and manually excluded dates are omitted.' : 'No active, included dates in this range. Change the range or restore excluded dates.';
    if (!rows.length) { chart.append(svgElement('text', { x: 450, y: 125, 'text-anchor': 'middle', fill: '#667987' }, 'No active data in this selection')); return; }
    const left = 62, right = 870, top = 24, bottom = 210;
    const max = metric === 'sla' || metric === 'abandonment' ? 100 : Math.max(1, ...rows.flatMap(row => series.map(([, key]) => row[key] || 0))) * 1.1;
    const x = i => rows.length === 1 ? (left + right) / 2 : left + i / (rows.length - 1) * (right - left);
    const y = value => bottom - value / max * (bottom - top);
    for (let i = 0; i <= 4; i++) {
      const value = max * i / 4;
      chart.append(svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), stroke: '#e4ebf0' }), svgElement('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end', fill: '#667987', 'font-size': 11 }, ['sla', 'abandonment'].includes(metric) ? rate(value) : fmt(value, max > 100 ? 0 : 1)));
    }
    if (metric === 'sla' || metric === 'abandonment') {
      const target = metric === 'sla' ? targets.sla : targets.abandonment;
      chart.append(svgElement('line', { x1: left, x2: right, y1: y(target), y2: y(target), stroke: '#526e88', 'stroke-dasharray': '5 5' }));
      const text = document.createElement('span'); text.textContent = `Dashed line: ${rate(target)}% target`; z('ziwo-chart-legend').append(text);
    }
    const show = row => {
      const comparison = Ziwo.compareSla(row.sla, row.reportedSla);
      z('ziwo-point').textContent = `${options.view === 'weekly' ? 'Week of ' : ''}${row.date} · ${series.map(([label, key]) => `${label}: ${fmt(row[key], metric === 'volume' ? 0 : 2)}${['sla', 'abandonment'].includes(metric) && row[key] !== null ? '%' : ''}`).join(' · ')}${metric === 'sla' && options.view !== 'weekly' ? ` · Calculated − reported: ${delta(comparison.difference)}` : ''}`;
    };
    for (const [label, key, color] of series) {
      // Missing values break the line rather than turning into a false zero.
      let segment = [];
      const flush = () => { if (segment.length > 1) chart.append(svgElement('polyline', { points: segment.join(' '), fill: 'none', stroke: color, 'stroke-width': 2 })); segment = []; };
      rows.forEach((row, i) => { if (row[key] === null || row[key] === undefined) flush(); else segment.push(`${x(i)},${y(row[key])}`); }); flush();
      rows.forEach((row, i) => {
        if (row[key] === null || row[key] === undefined) return;
        const group = svgElement('g', { tabindex: 0, role: 'button', 'aria-label': `${row.date}: ${label} ${fmt(row[key], 2)}`, class: 'trend-point' });
        group.append(svgElement('circle', { cx: x(i), cy: y(row[key]), r: 11, fill: 'transparent' }), svgElement('circle', { cx: x(i), cy: y(row[key]), r: 3.5, fill: color }));
        for (const event of ['mouseenter', 'focus', 'click']) group.addEventListener(event, () => show(row));
        group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(row); } });
        chart.append(group);
      });
    }
    const stride = Math.max(1, Math.ceil(rows.length / 7));
    rows.forEach((row, i) => { if (i % stride === 0 || i === rows.length - 1) chart.append(svgElement('text', { x: x(i), y: 238, 'text-anchor': 'middle', fill: '#667987', 'font-size': 10 }, row.date.slice(5))); });
  }
  // Chart pagination avoids dropping points or overwhelming large daily exports.
  const pagination = document.createElement('div'); pagination.className = 'table-pagination';
  pagination.innerHTML = '<button id="ziwo-chart-prev" type="button" class="secondary">Earlier points</button><span id="ziwo-chart-window"></span><button id="ziwo-chart-next" type="button" class="secondary">Later points</button>';
  z('ziwo-trend').parentElement.after(pagination);
  z('ziwo-chart-prev').addEventListener('click', () => { state.chartPage = Math.max(0, state.chartPage - 1); renderChart(chartGroups, chartOptions); });
  z('ziwo-chart-next').addEventListener('click', () => { state.chartPage++; renderChart(chartGroups, chartOptions); });
})();
