import type { Config } from '../config.ts';
import type { ProtectionRule, ProtectionInput } from '../gates/protection-store.ts';
import type { AutoRule } from '../approval/rules-store.ts';
import { renderPage, escapeHtml as esc } from './render.ts';
import { sharingGatesHtml } from './gates.ts';
export interface RulesPageOptions {
    config: Config;
    csrfToken: string;
    notice?: string;
    error?: string;
    form?: Record<string, string>;
    editingId?: number;
    preview?: { input: string; text: string; count: number };
}
/** Plain names for the seeded patterns, so the page never asks a reader to parse a regular expression. */
const BUILT_IN_NAMES: Record<string, string> = {
    '\\bACME-\\d{3,6}\\b': 'Ticket IDs, like ACME-1234',
    '\\b(sk|pk)_(live|test)_[A-Za-z0-9]{8,}\\b': 'Payment API keys',
    '\\bprim_[A-Za-z0-9_]{8,}\\b': 'Primitive API keys',
    '(api[_-]?key|secret|token)\\s*[:=]\\s*\\S+': 'Values set after api_key, secret or token',
    '[\\w.+-]+@[\\w-]+\\.[\\w.-]+': 'Email addresses',
};
const NOTICES: Record<string, string> = { created: 'Rule added. New drafts will use it.', saved: 'Rule saved. New drafts will use it.', toggled: 'Rule updated.', granted: 'Automatic approval added.', revoked: 'Automatic approval revoked. Matching answers wait for your review again.' };
const ruleName = (r: ProtectionRule) => r.kind === 'regex' ? esc(BUILT_IN_NAMES[r.pattern] ?? 'Built-in pattern') : `“${esc(r.pattern)}”`;
export function renderRules(protection: ProtectionRule[], approvals: AutoRule[], options: RulesPageOptions): string {
    const token = `<input type="hidden" name="csrf" value="${esc(options.csrfToken)}">`;
    const values = options.form ?? {};
    // Messages appear beside the form they belong to, not only at the top of a long page.
    const area = options.editingId ? 'edit' : 'sample' in values ? 'preview' : 'requester' in values ? 'approval' : 'protection';
    const message = (where: string) => options.error && area === where ? `<p class="settings-notice" role="alert">${esc(options.error)}</p>`
        : !options.error && options.notice && Object.hasOwn(NOTICES, options.notice) && where === (['granted', 'revoked'].includes(options.notice) ? 'approval' : 'protection') ? `<p class="settings-notice" role="status">${NOTICES[options.notice]}</p>` : '';
    const fields = (prefix: string, value: Partial<Omit<ProtectionInput, 'note'>> & { note?: string | null }, submit: string, noteOpen: boolean) => `<div><label for="${prefix}-pattern">Protected text</label><input id="${prefix}-pattern" name="pattern" required maxlength="500" value="${esc(value.pattern ?? '')}" placeholder="A customer name, codename or phrase"></div><div><label for="${prefix}-kind">Action</label><select id="${prefix}-kind" name="kind"><option value="literal"${value.kind !== 'sentence' ? ' selected' : ''}>Replace the text</option><option value="sentence"${value.kind === 'sentence' ? ' selected' : ''}>Remove the sentence</option></select></div><div><label for="${prefix}-placeholder">Shown as</label><input id="${prefix}-placeholder" name="placeholder" required maxlength="62" value="${esc(value.placeholder ?? '[redacted]')}"></div><div class="rule-submit">${submit}</div><p class="rule-help full">Matching ignores capitalization. Labels go in brackets, like [customer].</p><details class="full rule-note"${noteOpen ? ' open' : ''}><summary>${prefix === 'new-rule' ? 'Add a note' : 'Note'}</summary><label for="${prefix}-note">Why this is protected <span class="optional">(optional)</span></label><input id="${prefix}-note" name="note" maxlength="200" value="${esc(value.note ?? '')}"></details>`;
    const line = (r: ProtectionRule) => {
        const editing = options.editingId === r.id && r.is_custom;
        const effect = r.kind === 'sentence' ? 'Whole sentence removed' : `Shown as <strong>${esc(r.placeholder)}</strong>`;
        const edit = editing ? `<form class="rule-form" aria-label="Edit protection rule" method="post" action="/rules/${r.id}/update#rule-${r.id}">${token}${message('edit')}${fields(`edit-${r.id}`, options.form ?? r, `<button class="primary" type="submit">Save</button><a class="text-link" href="/rules#rule-${r.id}">Cancel</a>`, Boolean(options.form?.note ?? r.note))}</form>` : '';
        return `<li class="rule-line${r.enabled ? '' : ' is-off'}" id="rule-${r.id}"><div class="rule-what"><span class="rule-name">${ruleName(r)}</span>${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</div><div class="rule-effect">${r.enabled ? '' : '<span class="rule-off">Off</span> · '}${effect}</div><div class="rule-actions">${r.is_custom && !editing ? `<a class="text-link" href="/rules?edit=${r.id}#rule-${r.id}" aria-label="Edit ${esc(r.pattern)}">Edit</a>` : ''}<form method="post" action="/rules/${r.id}/toggle">${token}<input type="hidden" name="enabled" value="${r.enabled ? '0' : '1'}"><button class="quiet" type="submit" aria-label="${r.enabled ? 'Turn off' : 'Turn on'} ${esc(r.kind === 'regex' ? BUILT_IN_NAMES[r.pattern] ?? 'built-in pattern' : r.pattern)}">${r.enabled ? 'Turn off' : 'Turn on'}</button></form></div>${edit}</li>`;
    };
    const custom = protection.filter(r => r.is_custom), builtIn = protection.filter(r => !r.is_custom).sort((a, b) => a.id - b.id);
    const addForm = `<form class="rule-form" aria-label="Add protection rule" method="post" action="/rules/create#protection-rules">${token}${fields('new-rule', options.editingId ? {} : values, '<button class="primary" type="submit">Add rule</button>', Boolean(!options.editingId && values.note))}</form>`;
    const protectionSection = `<section class="section" id="protection-rules"><h2>Protected information</h2><p class="note">Masked before the model reads any source, and checked again on every draft.</p>${message('protection')}${addForm}<h3 class="rule-group" id="custom-rules">Your rules <span class="count">${custom.length}</span></h3>${custom.length ? `<ul class="rule-list">${custom.map(line).join('')}</ul>` : '<p class="muted">None yet. Add a name or phrase above.</p>'}<h3 class="rule-group">Built in <span class="count">${builtIn.length}</span></h3><ul class="rule-list">${builtIn.map(line).join('')}</ul></section>`;
    const preview = `<section class="section" id="rule-preview"><h2>Try it</h2><p class="note">Runs your rules on sample text. Nothing is saved or sent.</p>${message('preview')}<form class="preview-form" aria-label="Preview protection rules" method="post" action="/rules/preview#rule-preview">${token}<div><label for="preview-text">Sample text</label><textarea id="preview-text" name="sample" rows="3" maxlength="8000" required placeholder="Northwind hit this in ACME-4411 last week.">${esc(options.preview?.input ?? values.sample ?? '')}</textarea></div><div class="rule-submit"><button type="submit">Preview</button></div></form>${options.preview ? `<div class="preview-result"><p class="note">${options.preview.count} ${options.preview.count === 1 ? 'match' : 'matches'} masked</p><pre class="exact" role="status">${esc(options.preview.text)}</pre></div>` : ''}</section>`;
    const grants = approvals.map(r => `<li class="rule-line"><div class="rule-what"><span class="rule-name">${esc(r.requester_identity)}</span><span class="note">${r.created_from_pr === 'manual' ? 'Added here' : 'From Approve always'}</span></div><div class="rule-effect">Topic <strong>${esc(r.topic)}</strong></div><div class="rule-actions"><form method="post" action="/rules/approval/${esc(r.id)}/revoke#approval-rules">${token}<button class="quiet" type="submit" aria-label="Revoke automatic approval for ${esc(r.requester_identity)} on ${esc(r.topic)}">Revoke</button></form></div></li>`).join('');
    const grantForm = `<details class="add-approval"${area === 'approval' && options.error ? ' open' : ''}><summary>Add an automatic approval</summary><form aria-label="Enable automatic approval" method="post" action="/rules/approval/create#approval-rules">${token}<div class="fields"><div><label for="grant-requester">Requester email</label><input id="grant-requester" name="requester" type="email" required maxlength="254" value="${esc(values.requester ?? '')}" placeholder="agent@example.com"></div><div><label for="grant-topic">Exact topic</label><input id="grant-topic" name="topic" required maxlength="120" pattern="[a-z0-9]+([-/][a-z0-9]+)*" value="${esc(values.topic ?? '')}" placeholder="acme-sdk/retries"></div></div><label class="check-field"><input type="checkbox" name="confirmed" value="yes" required>Send matching answers without my review.</label><div class="actions"><button type="submit">Add automatic approval</button></div></form></details>`;
    const approvalSection = `<section class="section" id="approval-rules"><h2>Automatic approvals <span class="count">${approvals.length}</span></h2><p class="note">Answers for these exact requester and topic pairs are sent without waiting for you. Protection still runs, and you get a copy with a revoke link.</p>${message('approval')}${grants ? `<ul class="rule-list">${grants}</ul>` : '<p class="muted">None. Every answer waits for your approval.</p>'}${grantForm}</section>`;
    const intro = `<div class="intro"><h1>Rules</h1><p class="muted">What gets masked before an answer is drafted, and which answers can skip your review.</p><p class="note">For ${esc(options.config.RESPONDER_IDENTITY)}. Changes apply to new drafts only.</p></div>`;
    const explainer = `<section class="section"><details class="gate-explanation" id="sharing-checks"><summary>How sharing works</summary>${sharingGatesHtml()}</details></section>`;
    return renderPage('Rules', `${intro}${protectionSection}${preview}${approvalSection}${explainer}`, options);
}
