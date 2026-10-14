import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
export type Stage = 'theory'|'tests'|'code'|'problems'|'revision';
export const stages: Stage[] = ['theory','tests','code','problems','revision'];
export type Passage = {file:string;page:number;text:string};
export type Prompt = {id:string;stage:Stage;question:string;source:Passage;topic?:string};
export type Answer = {text:string;hints:number;score?:number};
export type Plan = {version:1|2;title:string;track:'general'|'programming';files:string[];questions:Prompt[];answers:Record<string,Answer>};
const STORE = 'studyflow-uploaded-plan-v1'; // keep previous sessions available
export function getPlan():Plan|null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE)||'null') as Plan|null;
    return (v?.version===1||v?.version===2)&&Array.isArray(v.questions)&&v.answers ? v:null;
  }catch {return null;}
}
export function savePlan(plan:Plan) {
  try {localStorage.setItem(STORE,JSON.stringify(plan));}
  catch {throw Error('Browser storage is unavailable or full. Please use smaller PDFs or clear old browser data.');}
}
export function deletePlan(){localStorage.removeItem(STORE);}

/** Reconstruct lines from PDF.js coordinates rather than flattening all content into one line.
 * Coordinates may be missing in synthetic PDFs, in which case we use PDF text order.
 * This is best-effort; slide columns, image-only pages and complex tables need checking.
 */
export function linesFromPdfItems(items: Array<{str:string;transform?:number[];width?:number;hasEOL?:boolean}>):string {
  const lines:{y:number;bits:Array<{x:number;end:number;str:string}>;ordinal:number}[]=[];
  let fallback='';
  const valid=items.filter(item=>item.str.trim()||item.hasEOL);
  const withCoords=valid.filter(it=>it.transform&&Number.isFinite(it.transform[4])&&Number.isFinite(it.transform[5]));
  if (withCoords.length<Math.max(2,valid.length*0.6)) {
    const parts:string[]=[];
    for (const it of valid) {fallback+=it.str;
      if(it.hasEOL){parts.push(fallback);fallback='';}
      else fallback+=' ';
    }
    if(fallback.trim())parts.push(fallback);
    return parts.map(cleanLine).filter(Boolean).join('\n');
  }
  for(const item of valid){
    if(!item.str.trim())continue;
    const x=item.transform?.[4]??0,y=item.transform?.[5]??0;
    let line=lines.find(l=>Math.abs(l.y-y)<=2.5);
    if(!line){line={y,bits:[],ordinal:lines.length};lines.push(line);}
    line.bits.push({x,end:x+(item.width||item.str.length*5),str:item.str});
  }
  lines.sort((a,b)=> b.y-a.y || a.ordinal-b.ordinal);
  const output=lines.map(line=>{
    line.bits.sort((a,b)=>a.x-b.x);
    let text='',end=0;
    for(const part of line.bits){
      // Actual coordinate gap instead of inserting spaces inside every code token.
      if(text && part.x-end>2.5 && !/^\s/.test(part.str) && !/\s$/.test(text))text+=' ';
      text+=part.str;end=Math.max(end,part.end);
    }
    return cleanLine(text);
  }).filter(Boolean);
  return output.join('\n');
}
function cleanLine(line:string):string {
  return line.replace(/[\u00a0\u200b]/g,' ').replace(/[ \t]+$/,'')
    .replace(/\b([A-Za-z]{3,})\1\b/gi,'$1'); // recover duplicated slide-text glyphs
}
export async function readPdf(file:File):Promise<Passage[]> {
  if(!file.name.toLowerCase().endsWith('.pdf'))throw Error('Please choose PDF files.');
  if(file.size>12*1024*1024)throw Error(file.name+' is over the 12 MB limit.');
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pdf=await task.promise;
  try {
    if(pdf.numPages>100)throw Error(file.name+' is longer than 100 pages.');
    const pages:Passage[]=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),content=await page.getTextContent();
      const text=linesFromPdfItems(content.items.filter((it): it is typeof it & {str:string} => 'str' in it) as Array<{str:string;transform?:number[];width?:number;hasEOL?:boolean}>);
      pages.push({file:file.name,page:n,text});page.cleanup();
    }
    if(pages.reduce((n,p)=>n+p.text.length,0)<150)throw Error(file.name+' has too little selectable text. Scanned PDFs need OCR before use.');
    return pages;
  }finally {await pdf.destroy();}
}

