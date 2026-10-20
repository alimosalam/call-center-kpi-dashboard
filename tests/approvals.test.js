'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Z=require('../ziwo.js'),A=require('../ziwo-approvals.js');
const rows=()=>Z.normalizeRows(Z.parseCSV(fs.readFileSync(path.join(__dirname,'../samples/ziwo-management-sample.csv'),'utf8')));
const options={from:'2026-10-01',through:'2026-10-11',view:'mtd',formula:'inbound'};
test('pending October review dates stay in official counts despite proposed exclusions',()=>{
 const values=rows(),original=JSON.stringify(values),result=A.performance(values,{...options,excluded:['2026-10-04','2026-10-11']},new Set(['2026-10-04','2026-10-11']));
 assert.equal(result.official.rows.length,11);assert.equal(result.official.summary.offered,1100);assert.equal(result.adjusted.rows.length,9);assert.equal(result.adjusted.summary.offered,900);assert.equal(result.adjusted.summary.sla,92);assert.equal(result.adjusted.summary.abandonment,4);assert.equal(JSON.stringify(values),original);
 assert.equal(result.impact.sla,92-result.official.summary.sla);assert.equal(result.impact.abandonment,4-result.official.summary.abandonment);
});
test('all manual approval status labels are records only and never calculation inputs',()=>{
 const before=A.performance(rows(),options,[]).official.summary;
 for(const status of A.STATUSES){const record=A.record(status,'Manual reason');assert.equal(record.status,status);assert.ok(Object.isFrozen(record));assert.deepEqual(A.performance(rows(),options,[]).official.summary,before);}
 assert.throws(()=>A.record('Auto Approved','reason'));assert.throws(()=>A.record('Approved','x'.repeat(2001)));
});
test('flag records include requested dates even if missing, and actual flagged drops',()=>{
 assert.ok(A.flaggedDates(rows()).includes('2026-10-04'));assert.ok(A.flaggedDates([]).includes('2026-10-11'));
});
test('empty and all-excluded simulation is unavailable, not an official failure',()=>{
 const result=A.performance(rows(),options,rows().map(row=>row.date));assert.equal(result.adjusted.summary.sla,null);assert.equal(result.impact.sla,null);assert.equal(result.official.summary.offered,1100);assert.equal(result.official.summary.aht,null);
 const none=A.performance(rows(),options,[]);assert.equal(none.impact.sla,0);assert.equal(none.impact.abandonment,0);
});
test('approval export preserves manual status, reason and simulation scope without claiming proof',()=>{
 const sheet=A.exportSheets(new Map([['2026-10-04',A.record('Pending Approval','=manual reason')]]),new Set(['2026-10-04']),'SIMULATION ONLY');
 assert.equal(sheet.rows[1][1],'Pending Approval');assert.equal(sheet.rows[1][2],'=manual reason');assert.equal(sheet.rows[1][3],'Yes');assert.match(sheet.rows[1][5],/not proof/);
});
