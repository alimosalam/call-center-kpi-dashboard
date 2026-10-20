(function(root){
 'use strict';
 const Z=typeof module!=='undefined'&&module.exports?require('./ziwo.js'):root.Ziwo;
 const R=typeof module!=='undefined'&&module.exports?require('./ziwo-review.js'):root.ZiwoReview;
 const STATUSES=Object.freeze(['Pending Approval','Approved','Rejected']);
 function flaggedDates(rows,dropThreshold=10,formula='inbound'){
  const dates=new Set(R.REVIEW_DATES);
  if(rows.length){const q=R.dataQuality(rows,{from:rows[0].date,through:rows.at(-1).date,dropThreshold,formula});for(const item of q.investigation)dates.add(item.date);}
  return [...dates].sort();
 }
 function record(status='Pending Approval',reason=''){
  if(!STATUSES.includes(status))throw Error('Choose Pending Approval, Approved, or Rejected.');
  if(typeof reason!=='string'||reason.length>2000)throw Error('Reason must be text of at most 2,000 characters.');
  return Object.freeze({status,reason});
 }
 function performance(rows,options,proposed=[]){
  // Approval labels and simulation selections are deliberately not official exclusion inputs.
  const official=Z.analyze(rows,{...options,excluded:[]});
  const adjusted=Z.analyze(rows,{...options,excluded:[...proposed]});
  const gap=key=>official.summary[key]===null||adjusted.summary[key]===null?null:adjusted.summary[key]-official.summary[key];
  return {official,adjusted,impact:{sla:gap('sla'),abandonment:gap('abandonment')},proposed:[...proposed].sort()};
 }
 function exportSheets(records,proposed,scope){
  return {name:'Exclusion Approval Records',rows:[['Date','Manually Recorded Status','Reason','Proposed Simulation Exclusion','Official Inclusion','Record Meaning'],...[...records].sort(([a],[b])=>a.localeCompare(b)).map(([date,item])=>[date,item.status,item.reason,proposed.has(date)?'Yes':'No','Included if present and inside reporting range','User-entered record only; status is not proof of client approval.']),['Export Scope',scope],['Official Policy','All valid dates remain included. This version does not apply approval records or simulation selections to official KPIs.'],['Simulation Policy','Adjusted results are hypothetical; selections may include pending or rejected proposals and must not be presented as official.']]};
 }
 root.ZiwoApprovals={STATUSES,flaggedDates,record,performance,exportSheets};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ZiwoApprovals;
})(typeof globalThis!=='undefined'?globalThis:this);
