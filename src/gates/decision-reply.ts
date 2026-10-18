import type { Decision } from '../types.ts';

export const REASON_LABEL = 'Decision reason (optional):';
export const ANSWER_LABEL = 'Answer to share:';
export interface ParsedDecision {
    decision: Decision;
    text?: string;
    reason?: string;
}

/** The editable body opened by an approval email's buttons. Empty fields contain no placeholder text. */
export function decisionReplyBody(decision: 'approve' | 'deny' | 'edit', answer = ''): string {
    return `${decision}\n\n${REASON_LABEL}\n\n${decision === 'edit' ? `${ANSWER_LABEL}\n${answer}` : ''}`;
}

/** null means an old-style reply; an incomplete or malformed template must never fall back to approval. */
export function parseDecisionFields(command: string, remainder: string): ParsedDecision | null {
    const lines = remainder.replace(/\r\n/g, '\n').trim().split('\n');
    const header = lines[0]?.match(/^Decision reason(?: \(optional\))?:[ \t]*(.*)$/i);
    if (!header)
        return null;
    const decision: Decision | undefined = ({ approve: 'approve', 'approve always': 'approve_always', deny: 'deny', edit: 'edit' } as Record<string, Decision>)[command];
    if (!decision)
        return { decision: 'unrecognized' };
    const answerAt = lines.findIndex((line, index) => index > 0 && /^Answer to share:[ \t]*(.*)$/i.test(line));
    if (decision !== 'edit' && answerAt >= 0 || decision === 'edit' && answerAt < 0)
        return { decision: 'unrecognized' };
    const reason = [header[1], ...lines.slice(1, answerAt < 0 ? undefined : answerAt)].join('\n').trim();
    const result: ParsedDecision = { decision, ...(reason ? { reason } : {}) };
    if (decision === 'edit') {
        const first = lines[answerAt].match(/^Answer to share:[ \t]*(.*)$/i)![1];
        const text = [first, ...lines.slice(answerAt + 1)].join('\n').trim();
        if (!text)
            return { decision: 'unrecognized' };
        result.text = text;
    }
    return result;
}
