import { randomBytes } from 'node:crypto';
export function newPrId(): string {
    const t = Date.now().toString(36);
    const r = randomBytes(3).toString('hex').slice(0, 4);
    return `cpr_${t}${r}`;
}
export function nowIso(): string { return new Date().toISOString(); }
