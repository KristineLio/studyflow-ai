import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
export type Stage = 'theory'|'tests'|'code'|'problems'|'revision';
export const stages:Stage[]=['theory','tests','code','problems','revision'];
export type Passage = {file:string;page:number;text:string};
export type Prompt = {id:string;stage:Stage;question:string;source:Passage};
export type Answer = {text:string;hints:number;score?:number};
export type Plan = {version:1;title:string;track:'general'|'programming';files:string[];questions:Prompt[];answers:Record<string,Answer>};
const STORE='studyflow-uploaded-plan-v1';
export function getPlan():Plan|null{
  try {const v=JSON.parse(localStorage.getItem(STORE)||'null') as Plan|null;return v?.version===1&&Array.isArray(v.questions)&&v.answers? v:null;}catch{return null;}
}
export function savePlan(plan:Plan){try{localStorage.setItem(STORE,JSON.stringify(plan));}catch{throw Error('Your browser storage is unavailable or full. Please try smaller PDFs.');}}
export function deletePlan(){localStorage.removeItem(STORE);}
export async function readPdf(file:File):Promise<Passage[]>{
  if(!file.name.toLowerCase().endsWith('.pdf'))throw Error('Please choose PDF files.');
  if(file.size>12*1024*1024)throw Error(file.name+' is over the 12 MB limit.');
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pdf=await task.promise;
  try{
    if(pdf.numPages>100)throw Error(file.name+' is longer than 100 pages.');
    const pages:Passage[]=[];
    for(let n=1;n<=pdf.numPages;n++){
      const pg=await pdf.getPage(n),items=await pg.getTextContent();
      pages.push({file:file.name,page:n,text:items.items.map(it=>'str' in it?String(it.str):'').join(' ').replace(/\s+/g,' ').trim()});
      pg.cleanup();
    }
    if(pages.reduce((x,p)=>x+p.text.length,0)<150)throw Error(file.name+' has too little selectable text. Scanned PDFs need OCR before use.');
    return pages;
  }finally{await pdf.destroy();}
}
export function createPlan(title:string,track:Plan['track'],pages:Passage[]):Plan{
  const candidates:Passage[]=[];
  for(const p of pages){
    if(p.text.length<70)continue;
    const pieces=p.text.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
    let part='';
    for(const piece of pieces){if(part.length>=210 && (part.length+piece.length)>750){candidates.push({...p,text:part.trim()});part='';}part+=(part?' ':'')+piece;}
    if(part.length>=70)candidates.push({...p,text:part.trim().slice(0,750)});
  }
  if(!candidates.length)throw Error('Could not extract enough meaningful text. Try a text-based lecture PDF.');
  const questions:Prompt[]=stages.flatMap((stage,i)=>[0,1].map(j=>{
    const x=i*2+j,p=candidates[Math.floor(x*candidates.length/10)];
    const place=p.file+' — page '+p.page;
    const question=stage==='theory'?'Explain the central concept on '+place+' in your own words. Why does it matter?'
      :stage==='tests'?'Recall two key facts or distinctions from '+place+'. What evidence supports them?'
      :stage==='code'?(track==='programming'?'Write a short code example illustrating a concept from '+place+'. Explain each step.':'Apply a concept from '+place+' to a new scenario, showing your reasoning.')
      :stage==='problems'?'Invent and solve a realistic problem involving the main concept from '+place+'. What could go wrong?'
      :'Unaided: reconstruct the central idea from '+place+' and give an example or limitation. Do not view the original until both answers are submitted.';
    return {id:stage+'-'+j,stage,question,source:{...p,text:p.text.slice(0,750)}};
  }));
  return {version:1,title:title.trim()||'My course',track,files:[...new Set(pages.map(p=>p.file))],questions,answers:{}};
}
export function stageScore(plan:Plan,stage:Stage):number|null{
 const qs=plan.questions.filter(q=>q.stage===stage);
 if(!qs.length||qs.some(q=>plan.answers[q.id]?.score===undefined))return null;
 return qs.reduce((n,q)=>n+(plan.answers[q.id]?.score||0),0)/qs.length;
}
export function revisionUnlocked(plan:Plan){return stages.slice(0,4).every(s=>stageScore(plan,s)!==null);}
export function allRevisionSubmitted(plan:Plan){return plan.questions.filter(q=>q.stage==='revision').every(q=>!!plan.answers[q.id]?.text);}
export function finalScore(plan:Plan):number|null{
 if(!revisionUnlocked(plan)||!allRevisionSubmitted(plan))return null;
 const scores=stages.map(s=>stageScore(plan,s));
 return scores.some(x=>x===null)?null:scores.reduce<number>((n,x)=>n+(x||0),0)/scores.length;
}