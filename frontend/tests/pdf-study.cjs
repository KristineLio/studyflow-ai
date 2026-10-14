const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../src/pdfStudy.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
assert.equal(compiled.diagnostics.length,0);
const storage=new Map(),moduleExports={};
const inputLines=[
 {str:'Lists are mutable,',transform:[1,0,0,1,40,600],width:145},
 {str:'but tuples are not.',transform:[1,0,0,1,188,600],width:145},
 {str:'>>> a = [1, 2, 3]',transform:[1,0,0,1,42,565],width:147},
 {str:'>>> a[0]',transform:[1,0,0,1,42,540],width:70},
 {str:'Python examples demonstrate why indexing is useful and what happens when list elements are accessed by their positions, including the first and last elements.',transform:[1,0,0,1,40,510],width:720},
];
const fakePdf={numPages:1,getPage:async()=>({getTextContent:async()=>({items:inputLines}),cleanup:()=>{}}),destroy:async()=>{}};
const context={exports:moduleExports,require:id=>id==='pdfjs-dist'?{GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(fakePdf)})}:'worker.js',localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
vm.runInNewContext(compiled.outputText,context);
const x=context.exports;
const joined=x.linesFromPdfItems(inputLines);
assert.match(joined,/Lists are mutable, but tuples are not\./);
assert.match(joined,/not\.\n>>> a/);
assert.match(joined,/>>> a\[0\]/);
const filename='Lecture2.pdf';
const pages=[
 {file:filename,page:1,text:'Python Lecture 2\nLecture 2\nLists and tuples\nFilip Andonov, test@example.edu'},
 {file:filename,page:2,text:'Content\nSequences\nIndexing\nSlices\nTuples\nLoops'},
 {file:filename,page:3,text:'Sequences\nPython has several built-in types for sequences. The two common types are lists and tuples. The main difference is that lists are mutable, but tuples are not.'},
 {file:filename,page:4,text:'Indexing\nEvery element in a sequence is numbered from 0. With a negative index Python counts from the right, so the last element is at position -1.\n>>> greeting = "Hello"\n>>> greeting[-1]'},
 {file:filename,page:5,text:'Slicing\nSlicing can access ranges of a sequence. The slice stop bound is not included. It is possible to select a step.\n>>> numbers = [1, 2, 3, 4, 5]\n>>> numbers[1:4]'},
 {file:filename,page:6,text:'Tuples\nA tuple is a sequence that is immutable. A list can be changed after creation. This makes tuples useful for values that should not be edited. The syntax uses parentheses and commas.'},
 {file:filename,page:7,text:'Examples\nA negative slice step can reverse part of a sequence. Using a step of zero is not allowed.\n>>> numbers[4:0:-1]'},
];
const evidence=x.selectEvidence(pages);
assert(evidence.length>=3);
assert(evidence.every(e=>e.page>2),'Cover and agenda must be ignored');
assert(evidence.some(e=>e.topic==='lists and tuples'),'Relevant mutability section not found');
const p=x.createPlan('Python','programming',pages);
assert.equal(p.version,2);
assert.equal(p.questions.length,10);
assert.equal(p.questions[0].source.page,3);
assert.match(p.questions[0].question,/lists and tuples/i);
assert(!p.questions.some(q=>q.question.includes('central concept on')));
assert(p.questions.filter(q=>q.stage==='code').some(q=>q.question.includes('>>>')));
assert(p.questions.every(q=>q.source.page>=3));
assert.equal(x.revisionUnlocked(p),false);
assert.equal(x.finalScore(p),null);
for(const q of p.questions.filter(q=>q.stage!=='revision'))p.answers[q.id]={text:'My response',hints:1,score:1};
assert.equal(x.revisionUnlocked(p),true);
assert.equal(x.finalScore(p),null);
for(const q of p.questions.filter(q=>q.stage==='revision'))p.answers[q.id]={text:'Unaided answer',hints:0};
assert.equal(x.allRevisionSubmitted(p),true);
assert.equal(x.finalScore(p),null);
for(const q of p.questions.filter(q=>q.stage==='revision'))p.answers[q.id].score=1;
assert.equal(x.finalScore(p),1);
x.savePlan(p);
assert.equal(x.getPlan().version,2);
x.deletePlan();
assert.equal(x.getPlan(),null);
const legacy={...p,version:1};x.savePlan(legacy);assert.equal(x.getPlan().version,1);x.deletePlan();
assert.throws(()=>x.createPlan('x','general',pages.slice(0,2)),/No substantial teaching content/);
(async()=>{
 const loaded=await x.readPdf({name:'valid.pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(4)});
 assert.equal(loaded.length,1);
 assert.match(loaded[0].text,/mutable/);
 assert.match(loaded[0].text,/>?>>> a\[0\]/);
 console.log('PASS: slide filtering, topic-specific prompts, source examples, line reconstruction, revision gate, score, persistence, legacy sessions and PDF reader.');
})().catch(e=>{console.error(e);process.exitCode=1;});