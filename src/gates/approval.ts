import type { Decision } from '../types.ts';
import { parseDecisionFields } from './decision-reply.ts';
/** True at a line where a mail client starts its signature, attribution or quoted original. */
function isReplyTrailer(lines: string[], i: number): boolean {
    const l = lines[i];
    return /^On .+ wrote:\s*$/.test(l)
        // Gmail mobile wraps a long attribution: "On <date>" then "<sender> wrote:" on the next line.
        || (/^On .+/.test(l) && lines.slice(i + 1, i + 3).some(s => /wrote:\s*$/.test(s)))
        || /^-{2,}\s*Original Message/i.test(l) || /^-- $/.test(l)
        || /^Sent from (my |Outlook|Mail for )/i.test(l) || /^Get Outlook for /i.test(l)
        // Outlook desktop separates the quoted original with a line of underscores.
        || /^_{10,}\s*$/.test(l)
        || (/^From: .+$/.test(l) && lines.slice(i + 1, i + 4).some(s => /^Sent: /.test(s)));
}
export function stripQuotedReply(body: string): string {
    const lines = body.replace(/\r\n/g, '\n').split('\n'), out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (isReplyTrailer(lines, i))
            break;
        if (!/^>/.test(l))
            out.push(l);
    }
    return out.join('\n').trim();
}
export function parseDecision(body: string | null, options: {
    local?: boolean;
} = {}): {
    decision: Decision;
    text?: string;
    reason?: string;
} {
    // Local replacements are authored in the dashboard, not wrapped by a mail client.
    // Keep newline bytes in each chunk so the replacement is never normalized or trimmed.
    const content = options.local ? body ?? '' : stripQuotedReply(body ?? '');
    const chunks = content.split(/(?<=\n)/), first = chunks.findIndex(chunk => chunk.trim());
    if (first < 0)
        return { decision: 'unrecognized' };
    const command = chunks[first].replace(/\r?\n$/, ''), remainder = chunks.slice(first + 1).join('');
    const line = command.trim().toLowerCase().replace(/[.!?:;,]+$/, '');
    if (!options.local) {
        const fields = parseDecisionFields(line, remainder);
        if (fields)
            return fields;
    }
    if (!remainder.trim()) {
        if (line === 'approve always')
            return { decision: 'approve_always' };
        if (/^(approve|approved|ok|okay|lgtm|yes|ship it)$/.test(line))
            return { decision: 'approve' };
        if (line === 'revoke')
            return { decision: 'revoke' };
    }
    if (/^(deny|denied|reject|no)\b/.test(line))
        return { decision: 'deny', reason: [command.trim().replace(/^(deny|denied|reject|no)\b[\s:,-]*/i, ''), remainder].join('\n').trim() };
    if (line === 'edit') {
        const text = options.local ? remainder : remainder.trim();
        return text.trim() ? { decision: 'edit', text } : { decision: 'unrecognized' };
    }
    return { decision: 'unrecognized' };
}
import type { PrRow } from '../db/db.ts';
import type { Config } from '../config.ts';
import { applyRules } from './rules.ts';
import type { Rule } from './rules.ts';
const MAX_DENIAL_REASON = 500;
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/**
 * A denial reason goes to the requester, so it must never carry the draft that was denied. A mail
 * client whose quoted original was not stripped would otherwise send the draft back as the "reason".
 * Long reasons or reasons repeating any sentence of the draft are withheld; protection rules mask the rest.
 */
export function shareableDenialReason(reason: string | undefined, draft: string | null, rules: readonly Rule[]): {
    reason: string | undefined;
    withheld: boolean;
} {
    if (!reason?.trim())
        return { reason: undefined, withheld: false };
    const said = normalize(reason);
    const quotesDraft = (draft ?? '').split(/(?<=[.!?])\s+|\n/).map(normalize).some(sentence => sentence.length >= 24 && said.includes(sentence));
    if (reason.length > MAX_DENIAL_REASON || quotesDraft)
        return { reason: undefined, withheld: true };
    return { reason: applyRules(reason.trim(), rules).text, withheld: false };
}
import { approvalEmailHtml } from './email-html.ts';
import type { Removal } from '../types.ts';
export function buildApprovalEmail(p: PrRow, config: Config): {
    subject: string;
    bodyText: string;
    bodyHtml: string;
} {
    const removals = (JSON.parse(p.removals ?? '[]') as Removal[]).map(r => `${r.placeholder} ×${r.count}`).join(', ') || 'none';
    const ids = JSON.parse(p.matched_source_ids ?? '[]') as string[];
    const subject = `[Nanobite ${p.id}] Approve answer to ${p.requester_identity}? (${p.topic})`;
    return { subject, bodyHtml: approvalEmailHtml(p, config, subject), bodyText: `A coding agent at ${p.requester_identity} (for ${p.on_behalf_of ?? 'an engineer'}) asked your agent:\n\n  "${p.question}"\n\nDRAFT ANSWER — sent word for word if you approve:\n----------------------------------------\n${p.draft_answer}\n----------------------------------------\nAlready removed by rules: ${removals}\nModel flagged for your judgment: ${(JSON.parse(p.draft_flagged ?? '[]') as string[]).map(s => JSON.stringify(s)).join(', ') || 'none'}\nSources: ${new Set(ids.map(id => id.split(':')[0])).size} session, ${ids.length} excerpts. Nothing else is sent.\n\nReply with ONE of:\n  approve\n  approve always      auto-send future answers on this topic to this requester; you get a copy each time\n  deny <reason>\n  edit                then paste the full replacement text below it\n\nThe buttons include an optional Decision reason section. For Edit, only the Answer to share section is sent. Approval and edit reasons stay in the review record; denial reasons go to the requester.\n\nRequest: ${config.DASHBOARD_PUBLIC_URL}/pr/${p.id}` };
}
export function buildClarificationEmail(p: PrRow) { return { subject: `[Nanobite ${p.id}] Clarify your decision`, bodyText: 'I could not read that reply. Reply with exactly one of: approve, approve always, deny <reason>, edit. You can add a Decision reason (optional): section. For edit, use that section followed by Answer to share: and the full replacement, or reply in the original edit-then-answer format.' }; }
import type { AutoRule } from '../approval/rules-store.ts';
export function buildNotificationEmail(p: PrRow, rule: AutoRule) { return { subject: `[Nanobite ${p.id}] Auto-sent under your rule (${p.topic}) — reply "revoke" to stop`, bodyText: `Full capsule sent under rule ${rule.id}\nRequester: ${rule.requester_identity}\nTopic: ${rule.topic}\n\n${p.approved_text}\n\nReply revoke to delete this rule. Future requests will require approval.` }; }
export function buildAckEmail(p: PrRow) { return { subject: `[Nanobite ${p.id}] Rule revoked`, bodyText: 'The rule was revoked. Future requests for this requester and topic will require human approval.' }; }
