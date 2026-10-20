'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Z = require('../ziwo.js');
const R = require('../ziwo-review.js');
const X = require('../xlsx-writer.js');
const table = () => Z.parseCSV(fs.readFileSync(path.join(__dirname, '../samples/ziwo-inbound-sample.csv'), 'utf8'));
const rows = () => Z.normalizeRows(table());
test('validation collects invalid rows and duplicate dates, without accepting partial files', () => {
 const input=table();input[1][1]='bad';input[2][4]='00:99:99';input.push(input[3].slice());
 const r=R.validateTable(input);assert.equal(r.issues.length,3);assert.deepEqual(r.issues.map(i=>i.row),[2,3,7]);assert.match(r.issues[0].message,/Inbound Calls/);assert.match(r.issues[2].message,/Duplicate Day/);
 assert.equal(R.validateTable(table()).issues.length,0);assert.ok(Object.isFrozen(R.validateTable(table()).rows));
 assert.match(R.validateTable([['Day'],['invalid']]).issues[0].message,/Missing required/);
});
test('quality distinguishes absent dates from zero rows, including future zeros', () => {
 const quality=R.dataQuality(rows(),{from:'2026-10-01',through:'2026-10-05',today:'2026-10-19'});
 assert.equal(quality.missingCount,2);assert.deepEqual(quality.missing,[{from:'2026-10-03',through:'2026-10-04',count:2}]);assert.equal(quality.zero.length,0);
 const future=R.dataQuality(rows(),{from:'2026-10-31',through:'2026-10-31',today:'2026-10-19'});assert.equal(future.missingCount,0);assert.equal(future.zero.length,1);assert.equal(future.futureZero.length,1);
});
test('quality counts leading and trailing gaps; missing periods are ranges, not fabricated zero days', () => {
 const q=R.dataQuality(rows(),{from:'2026-09-27',through:'2026-10-06'});assert.equal(q.missingCount,6);assert.equal(q.missing[0].from,'2026-09-27');assert.equal(q.missing.at(-1).through,'2026-10-06');
 const empty=R.dataQuality([],{from:'2024-02-28',through:'2024-03-01'});assert.equal(empty.missingCount,3);
});
test('active zero-SLA drop is flagged against prior active observation, with date gap disclosed', () => {
 const q=R.dataQuality(rows(),{from:'2026-10-01',through:'2026-10-05',dropThreshold:10});assert.equal(q.drops.length,1);assert.equal(q.drops[0].date,'2026-10-02');assert.equal(q.drops[0].calculatedDrop,90);
 const gaps=R.dataQuality([{...rows()[1],date:'2026-10-01'},{...rows()[2],date:'2026-10-05'}],{from:'2026-10-01',through:'2026-10-05'});assert.equal(gaps.drops[0].gapDays,4);
});
test('reconciliation separates significant discrepancies from rounding and never changes original SLA', () => {
 const r=rows();const mismatch=r.map(row=>row.date==='2026-10-02'?{...row,reportedSla:70}:row);const original=JSON.stringify(mismatch);
 const result=R.reconciliation(mismatch,{threshold:1});assert.equal(result.significant.length,1);assert.equal(result.significant[0].date,'2026-10-02');assert.equal(result.significant[0].difference,-70);assert.match(result.significant[0].explanation,/Not explained/);assert.equal(JSON.stringify(mismatch),original);
 const rounding=R.reconciliation([{...r[1],inbound:300,before:274,reportedSla:91.33}]);assert.equal(rounding.significant.length,0);assert.equal(rounding.rounded.length,1);assert.match(rounding.daily[0].explanation,/rounding/);
});
test('possible alternative formula matches are hypotheses, not automatic changes', () => {
 const r={...rows()[1],queue:95,reportedSla:90/95*100};const result=R.reconciliation([r]);assert.equal(result.daily[0].calculated,90);assert.match(result.daily[0].explanation,/queue/);assert.match(result.daily[0].explanation,/verify Ziwo settings/);
});
test('significance threshold boundary and invalid denominators are handled explicitly', () => {
 const r={...rows()[1],reportedSla:91};assert.equal(R.reconciliation([r],{threshold:1}).significant.length,1);assert.equal(R.reconciliation([r],{threshold:1.01}).significant.length,0);
 const invalid={...r,queue:91,earlyAbandoned:5};const report=R.reconciliation([invalid],{formula:'queue-adjusted'});assert.equal(report.unmatched.length,1);assert.equal(report.significant.length,0);
});
test('daily performance target boundaries, filtering and full AHT are correct', () => {
 const active=Z.analyze(rows(),{from:'2026-10-01',through:'2026-10-05',excluded:['2026-10-05']}).rows;
 const result=R.dailyPerformance(active);assert.equal(result.length,2);assert.equal(result[0].slaBelow,false);assert.equal(result[0].abandonmentAbove,false);assert.equal(result[1].slaBelow,true);assert.equal(result[1].abandonmentAbove,false);assert.equal(result[1].aht,null);
 assert.equal(R.dailyPerformance([{...rows()[1],abandoned:6}])[0].abandonmentAbove,true);
 const unanswered=R.dailyPerformance([{...rows()[1],answered:0,before:0,talk:0}])[0];assert.equal(unanswered.talk,null);assert.equal(unanswered.aht,null);
});
test('Excel rows match filtered daily rows with percentages in explicit units and AHT blank', () => {
 const performance=R.dailyPerformance(Z.analyze(rows(),{from:'2026-10-01',through:'2026-10-02',excluded:['2026-10-02']}).rows);
 const sheets=R.exportTables(performance,{source:'test.csv',from:'2026-10-01',through:'2026-10-02',view:'daily',formula:'inbound',targets:Z.DEFAULT_TARGETS,excluded:['2026-10-02'],discrepancyThreshold:1});
 assert.equal(sheets[0].rows.length,2);assert.equal(sheets[0].rows[1][0],'2026-10-01');assert.equal(sheets[0].rows[1][4],90);assert.equal(sheets[0].rows[1][7],5);assert.equal(sheets[0].rows[1][10],null);assert.ok(sheets[1].rows.some(row=>row[0]==='Excluded Date'&&row[1]==='2026-10-02'));
});
test('XLSX writer emits a real ZIP with literal escaped strings and no formulas', () => {
 const bytes=X.workbook([{name:'Test',rows:[['Label','Value'],['=HYPERLINK("bad")',90],['<script>&',null]]}]);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 const text=new TextDecoder().decode(bytes);assert.match(text,/inlineStr/);assert.doesNotMatch(text,/<f>/);assert.match(text,/&lt;script&gt;&amp;/);assert.match(text,/<v>90<\/v>/);assert.match(text,/<c r="B3" s="0"\/>/);
 assert.throws(()=>X.workbook([{name:'Bad/name',rows:[['x']]}]));assert.throws(()=>X.workbook([{name:'Test',rows:[['x'],[Infinity]]}]));
});
