# Call Center KPI Dashboard

A responsive dashboard for team leaders, using only HTML, CSS, and vanilla JavaScript. No installation, external libraries, internet connection, or API keys are required.

## Run the dashboard

1. Download or copy the project folder to your computer. If downloading from GitHub, use **Code → Download ZIP** and extract it first.
2. Double-click **index.html** to open it in Chrome, Edge, Firefox, or Safari. It includes its own styles and scripts, so you can also open this file alone in an HTML Web Preview.
3. Replace the sample totals with your figures for the same reporting period. Results update as you type.
4. **Load sample data** restores the example. **Reset** sets all inputs to zero.

Data stays in your current browser tab; it is not transmitted or saved. Refreshing restores the sample data.

## Calculations and targets

| KPI | Formula | Target |
| --- | --- | --- |
| Service level | Answered within SLA ÷ offered × 100 | ≥ 90% |
| Average handling time | Handling seconds ÷ answered | ≤ 260 seconds |
| Abandonment rate | Abandoned ÷ offered × 100 | ≤ 5% |
| Answer rate | Answered ÷ offered × 100 | Informational; no target |

Green **On target** and orange **Needs attention** indicators use full precision; displayed values are rounded to one decimal. A number close to a target can therefore appear equal while missing it. A dash means there is no denominator or inputs need correcting.

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
