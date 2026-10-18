// Read-only checks that everything the live demo depends on is ready. Prints a fix for each problem.
//   npm run preflight
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config.ts';
import { bareAddress } from '../src/primitive/client.ts';
/** A new Primitive account sends only to Primitive addresses, its owner, and addresses that wrote to it first. */
export function approverReachable(i: { approver: string; responder: string; accountEmail: string; inboundSenders: string[] }): { ok: boolean; fix?: string } {
    const a = bareAddress(i.approver).toLowerCase();
    if (a.endsWith('.primitive.email') || a === i.accountEmail.toLowerCase() || i.inboundSenders.some(s => bareAddress(s).toLowerCase() === a))
        return { ok: true };
    return { ok: false, fix: `Have ${a} send any email to ${i.responder} once, then rerun preflight. Until then Primitive refuses approval emails to that address.` };
}
async function main() {
    let failed = 0;
    const ok = (label: string) => console.log(`  ok    ${label}`);
    const bad = (label: string, fix: string) => { failed++; console.log(`  FIX   ${label}\n        ${fix}`); };
    const info = (label: string) => console.log(`  note  ${label}`);
    let config;
    try {
        config = loadConfig();
        ok(`.env loads (mail=${config.MAIL_PROVIDER}, model=${config.MODEL_PROVIDER})`);
    }
    catch (e) {
        bad('.env', e instanceof Error ? e.message : String(e));
        process.exit(1);
    }
    if (config.MODEL_PROVIDER === 'anthropic') {
        try {
            const m = await new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }).models.retrieve(config.ANTHROPIC_MODEL);
            ok(`Claude key works, ${m.id} available`);
        }
        catch (e) {
            bad('Claude', `Key or model rejected (${e instanceof Anthropic.APIError ? e.status : 'network'}). Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL.`);
        }
    }
    if (config.MAIL_PROVIDER === 'primitive') {
        const H = { Authorization: `Bearer ${config.PRIMITIVE_API_KEY}` };
        try {
            const account = (await (await fetch('https://api.primitive.dev/v1/account', { headers: H, signal: AbortSignal.timeout(10000) })).json()).data;
            if (!account?.email)
                throw new Error('no account');
            ok(`Primitive key works (${account.managed_inbox_address})`);
            const senders: string[] = [];
            const search = await (await fetch('https://api.primitive.dev/v1/emails?' + new URLSearchParams({ search: config.APPROVER_EMAIL, limit: '20' }), { headers: H, signal: AbortSignal.timeout(10000) })).json();
            for (const e of search.data ?? [])
                senders.push(String(e.sender ?? ''));
            const reach = approverReachable({ approver: config.APPROVER_EMAIL, responder: config.RESPONDER_IDENTITY, accountEmail: String(account.email), inboundSenders: senders });
            reach.ok ? ok(`Approver ${config.APPROVER_EMAIL} can receive approval emails`) : bad(`Approver ${config.APPROVER_EMAIL} cannot be emailed yet`, reach.fix!);
        }
        catch {
            bad('Primitive', 'Key rejected or API unreachable. Check PRIMITIVE_API_KEY.');
        }
    }
    else
        info('Mail is local: approvals happen in the dashboard, not by email (Primitive track needs MAIL_PROVIDER=primitive)');
    if (existsSync(config.CONTEXTPR_DB)) {
        const db = new DatabaseSync(config.CONTEXTPR_DB, { readOnly: true });
        const sources = Number(db.prepare('SELECT count(*) n FROM sources WHERE owner_identity=?').get(config.RESPONDER_IDENTITY)?.n ?? 0);
        const rules = Number(db.prepare('SELECT count(*) n FROM denylist WHERE responder_identity=?').get(config.RESPONDER_IDENTITY)?.n ?? 0);
        const prs = Number(db.prepare('SELECT count(*) n FROM context_prs').get()?.n ?? 0);
        db.close();
        sources && rules ? ok(`Demo data seeded (${sources} transcript turns, ${rules} rules, ${prs} existing requests)`) : bad('Demo data', 'Run: npm run reset && npm run seed');
        if (prs)
            info('Existing requests will show in the Inbox. For a clean demo: stop the worker, npm run reset && npm run seed');
    }
    else
        bad('Demo database missing', 'Run: npm run seed');
    config.MCP_HTTP_TOKEN ? ok(`MCP over HTTP configured on port ${config.MCP_HTTP_PORT}`) : info('MCP over HTTP disabled (MCP_HTTP_TOKEN empty); agents must use stdio');
    const charge = readFileSync(new URL('../demo/yunha-app/charge.ts', import.meta.url), 'utf8');
    charge.includes('preserveIdempotencyKey') ? bad('Demo test is already green', 'Restore the bug: git checkout demo/yunha-app/charge.ts') : ok('Demo test starts red (charge.ts has the bug)');
    const worker = await fetch(`http://127.0.0.1:${config.DASHBOARD_PORT}/`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false);
    worker ? ok(`Worker running, Inbox at http://127.0.0.1:${config.DASHBOARD_PORT}`) : info('Worker not running yet: npm start');
    const acme = await fetch('http://127.0.0.1:8791/v1/charges', { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false);
    acme ? ok('Mock Acme API running on :8791') : info('Mock Acme API not running yet: npm run demo:acme');
    const claude = spawnSync('claude', ['mcp', 'get', 'nanobite'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    claude.status === 0 ? ok('Claude Code has nanobite registered for this folder') : info('Claude Code not connected here: npm run connect -- claude');
    console.log(failed ? `\n${failed} problem(s) to fix before the demo.` : '\nReady for the demo.');
    process.exit(failed ? 1 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
    await main();
