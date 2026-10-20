'use strict';
const { calculate, SAMPLE } = CallCenter;
const $ = id => document.getElementById(id);
const inputs = [...document.querySelectorAll('#activity input')];
const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
const specs = [
  { key: 'sla', title: 'Service level', unit: '%', target: 'Target ≥ 90%', formula: 'Within SLA ÷ offered × 100', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>' },
  { key: 'aht', title: 'Average handling time', unit: 'sec', target: 'Target ≤ 260 sec', formula: 'Handling seconds ÷ answered', icon: '<circle cx="12" cy="13" r="7"/><path d="M9 2h6M12 6V2m0 7v4l2 2"/>' },
  { key: 'abandonment', title: 'Abandonment rate', unit: '%', target: 'Target ≤ 5%', formula: 'Abandoned ÷ offered × 100', icon: '<path d="m5 5 14 14M9 19h10V9"/>' },
  { key: 'answerRate', title: 'Answer rate', unit: '%', target: 'Informational · no target', formula: 'Answered ÷ offered × 100', icon: '<path d="m5 19 14-14M9 5h10v10"/>' }
];
function render(source) {
  $('data-state').textContent = source;
  const targets = window.DashboardTargets || { sla: 90, abandonment: 5, aht: 260 };
  specs[0].target = `Target ≥ ${DashboardFormat.fixed(targets.sla)}%`;
  specs[1].target = `Target ≤ ${targets.aht} sec`;
  specs[2].target = `Target ≤ ${DashboardFormat.fixed(targets.abandonment)}%`;
  const data = Object.fromEntries(inputs.map(input => [input.name, input.value.trim() === '' ? NaN : input.valueAsNumber]));
  const result = calculate(data);
  if (result.metrics) {
    result.targets = { sla: result.metrics.sla === null ? null : result.metrics.sla >= targets.sla, aht: result.metrics.aht === null ? null : result.metrics.aht <= targets.aht, abandonment: result.metrics.abandonment === null ? null : result.metrics.abandonment <= targets.abandonment };
  }
  $('error').hidden = !result.error;
  $('error').textContent = result.error || '';
  for (const input of inputs) input.setAttribute('aria-invalid', String(Boolean(result.error)));
  const metrics = result.metrics || {};
  $('kpis').innerHTML = specs.map(spec => {
    const value = metrics[spec.key];
    const available = typeof value === 'number';
    const status = !available ? 'neutral' : spec.key === 'answerRate' ? 'info' : result.targets[spec.key] ? 'good' : 'bad';
    const label = !available ? 'No result' : status === 'info' ? 'Informational' : status === 'good' ? 'On target' : 'Needs attention';
    return `<article class="kpi ${status}"><div class="card-top"><h3>${spec.title}</h3><span class="metric-icon" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${spec.icon}</svg></span></div><div class="metric">${available ? value.toFixed(spec.unit === '%' ? 2 : 1) : '—'}<span>${spec.unit}</span></div><div class="card-status"><span class="badge ${status}">${label}</span><span>${spec.target}</span></div><p class="formula">${spec.formula}</p></article>`;
  }).join('');
  const valid = !result.error;
  const total = valid ? data.offered : 0;
  const answeredPercent = total ? data.answered / total * 100 : 0;
  const abandonedPercent = total ? data.abandoned / total * 100 : 0;
  $('donut').style.background = total ? `conic-gradient(var(--teal) 0% ${answeredPercent}%, var(--coral) ${answeredPercent}% ${answeredPercent + abandonedPercent}%, #dfe7ed ${answeredPercent + abandonedPercent}% 100%)` : '#e8edf2';
  $('donut').setAttribute('aria-label', valid ? `${number(total)} offered calls: ${number(data.answered)} answered, ${number(data.abandoned)} abandoned, ${number(result.other)} other or pending.` : 'Call distribution unavailable. Correct the input totals.');
  $('call-total').textContent = valid ? number(total) : '—';
  $('legend').innerHTML = [['Answered', data.answered, 'teal'], ['Abandoned', data.abandoned, 'coral'], ['Other / pending', result.other, 'gray']].map(([label, value, color]) => `<div class="legend-row"><span><i class="dot ${color}"></i>${label}</span><strong>${valid ? number(value) : '—'}</strong><small>${total ? (value / total * 100).toFixed(2) + '%' : '—'}</small></div>`).join('');
  $('target-chart').innerHTML = specs.slice(0, 3).map(spec => {
    const value = metrics[spec.key];
    const available = typeof value === 'number';
    const max = spec.key === 'aht' ? Math.max(520, targets.aht * 2, value || 0) : 100;
    const target = targets[spec.key];
    return `<div class="target-row"><div class="bar-label"><span>${spec.title}</span><strong>${available ? value.toFixed(spec.unit === '%' ? 2 : 1) + (spec.unit === '%' ? '%' : ' sec') : '—'}</strong></div><div class="track" role="img" aria-label="${spec.title}: ${available ? value.toFixed(spec.unit === '%' ? 2 : 1) : 'unavailable'}; ${spec.target}"><div class="fill ${available && !result.targets[spec.key] ? 'miss' : ''}" style="width:${available ? Math.min(100, value / max * 100) : 0}%"></div><span class="marker" style="left:${target / max * 100}%"></span></div><div class="axis"><span>${spec.unit === '%' ? '0.00' : '0'}</span><span>${spec.target}</span><span>${spec.unit === '%' ? DashboardFormat.fixed(max) : number(max)}${spec.unit === '%' ? '%' : ' sec'}</span></div></div>`;
  }).join('');
  const missed = valid ? specs.slice(0, 3).filter(spec => result.targets[spec.key] === false).map(spec => spec.title.toLowerCase()) : [];
  $('insight').textContent = result.error ? 'Correct the call activity above to see your performance insights.' : !data.offered ? 'Enter your call activity or load sample data to see how your team is performing. A dash means there is no data to calculate a result.' : missed.length ? `Focus on ${missed.join(' and ')}. Review the highlighted KPIs against their targets to identify your next coaching opportunity.` : result.targets.aht === null ? 'Percentage targets are on track. Average handling time needs at least one answered call.' : 'All three performance targets are on track. Keep an eye on these measures throughout your reporting period.';
}
function load(data, source) { inputs.forEach(input => { input.value = data[input.name]; }); render(source); }
$('activity').addEventListener('submit', event => event.preventDefault());
$('activity').addEventListener('input', () => render('Your data · updated live'));
$('sample').addEventListener('click', () => load(SAMPLE, 'Sample data'));
$('reset').addEventListener('click', () => load({ offered: 0, answered: 0, withinSla: 0, abandoned: 0, handling: 0 }, 'No call activity'));
load(SAMPLE, 'Sample data');

document.addEventListener('targetschange', () => render($('data-state').textContent));
