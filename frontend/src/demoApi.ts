/** Self-contained showcase adapter for the SAME question catalog and scoring rules.
 *  No backend, LLM, Python execution, or private PDF content is bundled here.
 *  Browser-only progress is explicitly presented as a demo, not a synced account.
 */
import catalog from './demoCatalog.json';
import { STAGES, type Lecture, type LectureDetail, type Progress, type Question, type Stage } from './types';

type CatalogQuestion = {
  stage: Stage; prompt: string; answer: string; explanation: string;
  choices: string[]; difficulty: number; source_reference: string;
};
type CatalogLecture = { title: string; source_file: string; topics: string[]; subtitle?: string; questions: CatalogQuestion[] };
type Attempt = {
  id: number; question_id: number; answer: string; score: number | null;
  hints_used: number; feedback: string; evaluated_by: string;
};
type DemoData = { attempts: Attempt[]; sequence: number };
const data = catalog as unknown as { course: {name:string;code:string;description:string}; lectures:CatalogLecture[] };
const STORAGE = 'studyflow-showcase-v1';
let memory: DemoData = { attempts: [], sequence: 0 };

function readData(): DemoData {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return memory;
    const saved = JSON.parse(raw) as DemoData;
    if (!Array.isArray(saved.attempts) || !Number.isSafeInteger(saved.sequence)) return memory;
    memory = saved;
  } catch { /* Private browsing or disabled storage: use in-memory state. */ }
  return memory;
}
function saveData(state: DemoData) {
  memory = state;
  try { window.localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* in-memory fallback */ }
}
export function resetShowcase() {
  memory = { attempts: [], sequence: 0 };
  try { window.localStorage.removeItem(STORAGE); } catch { /* in-memory fallback */ }
}

function questionRows(lectureId: number): Array<Question & { answer:string; explanation:string }> {
  const entry = data.lectures[lectureId - 1];
  if (!entry) return [];
  return entry.questions.map((q, i) => ({
    id: lectureId * 1000 + i + 1,
    lecture_id: lectureId,
    stage: q.stage,
    prompt: q.prompt,
    choices: q.choices,
    source_id: null,
    source_excerpt: q.source_reference,
    difficulty: q.difficulty,
    answer: q.answer,
    explanation: q.explanation,
  }));
}
function lookup(id:number) {
  const lectureId = Math.floor((id - 1)/1000);
  const question = questionRows(lectureId).find(q=>q.id===id);
  if (!question) throw new Error('Question not found in the showcase catalog.');
  return question;
}
function latest(questionId: number, state:DemoData): Attempt | undefined {
  return [...state.attempts].reverse().find(a=>a.question_id===questionId);
}
function getProgress(lectureId: number, state:DemoData): Progress {
  const rows = questionRows(lectureId);
  const stages = {} as Progress['stages'];
  STAGES.forEach(stage => {
    const relevant = rows.filter(q=>q.stage===stage);
    const submissions = relevant.map(q=>latest(q.id,state)).filter((a):a is Attempt=>!!a);
    const graded = submissions.filter(a=>a.score!==null);
    const complete = relevant.length>0 && graded.length===relevant.length;
    stages[stage] = {
      total: relevant.length, submitted:submissions.length, graded:graded.length, complete,
      unaided: submissions.every(a=>a.hints_used===0),
      score:complete ? Math.round(100*graded.reduce((s,a)=>s+(a.score??0),0)/graded.length)/10 : null,
    };
  });
  const unlocked = STAGES.every(s=>stages[s].complete) && stages.revision.unaided;
  return {
    stages,
    overall: unlocked ? Math.round(10*STAGES.reduce((s,k)=>s+(stages[k].score??0),0)/STAGES.length)/10 : null,
    overall_note:'Final score unlocks only when all five stages are graded and revision is completed unaided.',
  };
}
function getLecture(lectureId:number,state:DemoData): Lecture {
  const entry = data.lectures[lectureId-1];
  if (!entry) throw new Error('Lecture not found.');
  const description = `Source: ${entry.source_file} | Topics: ${entry.topics.join(', ')}`;
  return {id:lectureId,course_id:1,title:entry.title,description:description.slice(0,500),progress:getProgress(lectureId,state)};
}
function detail(lectureId:number,state:DemoData): LectureDetail {
  const lecture=getLecture(lectureId,state);
  const progress=lecture.progress;
  const revisionReleased=STAGES.slice(0,4).every(s=>progress.stages[s].complete)
    && progress.stages.revision.complete && progress.stages.revision.unaided;
  const questions=questionRows(lectureId).map(({answer:_answer,explanation:_explanation,...q})=>({
    ...q,source_excerpt:q.stage==='revision'&&!revisionReleased?'':q.source_excerpt,
  }));
  const attempts: LectureDetail['latest_attempts']={};
  for (const q of questions) {
    const a=latest(q.id,state);
    if (a) {
      const sealed=q.stage==='revision'&&!revisionReleased;
      attempts[q.id]={id:a.id,score:sealed?null:a.score,hints_used:a.hints_used,
        feedback:sealed?'Answer saved; results sealed until revision complete.':a.feedback,
        evaluated_by:sealed?'sealed_revision':a.evaluated_by};
    }
  }
  return {lecture,questions,progress,latest_attempts:attempts,sources:[]};
}
function validateMcq(answer:string) {
  const val=answer.trim().toUpperCase();
  return /^[A-D](?:$|[.)\s])/.test(val)?val[0]:val;
}
function input(init?:RequestInit) {
  return init?.body && typeof init.body==='string' ? JSON.parse(init.body) as Record<string,unknown> : {};
}
function match(path:string,re:RegExp) {return path.match(re);}

