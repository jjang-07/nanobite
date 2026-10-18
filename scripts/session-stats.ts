// Measures how much text real Claude Code sessions on this machine contain, for an honest
// "session versus capsule" comparison. Reads local transcripts only, sends nothing anywhere,
// and prints aggregate character counts, never content, file names, or project names.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseTranscript } from '../src/indexer/transcript.ts';
export interface SessionStats {
    sessions: number;
    characters: number[];
    median: number | null;
    p75: number | null;
}
const at = (sorted: number[], q: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : null;
export function sessionStats(root = join(homedir(), '.claude', 'projects')): SessionStats {
    const characters: number[] = [];
    if (existsSync(root))
        for (const dir of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()))
            for (const file of readdirSync(join(root, dir.name)).filter(f => f.endsWith('.jsonl'))) {
                const path = join(root, dir.name, file);
                if (statSync(path).size < 100)
                    continue;
                try {
                    // The same extraction the indexer uses: user, assistant and tool text, never thinking.
                    characters.push(parseTranscript(readFileSync(path, 'utf8')).reduce((n, t) => n + [...t.text].length, 0));
                }
                catch { /* unreadable transcript: skip */ }
            }
    characters.sort((a, b) => a - b);
    return { sessions: characters.length, characters, median: at(characters, 0.5), p75: at(characters, 0.75) };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const s = sessionStats(process.argv[2]);
    if (!s.sessions) {
        console.log('No Claude Code transcripts found. Pass a directory, or run this on a laptop that uses Claude Code.');
        process.exit(0);
    }
    const fmt = (n: number | null) => (n ?? 0).toLocaleString('en-US');
    console.log(`Claude Code sessions measured: ${s.sessions}`);
    console.log(`Median session: ${fmt(s.median)} characters of text (thinking excluded)`);
    console.log(`75th percentile: ${fmt(s.p75)} characters`);
    console.log('Compare with the capsule length in benchmark.md (about 500 to 660 characters).');
}
