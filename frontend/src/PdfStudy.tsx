import { useEffect, useState, type ChangeEvent } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, CloudUpload, FileText, Lightbulb, LoaderCircle, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { readPdf,createPlan,getPlan,savePlan,deletePlan,stages,stageScore,revisionUnlocked,allRevisionSubmitted,finalScore,type Plan,type Stage,type Passage } from './pdfStudy';

const title:Record<Stage,string>={theory:'Theory',tests:'Recall',code:'Practice',problems:'Problems',revision:'Revision'};
const guidance:Record<Stage,string>={
 theory:'Identify the main idea and define unfamiliar terms before adding an example.',
 tests:'Recall the key facts and the conditions that make them true.',
 code:'Try a small, concrete example before solving the full task.',
 problems:'Write down the inputs, desired result, and the principle connecting them.',
 revision:'Hints are not available during final recall.'
};
export default function PdfStudy({trySample}:{trySample:()=>void}){
 const [plan,setPlan]=useState<Plan|null>(()=>getPlan());
 const [files,setFiles]=useState<File[]>([]);
 const [course,setCourse]=useState('');
 const [track,setTrack]=useState<Plan['track']>('general');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [stage,setStage]=useState<Stage>('theory');
 const [index,setIndex]=useState(0);
 const [draft,setDraft]=useState('');
 const [hints,setHints]=useState(0);
 const [tip,setTip]=useState('');
 const [reveal,setReveal]=useState(false);
 const questions=plan?.questions.filter(q=>q.stage===stage)||[];
 const question=questions[index];
 const answer=plan&&question?plan.answers[question.id]:undefined;
 const unlocked=plan?revisionUnlocked(plan):false;
 const sealed=stage==='revision'&&plan&&!allRevisionSubmitted(plan);
 const total=plan?finalScore(plan):null;
 const finished=plan?stages.filter(s=>stageScore(plan,s)!==null).length:0;
 useEffect(()=>{setDraft(answer?.text||'');setHints(answer?.hints||0);setTip('');setReveal(false);},[question?.id,plan?.title]);
 function persist(v:Plan){try{savePlan(v);setPlan(v);setError('');return true;}catch(e){setError(e instanceof Error?e.message:'Unable to save to this browser');return false;}}
 function onFiles(e:ChangeEvent<HTMLInputElement>){
  const next=[...files,...Array.from(e.target.files||[])];e.target.value='';
  if(next.length>5){setError('Choose at most five PDFs.');return;}
  if(next.some(f=>!f.name.toLowerCase().endsWith('.pdf'))){setError('PDF files only.');return;}
  setFiles(next);if(!course&&next[0])setCourse(next[0].name.replace(/\.pdf$/i,'').replace(/[_-]/g,' '));setError('');
 }
 async function start(){
  setBusy(true);setError('');
  try{
   const pages:Passage[]=[];
   for(const f of files){pages.push(...await readPdf(f));}
   const newPlan=createPlan(course,track,pages);
   if(persist(newPlan)){setStage('theory');setIndex(0);}
  }catch(e){setError(e instanceof Error?e.message:'Could not read PDFs');}finally{setBusy(false);}
 }
 function switchStage(s:Stage){if(s==='revision'&&!unlocked)return;setStage(s);setIndex(0);}
 function submit(){
  if(!plan||!question||answer||!draft.trim())return;
  const changed:Plan={...plan,answers:{...plan.answers,[question.id]:{text:draft.trim(),hints}}};
  persist(changed);
 }
 function assess(value:0|1){
  if(!plan||!question||!answer||answer.score!==undefined||sealed)return;
  persist({...plan,answers:{...plan.answers,[question.id]:{...answer,score:value}}});
 }
 function advance(){
  if(index+1<questions.length){setIndex(index+1);return;}
  const next=stages[stages.indexOf(stage)+1];if(next&&!(next==='revision'&&!unlocked)){switchStage(next);}else{setIndex(0);}
 }
 function remove(){
  if(window.confirm('Permanently delete this local PDF study plan and answers?')){deletePlan();setPlan(null);setFiles([]);setCourse('');setError('');setStage('theory');setIndex(0);}
 }
 const left=plan?.questions.length||10;
 return <div className="pdf-study">
  {error&&<div className="flash flash-error" role="alert"><CircleHelp size={17}/>{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  {!plan?<>
   <header className="pdf-welcome"><span className="page-kicker"><BookOpen size={16}/> YOUR COURSE. YOUR MATERIAL.</span><h1>Upload. Study. Remember.</h1><p>Bring your own lecture PDFs and turn them into a guided, five-stage revision session. No preset course required.</p><div className="pdf-promises"><span><ShieldCheck size={16}/> Files stay on your device</span><span><FileText size={16}/> PDF page references</span><span><CheckCircle2 size={16}/> Self-assessed progress</span></div></header>
   <div className="pdf-layout"><section className="surface pdf-panel"><h2>Start with your lecture notes</h2><p className="pdf-muted">Up to five PDFs, max 12 MB and 100 pages per file. Scanned files need OCR first.</p>
    <label className="pdf-drop"><input type="file" multiple accept=".pdf,application/pdf" disabled={busy} onChange={onFiles}/><CloudUpload size={33}/><strong>Choose PDF files</strong><small>Your documents are processed in this browser only.</small></label>
    <div className="pdf-files">{files.map((f,i)=><div key={i}><FileText size={16}/><span>{f.name}</span><button onClick={()=>setFiles(a=>a.filter((_,j)=>i!==j))} disabled={busy} aria-label={'Remove '+f.name}>×</button></div>)}</div>
    <label className="pdf-field">Course name<input value={course} onChange={e=>setCourse(e.target.value)} maxLength={100} placeholder="e.g. Linear Algebra"/></label>
    <label className="pdf-field">Material type<select value={track} onChange={e=>setTrack(e.target.value as Plan['track'])}><option value="general">General university course</option><option value="programming">Programming or computer science</option></select></label>
    <button className="btn btn-primary pdf-start" disabled={!files.length||busy} onClick={()=>void start()}>{busy?<LoaderCircle size={18} className="spin"/>:<BookOpen size={18}/>} {busy?'Reading your PDFs...':'Build my study session'} <ArrowRight size={17}/></button>
   </section><aside className="surface pdf-panel"><h2>Your five-stage learning path</h2><p className="pdf-muted">Structured prompts use passages extracted from your own files.</p>
    {stages.map((s,i)=><div key={s} className="pdf-path"><b>{i+1}</b><div><strong>{s==='code'&&track==='general'?'Apply':title[s]}</strong><p>{['Explain the concepts','Recall rules and distinctions','Apply what you read','Solve unfamiliar problems','Answer independently, then review'][i]}</p></div></div>)}
    <div className="pdf-disclosure"><CircleHelp size={18}/> This is a browser-only prototype. It builds source-linked study prompts, not AI-generated quizzes. You assess your answers against the real passages. AI grading requires a secure backend.</div>
    <button className="pdf-link" onClick={trySample}>Try the curated Python example instead <ArrowRight size={16}/></button>
   </aside></div>
  </>:<>
   <div className="pdf-plan-head"><div><span className="page-kicker">YOUR PRIVATE STUDY ROOM</span><h1>{plan.title}</h1><p>{plan.files.join(' · ')}</p></div><button className="btn btn-outline" onClick={remove}><Trash2 size={16}/> Delete session</button></div>
   <div className="pdf-metrics"><span><strong>{finished} / 5</strong> completed stages</span><span><strong>{plan.questions.filter(q=>plan.answers[q.id]?.score!==undefined).length} / {left}</strong> self-reviewed questions</span><span><strong>{total===null?'Locked':Math.round(total*100)+'%'}</strong> self-assessed score</span></div>
   <div className="pdf-tabs">{stages.map((s,i)=><button key={s} disabled={s==='revision'&&!unlocked} onClick={()=>switchStage(s)} className={'pdf-tab '+(s===stage?'active':'')}><span>{s==='revision'&&!unlocked?<LockKeyhole size={15}/>:stageScore(plan,s)!==null?<Check size={16}/>:i+1}</span>{s==='code'&&plan.track==='general'?'Apply':title[s]}</button>)}</div>
   {total!==null&&<div className="pdf-complete"><CheckCircle2 size={22}/><div><strong>Revision completed — {Math.round(total*100)}% self-assessed</strong><p>This is your own comparison with the source, not an automatically graded exam score.</p></div></div>}
   {question&&<div className="surface pdf-question">
    <div className="pdf-qhead"><span className="page-kicker">{stage==='code'&&plan.track==='general'?'APPLICATION':title[stage].toUpperCase()}</span><span>Question {index+1} of {questions.length}</span></div>
    <h2>{question.question}</h2><p className="pdf-muted"><FileText size={16}/> {question.source.file} · page {question.source.page}</p>
    {!answer?<><label className="pdf-field">Answer in your own words<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={6} placeholder="Think before opening the passage..."/></label>
     {tip&&<div className="pdf-disclosure"><Lightbulb size={17}/>{tip}</div>}
     {reveal&&<blockquote className="pdf-passage"><strong>Extracted page text</strong><p>{question.source.text}</p></blockquote>}
     <div className="pdf-buttons">{stage!=='revision'&&<><button className="btn btn-outline" onClick={()=>{setHints(h=>h+1);setTip(guidance[stage]);}}><Lightbulb size={16}/> Hint {hints||''}</button><button className="btn btn-outline" onClick={()=>{setHints(h=>h+1);setReveal(true);}}>Reveal passage</button></>}<button className="btn btn-primary" disabled={!draft.trim()} onClick={submit}>Save answer <ArrowRight size={16}/></button></div>
    </>:<>
     <div className="pdf-saved"><CheckCircle2 size={17}/> Answer saved {sealed?'— source is sealed until all revision answers are submitted':''}</div><blockquote className="pdf-written">{answer.text}</blockquote>
     {!sealed&&<><blockquote className="pdf-passage"><strong>Compare with the original extracted page</strong><p>{question.source.text}</p><small>Check key concepts, supporting details, and examples. Some mathematical notation or code formatting may be lost during extraction.</small></blockquote>
      {answer.score===undefined?<div className="pdf-grade"><h3>How well did you understand?</h3><p>Compare your answer carefully with the original passage. This is self-assessment, not AI scoring.</p><button className="btn btn-outline" onClick={()=>assess(0)}>Need more revision</button><button className="btn btn-primary" onClick={()=>assess(1)}><Check size={16}/> I can explain it correctly</button></div>:<div className="pdf-saved">Self-assessed: {answer.score?'Understood':'Needs review'} · {answer.hints?'Hints used: '+answer.hints:'Unaided'}</div>}
     </>}
     {sealed&&<p className="pdf-disclosure"><LockKeyhole size={17}/> Submit both revision answers before reviewing any source passages.</p>}
     {(answer.score!==undefined||stage==='revision')&&<div className="pdf-buttons"><button className="btn btn-outline" onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={index===0}>Previous</button><button className="btn btn-primary" onClick={advance} disabled={index===questions.length-1&&stage==='revision'&&!allRevisionSubmitted(plan)}>Continue <ArrowRight size={16}/></button></div>}
    </>}
   </div>}
   {stage==='revision'&&allRevisionSubmitted(plan)&&total===null&&<p className="pdf-disclosure"><CircleHelp size={16}/> Your revision answers are ready. Open each one and self-assess to finish.</p>}
   <p className="pdf-privacy"><ShieldCheck size={15}/> Only selected text passages and your answers are stored in this browser. Your PDF files are not uploaded to a server.</p>
  </>}
 </div>;
}