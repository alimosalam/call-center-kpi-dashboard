(function (root) {
  'use strict';
  const SAMPLE = Object.freeze({ offered: 1200, answered: 1152, withinSla: 1104, abandoned: 36, handling: 282240 });
  function calculate(data) {
    const names = ['offered', 'answered', 'withinSla', 'abandoned', 'handling'];
    for (const name of names) {
      if (typeof data[name] !== 'number' || !Number.isFinite(data[name]) || data[name] < 0 || data[name] > Number.MAX_SAFE_INTEGER || (name !== 'handling' && !Number.isSafeInteger(data[name]))) {
        return { error: 'Enter valid, non-negative numbers in every field. Call counts must be whole numbers within the safe number range.' };
      }
    }
    if (data.answered > data.offered) return { error: 'Answered calls cannot exceed offered calls.' };
    if (data.withinSla > data.answered) return { error: 'Calls answered within SLA cannot exceed answered calls.' };
    if (data.abandoned > data.offered - data.answered) return { error: 'Answered and abandoned calls together cannot exceed offered calls.' };
    if (!data.answered && data.handling > 0) return { error: 'Handling time must be zero when no calls were answered.' };
    const percent = n => data.offered ? (n / data.offered) * 100 : null;
    const metrics = { sla: percent(data.withinSla), aht: data.answered ? data.handling / data.answered : null, abandonment: percent(data.abandoned), answerRate: percent(data.answered) };
    if (Object.values(metrics).some(value => value !== null && !Number.isFinite(value))) return { error: 'These totals produce a result outside the supported number range.' };
    return { metrics, other: data.offered - data.answered - data.abandoned, targets: { sla: metrics.sla === null ? null : metrics.sla >= 90, aht: metrics.aht === null ? null : metrics.aht <= 260, abandonment: metrics.abandonment === null ? null : metrics.abandonment <= 5 } };
  }
  root.CallCenter = { calculate, SAMPLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CallCenter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
