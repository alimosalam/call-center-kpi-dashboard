# Call Center KPI Dashboard

A responsive dashboard for team leaders, using only HTML, CSS, and vanilla JavaScript. No installation, external libraries, internet connection, or API keys are required.

## Run the dashboard

1. Download or copy the project folder to your computer. If downloading from GitHub, use **Code → Download ZIP** and extract it first.
2. Double-click **index.html** to open it in Chrome, Edge, Firefox, or Safari. It includes its own styles and scripts, so you can also open this file alone in an HTML Web Preview.
3. The app opens on **Overview**. Select **Calls → Manual totals** to enter figures, or **Calls → Ziwo reports** to import a report. Results update as you type.
4. **Load sample data** restores the example. **Reset** sets all inputs to zero.

Report data and approval records stay in your current browser tab; they are not transmitted or saved remotely. Refreshing clears imported reports. Account/Site labels, theme, and sidebar preferences are saved locally in your browser.

## Calculations and targets

| KPI | Formula | Target |
| --- | --- | --- |
| Service level | Answered within SLA ÷ offered × 100 | ≥ 90% |
| Average handling time | Handling seconds ÷ answered | ≤ 260 seconds |
| Abandonment rate | Abandoned ÷ offered × 100 | ≤ 5% |
| Answer rate | Answered ÷ offered × 100 | Informational; no target |

Green **On target** and orange **Needs attention** indicators use full precision; displayed rate values are rounded to exactly two decimals. A number close to a target can therefore appear equal while missing it. A dash means there is no denominator or inputs need correcting.

Call counts must be non-negative whole numbers within JavaScript's safe integer range. Handling seconds may include decimals. Answered cannot exceed offered; SLA calls cannot exceed answered; answered plus abandoned cannot exceed offered. Handling time must be zero when no calls were answered. Blank, negative, non-finite, and unsafe numbers display an error and clear results until corrected.

The distribution chart includes **Other / pending** for offered calls neither answered nor abandoned. Target bars show actual results with target markers. The AHT scale is at least 520 seconds and expands for higher results. Charts represent the entered period, not historical trends.

Sample: 1,200 offered, 1,152 answered, 1,104 within SLA, 36 abandoned, and 282,240 handling seconds. Expected: **92% SLA, 245 sec AHT, 3% abandonment, 96% answer rate**.

## Files

- `index.html`: layout, inputs, chart containers, and embedded CSS/JavaScript for standalone previews.
- `styles.css`: responsive dashboard design.
- `calculations.js`: formulas, validation, targets, sample totals.
- `app.js`: live cards, charts, indicators, and button behavior.
- `tests/calculations.test.js`: automated calculation tests.
- `tests/browser.html`: browser interaction and mobile layout checks.
- `scripts/embed-assets.js`: copies the source CSS/JavaScript into the standalone HTML using Node.js built-ins.
- `tests/preview.test.js`: checks that the embedded assets match their source files and require no separate asset requests.

## Web Preview and editing

Some HTML previews display one file without serving sibling files. Relative links to `styles.css`, `calculations.js`, and `app.js` then cannot load, leaving unstyled inputs and empty KPI/chart containers. `index.html` now embeds all three files. Scripts run in dependency order after the page markup. No external resources are required. If a preview disables JavaScript entirely, interactive calculations require opening the file in a normal browser instead.

For development, edit `styles.css`, `calculations.js`, or `app.js`, then regenerate the embedded copies:

```sh
node scripts/embed-assets.js
```

Node.js is only needed to regenerate/test the developer sources. Running or previewing the dashboard still requires no installation. After changing files, refresh or reopen Web Preview so it uses the updated HTML.

## Optional developer tests

With Node.js installed, run from the project folder:

```sh
node --test tests/*.test.js
node scripts/embed-assets.js --check
```

