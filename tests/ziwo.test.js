'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Z = require('../ziwo.js');
const source = fs.readFileSync(path.join(__dirname, '../samples/ziwo-inbound-sample.csv'), 'utf8');
const table = () => Z.parseCSV(source);
const rows = () => Z.normalizeRows(table());
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test('Ziwo CSV keeps headers, rows, reported percentages, and seconds', () => {
 const values=rows();assert.equal(values.length,5);assert.equal(values[0].date,'2026-09-28');assert.equal(values[1].reportedSla,90);assert.equal(values[2].reportedSla,0);assert.equal(values[1].talk,100);assert.equal(values[2].talk,300);
 assert.equal(values[1].original['Average Talk Time for Queue Calls'],'00:01:40');assert.ok(Object.isFrozen(values));assert.ok(Object.isFrozen(values[0].original));
});
test('overall SLA uses counts, not a mean of daily percentages', () => {
 const r=Z.analyze(rows(),{from:'2026-10-01',through:'2026-10-02'});
 assert.equal(r.summary.sla,9);assert.equal(r.summary.offered,1000);assert.equal(r.summary.answered,900);assert.equal(r.summary.abandoned,50);assert.equal(r.summary.abandonment,5);assert.equal(r.summary.answerRate,90);assert.equal(r.summary.talk,280);assert.equal(r.summary.aht,null);
});
test('queue and short-abandon-adjusted SLA use configurable count denominators', () => {
 const table2=table();table2[1][7]=45;table2[1][9]=35;
 const r=Z.normalizeRows(table2);
 near(Z.aggregate([r[0]],'queue').sla,35/45*100);
 near(Z.aggregate([r[0]],'queue-adjusted').sla,35/44*100);
 near(Z.analyze(rows(),{from:'2026-10-01',through:'2026-10-02',formula:'queue-adjusted'}).summary.sla,90/978*100);
});
test('manual exclusions change results without modifying original rows', () => {
 const values=rows(), original=JSON.stringify(values);
 const r=Z.analyze(values,{from:'2026-10-01',through:'2026-10-02',excluded:['2026-10-02']});
 assert.equal(r.summary.sla,90);assert.equal(r.summary.talk,100);assert.equal(r.groups.length,1);assert.equal(JSON.stringify(values),original);
});
test('active zero-SLA days remain; zero-volume future dates do not create points', () => {
 const r=Z.analyze(rows(),{from:'2026-10-01',through:'2026-10-31'});
 assert.equal(r.groups.length,3);assert.equal(r.groups[1].sla,0);assert.equal(r.groups[1].reportedSla,0);assert.equal(r.zeroDays,1);assert.equal(r.summary.offered,1200);assert.equal(r.summary.sla,22.5);
});
test('weekly Monday buckets sum counts and weight talk time across month boundaries', () => {
 const r=Z.analyze(rows(),{from:'2026-09-01',through:'2026-10-31',view:'weekly'});
 assert.deepEqual(r.groups.map(g=>g.date),['2026-09-28','2026-10-05']);
 near(r.groups[0].sla,125/1050*100);near(r.groups[0].talk,258000/940);assert.equal(r.groups[0].reportedSla,null);
 assert.equal(Z.weekStart('2026-10-04'),'2026-09-28');
});
test('MTD respects month and cutoff even if From is earlier', () => {
 const r=Z.analyze(rows(),{from:'2026-09-01',through:'2026-10-02',view:'mtd'});
 assert.equal(r.start,'2026-10-01');assert.equal(r.summary.offered,1000);assert.equal(r.groups.length,2);
});
test('empty/all excluded periods have unavailable KPIs, never NaN', () => {
 const r=Z.analyze(rows(),{from:'2026-10-31',through:'2026-10-31'});
 assert.equal(r.groups.length,0);assert.equal(r.summary.sla,null);assert.equal(r.summary.talk,null);assert.equal(r.summary.abandonment,null);
 assert.equal(Z.analyze(rows(),{excluded:rows().map(r=>r.date)}).summary.offered,0);
});
test('dates validate calendar days and configurable date order', () => {
 assert.equal(Z.parseDate('02/10/2026'),'2026-10-02');assert.equal(Z.parseDate('02/10/2026','mdy'),'2026-02-10');assert.equal(Z.parseDate(46296),'2026-10-01');
 for(const value of ['2026-02-29','31/04/2026','garbage',60,NaN])assert.throws(()=>Z.parseDate(value));
 assert.equal(Z.parseDate('2024-02-29'),'2024-02-29');
});
test('durations accept seconds, MM:SS, HH:MM:SS, decimal seconds, and Excel day fractions', () => {
 assert.equal(Z.duration('04:20','talk'),260);assert.equal(Z.duration('01:04:20.5','talk'),3860.5);assert.equal(Z.duration('260 sec','talk'),260);assert.equal(Z.duration(260,'talk'),260);near(Z.duration(260/86400,'talk',true),260);
 for(const value of ['00:60:00','04:60','-1','4 minutes','',Infinity])assert.throws(()=>Z.duration(value,'talk'));
});
test('strict numeric and structural validation rejects invalid reports', () => {
 assert.throws(()=>Z.normalizeRows([['Day'],['2026-01-01']]),/Missing required/);
 const duplicate=table();duplicate[0][1]='Day';assert.throws(()=>Z.normalizeRows(duplicate));
 const dupDay=table();dupDay.push(dupDay[1]);assert.throws(()=>Z.normalizeRows(dupDay),/Duplicate Day/);
 for(const [col,value] of [[1,-1],[1,1.5],[1,''],[2,'101%'],[4,'00:99:99'],[5,101],[9,91],[10,6],[1,'1e2'],[1,'1,00']]){
  const t=table();t[2][col]=value;assert.throws(()=>Z.normalizeRows(t),`column ${col}, ${value}`);
 }
 const bad=table();bad[5][4]='00:00:01';assert.throws(()=>Z.normalizeRows(bad),/zero when answered/);
});
test('CSV handles BOM, CRLF, quoting, thousands, and alternative separators', () => {
 assert.deepEqual(Z.parseCSV('\uFEFFa,b\r\n"x,y","a""b"\r\n'),[['a','b'],['x,y','a"b']]);
 assert.deepEqual(Z.parseCSV('a;b\n1;2'),[['a','b'],['1','2']]);assert.deepEqual(Z.parseCSV('a\tb\n1\t2'),[['a','b'],['1','2']]);
 assert.equal(Z.numeric('1,200','n',true),1200);
 assert.throws(()=>Z.parseCSV('a,b\n"unclosed,2'),/Unclosed/);assert.throws(()=>Z.parseCSV('a,b\n"x"oops,2'));
});
test('Excel percentage and duration formatting are interpreted without guessing plain numbers', () => {
 const t=table();t[2][2]=0.9;t[2].percentCells=new Set([2]);t[2][4]=100/86400;t[2].timeCells=new Set([4]);const r=Z.normalizeRows(t);assert.equal(r[1].reportedSla,90);near(r[1].talk,100);
 t[2].percentCells.clear();assert.equal(Z.normalizeRows(t)[1].reportedSla,.9);
});
test('invalid selected SLA denominator is unavailable rather than clamped', () => {
 const value={...rows()[1],queue:91,earlyAbandoned:5};const r=Z.aggregate([value],'queue-adjusted');assert.equal(r.sla,null);assert.equal(r.formulaInvalid,true);
 assert.throws(()=>Z.aggregate(rows(),'unknown'));
});
test('synthetic sample spans weeks, zero-volume placeholders and real zero-SLA days', () => {
 const values=Z.normalizeRows(Z.sampleTable('2026-10-19'));assert.equal(values.length,38);assert.ok(values.some(r=>r.inbound>0&&r.before===0));assert.ok(values.some(r=>r.date>'2026-10-19'&&!r.inbound));
});
test('aggregate rejects combined counts or duration beyond safe range', () => {
 const value={...rows()[0],inbound:Number.MAX_SAFE_INTEGER};assert.throws(()=>Z.aggregate([value,value]),/safe numeric/);
 assert.throws(()=>Z.aggregate([{...rows()[0],talk:Number.MAX_SAFE_INTEGER}]),/duration/);
});
test('early abandoned calls remain in default denominator and are excluded only explicitly', () => {
 const values=rows().slice(1,3);
 assert.equal(Z.aggregate(values).denominator,1000);assert.equal(Z.aggregate(values).sla,9);
 assert.equal(Z.aggregate(values,'inbound-adjusted').denominator,978);
 assert.equal(Z.aggregate(values,'inbound-adjusted').offered,1000);assert.equal(Z.aggregate(values,'inbound-adjusted').abandoned,50);
});
test('calculated vs original Ziwo SLA differences use percentage points and preserve zeros', () => {
 assert.deepEqual(Z.compareSla(0,0),{difference:0,mismatch:false});assert.deepEqual(Z.compareSla(90,91),{difference:-1,mismatch:true});assert.deepEqual(Z.compareSla(null,90),{difference:null,mismatch:false});
 assert.equal(Z.compareSla(91.333333333,91.33).mismatch,true);assert.equal(Z.compareSla(90+1e-12,90).mismatch,false);
 const values=rows(),modified=values.map(row=>row.date==='2026-10-02'?{...row,reportedSla:70}:row);
 const r=Z.aggregate(modified.slice(1,3));assert.equal(r.sla,9);assert.equal(modified[2].reportedSla,70);assert.equal(Z.compareSla(Z.aggregate([modified[2]]).sla,modified[2].reportedSla).difference,-70);
});
