import type { PrRow } from '../db/db.ts';
import type { Config } from '../config.ts';
import type { Removal } from '../types.ts';
import { personName } from '../dashboard/tracker.ts';
/**
 * The approval email as HTML, in the dashboard's visual language: one system sans stack, white page,
 * near-black text, muted labels, hairline rules, square buttons and tags, no images or icons.
 * Order: plain-language summary, the exact answer, the decision buttons, then collapsed details.
 * Buttons are mailto links: each opens a ready-to-send email to the agent with the request ID in
 * the subject, so the decision still travels as an email. Mail clients need inline styles and tables.
 */
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const C = { text: '#181818', muted: '#626262', line: '#e5e5e5', state: '#185cba', tag: '#c9c9c9', soft: '#f5f5f5' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function list<T>(value: string | null): T[] { try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
}
catch {
    return [];
} }
/** RFC 6068 mailto: CRLF line breaks, everything percent-encoded. Long edit bodies fall back to a prompt. */
export function decisionMailto(to: string, subject: string, body: string): string {
    const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
    return `mailto:${encodeURIComponent(to).replace('%40', '@')}?subject=${enc(subject)}&body=${enc(body)}`;
}
const tag = (text: string, wrap = false) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 9px;border:1px solid ${C.tag};font-size:13px;line-height:1.5;color:${C.text};white-space:${wrap ? 'normal' : 'nowrap'};word-break:break-word">${esc(text)}</span>`;
const eyebrow = (text: string) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${C.muted}">${text}</p>`;
const fact = (name: string, valueHtml: string) => `<tr><td valign="top" style="width:118px;padding:10px 14px 10px 0;border-top:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.muted}">${esc(name)}</td><td valign="top" style="padding:8px 0 4px;border-top:1px solid ${C.line};font-size:14px;line-height:1.6;color:${C.text};word-break:break-word;overflow-wrap:anywhere">${valueHtml}</td></tr>`;
function button(label: string, href: string, primary: boolean): string {
    const style = primary
        ? `background:${C.text};color:#ffffff;border:1px solid ${C.text}`
        : `background:#ffffff;color:${C.text};border:1px solid #777777`;
    return `<td style="padding:0 8px 8px 0"><a href="${esc(href)}" style="display:inline-block;${style};padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;text-decoration:none;mso-padding-alt:0">${esc(label)}</a></td>`;
}
export function approvalEmailHtml(p: PrRow, config: Pick<Config, 'APPROVER_NAME' | 'DASHBOARD_PUBLIC_URL'>, subject: string): string {
    const approver = config.APPROVER_NAME || 'there', requester = personName(p.on_behalf_of, 'The requester');
    const removals = list<Removal>(p.removals), flags = list<string>(p.draft_flagged), sources = list<string>(p.matched_source_ids);
    const sessions = new Set(sources.map(id => String(id).split(':')[0])).size;
    const publicUrl = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(config.DASHBOARD_PUBLIC_URL) ? null : `${config.DASHBOARD_PUBLIC_URL}/pr/${p.id}`;
    const re = `Re: ${subject}`, to = p.responder_identity, draft = p.draft_answer ?? '';
    let editHref = decisionMailto(to, re, `edit\n\n${draft}`);
    if (editHref.length > 1900)
        editHref = decisionMailto(to, re, 'edit\n\nWrite the full replacement answer here. Only this text will be shared.');
    const buttons = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${button('Approve', decisionMailto(to, re, 'approve'), true)}${button('Deny', decisionMailto(to, re, 'deny'), false)}${button('Edit', editHref, false)}</tr></table>`;
    const details = [
        fact('Masked by rules', removals.length ? removals.map(r => tag(`${r.placeholder} ×${r.count}`)).join('') : `<span style="color:${C.muted}">Nothing needed masking</span>`),
        fact('Built from', esc(`${sessions || 0} ${sessions === 1 ? 'session' : 'sessions'}, ${sources.length} ${sources.length === 1 ? 'excerpt' : 'excerpts'}. Nothing else is sent.`)),
        fact('Request ID', `<span style="color:${C.muted}">${esc(p.id)}</span>${publicUrl ? ` · <a href="${esc(publicUrl)}" style="color:${C.text}">Open in Nanobite</a>` : ''}`),
    ].join('');
    const summary = p.draft_summary ? `<tr><td style="padding:36px 0 0">${eyebrow('Summary')}<p style="margin:0;font-size:18px;line-height:1.5;font-weight:500;color:${C.text};word-break:break-word;overflow-wrap:anywhere">${esc(p.draft_summary)}</p></td></tr>` : '';
    const flagged = flags.length ? `<tr><td style="padding:36px 0 0">${eyebrow('Flagged for you')}${flags.map(f => tag(`“${f}”`, true)).join('')}</td></tr>` : '';
    const preheader = `${approver}, approve this answer for ${requester}? ${p.draft_summary ?? ''}`.trim();
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>Approve this answer</title><style>details > summary.nb-s{display:list-item!important} details[open] .nb-dc{display:block!important;max-height:none!important;overflow:visible!important}</style></head>
<body style="margin:0;padding:0;background:#ffffff;color:${C.text}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff"><tr><td align="center" style="padding:28px 20px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};color:${C.text}">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${C.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:20px;font-weight:650;letter-spacing:-0.03em;color:${C.text}">Nanobite</td>
<td align="right" style="font-size:13px;font-weight:600;color:${C.state}">Ready for your review</td></tr></table></td></tr>
<tr><td style="padding:26px 0 0">
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${C.text}">Approve this answer for ${esc(requester)}?</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.muted};word-break:break-word;overflow-wrap:anywhere">${esc(requester)}’s coding agent asked: <span style="color:${C.text}">“${esc(p.question)}”</span></p>
</td></tr>
${summary}
<tr><td style="padding:36px 0 0">
${eyebrow('Exact answer')}
<div style="border-left:3px solid ${C.text};padding:2px 0 2px 16px;font-size:15px;line-height:1.65;color:${C.text};white-space:pre-wrap;word-break:break-word">${esc(draft)}</div>
</td></tr>
${flagged}
<tr><td style="padding:36px 0 0">${buttons}</td></tr>
<tr><td style="padding:36px 0 0;font-size:14px;line-height:1.6;color:${C.muted};word-break:break-word;overflow-wrap:anywhere">Requested by <span style="color:${C.text}">${esc(p.requester_identity)}</span> for ${esc(p.on_behalf_of ?? 'an engineer')} · topic ${tag(p.topic)}</td></tr>
<tr><td style="padding:20px 0 0">
<details class="nb-d"><summary class="nb-s" style="display:none;mso-hide:all;cursor:pointer;padding:10px 0;font-size:14px;color:${C.text};border-top:1px solid ${C.line}">Details</summary>
<div class="nb-dc" style="display:none;max-height:0;overflow:hidden;mso-hide:all"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details}</table></div>
</details>
</td></tr>
<tr><td style="padding:28px 0 0;border-bottom:1px solid ${C.line}"></td></tr>
<tr><td style="padding:14px 0 0;font-size:12px;line-height:1.6;color:${C.muted};word-break:break-word;overflow-wrap:anywhere">Sent by the Nanobite agent at ${esc(p.responder_identity)}. Rules and minimization ran before this email; your decision is the last gate. Nothing leaves without it.</td></tr>
</table></td></tr></table></body></html>`;
}
