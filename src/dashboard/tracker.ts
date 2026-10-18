import type { PrRow, EventRow } from '../db/db.ts';
import type { Config } from '../config.ts';
/**
 * Package-tracking view of one Nanobite request: seven stages, with the three gates labeled. Status is
 * derived from the request state; event timestamps add times. Works with no events (Inbox rows).
 */
export type StepStatus = 'done' | 'current' | 'waiting' | 'stopped' | 'skipped';
export interface TrackStep {
    key: 'asked' | 'received' | 'rules' | 'minimize' | 'human' | 'delivered' | 'outcome';
    gate?: 1 | 2 | 3;
    title: string;
    status: StepStatus;
    /** Short status text under the title, e.g. "Waiting for TK". */
    label: string;
    detail: string;
    time: string | null;
}
const KEYS: TrackStep['key'][] = ['asked', 'received', 'rules', 'minimize', 'human', 'delivered', 'outcome'];
const EVENT_FOR: Record<TrackStep['key'], string[]> = { asked: ['request_sent', 'created'], received: ['received'], rules: ['sources_matched', 'rules_applied'], minimize: ['drafted'], human: ['decision', 'auto_merged'], delivered: ['delivered'], outcome: ['outcome'] };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function list(value: string | null): any[] { try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
}
catch {
    return [];
} }
/** "Yunha (startup)" → "Yunha". */
export function personName(onBehalfOf: string | null | undefined, fallback: string): string {
    const name = String(onBehalfOf ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
    return name || fallback;
}
function clock(iso: string | undefined): string | null {
    if (!iso)
        return null;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(d) : null;
}
/** Index of the first unfinished stage, and whether the request stopped there. */
function progress(pr: PrRow, has: (kind: string) => boolean): { at: number; stopped: boolean } {
    switch (pr.state) {
        case 'queued': return { at: 0, stopped: false };
        case 'requested': return { at: 1, stopped: false };
        case 'received': return { at: 2, stopped: false };
        case 'drafting': return { at: pr.draft_answer !== null ? 4 : has('sources_matched') || has('rules_applied') ? 3 : 2, stopped: false };
        case 'awaiting_approval': return { at: 4, stopped: false };
        case 'approved': return { at: 5, stopped: false };
        case 'delivered': return { at: 6, stopped: false };
        case 'reported': return { at: 7, stopped: false };
        case 'denied': return { at: pr.decision_reason === 'no_sources' ? 2 : 4, stopped: true };
        case 'failed': return { at: pr.draft_answer !== null ? 4 : has('sources_matched') ? 3 : 2, stopped: true };
        default: return { at: 0, stopped: false };
    }
}
export function trackSteps(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): TrackStep[] {
    const approver = config?.APPROVER_NAME || 'the approver', requester = personName(pr.on_behalf_of, 'The requester');
    const firstAt = (kinds: string[]) => kinds.map(k => events.find(e => e.kind === k)?.at).find(Boolean);
    const has = (kind: string) => events.some(e => e.kind === kind);
    const { at, stopped } = progress(pr, has);
    const removals = list(pr.removals).map((r: any) => `${r?.placeholder} ×${Number(r?.count) || 0}`).join(', ');
    const sources = list(pr.matched_source_ids).length, flags = list(pr.draft_flagged).length;
    const decided = pr.decision === 'auto' ? `Auto-approved under ${approver}'s rule` : pr.decision === 'edit' ? `Edited and approved by ${approver}` : pr.decision === 'approve_always' ? `Approved by ${approver}; future answers on this topic auto-approve` : `Approved by ${approver}`;
    const text: Record<TrackStep['key'], { title: string; gate?: 1 | 2 | 3; done: string; current: string; stopped?: string; stoppedDetail?: string }> = {
        asked: { title: 'Asked', done: `${requester}'s agent asked ${pr.responder_identity}`, current: 'Sending the question' },
        received: { title: 'Received', done: "The responder's agent picked it up", current: "Waiting for the responder's agent" },
        rules: { title: 'Rules', gate: 1, done: removals ? `Masked ${removals}` : 'Protected details masked', current: 'Masking protected details', stopped: 'No matching source', stoppedDetail: 'Nothing was shared.' },
        minimize: { title: 'Minimize', gate: 2, done: `Smallest answer drafted${sources ? ` from ${sources} excerpts` : ''}${flags ? `; ${flags} ${flags === 1 ? 'phrase' : 'phrases'} flagged for ${approver}` : ''}`, current: 'Drafting the smallest answer', stopped: 'Drafting stopped', stoppedDetail: pr.decision_reason ?? 'See the timeline for the cause.' },
        human: { title: 'Human', gate: 3, done: decided, current: `Waiting for ${approver}`, stopped: pr.state === 'failed' ? 'Stopped' : `Denied by ${approver}`, stoppedDetail: pr.decision_reason ?? 'Nothing was shared.' },
        delivered: { title: 'Delivered', done: `Answer delivered to ${requester}'s agent`, current: `Delivering to ${requester}'s agent` },
        outcome: { title: 'Outcome', done: pr.outcome_result ? `Test ${pr.outcome_result.replace('_', ' ')}` : 'Outcome recorded', current: `Waiting for ${requester}'s test result` },
    };
    return KEYS.map((key, i) => {
        const t = text[key], time = clock(firstAt(EVENT_FOR[key]));
        let status: StepStatus = i < at ? 'done' : i === at ? (stopped ? 'stopped' : 'current') : (stopped ? 'skipped' : 'waiting');
        if (pr.state === 'reported')
            status = 'done';
        const approvalSent = clock(firstAt(['approval_sent']));
        const label = status === 'done' ? (time ? `Done · ${time}` : 'Done') : status === 'current' ? t.current : status === 'stopped' ? (t.stopped ?? 'Stopped') : status === 'skipped' ? 'Not shared' : 'Waiting';
        const detail = status === 'done' ? t.done : status === 'stopped' ? (t.stoppedDetail ?? '') : status === 'current' && key === 'human' && approvalSent ? `Approval email sent ${approvalSent}` : '';
        return { key, ...(t.gate ? { gate: t.gate } : {}), title: t.title, status, label, detail, time };
    });
}
const ROLE: Record<string, (approver: string) => string> = {
    rules: () => 'Masks names, tickets and secrets',
    minimize: () => 'Drafts the smallest answer',
    human: approver => `${approver} approves the exact words`,
};
function stepHtml(s: TrackStep, approver: string): string {
    const marker = s.gate ? String(s.gate) : '';
    const role = s.gate ? `<span class="track-role">${escape(ROLE[s.key](approver))}</span>` : '';
    const hidden = s.gate ? `<span class="visually-hidden">Gate ${s.gate}: </span>` : '';
    return `<li class="track-step" data-status="${s.status}"><span class="track-dot" aria-hidden="true">${marker}</span><span class="track-title">${hidden}${escape(s.title)}</span>${role}<span class="track-label">${escape(s.label)}</span>${s.detail ? `<span class="track-detail">${escape(s.detail)}</span>` : ''}</li>`;
}
export function trackerHtml(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): string {
    const steps = trackSteps(pr, events, config), approver = config?.APPROVER_NAME || 'The approver';
    const zone = (cls: string, label: string, list: TrackStep[]) => `<div class="zone ${cls}"><p class="zone-label">${escape(label)}</p><ol class="zone-steps n${list.length}">${list.map(s => stepHtml(s, approver)).join('')}</ol></div>`;
    return `<section class="section tracking" aria-labelledby="track-heading"><h2 id="track-heading">Tracking</h2><div class="track" aria-label="Request progress">${zone('request', 'Request', steps.slice(0, 2))}${zone('gates', 'Three gates before anything is shared', steps.slice(2, 5))}${zone('delivery', 'Delivery', steps.slice(5))}</div></section>`;
}
/** Seven-segment bar for an Inbox row, grouped 2 · 3 · 2 with the gates marked; the state text carries the meaning. */
export function miniTrack(pr: PrRow, config?: Pick<Config, 'APPROVER_NAME'>): string {
    return `<span class="mini-track" aria-hidden="true">${trackSteps(pr, [], config).map(s => `<span${s.gate ? ' class="g"' : ''} data-status="${s.status}"></span>`).join('')}</span>`;
}
export const trackerStyles = `
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.track{display:grid;grid-template-columns:2fr 3.4fr 2fr;gap:14px;margin:20px 0 0;align-items:stretch}
.zone{border-top:1px solid var(--line);padding:12px 0 4px;min-width:0}
.zone-label{font-size:12px;color:var(--muted);margin:0 0 14px}
.zone.gates{background:#f3f4f6;border-top:3px solid #181818;padding:12px 18px 14px}
.zone.gates .zone-label{font-size:14px;font-weight:600;color:#181818}
.zone-steps{list-style:none;margin:0;padding:0;display:grid}
.zone-steps.n2{grid-template-columns:repeat(2,minmax(0,1fr))}.zone-steps.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.track-step{position:relative;min-width:0;padding:22px 12px 0 0}
.track-step::before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--line)}
.track-step:last-child::before{right:auto;width:12px}
.track-step[data-status=done]::before{background:var(--state)}
.track-dot{position:absolute;top:0;left:0;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #b8b8b8;box-sizing:border-box}
.track-step[data-status=done] .track-dot{background:var(--state);border-color:var(--state)}
.track-step[data-status=current] .track-dot{border-color:var(--state);border-width:3px}
.track-step[data-status=stopped] .track-dot{background:#181818;border-color:#181818}
.track-step[data-status=skipped] .track-dot{border-style:dashed}
.track-step[data-status=current] .track-dot::after{content:"";position:absolute;inset:-7px;border-radius:inherit;border:2px solid var(--state);animation:track-pulse 1.6s ease-out infinite}
.gates .track-step{padding-top:40px}
.gates .track-step::before{top:13px}
.gates .track-dot{width:28px;height:28px;border-radius:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;line-height:1;color:#8a8a8a}
.gates .track-step[data-status=done] .track-dot,.gates .track-step[data-status=stopped] .track-dot{color:#fff}
.gates .track-step[data-status=current] .track-dot{color:var(--state);background:#fff}
.track-title{display:block;font-weight:600;line-height:1.35}
.gates .track-title{font-size:17px}
.track-role{display:block;font-size:13px;color:#181818;margin:1px 0 3px}
.track-label{display:block;font-size:13px;color:var(--muted)}
.track-step[data-status=current] .track-label{color:var(--state);font-weight:600}
.track-step[data-status=stopped] .track-label{color:#181818;font-weight:600}
.track-detail{display:block;font-size:13px;color:var(--muted);overflow-wrap:anywhere;margin-top:2px}
@keyframes track-pulse{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.15);opacity:0}}
@media(prefers-reduced-motion:reduce){.track-step[data-status=current] .track-dot::after{animation:none;opacity:.35}}
.mini-track{display:flex;gap:3px;margin-top:6px;align-items:center}.mini-track span{width:11px;height:3px;background:var(--line)}
.mini-track span.g{height:6px}.mini-track span.g:first-of-type,.mini-track span:nth-child(3),.mini-track span:nth-child(6){margin-left:5px}
.mini-track span[data-status=done]{background:var(--state)}.mini-track span[data-status=current]{background:#8fb0dd}.mini-track span[data-status=stopped]{background:#181818}
.summary-block{margin:4px 0 22px;max-width:72ch}.summary-block p{margin:0}.summary-text{font-size:18px;line-height:1.5;font-weight:500}
.live-stamp{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.intro.top{margin-bottom:10px}.status-block{margin-bottom:0}
@media(max-width:760px){.track{grid-template-columns:1fr;gap:10px}.zone-steps.n2,.zone-steps.n3{grid-template-columns:1fr}.track-step{padding:0 0 16px 26px}.track-step::before{top:0;bottom:0;left:5px;right:auto;width:2px;height:auto}.track-step:last-child::before{display:none}.gates .track-step{padding:0 0 16px 42px;min-height:44px}.gates .track-step::before{left:13px}.zone.gates{padding:12px 14px 4px}}
`;
