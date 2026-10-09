import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, CloudUpload, Code2, FileCode2, FileText, Flame, GraduationCap,
  Layers3, Lightbulb, ListChecks, LoaderCircle, Menu, Plus, ShieldCheck,
  Sparkles, Target, TrendingUp, UploadCloud, X, Zap, Download, AlertTriangle,
} from 'lucide-react';
import { api } from './api';
import type { AttemptResult, Course, LectureDetail, Stage } from './types';
import { STAGES } from './types';

const labels: Record<Stage, string> = { theory: 'Theory', tests: 'Tests', code: 'Code', problems: 'Problems', revision: 'Revision' };
const stageDescs: Record<Stage, string> = {
  theory: 'Understand the ideas before memorizing them.', tests: 'Check your recall and recognize the right reasoning.',
  code: 'Write Python solutions and review your approach.', problems: 'Apply concepts to unfamiliar scenarios.',
  revision: 'Prove what you know independently. No hints.',
};
const stageIcons = { theory: BookOpen, tests: ListChecks, code: Code2, problems: BrainCircuit, revision: Target };
const fmt = (value: number | null) => value === null ? '—' : value.toFixed(1);

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [activeLectureId, setActiveLectureId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LectureDetail | null>(null);
  const [view, setView] = useState<'overview'|'study'|'sources'>('overview');
  const [stage, setStage] = useState<Stage>('theory');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState('');
  const [hintCount, setHintCount] = useState(0);
  const [review, setReview] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [aiReady, setAiReady] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(false);
  const [modal, setModal] = useState<'course'|'lecture'|null>(null);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function initialLoad() {
      try {
        const [data, health] = await Promise.all([api.courses(), api.health()]);
        setCourses(data); setAiReady(health.ai_configured); setExportEnabled(health.export_enabled);
        if (data.length) {
          setActiveCourseId(data[0].id);
          if (data[0].lectures.length) setActiveLectureId(data[0].lectures[0].id);
        }
      } catch (e) { setError(getMessage(e)); } finally { setLoading(false); }
    }
    void initialLoad();
  }, []);

  useEffect(() => {
    if (activeLectureId === null) { setDetail(null); return; }
    let cancelled = false;
    api.lecture(activeLectureId).then(data => { if (!cancelled) setDetail(data); }).catch(e => {if (!cancelled) setError(getMessage(e));});
    return () => { cancelled = true; };
  }, [activeLectureId]);

  const currentCourse = courses.find(c => c.id === activeCourseId);
  const activeQuestions = useMemo(() => (detail?.questions || []).filter(q => q.stage === stage), [detail,stage]);
  const q = activeQuestions[questionIndex] || null;
  const currentAttempts = detail?.latest_attempts || {};
  const answered = detail?.questions.filter(item => currentAttempts[item.id]?.score !== null && currentAttempts[item.id]?.score !== undefined).length || 0;
  const percent = detail && detail.questions.length ? Math.round(answered / detail.questions.length * 100) : 0;
  const questionPrevious = q ? currentAttempts[q.id] : undefined;
  const allStagesBeforeRevision = STAGES.slice(0, 4).every(s => detail?.progress.stages[s].complete);
  const revisionBlocked = stage === 'revision' && !allStagesBeforeRevision;
  const revisionComplete = !!detail?.progress.stages.revision.complete;

  function selectLecture(courseId:number, lectureId:number) {
    setActiveCourseId(courseId); setActiveLectureId(lectureId); setView('overview'); setError('');setNotice('');
    setSidebarOpen(false); setQuestionIndex(0); resetQuestion();
  }
  function resetQuestion() { setAnswer(''); setHint(''); setHintCount(0); setReview(null); }
  function startStage(s: Stage) { setStage(s); setQuestionIndex(0); resetQuestion(); setView('study'); setSidebarOpen(false); }
  function moveQuestion(next:number) { setQuestionIndex(next); resetQuestion(); }
  async function reload() {
    const [all, one] = await Promise.all([api.courses(), activeLectureId ? api.lecture(activeLectureId) : Promise.resolve(null)]);
    setCourses(all); if (one) setDetail(one);
  }
  async function perform(action:()=>Promise<void>) {
    setError(''); setNotice(''); setBusy(true);
    try { await action(); } catch (e) {setError(getMessage(e));} finally {setBusy(false);}
  }
  async function submitAnswer() {
    if (!q || !answer.trim()) return;
    await perform(async () => {
      const result = await api.attempt(q.id, answer.trim(), hintCount);
      setReview(result);
      await reload();
    });
  }
  async function selfAssess(value: number) {
    if (!review) return;
    await perform(async () => {
      await api.selfGrade(review.attempt_id, value);
      setReview({...review, score:value, evaluated_by:'self_assessed', feedback:'Self-assessment recorded. Review your solution against the rubric.'});
      await reload();
    });
  }
  async function useHint() {
    if (stage === 'revision' || !q) return;
    const next = hintCount + 1;
    await perform(async () => {
      const result = await api.hint(q.id, answer, next);
      setHintCount(next);
      setHint(result.hint);
    });
  }
  async function addItem(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newName.trim(); if (!name) return;
    await perform(async () => {
      if (modal === 'course') {
        const c = await api.createCourse(name, newCode.trim());
        setActiveCourseId(c.id); setActiveLectureId(null); setDetail(null);
      } else if (activeCourseId != null) {
        const l = await api.createLecture(activeCourseId, name);
        setActiveLectureId(l.id); setView('overview');
      }
      setModal(null); setNewName(''); setNewCode(''); await reload();
    });
  }
  async function uploadFile(file: File) {
    if (!detail) return;
    await perform(async () => {
      const response = await api.upload(detail.lecture.id, file);
      setNotice(`${response.filename} uploaded. Extracted ${response.characters.toLocaleString()} characters.`);
      await reload();
    });
  }
  async function generate(id:number) {
    await perform(async () => {
      const result = await api.generate(id);
      setNotice(`${result.added} questions added. Check your source and review generated questions before the exam.`);
      await reload();
    });
  }
  async function viewSource(id:number) {
    await perform(async () => {
      const result = await api.source(id); setSelectedSource(id); setSourceText(result.content);
    });
  }
  const scores = detail?.progress.stages;

  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={32}/><span>Preparing your study space…</span></div>;

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-overlay" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"/>}
    <aside className={`sidebar ${sidebarOpen?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Layers3 size={21} strokeWidth={2.3}/></div><div><b>studyflow<span className="brand-dot">.</span></b><small>LEARN WITH PURPOSE</small></div><button className="sidebar-close" onClick={()=>setSidebarOpen(false)}><X size={20}/></button></div>
      <div className="sidebar-section"><div className="nav-heading">WORKSPACE</div>
        <button className={`nav-link ${view==='overview'?'selected':''}`} onClick={()=>{setView('overview');setSidebarOpen(false);}}><Layers3 size={18}/> Overview</button>
        <button className={`nav-link ${view==='study'?'selected':''}`} onClick={()=>{setView('study');setSidebarOpen(false);}}><BrainCircuit size={18}/> Study room</button>
        <button className={`nav-link ${view==='sources'?'selected':''}`} onClick={()=>{setView('sources');setSidebarOpen(false);}}><FileText size={18}/> Course materials</button>
      </div>
      <div className="sidebar-section course-section"><div className="sidebar-heading-line"><span className="nav-heading">YOUR COURSES</span><button className="icon-button subtle" title="Add course" onClick={()=>{setNewName('');setModal('course');}}><Plus size={16}/></button></div>
        {courses.map(course=><div key={course.id}>
          <button className={`course-item ${course.id===activeCourseId?'active':''}`} onClick={()=>{setActiveCourseId(course.id);if(course.lectures.length) selectLecture(course.id,course.lectures[0].id);else{setActiveLectureId(null);setDetail(null);setView('overview');} }}>
            <span className="course-icon">{course.name.toLowerCase().includes('python') ? <FileCode2 size={18}/> : <GraduationCap size={18}/>}</span><span className="course-name">{course.name}</span><ChevronDown size={15} className={course.id===activeCourseId?'':'rotate-neg'}/>
          </button>
          {course.id===activeCourseId && <div className="lecture-links">
            {course.lectures.map(lecture=><button key={lecture.id} className={`lecture-item ${lecture.id===activeLectureId?'active':''}`} onClick={()=>selectLecture(course.id,lecture.id)}>
              <span className="lecture-dot"/ ><span>{lecture.title}</span>{lecture.progress.overall!==null && <CheckCircle2 size={14}/>}
            </button>)}
            <button className="add-lecture" onClick={()=>{setNewName('');setModal('lecture');}}><Plus size={14}/> Add lecture</button>
          </div>}
        </div>)}
        {!courses.length && <p className="sidebar-empty">No courses yet.</p>}
      </div>
      <div className="sidebar-bottom"><div className="tip-icon"><Lightbulb size={18}/></div><b>Progress over perfection</b><p>Small, consistent practice creates lasting understanding.</p></div>
      <div className="sidebar-footer"><ShieldCheck size={15}/> Your study space · Local MVP</div>
    </aside>

    <main className="main-panel">
      <div className="topbar"><div className="breadcrumb"><button className="mobile-menu" onClick={()=>setSidebarOpen(true)}><Menu size={21}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{view==='overview'?'Overview':view==='study'?'Study room':'Course materials'}</strong></div><div className="top-actions"><span className={`mode-tag ${aiReady?'mode-ai':''}`}><span className="live-dot"/>{aiReady?'AI Connected':'Manual assessment'}</span><span className="avatar">CL</span></div></div>
      <div className="page-content">
        {error && <div className="flash flash-error"><AlertTriangle size={17}/><span>{error}</span><button aria-label="Dismiss" onClick={()=>setError('')}><X size={16}/></button></div>}
        {notice && <div className="flash flash-ok"><Check size={17}/><span>{notice}</span><button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={16}/></button></div>}
        {!detail ? <section className="empty-screen"><div className="empty-emblem"><BookOpen size={32}/></div><h1>Start with a lecture.</h1><p>Create a course, then add your first lecture and upload the professor's materials.</p><button className="btn btn-primary" onClick={()=>setModal(activeCourseId?'lecture':'course')}><Plus size={18}/>{activeCourseId?'Add lecture':'Create course'}</button></section> : <>
          {view==='overview' && <>
            <div className="hero"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL LEARNING SPACE</div><h1>Learn it. <em>Prove it.</em></h1><p>Learn deeply, practice deliberately, and walk into your exam knowing what you actually understand.</p><div className="hero-actions"><button className="btn btn-light" onClick={()=>startStage('theory')}>Continue studying <ArrowRight size={17}/></button><button className="btn btn-ghost-light" onClick={()=>setView('sources')}><UploadCloud size={17}/> Add lecture notes</button></div></div><div className="hero-art" aria-hidden="true"><div className="art-orbit art-orbit-1"/><div className="art-orbit art-orbit-2"/><div className="art-center"><BookOpen size={41} strokeWidth={1.5}/></div><div className="art-spark art-spark-1"><Sparkles size={20}/></div><div className="art-spark art-spark-2"><Check size={20}/></div></div></div>
            <div className="section-head"><div><div className="page-kicker">YOUR COURSE</div><h2>{currentCourse?.name || 'Python Programming'}</h2><p>{detail.lecture.title} · {detail.questions.length ? `${detail.questions.length} practice questions` : 'Add course materials to begin'}</p></div><button className="btn btn-outline" onClick={()=>setView('sources')}><FileText size={17}/> Materials</button></div>
            <div className="metrics-grid"><Metric icon={<Target size={20}/>} name="Questions practiced" value={`${answered} / ${detail.questions.length}`} sub="Graded answers" color="blue"/><Metric icon={<TrendingUp size={20}/>} name="Final assessment" value={fmt(detail.progress.overall)} sub={detail.progress.overall===null?'Unlocks after unaided revision':'Score out of 10'} color="violet"/><Metric icon={<Flame size={20}/>} name="Completed stages" value={`${STAGES.filter(s=>scores?.[s].complete).length} / 5`} sub="Five-part study system" color="amber"/><Metric icon={<Clock3 size={20}/>} name="Study progress" value={`${percent}%`} sub="Questions graded" color="mint"/></div>
            <div className="content-grid"><section className="surface"><div className="card-head"><div><h3>Your learning path</h3><p>Five stages to real understanding</p></div><span className="pill">5 STAGES</span></div><div className="stage-rows">{STAGES.map((s,i)=>{const Icon=stageIcons[s];const info=scores?.[s]; const locked=s==='revision'&&!allStagesBeforeRevision;return <button className={`stage-row ${locked?'muted':''}`} key={s} onClick={()=>startStage(s)}><div className={`stage-square stage-${s}`}><Icon size={19}/></div><div className="stage-main"><div className="stage-title"><strong>{i+1}. {labels[s]}</strong>{info?.complete && <span className="completed-label"><CheckCircle2 size={13}/> Completed</span>}</div><span>{stageDescs[s]}</span></div><div className="stage-score">{info?.score!==null && info?.score!==undefined ? `${fmt(info.score)}/10` : info?.total?`${info.graded}/${info.total}`:'Not ready'}</div><ChevronRight size={17} className="stage-chevron"/></button>})}</div></section>
            <section className="surface sidebar-card"><div className="focus-box"><span className="focus-icon"><Zap size={18}/></span><div className="page-kicker">TODAY'S FOCUS</div><h3>Build confidence, one answer at a time.</h3><p>Your revision is only considered complete when you demonstrate understanding without assistance.</p><button className="btn btn-primary full" onClick={()=>startStage('theory')}>Open study room <ArrowRight size={17}/></button></div><div className="mini-divider"/><h4>Assessment principles</h4><div className="principle"><ShieldCheck size={17}/><span>No fabricated grades or code execution results</span></div><div className="principle"><CircleHelp size={17}/><span>Hints are tracked separately from mastery</span></div><div className="principle"><Target size={17}/><span>Final score only after unaided revision</span></div></section></div>
          </>}
          {view==='study' && <>
            <div className="study-header"><div><button className="text-back" onClick={()=>setView('overview')}><ArrowLeft size={15}/> Back to overview</button><div className="page-kicker">ACTIVE STUDY SESSION</div><h1>{detail.lecture.title}</h1><p>Select a stage and work through each question. Your progress saves automatically.</p></div><span className="study-meta"><CheckCircle2 size={15}/> Saved to local database</span></div>
            <div className="study-layout"><div className="study-stages">{STAGES.map((s,i)=>{const Icon=stageIcons[s];const info=scores?.[s];return <button className={`study-stage ${stage===s?'active':''}`} key={s} onClick={()=>startStage(s)}><div className="number-icon"><Icon size={18}/></div><div><strong>{i+1}. {labels[s]}</strong><small>{info?.complete?'Completed':`${info?.graded || 0} / ${info?.total || 0} assessed`}</small></div>{info?.complete&&<CheckCircle2 className="right-check" size={17}/>}</button>})}</div>
            <section className="question-card"><div className="question-top"><div className="stage-pill">{labels[stage].toUpperCase()}</div><span>QUESTION {Math.min(questionIndex+1,activeQuestions.length)} OF {activeQuestions.length}</span></div><div className="question-progress"><span style={{width:`${activeQuestions.length?((questionIndex+1)/activeQuestions.length)*100:0}%`}}/></div>
              {revisionBlocked ? <div className="empty-question"><div className="locked-icon"><ShieldCheck size={30}/></div><h2>Revision unlocks after practice</h2><p>Complete Theory, Tests, Code, and Problems first. This final stage is an unaided assessment, so hints and answer reveals are disabled until the stage is finished.</p><button className="btn btn-primary" onClick={()=>startStage(STAGES.slice(0,4).find(s=>!scores?.[s].complete) || 'theory')}>Continue learning <ArrowRight size={17}/></button></div> : !q ? <div className="empty-question"><div className="locked-icon"><FileText size={30}/></div><h2>No questions here yet</h2><p>Upload lecture PDFs or DOCX files, then generate questions when your AI connection is configured.</p><button className="btn btn-primary" onClick={()=>setView('sources')}>Add materials</button></div> : <>
                <div className="question-body"><h2>{q.prompt}</h2>{q.choices?.length ? <div className="answer-options">{q.choices.map((choice,i)=>{const letter=String.fromCharCode(65+i);return <button key={choice} disabled={!!review} className={`answer-choice ${answer===letter?'chosen':''}`} onClick={()=>setAnswer(letter)}><span>{letter}</span><strong>{choice.replace(/^[A-D][.)]\s*/, '')}</strong>{answer===letter&&<Check size={16}/>}</button>})}</div> : <div className="answer-writing"><label htmlFor="written-answer">Your answer {stage==='code'?'(Python)':''}</label><textarea id="written-answer" value={answer} disabled={!!review} onChange={e=>setAnswer(e.target.value)} rows={stage==='code'?11:6} spellCheck={false} placeholder={stage==='code'?'import sys\n\n# Write your solution here…':'Explain your reasoning in your own words…'} className={stage==='code'?'code-input':''}/><small>{stage==='code'?'Code is reviewed, not executed in this MVP.':'Think it through before submitting.'}</small></div>}
                {q.source_excerpt && <div className="source-reference"><FileText size={15}/><div><strong>Lecture source reference</strong><p>{q.source_excerpt.length>260?q.source_excerpt.slice(0,260)+'…':q.source_excerpt}</p></div></div>}
                {hint && stage!=='revision' && <div className="hint-box"><Lightbulb size={17}/><span>{hint}</span></div>}
                {questionPrevious && !review && !(stage==='revision'&&!revisionComplete) && <div className="previous-answer"><CheckCircle2 size={16}/> Previous assessment: {questionPrevious.score===null?'awaiting self-review':`${Math.round(questionPrevious.score*100)}%`}. You can try again.</div>}
                {review && <div className="feedback-box"><div className="feedback-title"><CheckCircle2 size={19}/><b>{stage==='revision' && !revisionComplete ? 'Answer recorded' : review.score===null ? 'Compare with the rubric' : 'Answer assessed'}</b><span>{stage==='revision'&&!revisionComplete?'Results hidden':review.score===null?'Self-review':`${Math.round(review.score*100)}%`}</span></div>
                  {stage==='revision'&&!revisionComplete?<p>Your answer is saved. Continue to the next question; the revision assessment stays blind until you finish.</p>:<><p>{review.feedback}</p><div className="model-answer"><strong>Reference answer / grading rubric</strong><p>{review.model_answer}</p>{review.explanation&&<p className="explanation">{review.explanation}</p>}</div>{review.score===null&&<div className="self-grades"><span>How accurate was your answer?</span><button onClick={()=>void selfAssess(0)} disabled={busy}>Not yet (0%)</button><button onClick={()=>void selfAssess(.5)} disabled={busy}>Partly (50%)</button><button onClick={()=>void selfAssess(1)} disabled={busy}>Got it (100%)</button></div>}{review.evaluated_by==='ai_review_not_execution'&&<small>AI rubric review only — code was not executed.</small>}</>}
                </div>}</div>
                <div className="question-bottom"><div className="question-bottom-left">{questionIndex>0&&<button className="btn btn-text" onClick={()=>moveQuestion(questionIndex-1)}><ArrowLeft size={16}/> Previous</button>}{stage!=='revision'&&!review&&<button className="btn btn-text" onClick={()=>void useHint()} disabled={busy}><Lightbulb size={16}/> Hint {hintCount>0?`(${hintCount})`:''}</button>}</div><div>{!review?<button className="btn btn-primary" onClick={()=>void submitAnswer()} disabled={!answer.trim()||busy}>{busy?<LoaderCircle className="spin" size={17}/>:null}Submit answer <ArrowRight size={17}/></button>:questionIndex<activeQuestions.length-1?<button className="btn btn-primary" onClick={()=>moveQuestion(questionIndex+1)}>Next question <ArrowRight size={17}/></button>:<button className="btn btn-primary" onClick={()=>{resetQuestion();setView('overview');}}>Back to dashboard <ArrowRight size={17}/></button>}</div></div>
              </>}
            </section></div>
          </>}
          {view==='sources'&&<><div className="study-header"><div><button className="text-back" onClick={()=>setView('overview')}><ArrowLeft size={15}/> Back to overview</button><div className="page-kicker">LEARNING MATERIALS</div><h1>Build your course library.</h1><p>Add lecture notes and exercises. Documents are parsed locally by your backend.</p></div></div>
            <section className="surface materials-card"><div className="card-head"><div><h3>{detail.lecture.title}</h3><p>PDF · DOCX · TXT · Maximum 12 MB</p></div><span className="pill">{detail.sources.length} FILES</span></div><label className={`dropzone ${busy?'disabled':''}`}><input type="file" accept=".pdf,.docx,.txt" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);e.target.value='';}}/><div className="upload-symbol">{busy?<LoaderCircle className="spin" size={25}/>:<CloudUpload size={27}/>}</div><strong>{busy?'Working on your material…':'Choose a lecture file to upload'}</strong><span>Extract searchable text from course material. Select a PDF, DOCX or TXT file.</span><span className="upload-link">Browse files <ArrowRight size={14}/></span></label>
              <div className="sources-list">{detail.sources.length ? detail.sources.map(s=><div className="file-row" key={s.id}><div className="file-row-icon"><FileText size={20}/></div><div><strong>{s.filename}</strong><span>{s.length.toLocaleString()} characters extracted</span></div><button className="btn btn-outline btn-sm" onClick={()=>void viewSource(s.id)}>Preview</button><button className="btn btn-primary btn-sm" disabled={busy||!aiReady} title={!aiReady?'Configure the AI connection in your backend first':''} onClick={()=>void generate(s.id)}>{busy?<LoaderCircle size={14} className="spin"/>:<Sparkles size={14}/>} Generate practice</button></div>) : <div className="file-empty">No lecture files uploaded yet. Start with your Python Programming lecture PDFs.</div>}</div>
              {!aiReady&&<div className="info-note"><CircleHelp size={18}/><span>AI question generation is disabled until an API key and model are configured on the backend. The included source-grounded practice questions work without AI.</span></div>}
              {selectedSource!==null&&<div className="preview-panel"><div><strong>Extracted text preview</strong><button onClick={()=>{setSelectedSource(null);setSourceText('');}}><X size={16}/></button></div><pre>{sourceText}</pre><small>Check code formatting, diagrams, and mathematical notation against the original file.</small></div>}
            </section></>}
        </>}
        <footer className="main-footer"><span>StudyFlow MVP · Built for real understanding</span>{exportEnabled && <button onClick={()=>window.open('/api/export','_blank')} title="Developer-only JSON backup endpoint"><Download size={14}/> Export data (dev)</button>}</footer>
      </div>
    </main>
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className="modal-dialog"><div className="modal-top"><div><span className="page-kicker">SET UP YOUR WORKSPACE</span><h2>{modal==='course'?'Create a course':'Add a lecture'}</h2></div><button className="icon-button" onClick={()=>setModal(null)}><X size={19}/></button></div><form onSubmit={e=>void addItem(e)}><label>{modal==='course'?'Course name':'Lecture title'}<input autoFocus required value={newName} onChange={e=>setNewName(e.target.value)} placeholder={modal==='course'?'e.g. Data Structures':'e.g. L02 — Loops and Conditions'}/></label>{modal==='course'&&<label>Course code <span>(optional)</span><input value={newCode} onChange={e=>setNewCode(e.target.value)} placeholder="NETB508"/></label>}<div className="modal-actions"><button type="button" className="btn btn-outline" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!newName.trim()||busy} type="submit">Create <ArrowRight size={16}/></button></div></form></div></div>}
  </div>;
}

function Metric({icon,name,value,sub,color}:{icon:ReactNode;name:string;value:string;sub:string;color:string}) {
  return <div className="metric"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-name">{name}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>;
}
function getMessage(e:unknown){return e instanceof Error?e.message:'An unexpected error occurred.';}