For browser tests, serve the folder using Python 3:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/tests/browser.html`. Expect **ALL BROWSER TESTS PASSED**. These checks cover live updates, charts, targets, reset, sample data, zero/invalid inputs, and 375px mobile layout. Stop the server with Ctrl+C. The dashboard itself can be opened directly without this server.

## Ziwo inbound reports

Click **Upload Ziwo Report**, choose a `.csv` or `.xlsx` file, and the **Ziwo reports** workspace opens automatically. **Manual entry** returns to the original dashboard without losing its values. **Load Ziwo sample** generates a synthetic multi-week report with a real zero-SLA day and future zero-volume placeholders. Example upload files are included at `samples/ziwo-inbound-sample.csv` and `samples/ziwo-inbound-sample.xlsx`.

All parsing and calculations run locally in the browser. Uploaded contents are never sent to GitHub, APIs, or remote storage. No spreadsheet library or CDN is used. No upload server is required: the self-contained `index.html` works on GitHub Pages, including project subpaths. Reloading clears the report, date exclusions, and target changes. Uploading another valid report or changing worksheets replaces the current dataset; an invalid upload leaves the previous valid analysis intact.

### Required report columns

The first row must contain these exact names (surrounding whitespace is trimmed); column order may vary, and extra columns are retained in the original row data:

- Day
- Inbound Calls
- SLA
- Abandoned Calls
- Average Talk Time for Queue Calls
- Answered Queue Calls
- Calls landed in IVR
- Calls landed in Queue
- Average Waiting Time in Queue
- Answered Calls Before SLA Threshold
- Abandoned Calls Before SLA Threshold

Use one row per date and export values, not formulas or a grand-total footer. Duplicate days are rejected to prevent double counting. Blank rows are ignored, but required values on nonblank rows may not be blank. Counts must be non-negative whole numbers and pass consistency checks (for example, answered plus abandoned may not exceed inbound). Unusual reports that violate these relationships require checking the source export rather than silently changing its values.

### Report metric definitions

| Metric | Calculation |
| --- | --- |
| Offered calls | Sum of Inbound Calls |
| Answered calls | Sum of Answered Queue Calls |
| Abandoned calls | Sum of Abandoned Calls |
| Answer rate | Sum answered queue ÷ sum inbound × 100 |
| Abandonment rate | Sum abandoned ÷ sum inbound × 100 |
| Weighted Average Talk Time | Sum(daily average talk seconds × daily answered queue calls) ÷ sum answered queue calls |
| Full AHT | Unavailable: the report does not include hold time and after-call work |

IVR and queue counts are routing stages; they are not added to inbound calls. The answered metric is explicitly based on **Answered Queue Calls**, the answered count supplied by this report.

**Overall SLA is configurable**, with a visible numerator and denominator:

1. Default: sum answered before SLA ÷ sum inbound × 100.
2. Queue basis: sum answered before SLA ÷ sum calls landed in queue × 100.
3. Inbound excluding early abandons: sum answered before SLA ÷ (sum inbound calls − sum abandoned before SLA) × 100.
4. Queue excluding early abandons: sum answered before SLA ÷ (sum queue calls − sum abandoned before SLA) × 100.

Early abandoned calls are included by default. Only explicitly selecting one of the adjusted formulas removes them from the SLA denominator; all other volume/abandonment metrics keep them. Select the formula that matches your team's Ziwo configuration. The app does not assume that any one formula matches Ziwo's internal calculation. The original daily **Ziwo SLA (reported)** is retained in the daily table and shown alongside calculated SLA in daily trends. A daily comparison banner counts discrepancies in the included analysis dates. Highlighted daily cells show **calculated − reported SLA** in percentage points (pp); chart point details also show that gap. Differences beyond a 1e-9 pp floating-point tolerance are highlighted, including small gaps caused by Ziwo rounding. There is no averaged overall reported-SLA comparison. Weekly and overall SLA always use summed counts, never an arithmetic mean of daily percentages. A zero/invalid denominator produces a dash; an impossible denominator smaller than the numerator is flagged instead of clamped into a valid-looking percentage.

Configurable default targets are SLA ≥ 90%, abandonment ≤ 5%, and full AHT ≤ 260 seconds. The AHT target changes the manual AHT indicator only. **It is never applied to Average Talk Time.** Target changes apply immediately and last only in the current tab. Invalid target edits leave the last valid targets active.

### Views, trends, and exclusions

- **Daily:** summaries cover the From–Through range; trend points represent individual active dates. Set From and Through to the same day for a single-day view.
- **Weekly:** summaries cover that same range; trends group the included dates into Monday-start weeks. Partial boundary weeks contain only dates inside the selected range. All metrics are recalculated from counts/weights.
- **Month-to-Date:** uses the first of the month of the Through date up to that cutoff. This supports historical MTD reports as well as the current month. The disabled From field shows the effective first day of the month.
- Hover, tap, or keyboard-focus a chart point for exact values. Choose **SLA**, **Call volume**, **Abandonment**, or **Talk time**. Large exports paginate charts at 90 points and the original-data table at 50 rows; earlier/later controls expose every point/row.
- All zero-volume days are automatically omitted from calculations and trends, including future placeholders. **A day with calls and 0% SLA stays included.** Zero-volume days remain in the original-data table.
- Uncheck a date in **Daily records & exclusions** to propose its exclusion from the **Adjusted Performance simulation only**. Official summaries, charts, daily tables, comparisons, and exports keep all valid dates. Proposed dates are listed explicitly, including dates outside the current view. Switching views, formulas, or targets retains proposals. **Restore simulation dates** re-includes them in the simulation without changing approval records. Original imported row objects are preserved and never edited by exclusions.

The default range runs from the earliest imported date to the latest date with calls, so future zero rows do not move the cutoff. An entirely zero-volume report is valid and displays unavailable percentage/talk KPIs.

### Accepted formats and limits

CSV supports UTF-8 (with or without BOM), comma/semicolon/tab delimiters, CRLF or LF lines, and correctly quoted values. Valid thousands grouping such as `"1,200"` is accepted. Use a dot for decimal values; decimal commas and arbitrary text are rejected rather than guessed. SLA values are percentage points (`90`, `90.5`, or `90.5%`).

Dates can be `YYYY-MM-DD` or slash/dash dates with the chosen **DD/MM/YYYY** or **MM/DD/YYYY** order. Choose that order before uploading; changing it reimports the file and resets exclusions. Invalid calendar dates are rejected. Duration cells accept numeric seconds, `MM:SS`, `HH:MM:SS` (including fractional seconds), or values such as `260 sec`.

Standard XLSX workbooks are parsed using browser-native ZIP decompression and XML parsing. The app auto-selects a sheet with matching headers; the worksheet selector lets you choose another. Excel shared/inline strings, standard 1900/1904 date systems, percentage formats, and time-formatted duration fractions are supported. Plain numeric duration cells mean seconds; plain numeric SLA cells mean percentage points. Formula cells are deliberately rejected to avoid stale cached values. Export values only. Excel errors, encrypted files, legacy `.xls`, multipart/ZIP64 archives, and unsupported compression are rejected with a message. ZIP components read by the parser are size- and CRC-checked.

Limits: 10 MB uploaded file, 20,000 daily records, 30 worksheets, 256 columns, 2,000 ZIP entries, and 50 MB total expanded workbook content. Use a current browser with `DecompressionStream('deflate-raw')` support for XLSX; otherwise use CSV. No browser add-on, API key, server, or runtime package installation is needed.

### Additional source files and verification

- `ziwo.js`: CSV parsing, row validation, report formulas, grouping, exclusions, sample generation.
- `xlsx-reader.js`: dependency-free native XLSX reader.
- `ziwo-ui.js`: file selection, report controls, summaries, accessible interactive SVG charts, daily records.
- `tests/ziwo.test.js`: report calculations and validation regressions.
- `tests/uploads.html`: actual CSV/XLSX file-input browser tests using bundled synthetic fixtures.

Run `node scripts/embed-assets.js` after changing any source JS/CSS, then run `node --test tests/*.test.js` and `node scripts/embed-assets.js --check`.

Serve the project as described above and open `/tests/uploads.html` on that local server. It should report **ALL 52 ZIWO UPLOAD CHECKS PASSED**; `/tests/browser.html` verifies the original manual workflow. Browser tests use only bundled synthetic samples and simulate file selection; they never upload contents to a server. Additional development checks covered shared-string XLSX, the 1904 date system, formula rejection, zero-SLA retention, responsive widths from 320px to 1440px, and no application network requests during import.

## Data Quality, reconciliation, and daily Excel export

The report workspace now includes **Data quality**. Its date/drop checks inspect original records inside the selected analysis range, *before* manual date exclusions:

- **Missing dates** are absent calendar dates within that range, listed as dates or contiguous ranges. Missing dates are never filled with invented zero-call rows. Leading/trailing gaps count if you explicitly extend the date range.
- **Zero-call days** are known report rows with zero offered calls. They remain distinct from missing dates, and future placeholders are identified. The section also notes the total zero-call dates in the original report.
- **Invalid rows / structure** lists validation issues from the most recent rejected file, with row numbers and column messages where available. It shows the first issue for each invalid row and collects issues across rows. No partial invalid file is accepted. If a previous valid report is loaded, its analysis is retained and clearly labeled separately from the rejected upload.
- **Unusual SLA drops** default to decreases of at least **10 percentage points** in either calculated or reported SLA versus the previous active observation. A calendar gap between observations is disclosed. This threshold is configurable; a flagged drop is a prompt to review, not proof of a bad report.

**SLA reconciliation** defaults to a significant gap of **at least 1 percentage point**, using the absolute value of calculated SLA minus original Ziwo SLA. It lists affected dates and provides a button to show those dates in the daily table. Both values and the signed difference remain visible per day. Significant records show the answered-before-SLA numerator, selected denominator, inbound/queue counts, and early abandons to help investigate.

For investigation, the app checks all available count-based formulas against the original daily percentage. A match within 0.005 pp is labeled a possible formula explanation, never confirmation of Ziwo's configuration. Small gaps of at most 0.005 pp may reflect two-decimal rounding, but the original source precision must be checked. Unexplained gaps explicitly request checking Ziwo's SLA threshold, denominator, and reporting scope. The app does not silently change formulas, original reported percentages, or early-abandon inclusion.

The new **filtered daily performance** table contains Offered, Answered, Abandoned, calculated SLA, original Ziwo SLA, signed SLA difference, Abandonment Rate, and Talk Time. Calculated SLA below the configured minimum (90% default) and abandonment above the configured maximum (5% default) are highlighted with text as well as color. Exact boundaries pass. Filter to all included dates, target breaches, or significant SLA discrepancies. This additional filter affects the daily table and its export; the official KPI cards and trends use the selected range with all valid dates; simulation proposals have no effect on them. Original records and exclusion controls remain available separately.

Click **Export official table to Excel** to download a genuine `.xlsx` workbook generated in the browser. It contains **all** matching dates across every table page, not just visible rows, plus an **Analysis Settings** sheet with the date range, table filter, selected formula, current targets, and excluded dates. Numeric percentages are stored as percentage points (90 means 90%), with headers that identify the units. Target-breach rows are highlighted. Full AHT cells are blank and the settings sheet explains the missing hold/after-call-work data. The export never estimates Full AHT, sends data to a server, or executes user text as spreadsheet formulas. Empty tables and invalid date ranges disable export.

Additional files:

- `ziwo-review.js`: multi-row validation diagnostics, missing/zero dates, SLA drops, reconciliation, daily results, and export data.
- `xlsx-writer.js`: local, dependency-free OOXML/ZIP workbook generation with literal text cells, numeric metrics, frozen headers, and filters.
- `tests/review.test.js`: quality, reconciliation, daily target, and workbook regression tests.
- `tests/review.html`: 33 browser checks covering these sections, exclusions, target boundaries, filters, and all-page export.

Current validation: **37 Node tests**, **17 original dashboard browser checks**, **52 upload browser checks**, and **33 review browser checks**. A downloaded workbook was independently opened with Python/openpyxl to verify rows, numeric metrics, blank Full AHT, target colors, and Excel structure. No Python dependency is needed to use the app or its export. The native browser tests can be run at `/tests/browser.html`, `/tests/uploads.html`, and `/tests/review.html` on the local test server.

The development workspace cannot read a report held only in someone else's Web Preview browser tab. The saved sample CSV/XLSX files and explicitly synthetic variations were used for development tests. Refresh the preview and select your own report again to run the new data quality and reconciliation checks on it locally. No private report contents need to be sent to the development server or chat.

## Management review refinements

All displayed SLA, abandonment, answer-rate, and SLA-gap values now use **exactly two decimal places**, including cards, daily records, reconciliation, charts, comparison, manual entry results, and Excel display formats. Calculations, flags, and original values retain full precision: a small underlying difference can display `0.00 pp`, and a rounded target value can still miss the target. `dashboard-format.js` supplies the shared formatting. Excel stores unrounded numeric rates in percentage-point units and formats the relevant columns as `0.00` even on highlighted rows.

Dates with **Offered > 0 and Answered = 0** have a clear warning in Data Quality, original records, filtered daily performance, the management summary, and Excel status text. They stay included in official offered counts and SLA/rate denominators; manual proposals affect only the adjusted simulation. Their Average Talk Time is unavailable when there are no answered calls; Full AHT remains unavailable for every report row.

**October 4 and October 11, 2026** are explicit requested investigation dates. They appear as review flags when they fall in the selected range, alongside automatically detected drops. If a date is missing or has no active calls, the dashboard says a drop cannot be confirmed. A requested flag does not invent a drop, alter data, or exclude a date. Automatic drops compare the calculated and reported SLA series independently against their preceding active observations. Data Quality inspects original dates; the official performance table retains all valid active dates in range.

The **management summary** shows count-based overall SLA, target status and percentage-point gap, abandonment rate, answered-weighted Average Talk Time, included active days below the SLA target and above the abandonment target, and data-quality warnings. It never aggregates reported daily SLA by averaging or estimates Full AHT.

The expandable **previous-period comparison** uses the same selected SLA formula and includes all valid dates in both official periods; simulation exclusions do not change it:

- Daily and Weekly: immediately preceding calendar interval with the same inclusive number of days as From–Through. Weekly display grouping does not change that range.
- Month-to-Date: previous calendar month from day 1 through the same day-of-month cutoff, capped at that month's end. The displayed date ranges and calendar-day counts make any shorter prior month explicit.
- Rates show **selected minus previous in percentage points**. Call volumes show **(selected − previous) ÷ previous × 100**.
- Missing dates and exclusions are disclosed for each interval. Partial-period comparisons use observed included data only; missing dates are never assumed to be zero. Missing prior data, zero prior volume, or unavailable rate denominators produce a dash rather than an invented/infinite change. Upload a longer source report if the baseline is not included.

SLA reconciliation preserves both daily values, shows their signed gap, explains the numerator/denominator used by the dashboard, and checks alternatives as hypotheses. It cannot establish Ziwo's internal formula or configured threshold from these columns alone. No formula is automatically selected to force the numbers to match.

New synthetic review fixtures `samples/ziwo-management-sample.csv` and `.xlsx` include September/October comparison coverage, zero answers on October 4, and separate reported/calculated SLA drops on October 11. They contain demonstration data, not a real team's report. For a complete sample comparison, upload either file and select **Month-to-Date**, through `2026-10-11`.

Verification now includes **46 Node tests**, the existing **102 browser checks**, and **26 management browser checks** at `/tests/management.html`. Additional checks independently opened the downloaded Excel file to verify two-decimal number formats, retained zero-answer rows, warning text, and blank Full AHT. Responsive layouts were checked from 320px to 1440px; report processing and export made no application network requests. All changes remain compatible with the standalone HTML preview and static GitHub Pages project paths.

## Exclusion approval management: official results versus simulation

**October 4 and October 11, 2026 remain included in official KPIs while client approval is pending.** Each requested or automatically flagged date has a manually controlled record with **Pending Approval**, **Approved**, or **Rejected**, a reason (up to 2,000 characters), and an explicit **Save record** button. New records start Pending Approval. Edited fields are drafts until saved; normal view/target/chart changes preserve draft text. Changing a recorded status is never proof of client approval and never authorizes or applies an official exclusion.

The two performance scopes are deliberately separate:

- **Official Performance** includes every valid active date in the selected reporting period. Existing official KPI cards, management summary, period comparisons, SLA reconciliation, charts, daily table, and official Excel export do not consume simulation exclusions or approval labels. This version does not offer an action that removes an approved date from official results; applying an official exclusion would require a separately defined, explicit manual process.
- **Adjusted Performance — SIMULATION ONLY** applies only the dates explicitly proposed using the simulation checkboxes. It has its own cards, a management comparison for SLA and abandonment, and signed **adjusted minus official** percentage-point impacts. A pending or rejected proposal can be explored hypothetically, but the simulation is not an approved result and must not be presented as official. The status never automatically selects or deselects a simulation proposal.

The original-data table's include checkboxes now mean **Include in simulation**. They preserve the date-exclusion feature without allowing it to alter official KPIs. The approval table also provides an explicit **Simulation exclusion** checkbox; both controls stay synchronized. **Restore simulation dates** clears proposals only and keeps all saved approval records. Zero-call omission and zero-answer warnings retain their existing meanings; no original imported row or reported Ziwo SLA value is edited.

**Official Excel export** contains the filtered official daily table, analysis settings with no official date exclusions, and an **Exclusion Approval Records** sheet containing the saved manual status/reason and the proposed simulation selection. It retains October 4/11 even when they are proposed for simulation exclusion. **Export adjusted simulation to Excel** is a separate button; the filename starts `SIMULATION-ONLY-`, its data sheet is named `SIMULATION ONLY Adjusted`, and the workbook clearly states that it is hypothetical. Simulation export includes all adjusted active dates, independent of the official table's additional status filter. Full AHT stays blank in both exports.

Records are local to the loaded report in the current tab; no client approval is fetched, inferred, or verified externally. A new valid report/worksheet or refresh resets the records; an invalid upload leaves saved records and valid analysis intact. Save and download the records in Excel for a durable local copy before replacing the report or refreshing. Missing requested dates are labeled as absent, rather than fabricated. No report or record contents are sent to a server.

New implementation and tests: `ziwo-approvals.js`, `tests/approvals.test.js`, and `tests/approvals.html`. **51 Node tests** pass. The existing **128 browser checks** were rerun, with exclusion assertions updated to require official inclusion and simulation-only changes. **22 additional approval browser checks** cover pending defaults, manual status saves, no automatic official changes, unchanged charts/comparisons, draft preservation, simulation impact, separate exports, record preservation, and responsive layout. Downloaded official and simulated XLSX workbooks were independently opened to verify record values, the retained official dates, simulated exclusion, and blank Full AHT.


## Phase 1.1 — unified Command Center

The Command Center is now the application shell, with a collapsible sidebar, Account/Site selectors, reporting range, workspace status, and optional dark mode. Overview shows seven channel cards; unavailable channels show a dash rather than invented results. Its Calls metrics use the loaded **official** report for the selected context, or matching manual totals. Imported Average Talk Time never becomes Full AHT.

**Calls** contains the complete existing manual and Ziwo workflows. Official cards and charts remain visible; management review, approval/simulation controls, daily tables, data quality, and reconciliation use expandable panels to reduce scrolling. Navigation hides existing panels without rebuilding them, preserving reports, chart selections, approval drafts, saved records, and simulation proposals. Official and simulated exports stay separate.

Emails, Quality, CSAT & DSAT, Agent Performance, and cross-channel Management Reports have consistent layouts explicitly marked **Not yet operational**. Management Reports also links to the existing operational Calls reporting tools. Settings provides theme/sidebar controls and a shortcut to the existing Calls formula/target controls. No formulas or target defaults changed.

The original Account options (Relaam, MAF Entertainment, Other), Site options (All sites, UAE, Egypt), and `cc-personal-context-v1` preference remain compatible. Reports capture these labels when file selection starts. Switching context retains the report in memory and displays a guard instead of relabeling its results. Manual totals retain their own context independently. Return to the original selection to recover that workspace, or explicitly import a replacement for the new selection. **All sites never automatically combines UAE and Egypt.** Labels do not verify report origin. New valid imports still replace the current report and reset its report-specific approvals, as before.

The top reporting dates synchronize with the existing report filters; MTD calculates its start automatically. Without a report, dates alone do not create performance data. Theme/sidebar preferences use local browser storage only. The layout adapts from 320px mobile screens to desktop, with a mobile menu, keyboard controls, readable scrollable tables, and dark chart styling.

New source files are `command-center.css` and `command-center.js`. Regenerate `index.html` with `node scripts/embed-assets.js` after editing them. The result remains a self-contained static page compatible with GitHub Pages project paths and sandboxed HTML previews; no backend, remote storage, CDN, or API is used.

Validation: **51 Node tests** and **188 browser checks** (the existing 150 plus 38 navigation/context regressions) pass. Run the new browser suite at `/tests/navigation.html` alongside the existing suites. Additional real-browser checks cover native XLSX upload, official/simulated Excel downloads independently opened with openpyxl, preserved approval drafts, context-switch races, dark mode, stored-context compatibility, 320–1440px layouts, and zero application network requests or console errors. Openpyxl is used only for developer verification, never by the application.