const commonHeading=/^(?:python|lecture\s*\d+|lecture\s+\d+\b.*|contents?|agenda|outline|introduction|application|applications|example|examples|summary|references|bibliography|recap|tasks?|exercises?|filip\s+andonov|fandonov@)/i;
const contentVerb=/\b(is|are|means?|can|cannot|used|allows?|returns?|represents?|works?|defined|different|called|must|has|have|because|when|using|contains|evaluates?|access|stores?|implements?)\b/i;
const codeSyntax=/(?:^|\n)\s*(?:>>>\s*|\.\.\.\s*|def\s+\w+\(|for\s+\w+\s+in\s+|if\s+\S+\s*:|print\s*\(|\w+\s*=\s*(?:\[|\{|\(|['"]|\w+\())/m;
const terms: Array<[RegExp,string]> = [
  [/\blists?\b.*\btuples?\b|\btuples?\b.*\blists?\b/i,'lists and tuples'],
  [/\bnegative\s+index|\bindex(?:es|ing)?\b/i,'indexing'],
  [/\bslic(?:ing|es?)\b/i,'slicing'],
  [/\bmutable|\bimmutable|\bmutability/i,'mutability'],
  [/\bsequences?\b/i,'sequences'],
  [/\bdictionar(?:y|ies)\b|\bmappings?\b/i,'dictionaries and mappings'],
  [/\bstrings?\b/i,'strings'],
  [/\bformat(?:ting|ted)?\b/i,'string formatting'],
  [/\bloops?\b|\biterations?\b/i,'loops and iteration'],
  [/\bmethod\b/i,'methods'],
  [/\bfunctions?\b/i,'functions'],
  [/\bclasses?\b|\bobjects?\b/i,'classes and objects'],
  [/\bexceptions?\b|\berrors?\b/i,'exceptions'],
  [/\bfile(?:s|\s+handling)?\b/i,'file handling'],
  [/\boperators?\b/i,'operators'],
  [/\bvariables?\b/i,'variables'],
];
export function findTopic(text:string):string {
  // Introductory slides describe Python's characteristics, not class mechanics.
  // "object-oriented" alone is not evidence that classes/objects are explained.
  const normalized=text.replace(/\s+/g,' ');
  if(/\b(?:the\s+)?python\s+language\s+is\s*:/i.test(normalized)
      && /\b(?:general\s+purpose|high[ -]level|readability)\b/i.test(normalized))
    return 'Python language characteristics';
  if(/\bobject[ -]oriented\b/i.test(normalized) && !/\b(?:classes?|instances?|class\s+definitions?)\b/i.test(normalized))
    return 'object-oriented programming';

  if (/\blists?\b.*\btuples?\b/i.test(text.replace(/\n/g,' ')) && /\b(?:mutable|immutable|main difference)\b/i.test(text))return 'lists and tuples';
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const first=lines.find(line=>line.length>=4&&line.length<=62&&!commonHeading.test(line)
    && !/^[\d\s.·•\-]+$/.test(line) && !line.startsWith('>>>') && !line.startsWith('#!') && !/[{}=]/.test(line));
  if(first && !contentVerb.test(first) && first.split(/\s+/).length<=7){
    const label=first.replace(/^[•*●\-]+\s*/,'').replace(/[:.]$/,'').trim();
    if(label.length>=4) return label.toLowerCase();
  }
  const prose=lines.slice(0,14).join(' ');
  // Favor the more precise concepts, instead of guessing from a filename or title slide.
  const hit=terms.find(([pattern])=>pattern.test(prose));
  if(hit)return hit[1];
  const firstSentence=prose.match(/([A-Za-z][A-Za-z\s-]{4,65}?)\s+(?:is|are|means|can|allows|contains)\b/i);
  if(firstSentence)return firstSentence[1].replace(/^[•*●\-]+\s*/,'').trim().toLowerCase();
  return 'the concepts in this passage';
}
export type Evidence = {file:string;page:number;text:string;topic:string;score:number;code:string};
export function selectEvidence(pages:Passage[]):Evidence[] {
  const candidates:Evidence[]=[];
  const fingerprints=new Set<string>();
  for(const p of pages){
    const lines=p.text.split('\n').map(x=>x.trimEnd()).filter(Boolean);
    const text=lines.join('\n').trim();
    const prose=text.replace(/\s+/g,' ');
    const words=prose.split(/\s+/).length;
    const first=lines[0]?.trim()||'';
    if(prose.length<95||words<14)continue;
    if(/^(?:python\s+lecture\s*\d+|lecture\s*\d+\s+[\w\s]{0,40}(?:filip|andonov))/i.test(prose)&&words<40)continue;
    if(/^(?:contents?|agenda|outline)\b/i.test(first) && !contentVerb.test(prose))continue;
    if(/(?:fandonov@|filip\s+andonov|\blecture\s*\d+\b)/i.test(prose)&&words<30&&!codeSyntax.test(text))continue;
    const hasCode=codeSyntax.test(text);
    const informative=contentVerb.test(prose);
    if(!informative&&!hasCode)continue;
    const normalized=prose.toLowerCase().replace(/[^a-z0-9]+/g,' ').slice(0,130);
    if(fingerprints.has(normalized))continue;
    fingerprints.add(normalized);
    const codeLines=lines.map(line=>line.trimEnd()).filter(line=>
      /^(?:\s*>>>\s*|\s*\.\.\.\s*|\s*def\s+\w+\(|\s*for\s+\w+\s+in\s+|\s*if\s+.+:|\s*print\s*\(|\s*[\w.[\]]+\s*=\s*[^=])/m.test(line)
      && !/^\s*(?:●|•|[-*])/.test(line)).slice(0,8);
    const topic=findTopic(text);
    let score=Math.min(words,100)/12 + (informative?4:0)+(hasCode?2:0) +
      (/\b(?:because|different|difference|however|but|unlike|means|therefore|example)\b/i.test(prose)?4:0) +
      (/\b(?:index|mutable|tuple|list|function|variable|method|format)\b/i.test(prose)?2:0);
    if(/^(?:references|summary|further reading|bibliography)\b/i.test(first))score-=10;
    const clipped=text.length>1250?text.slice(0,1250).replace(/\s+\S*$/,'')+'…':text;
    candidates.push({file:p.file,page:p.page,text:clipped,topic,score,code:codeLines.join('\n')});
  }
  return candidates.sort((a,b)=>b.score-a.score || a.page-b.page);
}
function makeQuestion(stage:Stage,e:Evidence,track:Plan['track']):string {
  const topic=e.topic;
  const specificallyMutability=topic==='lists and tuples'&&/\bmutable\b|\bimmutable\b|\bmain difference\b/i.test(e.text);
  const specificallyNegativeIndex=topic==='indexing'&&/\bnegative\s+index|\b-1\b/.test(e.text);
  const pythonCharacteristics=topic==='Python language characteristics';
  // Ground list-method questions in the actual duplicate-value example.
  // Only mention the literal 'bee' example when the uploaded slide contains it.
  const removeFirst=topic==='methods'&&/\bremove\b/i.test(e.text)
    &&/\bfirst\s+occurrence\b/i.test(e.text);
  const beeExample=removeFirst&&/h\s*=\s*\[[^\]]*['"]bee['"][^\]]*['"]bee['"]/i.test(e.text)
    &&/h\.remove\(\s*['"]bee['"]\s*\)/i.test(e.text);
  if(stage==='theory'&&pythonCharacteristics)
    return 'According to this slide, what are Python’s main characteristics, and why does its emphasis on readable code matter?';
  if(stage==='tests'&&pythonCharacteristics)
    return 'From memory, name three characteristics of Python listed in the lecture. Which one is linked to writing algorithms with less code?';
  if(stage==='theory')return specificallyMutability
    ? 'How do Python lists and tuples differ when you need to change an existing element? Explain using the lecture’s rule.'
    : specificallyNegativeIndex?'How does positive versus negative indexing work in sequences? Explain with an example.'
    : 'Explain the lecture’s rule or main idea about '+topic+'. What does it mean, and why is it useful?';
  if(stage==='tests')return specificallyMutability
    ? 'A program needs to update an item in an existing sequence. What must you check about lists and tuples first, and why?'
    : specificallyNegativeIndex?'In Python, how do you use a negative index to reach the last element? Explain your answer.'
    : 'Without looking at the slide, recall two precise facts or conditions about '+topic+'. How would you check that each is correct?';
  if(stage==='code'){
    if(beeExample)return "Given h = ['two', 'bee', 'or', 'not', 'two', 'bee'], predict the contents of h after h.remove('bee'). Explain why one 'bee' remains, and write one further Python statement that removes it.";
    if(removeFirst)return 'A Python list contains the same value twice. Show a short list, call .remove(value), predict the result, and explain whether one match or all matches disappear.';
    // When the lecture contains an actual example, both course modes should
    // practice with it rather than offering an underspecified "apply" prompt.
    if(e.code)return 'Using this code example from the lecture about '+topic+', predict what it produces and explain why. Then change one input or operation and explain what would change.\n\n'+e.code;
    if(track==='programming')return 'Write a short Python example that demonstrates '+topic+'. State the expected output and justify it using the lecture.';
    return 'Construct a small, specific example of '+topic+' from the lecture. Show the steps, what result you expect, and why.';
  }
  if(stage==='problems')return 'Imagine a student misunderstands '+topic+'. Describe a concrete mistake they might make, correct it using the lecture, and explain your reasoning.';
  return 'Unaided revision: explain '+topic+' accurately from memory. Give an original example and identify a limitation or exception.';
}
export function createPlan(title:string,track:Plan['track'],pages:Passage[]):Plan {
  const pool=selectEvidence(pages);
  if(!pool.length)throw Error('No substantial teaching content found. The PDFs may contain only covers, contents, or scanned pages. Try a text-based lecture PDF.');
  const files=[...new Set(pages.map(p=>p.file))];
  const byFile=new Map(files.map(f=>[f,pool.filter(e=>e.file===f).sort((a,b)=>a.page-b.page)]));
  const used=new Set<string>();
  const chosen:Evidence[]=[];
  for(let i=0;i<10;i++){
    // Review topics in the order the uploaded lectures teach them, across the
    // beginning, middle and end. Skip repeated topics if another slide is available.
    const target=files[i%files.length];
    const choices=(byFile.get(target)||[]).length ? (byFile.get(target)||[]) : pool;
    const source=i>=4&&i<6&&track==='programming'&&choices.some(e=>e.code.trim()) ? choices.filter(e=>e.code.trim()) : choices;
    const visit=Math.floor(i/files.length);
    const visits=Math.ceil((10-(i%files.length))/files.length);
    const ideal=Math.round((visit/Math.max(1,visits-1))*(source.length-1));
    const ranked=source.map((e,j)=>({e,j,dist:Math.abs(j-ideal)}))
      .sort((a,b)=>a.dist-b.dist || b.e.score-a.e.score);
    const available=ranked.find(x=>!used.has(x.e.file+'#'+x.e.page)
      && !chosen.some(c=>c.file===x.e.file&&c.topic===x.e.topic));
    const fallback=ranked.find(x=>!used.has(x.e.file+'#'+x.e.page));
    const found=(available||fallback||ranked[0]).e;
    chosen.push(found);used.add(found.file+'#'+found.page);
  }
  const questions:Prompt[]=stages.flatMap((stage,i)=>[0,1].map(j=>{
    const e=chosen[i*2+j];
    return {id:stage+'-'+j,stage,topic:e.topic,question:makeQuestion(stage,e,track),
      source:{file:e.file,page:e.page,text:e.text}};
  }));
  return {version:2,title:title.trim()||'My course',track,files,questions,answers:{}};
}
export function stageScore(plan:Plan,stage:Stage):number|null{
  const qs=plan.questions.filter(q=>q.stage===stage);
  if(!qs.length||qs.some(q=>plan.answers[q.id]?.score===undefined))return null;
  return qs.reduce((n,q)=>n+(plan.answers[q.id]?.score||0),0)/qs.length;
}
export function revisionUnlocked(plan:Plan){return stages.slice(0,4).every(s=>stageScore(plan,s)!==null);}
export function allRevisionSubmitted(plan:Plan){return plan.questions.filter(q=>q.stage==='revision').every(q=>!!plan.answers[q.id]?.text);}
export function finalScore(plan:Plan):number|null {
  if(!revisionUnlocked(plan)||!allRevisionSubmitted(plan))return null;
  const scores=stages.map(s=>stageScore(plan,s));
  return scores.some(x=>x===null)?null:scores.reduce<number>((n,x)=>n+(x||0),0)/scores.length;
}