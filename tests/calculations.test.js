const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, SAMPLE } = require('../calculations.js');
test('sample formulas and targets', () => {
 const r=calculate(SAMPLE);
 assert.deepEqual(r.metrics,{sla:92,aht:245,abandonment:3,answerRate:96});
 assert.deepEqual(r.targets,{sla:true,aht:true,abandonment:true}); assert.equal(r.other,12);
});
test('inclusive target boundaries', () => {
 assert.deepEqual(calculate({offered:100,answered:95,withinSla:90,abandoned:5,handling:24700}).targets,{sla:true,aht:true,abandonment:true});
});
test('full precision determines missed targets', () => {
 assert.deepEqual(calculate({offered:10000,answered:9499,withinSla:8999,abandoned:501,handling:9499*260+1}).targets,{sla:false,aht:false,abandonment:false});
});
test('zero denominators are unavailable', () => {
 assert.deepEqual(calculate({offered:0,answered:0,withinSla:0,abandoned:0,handling:0}).metrics,{sla:null,aht:null,abandonment:null,answerRate:null});
 assert.deepEqual(calculate({offered:10,answered:0,withinSla:0,abandoned:10,handling:0}).metrics,{sla:0,aht:null,abandonment:100,answerRate:0});
});
test('invalid numbers rejected', () => {
 for(const value of [-1,NaN,Infinity,'',undefined,Number.MAX_SAFE_INTEGER+1,1.5]) assert.ok(calculate({...SAMPLE,offered:value}).error);
 assert.ok(calculate({...SAMPLE,handling:-1}).error);
 assert.equal(calculate({...SAMPLE,handling:0.5}).error,undefined);
});
test('inconsistent totals rejected', () => {
 for(const patch of [{answered:1201},{withinSla:1153},{abandoned:49},{answered:0,withinSla:0}]) assert.ok(calculate({...SAMPLE,...patch}).error);
});
test('fractional results and pending calls', () => {
 const r=calculate({offered:3,answered:1,withinSla:1,abandoned:1,handling:260.5});
 assert.equal(r.other,1); assert.ok(Math.abs(r.metrics.sla-100/3)<1e-12); assert.equal(r.metrics.aht,260.5);
});
