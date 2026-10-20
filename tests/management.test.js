'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Z=require('../ziwo.js'),R=require('../ziwo-review.js'),F=require('../dashboard-format.js');
const rows=()=>Z.normalizeRows(Z.parseCSV(fs.readFileSync(path.join(__dirname,'../samples/ziwo-management-sample.csv'),'utf8')));
test('rates and pp displays use exactly two decimals and suppress negative zero',()=>{
 assert.equal(F.fixed(90),'90.00');assert.equal(F.fixed(91.234),'91.23');assert.equal(F.pp(-.001),'0.00 pp');assert.equal(F.pp(-2.123),'−2.12 pp');assert.equal(F.pp(1),'+1.00 pp');assert.equal(F.fixed(null),'—');
});
test('zero answered days remain in aggregated denominators and warn without estimating AHT',()=>{
 const r=rows(),zero=r.find(row=>row.date==='2026-10-04');assert.equal(zero.answered,0);
 const q=R.dataQuality(r,{from:'2026-10-01',through:'2026-10-11'});assert.equal(q.noAnswers.length,1);
 const included=Z.analyze(r,{from:'2026-10-01',through:'2026-10-11'});assert.equal(included.summary.offered,1100);assert.equal(included.rows.length,11);assert.equal(included.summary.aht,null);
 const perf=R.dailyPerformance([zero])[0];assert.equal(perf.noAnswers,true);assert.equal(perf.talk,null);assert.equal(perf.aht,null);
});
test('October 4 and 11 are explicit investigation flags without inventing a drop for missing records',()=>{
 const q=R.dataQuality(rows(),{from:'2026-10-01',through:'2026-10-11'});assert.deepEqual(q.investigation.filter(r=>r.requested).map(r=>r.date),['2026-10-04','2026-10-11']);assert.ok(q.investigation.every(r=>r.drop));
 const absent=R.dataQuality([],{from:'2026-10-04',through:'2026-10-04'});assert.equal(absent.investigation[0].row,null);assert.equal(absent.investigation[0].drop,null);
});
test('management uses count-based SLA, target day counts, answered-weighted talk and quality warnings',()=>{
 const result=R.management(rows(),{from:'2026-10-01',through:'2026-10-11',view:'mtd',formula:'inbound',targets:Z.DEFAULT_TARGETS});
 assert.equal(result.offered,1100);assert.equal(result.before,848);assert.equal(result.sla,848/1100*100);assert.equal(result.achieved,false);assert.equal(result.below,2);assert.equal(result.above,2);assert.equal(result.talk,240);assert.equal(result.quality.noAnswers.length,1);assert.equal(result.aht,null);
});
test('previous daily and weekly periods have identical calendar length, across year boundaries',()=>{
 assert.deepEqual(R.previousPeriod('2026-01-01','2026-01-07'),{from:'2025-12-25',through:'2025-12-31',method:'Immediately preceding period with the same number of calendar days.'});
 assert.equal(R.previousPeriod('2026-10-05','2026-10-11','weekly').from,'2026-09-28');
});
test('MTD previous period uses same cutoff in prior month, with month-end and leap-year cap',()=>{
 assert.equal(R.previousPeriod('2026-10-01','2026-10-11','mtd').through,'2026-09-11');
 assert.equal(R.previousPeriod('2024-03-01','2024-03-31','mtd').through,'2024-02-29');
 assert.equal(R.previousPeriod('2026-01-01','2026-01-19','mtd').from,'2025-12-01');
});
test('comparison shows pp for rates and percentage change for call volumes, not relative rate changes',()=>{
 const r=R.comparePeriods(rows(),{from:'2026-10-01',through:'2026-10-11',view:'mtd'});
 assert.equal(r.previous.offered,880);assert.equal(r.current.offered,1100);assert.equal(r.changes.offered,25);assert.equal(r.previous.sla,90);assert.ok(Math.abs(r.changes.sla-(848/1100*100-90))<1e-10);assert.equal(r.partial,false);
});
test('missing baselines and zero prior volume are unavailable rather than fake zero or infinite changes',()=>{
 const noPrior=R.comparePeriods(rows().filter(r=>r.date.startsWith('2026-10')),{from:'2026-10-01',through:'2026-10-11',view:'mtd'});
 assert.equal(noPrior.changes.offered,null);assert.equal(noPrior.changes.sla,null);assert.equal(noPrior.partial,true);
 const zero=rows().map(row=>row.date.startsWith('2026-09')?{...row,inbound:0,answered:0,before:0,abandoned:0,queue:0,earlyAbandoned:0,talk:0}:row);
 assert.equal(R.comparePeriods(zero,{from:'2026-10-01',through:'2026-10-11',view:'mtd'}).changes.offered,null);
});
test('manual date exclusions apply to both periods while quality preserves original warning records',()=>{
 const r=R.comparePeriods(rows(),{from:'2026-10-01',through:'2026-10-11',view:'mtd',excluded:['2026-10-04','2026-09-04']});assert.equal(r.current.offered,1000);assert.equal(r.previous.offered,800);assert.equal(r.current.excluded,1);assert.equal(r.previous.excluded,1);assert.equal(r.partial,true);
 const m=R.management(rows(),{from:'2026-10-01',through:'2026-10-11',view:'mtd',formula:'inbound',excluded:['2026-10-04']});assert.equal(m.activeDays,10);assert.equal(m.quality.noAnswers.length,1);
});
