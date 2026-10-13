const fs=require('fs');const vm=require('vm');const ts=require('typescript');const assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../src/demoApi.ts','utf8');
const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
assert.equal((compiled.diagnostics??[]).length,0,JSON.stringify(compiled.diagnostics));
const catalog=require('../src/demoCatalog.json');const storage=new Map();let moduleExports={};
const context={exports:moduleExports,require:(p)=>p.endsWith('.json')?{default:catalog}:{STAGES:['theory','tests','code','problems','revision']},window:{localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}}};
vm.runInNewContext(compiled.outputText,context);const api=context.exports.showcaseRequest;const post=(path,x)=>api(path,{method:'POST',body:JSON.stringify(x)});
const courses=api('/courses'); assert.equal(courses.length,1);assert.equal(courses[0].lectures.length,14);
let lecture=api('/lectures/1');assert.equal(lecture.questions.length,10);assert.equal(lecture.progress.overall,null);
assert.throws(()=>post('/questions/1009/attempts',{answer:'A',hints_used:0}),/Complete Theory/);
assert.throws(()=>post('/questions/1009/hint',{hint_number:1}),/Hints are not available/);
assert.throws(()=>post('/lectures/1/sources',{name:'private.pdf'}),/full application/);
let questions=lecture.questions;
for(const q of questions.filter(q=>q.stage!=='revision')){
  const mcq=q.choices.length>0;const a=post(`/questions/${q.id}/attempts`,{answer:mcq?(q.id===1003?'B':'C'):'My considered Python answer',hints_used:0});
  if(!mcq){assert.equal(a.score,null);assert.ok(a.model_answer);const saved=post(`/attempts/${a.attempt_id}/self-grade`,{score:1});assert.equal(saved.score,1)}
}
lecture=api('/lectures/1');assert.equal(lecture.progress.stages.theory.complete,true);assert.equal(lecture.progress.stages.problems.complete,true);assert.equal(lecture.progress.stages.revision.complete,false);
const r1=post('/questions/1009/attempts',{answer:'A',hints_used:0});assert.equal(r1.score,null);assert.equal(r1.model_answer,'');assert.equal(api('/lectures/1').latest_attempts[1009].score,null);
assert.throws(()=>post('/questions/1009/attempts',{answer:'A',hints_used:0}),/final/);
const r2=post('/questions/1010/attempts',{answer:'B',hints_used:0});assert.equal(r2.score,1);lecture=api('/lectures/1');assert.equal(lecture.progress.stages.revision.complete,true);assert.ok(lecture.progress.overall!==null);assert.equal(lecture.latest_attempts[1009].score,1);
assert.equal(api('/courses')[0].lectures[0].progress.overall,lecture.progress.overall);
assert.equal(storage.size,1); // browser-local state survives the in-app navigation
assert.throws(()=>post('/questions/1010/attempts',{answer:'A',hints_used:0}),/final/);
context.exports.resetShowcase();assert.equal(api('/lectures/1').progress.overall,null);
console.log('PASS: 14 lectures, revision gate, 8 practice questions, self-grading, sealed results, no resubmission, score, persistence, reset.');