(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { overview:'Performance overview', calls:'Calls', emails:'Emails', quality:'Quality', csat:'CSAT & DSAT', agents:'Agent Performance', reports:'Management Reports', settings:'Settings' };
  const descriptions = { overview:'One workspace for your contact center. A clear view of what matters.', calls:'Manual Calls and Ziwo analytics. Official results stay separate from simulations.', emails:'Email service performance · planned module', quality:'Audit and coaching performance · planned module', csat:'Customer satisfaction and dissatisfaction · planned module', agents:'Individual performance and scorecards · planned module', reports:'Cross-channel management reporting · planned module', settings:'Appearance, local preferences and reporting configuration.' };
  let module = 'overview', report = null, manual = null, loadedContext = null;
  const context = () => ({ account:$('cc-account').value, site:$('cc-site').value });
  const same = (a,b) => Boolean(a && b && a.account === b.account && a.site === b.site);
  const contextLabel = value => `${value.account} / ${value.site}`;
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function store(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Reports still work when browser storage is unavailable. */ } }
  const saved = read('cc-personal-context-v1');
  for (const key of ['account','site']) if (saved && [...$('cc-'+key).options].some(option=>option.value===saved[key])) $('cc-'+key).value=saved[key];
  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    for (const id of ['cc-theme','cc-settings-theme']) $(id).setAttribute('aria-pressed',String(dark));
    $('cc-theme').setAttribute('aria-label',dark ? 'Switch to light mode' : 'Switch to dark mode');
    $('cc-settings-theme').textContent = dark ? 'Use light mode' : 'Enable dark mode';
    store('cc-theme-v1',dark ? 'dark' : 'light');
  }
  setTheme(read('cc-theme-v1') === 'dark');
  for (const id of ['cc-theme','cc-settings-theme']) $(id).addEventListener('click',()=>setTheme(document.documentElement.dataset.theme!=='dark'));
  function collapse(value) {
    document.body.classList.toggle('sidebar-collapsed',value);
    $('cc-collapse').setAttribute('aria-expanded',String(!value));
    $('cc-collapse').setAttribute('aria-label',value ? 'Expand sidebar' : 'Collapse sidebar');
    $('cc-collapse').querySelector('.nav-label').textContent=value ? 'Expand sidebar' : 'Collapse sidebar';
    store('cc-sidebar-collapsed-v1',value);
  }
  collapse(read('cc-sidebar-collapsed-v1') === true);
  for (const id of ['cc-collapse','cc-settings-collapse']) $(id).addEventListener('click',()=>collapse(!document.body.classList.contains('sidebar-collapsed')));
  function mobileMenu(open) {
    document.body.classList.toggle('sidebar-open',open);
    $('cc-menu').setAttribute('aria-expanded',String(open));
    $('cc-backdrop').hidden=!open;
    $('cc-sidebar').inert = matchMedia('(max-width: 760px)').matches && !open;
  }
  $('cc-menu').addEventListener('click',()=>mobileMenu(!document.body.classList.contains('sidebar-open')));
  $('cc-backdrop').addEventListener('click',()=>{ mobileMenu(false); $('cc-menu').focus(); });
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && document.body.classList.contains('sidebar-open')) { mobileMenu(false); $('cc-menu').focus(); }
    if (event.key==='Tab' && document.body.classList.contains('sidebar-open') && matchMedia('(max-width: 760px)').matches) {
      const nodes=[...$('cc-sidebar').querySelectorAll('a,button')].filter(el=>el.offsetWidth);
      if (event.shiftKey && document.activeElement===nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement===nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    }
  });
  matchMedia('(max-width: 760px)').addEventListener('change',()=>mobileMenu(false));
  $('cc-menu').addEventListener('click',()=>{ if (document.body.classList.contains('sidebar-open')) $('cc-sidebar').querySelector('a').focus(); });
  function navigate(key,history=true,focus=true) {
    if (!(key in labels)) key='overview';
    module=key;
    document.querySelectorAll('[data-module-page]').forEach(page=>page.hidden=page.dataset.modulePage!==key);
    document.querySelectorAll('[data-cc-module]').forEach(button=>{ if(button.dataset.ccModule===key)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); });
    $('cc-page-title').textContent=labels[key]; $('cc-page-description').textContent=descriptions[key]; $('cc-breadcrumb').textContent=`WORKSPACE / ${key==='csat'?'CSAT & DSAT':labels[key].toUpperCase()}`;
    if (history && location.hash!==`#${key}`) {
      try { window.history.pushState({module:key},'',`#${key}`); } catch { /* Sandboxed standalone previews may prohibit history changes. */ }
    }
    mobileMenu(false); renderContext();
    if (focus) $('main-content').focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  }
  document.querySelectorAll('[data-cc-module]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.ccModule)));
  window.addEventListener('popstate',()=>navigate(location.hash.slice(1),false));
  window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==module)navigate(location.hash.slice(1),false);});
  function openCalls(workspace='ziwo') {
    navigate('calls');
    if(workspace==='reports') { reveal('management-title');return; }
    $(workspace==='manual'?'manual-tab':'report-tab').click();
  }
  document.querySelectorAll('[data-open-calls]').forEach(button=>button.addEventListener('click',()=>openCalls(button.dataset.openCalls)));
  $('cc-open-ziwo').addEventListener('click',()=>{ openCalls(); if (!loadedContext || same(loadedContext,context())) $('ziwo-upload').click(); });
  document.addEventListener('calls:open',()=>{ if(module!=='calls')navigate('calls'); });
  document.addEventListener('calls:workspace',renderContext);
  function reveal(id) {
    navigate('calls');
    if(id!=='activity')$('report-tab').click();else $('manual-tab').click();
    const node=$(id);if(!node)return;
    let parent=node.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
    node.scrollIntoView({block:'start'});
  }
  document.addEventListener('click',event=>{if(event.target.closest('#show-discrepancies')){const node=$('performance-title');let parent=node.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}}},true);
  function renderContext() {
    const boundContext=!$('report-workspace').hidden ? loadedContext : manual?.context;
    const mismatch=Boolean(boundContext&&!same(boundContext,context()));
    $('cc-context-guard').hidden=!mismatch;
    $('calls-context-content').hidden=mismatch;
    $('cc-context-guard-message').textContent=mismatch ? `The loaded Calls data belongs to ${contextLabel(boundContext)}. You selected ${contextLabel(context())}. Its data remains in memory and is not shown as performance for this selection.` : '';
    $('cc-context-note').textContent=boundContext ? `Loaded Calls context: ${contextLabel(boundContext)}. ${mismatch?'Switch back to view it. ':''}Account/Site labels do not validate report origin. All sites never automatically combines UAE and Egypt data.` : 'Select the Account and Site that describe your report before importing. All sites is an unspecified label, not a combined UAE/Egypt calculation.';
    $('cc-workspace-status').textContent=mismatch?'Data retained · other context':report&&same(loadedContext,context())?'Local · report loaded':manual&&same(manual.context,context())?'Local · manual totals':'Browser only';
    if(report) updateRange(same(loadedContext,context())?report.from:'',same(loadedContext,context())?report.through:'');
    $('cc-from').disabled=Boolean(report&&!same(loadedContext,context())) || Boolean(report&&same(loadedContext,context())&&$('ziwo-from').disabled);
    $('cc-through').disabled=Boolean(report&&!same(loadedContext,context()));
    $('cc-workspace-status').classList.toggle('status-warning',mismatch);
    renderOverview();
  }
  for (const id of ['cc-account','cc-site']) $(id).addEventListener('change',()=>{store('cc-personal-context-v1',context());renderContext();});
  $('cc-return-context').addEventListener('click',()=>{const bound=!$('report-workspace').hidden ? loadedContext : manual?.context;if(bound){$('cc-account').value=bound.account;$('cc-site').value=bound.site;store('cc-personal-context-v1',context());renderContext();}});
  $('cc-replace-context').addEventListener('click',()=>{ $('ziwo-file').click(); });
  function updateRange(from,through) {
    $('cc-from').value=from||'';$('cc-through').value=through||'';
  }
  for(const id of ['cc-from','cc-through']) $(id).addEventListener('change',()=>{
    if(report && same(loadedContext,context())) {
      $('ziwo-from').value=$('cc-from').value;$('ziwo-through').value=$('cc-through').value;
      $('ziwo-through').dispatchEvent(new Event('change',{bubbles:true}));
    } else { $('cc-overview-source').textContent='A date range alone does not supply KPI data. Import a report in Calls to analyze this period.'; }
  });
  function overviewCard(title,value,unit,note,status='unavailable') {
    const card=document.createElement('article');card.className=`overview-card ${status}`;
    const heading=document.createElement('h3');heading.textContent=title;
    const mark=document.createElement('span');mark.className='overview-mark';mark.textContent=status==='available'?'●':'○';mark.setAttribute('aria-hidden','true');
    const line=document.createElement('div');line.className='overview-value';line.textContent=value;const small=document.createElement('span');small.textContent=unit;line.append(small);
    const text=document.createElement('p');text.textContent=note;card.append(heading,mark,line,text);return card;
  }
  function renderOverview() {
    const relevant=report&&same(loadedContext,context());
    const manualRelevant=manual&&same(manual.context,context())&&(!loadedContext||!same(loadedContext,context()));
    const data=relevant?report.summary:manualRelevant?manual.metrics:null;
    const F=DashboardFormat.fixed;
    const sla=data?.sla ?? null;
    const abandonment=data?.abandonment ?? null;
    const aht=manualRelevant?(data?.aht ?? null):null;
    $('cc-overview-kpis').replaceChildren(
      overviewCard('Calls SLA',F(sla),'%',data?`Target ≥ ${F(window.DashboardTargets.sla)}% · ${relevant?'Official Ziwo calculation':'Manual totals'}`:'No Calls data in this context',sla===null?'unavailable':'available'),
      overviewCard('Abandonment',F(abandonment),'%',data?`Target ≤ ${F(window.DashboardTargets.abandonment)}%`:'Import a Calls report to calculate',abandonment===null?'unavailable':'available'),
      overviewCard('AHT',F(aht),'sec',relevant?'Unavailable in Ziwo · talk time is not AHT':aht===null?'Full handling-time data required':'Calculated from manual handling totals',aht===null?'unavailable':'available'),
      ...[['Email SLA','Email analytics is not yet operational'],['Quality','Audit scoring is not yet operational'],['CSAT','Survey analytics is not yet operational'],['Agent Performance','Agent scorecards are not yet operational']].map(([title,note])=>overviewCard(title,'—','',note))
    );
    $('cc-overview-source').textContent=relevant?`${report.source} · Official Calls performance · ${report.from} → ${report.through}. Local report snapshot; not a live feed.`:manualRelevant?`Manual Calls totals · ${manual.source}. ${manual.source==='Sample data'?'Demonstration data; not live operations.':''}`:loadedContext?`Report retained for ${contextLabel(loadedContext)}. No data is attributed to ${contextLabel(context())}.`:'Import a Ziwo report or enter manual Calls totals. Unavailable channels show no invented live KPI values.';
  }
  document.addEventListener('ziwo:loaded',event=>{loadedContext=event.detail.context||context();renderContext();});
  document.addEventListener('ziwo:summary',event=>{
    report=event.detail;loadedContext=event.detail.context||loadedContext||context();
    updateRange(report.from,report.through);renderContext();
  });
  document.addEventListener('ziwo:invalid-range',()=>{report=null;updateRange($('ziwo-from').value,$('ziwo-through').value);$('cc-overview-source').textContent='Correct the Calls date range to display performance.';renderOverview();});
  document.addEventListener('calls:manual',event=>{manual={...event.detail,context:event.detail.context||context()};renderOverview();});
  document.addEventListener('targetschange',renderOverview);
  // Collapse lengthy report workflows into distinct, accessible tools without recreating any data or controls.
  function group(title,nodes,after=null) {
    if(!nodes.length)return;
    const detail=document.createElement('details');detail.className='report-tool';
    const summary=document.createElement('summary');summary.textContent=title;detail.append(summary);
    const first=nodes[0];first.before(detail);for(const node of nodes)detail.append(node);
    if(after)after.after(detail);
    return detail;
  }
  group('Management summary & previous-period comparison',[$('management-title').closest('.panel')]);
  group('Approval records & adjusted simulation',[$('approval-title').closest('.panel'),$('adjusted-title').closest('.panel')],$('ziwo-trend').closest('.panel'));
  group('Official daily performance & Excel export',[$('performance-title').closest('.panel')]);
  group('Original daily records & simulation selections',[$('ziwo-daily-heading').closest('.panel')]);
  const quality=$('ziwo-quality');const qualityGroup=group('Data quality & validation',[quality]);qualityGroup.hidden=quality.hidden;
  new MutationObserver(()=>{qualityGroup.hidden=quality.hidden;if(!$('quality-invalid').hidden)qualityGroup.open=true;}).observe(quality,{attributes:true,attributeFilter:['hidden'],subtree:true});
  group('SLA reconciliation & investigation',[$('ziwo-comparison'),$('reconciliation-title').closest('.panel')]);
  window.CommandCenter={context,navigate,openCalls,reveal};
  navigate(location.hash.slice(1)||'overview',false,false);
})();
