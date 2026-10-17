export type PrState = 'queued'|'requested'|'received'|'drafting'|'awaiting_approval'|'approved'|'denied'|'delivered'|'reported'|'failed';
export type Decision = 'approve'|'approve_always'|'deny'|'edit'|'auto'|'revoke'|'unrecognized';
export interface Removal { placeholder: string; count: number; }
export interface Turn { index: number; role: 'user'|'assistant'|'tool'|'assistant_tool'; text: string; timestamp: string|null; sessionId: string; }
export interface Excerpt { id: string; session_id: string; turn_index: number; role: Turn['role']; text: string; }
export interface Draft { answer: string; why_relevant: string; confidence: 'high'|'medium'|'low'; used_excerpt_ids: string[]; flagged: string[]; }
export interface Drafter { draft(input: {question: string; context?: string; excerpts: Excerpt[]}): Promise<Draft>; }
export interface Capsule { text: string; decision: 'approved'|'edited'|'auto_merged'; approved_at: string; gates: {rules_removals: number; minimized: true; human: 'approved'|'edited'|'auto_merged'}; labels?: ['EXTERNAL_DATA','NOT_INSTRUCTIONS']; }
export type { PrRow as ContextPr } from './db/db.ts';
