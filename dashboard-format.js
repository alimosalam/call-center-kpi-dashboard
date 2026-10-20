(function(root){
 'use strict';
 const fixed = (value, digits=2) => value === null || value === undefined || !Number.isFinite(value) ? '—' : (Math.abs(value)<.005 ? 0 : value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 const pp = value => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value < -.004999999 ? '−' : value > .004999999 ? '+' : ''}${fixed(Math.abs(value))} pp`;
 root.DashboardFormat={fixed,pp};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.DashboardFormat;
})(typeof globalThis!=='undefined'?globalThis:this);
