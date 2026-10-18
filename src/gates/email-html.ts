import type { PrRow } from '../db/db.ts';
import type { Config } from '../config.ts';
import type { Removal } from '../types.ts';
import { personName } from '../dashboard/tracker.ts';
/**
 * The approval email as HTML, in the dashboard's visual language: one system sans stack, white page,
 * near-black text, muted labels, hairline rules, square tags, no images, icons, shadows or cards.
 * Mail clients need inline styles and table layout. The exact draft comes first and is escaped.
 */
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const C = { text: '#181818', muted: '#626262', line: '#e5e5e5', state: '#185cba', tag: '#c9c9c9' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function list<T>(value: string | null): T[] { try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
}
catch {
    return [];
} }
const tag = (text: string) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 9px;border:1px solid ${C.tag};font-size:13px;line-height:1.5;color:${C.text};white-space:nowrap">${esc(text)}</span>`;
const label = (text: string) => `<td valign="top" style="width:118px;padding:12px 14px 12px 0;border-top:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.muted}">${esc(text)}</td>`;
const row = (name: string, valueHtml: string) => `<tr>${label(name)}<td valign="top" style="padding:10px 0 6px;border-top:1px solid ${C.line};font-size:14px;line-height:1.6;color:${C.text};word-break:break-word;overflow-wrap:anywhere">${valueHtml}</td></tr>`;
const reply = (command: string, meaning: string) => `<tr><td valign="top" style="width:118px;padding:9px 14px 9px 0;border-top:1px solid ${C.line};font-size:15px;font-weight:600;color:${C.text};white-space:nowrap">${esc(command)}</td><td valign="top" style="padding:9px 0;border-top:1px solid ${C.line};font-size:14px;line-height:1.55;color:${C.muted};word-break:break-word;overflow-wrap:anywhere">${esc(meaning)}</td></tr>`;
export function approvalEmailHtml(p: PrRow, config: Pick<Config, 'APPROVER_NAME' | 'DASHBOARD_PUBLIC_URL'>): string {
    const approver = config.APPROVER_NAME || 'there', requester = personName(p.on_behalf_of, 'The requester');
    const removals = list<Removal>(p.removals), flags = list<string>(p.draft_flagged), sources = list<string>(p.matched_source_ids);
    const sessions = new Set(sources.map(id => String(id).split(':')[0])).size;
    const publicUrl = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(config.DASHBOARD_PUBLIC_URL) ? null : `${config.DASHBOARD_PUBLIC_URL}/pr/${p.id}`;
    const facts = [
        row('Masked by rules', removals.length ? removals.map(r => tag(`${r.placeholder} ×${r.count}`)).join('') : `<span style="color:${C.muted}">Nothing needed masking</span>`),
        row('Flagged for you', flags.length ? flags.map(f => tag(`“${f}”`)).join('') + `<div style="font-size:13px;color:${C.muted};margin-top:2px">The model thinks you may not want these shared. Remove them with edit.</div>` : `<span style="color:${C.muted}">Nothing flagged</span>`),
        row('Built from', esc(`${sessions || 0} ${sessions === 1 ? 'session' : 'sessions'}, ${sources.length} ${sources.length === 1 ? 'excerpt' : 'excerpts'}. Nothing else is sent.`)),
        row('Requested by', `${esc(p.requester_identity)}<br><span style="color:${C.muted}">for ${esc(p.on_behalf_of ?? 'an engineer')}</span>`),
        row('Topic', tag(p.topic)),
        row('Request', `<span style="font-size:13px;color:${C.muted}">${esc(p.id)}</span>${publicUrl ? ` · <a href="${esc(publicUrl)}" style="color:${C.text}">Open in ContextPR</a>` : ''}`),
    ].join('');
    const preheader = `${approver}, approve this answer for ${requester}? Reply approve, edit, or deny.`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>Approve this answer</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:${C.text}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff"><tr><td align="center" style="padding:28px 20px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};color:${C.text}">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${C.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:20px;font-weight:650;letter-spacing:-0.03em;color:${C.text}">ContextPR</td>
<td align="right" style="font-size:13px;font-weight:600;color:${C.state}">Ready for your review</td></tr></table></td></tr>
<tr><td style="padding:26px 0 0">
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${C.text}">Approve this answer for ${esc(requester)}?</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.muted}">${esc(requester)}’s coding agent asked:</p>
<p style="margin:4px 0 0;font-size:16px;line-height:1.55;color:${C.text};word-break:break-word;overflow-wrap:anywhere">“${esc(p.question)}”</p>
</td></tr>
<tr><td style="padding:26px 0 0">
<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${C.muted}">Draft answer · sent word for word if you approve</p>
<div style="border-left:3px solid ${C.text};padding:2px 0 2px 16px;font-size:16px;line-height:1.65;color:${C.text};white-space:pre-wrap;word-break:break-word">${esc(p.draft_answer)}</div>
</td></tr>
<tr><td style="padding:30px 0 0">
<p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:${C.muted}">Before you decide</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${facts}</table>
</td></tr>
<tr><td style="padding:30px 0 0">
<p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:${C.muted}">Reply with one of these as the first line</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${reply('approve', 'Share the draft exactly as written.')}
${reply('approve always', `Share it, and auto-share future answers on ${p.topic} to this requester. You get a copy each time and can reply revoke.`)}
${reply('deny <reason>', 'Share nothing. The reason goes back to the requester.')}
${reply('edit', 'Put your full replacement text on the lines below. Only your text is shared.')}
</table>
</td></tr>
<tr><td style="padding:28px 0 0;border-bottom:1px solid ${C.line}"></td></tr>
<tr><td style="padding:16px 0 0;font-size:12px;line-height:1.6;color:${C.muted};word-break:break-word;overflow-wrap:anywhere">Sent by the ContextPR agent at ${esc(p.responder_identity)}. Rules and minimization ran before this email; your reply is the last gate. Nothing leaves without it.</td></tr>
</table></td></tr></table></body></html>`;
}
