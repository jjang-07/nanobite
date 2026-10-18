import type { PrRow, EventRow } from '../db/db.ts';
import type { Config } from '../config.ts';
/**
 * Request progress and the detailed gate history. Status is
 * derived from the request state; event timestamps add times. Works with no events (Inbox rows).
 */
export type StepStatus = 'done' | 'current' | 'waiting' | 'stopped' | 'skipped';
export interface TrackStep {
    key: 'asked' | 'received' | 'rules' | 'minimize' | 'human' | 'delivered';
    gate?: 1 | 2 | 3;
    title: string;
    status: StepStatus;
    /** Short status text under the title, e.g. "Waiting for your approval". */
    label: string;
    detail: string;
    time: string | null;
}
const KEYS: TrackStep['key'][] = ['asked', 'received', 'rules', 'minimize', 'human', 'delivered'];
const EVENT_FOR: Record<TrackStep['key'], string[]> = { asked: ['request_sent', 'created'], received: ['received'], rules: ['sources_matched', 'rules_applied'], minimize: ['drafted'], human: ['decision', 'auto_merged'], delivered: ['delivered', 'denied'] };
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
        case 'reported': return { at: 6, stopped: false };
        case 'denied': return { at: pr.decision_reason === 'no_sources' ? 2 : 4, stopped: true };
        case 'failed': return { at: pr.draft_answer !== null ? 4 : has('sources_matched') ? 3 : 2, stopped: true };
        default: return { at: 0, stopped: false };
    }
}
/** Shared completion wording for the request header, timeline, and Inbox. */
export function deliveryTitle(pr: PrRow): string | null {
    if (pr.state === 'delivered' || pr.state === 'reported')
        return pr.decision === 'edit' ? 'Delivered (edited)' : pr.decision === 'auto' ? 'Delivered (auto-approved)' : 'Delivered (approved)';
    if (pr.state === 'denied')
        return pr.capsule_sent_email_id || pr.capsule_inbound_email_id ? 'Delivered (denied)' : 'Delivering (denied)';
    return null;
}
export function trackSteps(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): TrackStep[] {
    const requester = personName(pr.on_behalf_of, 'The requester');
    const firstAt = (kinds: string[]) => kinds.map(k => events.find(e => e.kind === k)?.at).find(Boolean);
    const has = (kind: string) => events.some(e => e.kind === kind);
    const { at, stopped } = progress(pr, has);
    const removals = list(pr.removals).map((r: any) => `${r?.placeholder} ×${Number(r?.count) || 0}`).join(', ');
    const sources = list(pr.matched_source_ids).length, flags = list(pr.draft_flagged).length;
    const decided = pr.decision === 'auto' ? 'Auto-approved under your rule' : pr.decision === 'edit' ? 'Edited and approved by you' : pr.decision === 'approve_always' ? 'Approved by you; future answers on this topic auto-approve' : 'Approved by you';
    const text: Record<TrackStep['key'], { title: string; gate?: 1 | 2 | 3; done: string; current: string; stopped?: string; stoppedDetail?: string }> = {
        asked: { title: 'Asked', done: `${requester}'s agent asked ${pr.responder_identity}`, current: 'Sending the question' },
        received: { title: 'Received', done: "The responder's agent picked it up", current: "Waiting for the responder's agent" },
        rules: { title: 'Rules', gate: 1, done: removals ? `Masked ${removals}` : 'Protected details masked', current: 'Masking protected details', stopped: 'No matching source', stoppedDetail: 'Nothing was shared.' },
        minimize: { title: 'Minimize', gate: 2, done: `Smallest answer drafted${sources ? ` from ${sources} excerpts` : ''}${flags ? `; ${flags} ${flags === 1 ? 'phrase' : 'phrases'} flagged for your review` : ''}`, current: 'Drafting the smallest answer', stopped: 'Drafting stopped', stoppedDetail: pr.decision_reason ?? 'See the timeline for the cause.' },
        human: { title: 'Human', gate: 3, done: decided, current: 'Waiting for your approval', stopped: pr.state === 'failed' ? 'Stopped' : 'Denied by you', stoppedDetail: pr.decision_reason ?? 'Nothing was shared.' },
        delivered: { title: deliveryTitle(pr) ?? 'Delivered', done: `${pr.state === 'denied' ? 'Denial' : 'Answer'} delivered to ${requester}'s agent`, current: `Delivering ${pr.state === 'denied' ? 'the denial ' : ''}to ${requester}'s agent` },
    };
    return KEYS.map((key, i) => {
        const t = text[key], time = clock(firstAt(EVENT_FOR[key]));
        let status: StepStatus = i < at ? 'done' : i === at ? (stopped ? 'stopped' : 'current') : (stopped ? 'skipped' : 'waiting');
        if (pr.state === 'reported')
            status = 'done';
        if (key === 'delivered' && pr.state === 'denied')
            status = pr.capsule_sent_email_id || pr.capsule_inbound_email_id ? 'done' : 'current';
        const approvalSent = clock(firstAt(['approval_sent']));
        const label = status === 'done' ? (time ? `Done · ${time}` : 'Done') : status === 'current' ? t.current : status === 'stopped' ? (t.stopped ?? 'Stopped') : status === 'skipped' ? 'Not shared' : 'Waiting';
        const detail = status === 'done' ? t.done : status === 'stopped' ? (t.stoppedDetail ?? '') : status === 'current' && key === 'human' && approvalSent ? `Approval email sent ${approvalSent}` : '';
        return { key, ...(t.gate ? { gate: t.gate } : {}), title: t.title, status, label, detail, time };
    });
}
const GROUP: Record<TrackStep['key'], 'request' | 'gate' | 'delivery'> = { asked: 'request', received: 'request', rules: 'gate', minimize: 'gate', human: 'gate', delivered: 'delivery' };
/** Short status for the progress line; times and details go to the Activity log. */
function shortLabel(s: TrackStep): string {
    return s.status === 'done' ? 'Done' : s.status === 'skipped' ? 'Not shared' : s.label;
}
/** One checkpoint for the three gates: stopped if any stopped, done when all are done, else the active gate's status. */
function gatesCheckpoint(gates: TrackStep[]): { status: StepStatus; label: string } {
    const stopped = gates.find(g => g.status === 'stopped'), current = gates.find(g => g.status === 'current');
    if (stopped)
        return { status: 'stopped', label: stopped.label };
    if (gates.every(g => g.status === 'done'))
        return { status: 'done', label: 'Done' };
    if (current)
        return { status: 'current', label: current.label };
    return gates.some(g => g.status === 'skipped') ? { status: 'skipped', label: 'Not shared' } : { status: 'waiting', label: 'Waiting' };
}
interface Checkpoint {
    key: 'asked' | 'received' | 'approval' | 'delivered';
    group: 'request' | 'gate' | 'delivery';
    title: string;
    status: StepStatus;
    label: string;
}
/** The four points shown on both the request page and the Inbox: Asked, Received, Approval (the three gates as one), Delivery. */
function checkpoints(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): Checkpoint[] {
    const steps = trackSteps(pr, events, config), gates = steps.filter(s => s.gate), cp = gatesCheckpoint(gates);
    const humanDenied = pr.state === 'denied' && pr.decision === 'deny' && pr.decision_reason !== 'no_sources';
    const approval = humanDenied ? { status: 'done' as const, label: 'Review complete' }
        : cp.status === 'done' ? { ...cp, label: pr.decision === 'auto' ? 'Approval rule applied' : 'Review complete' } : cp;
    const delivery = steps[5];
    let deliveryTitle_ = deliveryTitle(pr) ?? 'Delivery', deliveryLabel = shortLabel(delivery);
    if (pr.state === 'denied') {
        deliveryLabel = pr.decision_reason === 'no_sources' ? 'No matching source' : 'Denied by you';
    }
    else if (pr.state === 'failed') {
        deliveryTitle_ = 'Not shared';
        deliveryLabel = 'Request stopped';
    }
    else if (['approved', 'delivered', 'reported'].includes(pr.state)) {
        const decision = pr.decision === 'auto' ? 'Auto-approved under a rule'
            : pr.decision === 'edit' ? 'Edited by you' : 'Approved by you';
        deliveryLabel = pr.state === 'approved' ? `${decision} · Delivering` : decision;
    }
    const point = (s: TrackStep): Checkpoint => ({ key: s.key as Checkpoint['key'], group: GROUP[s.key], title: s.title, status: s.status, label: shortLabel(s) });
    return [point(steps[0]), point(steps[1]), { key: 'approval', group: 'gate', title: 'Approval', ...approval }, { key: 'delivered', group: 'delivery', title: deliveryTitle_, status: delivery.status, label: deliveryLabel }];
}
export function trackerHtml(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): string {
    const points = checkpoints(pr, events, config).map(c => `<li class="track-step" data-anim-key="step-${c.key}" data-group="${c.group}" data-status="${c.status}"><span class="track-dot" aria-hidden="true"></span><span class="track-title">${escape(c.title)}</span><span class="track-label">${escape(c.label)}</span></li>`).join('');
    return `<section class="section tracking" aria-labelledby="track-heading"><h2 id="track-heading">Tracking</h2><ol class="track" aria-label="Request progress">${points}</ol></section>`;
}
/** The step-by-step record with times and details, shown at the bottom of the request page. */
export function activityLogHtml(pr: PrRow, events: EventRow[], config?: Pick<Config, 'APPROVER_NAME'>): string {
    const rows = trackSteps(pr, events, config).filter(s => s.status !== 'waiting' && s.status !== 'skipped').map(s => `<li><div class="log-head"><strong>${s.gate ? `Gate ${s.gate} · ` : ''}${escape(s.title)}</strong><span class="note">${escape(s.time ?? '')}</span></div><p>${escape(s.status === 'done' ? s.detail : [s.label, s.detail].filter(Boolean).join(' · '))}</p></li>`).join('');
    return `<section class="section" aria-labelledby="log-heading"><h2 id="log-heading">Activity log</h2><ol class="activity-log">${rows || '<li class="muted">Nothing has happened yet.</li>'}</ol></section>`;
}
/** The same four points as the request page, as evenly spaced segments; the state text next to it carries the meaning. */
export function miniTrack(pr: PrRow, config?: Pick<Config, 'APPROVER_NAME'>): string {
    return `<span class="mini-track" aria-hidden="true">${checkpoints(pr, [], config).map((c, i) => `<span data-anim-key="${escape(pr.id)}:${i}" data-group="${c.group}" data-status="${c.status}"></span>`).join('')}</span>`;
}
export const trackerStyles = `
.track{list-style:none;padding:0;margin:22px 0 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.track-step{position:relative;min-width:0;padding:26px 16px 0 0;--on:var(--state)}
.track-step::before{content:"";position:absolute;top:7px;left:0;right:0;height:2px;background:var(--line)}
.track-step:last-child::before{right:auto;width:16px}
.track-step[data-status=done]::before{background:var(--on)}
.track-dot{position:absolute;top:0;left:0;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #b8b8b8;box-sizing:border-box}
.track-step[data-status=done] .track-dot{background:var(--on);border-color:var(--on)}
.track-step[data-status=current] .track-dot{border-color:var(--on);border-width:4px}
.track-step[data-status=current] .track-dot::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid var(--on);animation:track-pulse 1.6s ease-out infinite}
.track-step[data-status=stopped] .track-dot{background:#181818;border-color:#181818}
.track-step[data-status=skipped] .track-dot{border-style:dashed}
.track-kicker{display:block;font-size:12px;color:var(--state);font-weight:600}
.track-title{display:block;font-weight:500;line-height:1.35;color:var(--muted)}
.track-step[data-status=done] .track-title,.track-step[data-status=current] .track-title,.track-step[data-status=stopped] .track-title{color:#181818}
.track-step[data-status=current] .track-title{font-weight:600}
.track-label{display:block;font-size:13px;color:var(--muted)}
.track-step[data-status=current] .track-label{color:var(--state);font-weight:600}
.track-step[data-status=stopped] .track-label{color:#181818;font-weight:600}
/* Completion: when a live update turns a step Done, its dot pops, a ring fades out and its line sweeps to the next step. */
.track-step.just-done .track-dot{animation:step-pop .7s cubic-bezier(.2,.9,.3,1.4)}
.track-step.just-done .track-dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--on);opacity:0;animation:step-burst .9s ease-out}
.track-step.just-done::before{transform-origin:left center;animation:line-fill .8s ease-out}
.track-step.just-done .track-label{animation:label-in .5s ease-out}
.mini-track span.just-done{animation:seg-pop .6s ease-out}
@keyframes step-pop{0%{transform:scale(.5)}55%{transform:scale(1.45)}100%{transform:scale(1)}}
@keyframes step-burst{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.4);opacity:0}}
@keyframes line-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes line-fill-v{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes label-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes seg-pop{0%{transform:scaleY(1)}50%{transform:scaleY(2.6)}100%{transform:scaleY(1)}}
@keyframes track-pulse{0%{transform:scale(.55);opacity:.7}100%{transform:scale(1.15);opacity:0}}
@media(prefers-reduced-motion:reduce){.track-step[data-status=current] .track-dot::after{animation:none;opacity:.35}.just-done,.just-done .track-dot,.just-done .track-label,.just-done::before,.just-done .track-dot::after{animation:none!important}}
.activity-log{list-style:none;padding:0;margin:16px 0 0}.activity-log>li{border-top:1px solid var(--line);padding:13px 0}
.activity-log p{margin:2px 0 0;font-size:14px;color:var(--muted);overflow-wrap:anywhere}
.log-head{display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap;font-size:14px}.log-head strong{font-weight:500}
.mini-track{display:flex;gap:4px;margin-top:6px}.mini-track span{width:22px;height:3px;background:var(--line)}
.mini-track span[data-status=done]{background:var(--state)}
.mini-track span[data-status=current]{background:#8fb0dd}.mini-track span[data-status=stopped]{background:#181818}
.summary-block{margin:4px 0 22px;max-width:72ch}.summary-block p{margin:0}.summary-text{font-size:18px;line-height:1.5;font-weight:500}.decision-summary{max-width:72ch;margin:4px 0 8px}.shared-text>summary{font-weight:500}.shared-text .exact{padding-top:4px}
.live-stamp{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.intro.top{margin-bottom:10px}.status-block{margin-bottom:0}
@media(max-width:760px){.track{grid-template-columns:1fr}.track-step{padding:0 0 18px 32px}.track-step::before{top:0;bottom:0;left:7px;right:auto;width:2px;height:auto}.track-step:last-child::before{display:none}.track-kicker{display:inline;margin-right:8px}.track-title{display:inline}.track-kicker:empty,.track-step:not([data-group=gate]) .track-kicker{display:none}.track-step.just-done::before{transform-origin:top center;animation-name:line-fill-v}}
`;
