import type { Course, LectureDetail, AttemptResult } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`/api${path}`, init); }
  catch { throw new Error('Cannot reach the backend. Start FastAPI on localhost:8000.'); }
  if (!r.ok) { let message = `${r.status} ${r.statusText}`; try { message = (await r.json()).detail || message; } catch {} throw new Error(message); }
  return r.json() as Promise<T>;
}
export const api = {
  health: () => request<{status: string; ai_configured: boolean; mode: string; export_enabled: boolean}>('/health'),
  courses: () => request<Course[]>('/courses'),
  lecture: (id: number) => request<LectureDetail>(`/lectures/${id}`),
  createCourse: (name: string, code: string) => request<Course>('/courses', {method: 'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify({name,code})}),
  createLecture: (course_id: number, title: string) => request<{id:number}>('/lectures', {method:'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify({course_id,title})}),
  hint: (id: number, draft_answer: string, hint_number: number) => request<{hint:string;mode:string}>(`/questions/${id}/hint`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft_answer,hint_number})}),
  attempt: (id: number, answer: string, hints_used: number) => request<AttemptResult>(`/questions/${id}/attempts`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({answer,hints_used})}),
  selfGrade: (id: number, score: number) => request<{score: number}>(`/attempts/${id}/self-grade`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({score})}),
  upload: (lecture_id: number, file: File) => { const body = new FormData(); body.append('file',file); return request<{id:number;filename:string;characters:number;note:string}>(`/lectures/${lecture_id}/sources`,{method:'POST',body}); },
  generate: (source_id:number) => request<{added:number;note:string}>(`/sources/${source_id}/generate`,{method:'POST'}),
  source: (source_id:number) => request<{content:string;filename:string;truncated:boolean}>(`/sources/${source_id}`),
};