/** Request-compatible adapter used exclusively when showcase mode is selected. */
export function showcaseRequest<T>(path:string,init?:RequestInit): T {
  const saved=readData();
  if(path==='/health') return {status:'ok',ai_configured:false,mode:'browser-only-showcase',export_enabled:false} as T;
  if(path==='/courses' && (!init?.method || init.method==='GET')) return [{id:1,...data.course,lectures:data.lectures.map((_,i)=>getLecture(i+1,saved))}] as T;
  const lectureMatch=match(path,/^\/lectures\/(\d+)$/);
  if(lectureMatch) return detail(Number(lectureMatch[1]),saved) as T;
  const hintMatch=match(path,/^\/questions\/(\d+)\/hint$/);
  if(hintMatch){
    const q=lookup(Number(hintMatch[1]));
    if(q.stage==='revision')throw new Error('Hints are not available during unaided revision.');
    const number=Number(input(init).hint_number || 1);
    return {hint:number===1
      ? 'Identify the given information, expected output, and relevant Python concept. Work through a small example.'
      : 'Try an edge case and break your explanation or solution into smaller steps. No answer is revealed.',mode:'general_hint_no_ai'} as T;
  }
  const attemptMatch=match(path,/^\/questions\/(\d+)\/attempts$/);
  if(attemptMatch){
    const q=lookup(Number(attemptMatch[1]));
    const params=input(init);
    const answer=String(params.answer ?? '').trim();
    const hints_used=Number(params.hints_used ?? 0);
    if(!answer)throw new Error('Please enter an answer first.');
    if(!Number.isInteger(hints_used)||hints_used<0)throw new Error('Invalid hint count.');
    if(q.stage==='revision'){
      const progress=getProgress(q.lecture_id,saved);
      if(!STAGES.slice(0,4).every(s=>progress.stages[s].complete))
        throw new Error('Complete Theory, Tests, Code, and Problems before revision.');
      if(hints_used)throw new Error('Revision must be completed without hints.');
      if(latest(q.id,saved))throw new Error('This revision answer is final and cannot be submitted again.');
    }
    const mcq=q.choices.length>0;
    const score=mcq?Number(validateMcq(answer)===q.answer.trim().toUpperCase()):null;
    const evaluated_by=mcq?'objective':'pending_self_grade';
    const feedback=mcq?q.explanation:'Self-assessment needed; no AI or code runner is connected.';
    const attempt:Attempt={id:saved.sequence+1,question_id:q.id,answer,score,hints_used,feedback,evaluated_by};
    const next={attempts:[...saved.attempts,attempt],sequence:attempt.id};
    saveData(next);
    const progress=getProgress(q.lecture_id,next);
    const sealed=q.stage==='revision'&&!progress.stages.revision.complete;
    return {attempt_id:attempt.id,score:sealed?null:score,
      feedback:sealed?'Answer recorded. Results unlock once you complete all revision questions.':feedback,
      evaluated_by:sealed?'sealed_revision':evaluated_by,
      model_answer:sealed?'':q.answer, explanation:sealed?'':q.explanation, progress} as T;
  }
  const gradeMatch=match(path,/^\/attempts\/(\d+)\/self-grade$/);
  if(gradeMatch){
    const id=Number(gradeMatch[1]);
    const grade=Number(input(init).score);
    if(!Number.isFinite(grade)||grade<0||grade>1)throw new Error('Self-assessment score must be between 0 and 1.');
    const existing=saved.attempts.find(a=>a.id===id);
    if(!existing)throw new Error('Attempt not found.');
    if(existing.evaluated_by!=='pending_self_grade')throw new Error('This answer cannot be self-assessed twice.');
    const next:DemoData={...saved,attempts:saved.attempts.map(a=>a.id===id?{...a,score:grade,evaluated_by:'self_assessed'}:a)};
    saveData(next);
    return {score:grade,progress:getProgress(lookup(existing.question_id).lecture_id,next)} as T;
  }
  // These operations genuinely need FastAPI, SQLite, and document extraction.
  if(path==='/courses' || path==='/lectures') throw new Error('Course editing requires the full FastAPI application.');
  if(path.includes('/sources')||path.startsWith('/sources/'))
    throw new Error('PDF upload and AI generation require the full application. This is a browser-only practice showcase.');
  throw new Error('This feature requires the full FastAPI application.');
}