const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/pdfStudy.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const storage=new Map(), moduleExports={};
const pageText='A lecture explains important concepts with examples and careful reasoning. Its material contains enough detailed explanation to study the idea and apply it correctly to multiple realistic scenarios and test cases.';
const fakePdf={numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:pageText}]}),cleanup:()=>{}}),destroy:async()=>{}};
const context={
  exports:moduleExports,
  require:(id)=>id==='pdfjs-dist'?{
    GlobalWorkerOptions:{},
    getDocument:()=>({promise:Promise.resolve(fakePdf)})
  }:'worker.js',
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
};
vm.runInNewContext(compiled.outputText,context);
const api=context.exports;
const pages=Array.from({length:15},(_,i)=>({file:'private-notes.pdf',page:i+1,text:'This lecture page describes concept '+i+' and its practical implications. It contains an explanation of rules and patterns that students must understand. We can provide examples and counterexamples to demonstrate how it works.'}));
let plan=api.createPlan('My course','general',pages);
assert.equal(plan.questions.length,10);assert.equal(plan.questions[0].source.page,1);
assert.equal(plan.questions.filter(q=>q.stage==='revision').length,2);
assert.ok(plan.questions.find(q=>q.stage==='code').question.includes('Apply'));
assert.equal(api.revisionUnlocked(plan),false);
assert.equal(api.finalScore(plan),null);
for(const q of plan.questions.filter(q=>q.stage!=='revision'))plan.answers[q.id]={text:'Careful answer',hints:0,score:1};
assert.equal(api.revisionUnlocked(plan),true);
assert.equal(api.finalScore(plan),null);
for(const q of plan.questions.filter(q=>q.stage==='revision'))plan.answers[q.id]={text:'Unaided answer',hints:0};
assert.equal(api.allRevisionSubmitted(plan),true);
assert.equal(api.finalScore(plan),null);
for(const q of plan.questions.filter(q=>q.stage==='revision'))plan.answers[q.id].score=1;
assert.equal(api.finalScore(plan),1);
api.savePlan(plan);assert.equal(api.getPlan().title,'My course');
api.deletePlan();assert.equal(api.getPlan(),null);
assert.throws(()=>api.createPlan('empty','general',[{file:'scan.pdf',page:1,text:''}]),/meaningful text/);
api.readPdf({name:'scan.pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(4)}).then(x=>assert.equal(x.length,1)).then(()=>console.log('PASS: PDFs are processed in the browser; 10 source-linked questions, revision lock, self-assessment, saved work, reset, and empty PDF guard.')).catch(e=>{console.error(e);process.exitCode=1;});
