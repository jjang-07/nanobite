// Connect a coding agent to Nanobite, in either client and over either transport.
//   npm run connect -- claude [http|stdio]   registers the server with Claude Code for this folder
//   npm run connect -- codex  [http|stdio]   prints the block to paste into ~/.codex/config.toml
//   npm run connect -- desktop               adds Nanobite to the Claude Desktop app (local stdio; restart the app)
//   npm run connect -- remove                removes the Claude Code registration for this folder
// HTTP talks to the running worker (npm start) at MCP_HTTP_PORT; stdio launches its own MCP process.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export type Client = 'claude' | 'codex';
export type Transport = 'http' | 'stdio';
export interface SetupEnv {
    root: string;
    port: number;
    token: string;
}
export interface Setup {
    /** Commands to run, in order. The first may fail harmlessly (removing an absent entry). */
    commands: string[][];
    toml?: string;
    notes: string[];
}
const NAME = 'nanobite';
export interface DesktopEntry {
    command: string;
    args: string[];
    env: Record<string, string>;
}
/**
 * Claude Desktop launches local MCP servers itself, with no shell PATH and no working folder, so the
 * entry uses an absolute Node path and an absolute database path. (A Desktop "connector" is a remote
 * server reached from Anthropic's cloud and needs a public HTTPS address, which this demo does not have.)
 */
export function desktopEntry(env: SetupEnv & { nodePath: string }): DesktopEntry {
    return { command: env.nodePath, args: [`--env-file-if-exists=${env.root}/.env`, `${env.root}/src/mcp/server.ts`], env: { CONTEXTPR_DB: `${env.root}/data/contextpr.db` } };
}
/** Adds or replaces only the nanobite server; every other setting and server is kept. */
export function mergeDesktopConfig(config: Record<string, any>, entry: DesktopEntry): Record<string, any> {
    return { ...config, mcpServers: { ...(config.mcpServers ?? {}), [NAME]: entry } };
}
export function agentSetup(client: Client, transport: Transport, env: SetupEnv): Setup {
    const url = `http://127.0.0.1:${env.port}/mcp`, envFile = `${env.root}/.env`, server = `${env.root}/src/mcp/server.ts`;
    if (transport === 'http' && env.token.length < 16)
        throw new Error('MCP_HTTP_TOKEN is not set in .env. Generate one with `openssl rand -hex 24`, or use the stdio transport.');
    if (client === 'claude') {
        const add = transport === 'http'
            ? ['claude', 'mcp', 'add', '--transport', 'http', '-s', 'local', NAME, url, '--header', `Authorization: Bearer ${env.token}`]
            : ['claude', 'mcp', 'add', '-s', 'local', NAME, '--', 'node', `--env-file-if-exists=${envFile}`, server];
        return { commands: [['claude', 'mcp', 'remove', NAME, '-s', 'local'], add], notes: [`Start Claude Code in ${env.root} (or a subfolder) to use it.`, transport === 'http' ? 'Keep `npm start` running; the tools are served by the worker.' : 'Keep `npm start` running; the worker drafts and sends the email.'] };
    }
    const toml = transport === 'http'
        ? `[mcp_servers.${NAME}]\nurl = "${url}"\nbearer_token_env_var = "CONTEXTPR_MCP_TOKEN"\n`
        : `[mcp_servers.${NAME}]\ncommand = "node"\nargs = ["--env-file-if-exists=${envFile}", "${server}"]\ncwd = "${env.root}"\nstartup_timeout_sec = 20\ntool_timeout_sec = 60\n`;
    return { commands: [], toml, notes: ['Paste this into ~/.codex/config.toml, replacing any earlier [mcp_servers.nanobite] block.', ...(transport === 'http' ? ['Before starting Codex: export CONTEXTPR_MCP_TOKEN=<MCP_HTTP_TOKEN from .env>'] : []), 'Keep `npm start` running.'] };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [first = 'claude', second = 'http'] = process.argv.slice(2);
    const root = resolve(new URL('..', import.meta.url).pathname);
    const env = { root, port: Number(process.env.MCP_HTTP_PORT ?? 8788), token: process.env.MCP_HTTP_TOKEN?.trim() ?? '' };
    if (first === 'desktop') {
        const path = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
        if (existsSync(path))
            copyFileSync(path, `${path}.before-nanobite`);
        writeFileSync(path, JSON.stringify(mergeDesktopConfig(current, desktopEntry({ ...env, nodePath: process.execPath })), null, 2) + '\n', { mode: 0o600 });
        console.log(`Claude Desktop: ${NAME} added to ${path}${existsSync(`${path}.before-nanobite`) ? ' (previous config saved as .before-nanobite)' : ''}.`);
        console.log('Quit and reopen Claude Desktop to load it. Keep `npm start` running; the worker drafts and sends the email.');
        process.exit(0);
    }
    if (first === 'remove') {
        const r = spawnSync('claude', ['mcp', 'remove', NAME, '-s', 'local'], { cwd: root, encoding: 'utf8' });
        console.log(r.status === 0 ? 'Removed the Claude Code registration for this folder.' : 'Nothing to remove.');
        process.exit(0);
    }
    if (!['claude', 'codex'].includes(first) || !['http', 'stdio'].includes(second)) {
        console.error('Usage: npm run connect -- <claude|codex> [http|stdio]   or   npm run connect -- remove');
        process.exit(2);
    }
    const setup = agentSetup(first as Client, second as Transport, env);
    for (const [i, cmd] of setup.commands.entries()) {
        const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8' });
        if (r.error) {
            console.error(`Could not run ${cmd[0]}: ${r.error.message}`);
            process.exit(1);
        }
        if (r.status !== 0 && i > 0) {
            console.error((r.stderr || r.stdout).replace(/Bearer [0-9a-f]+/g, 'Bearer [token]'));
            process.exit(r.status ?? 1);
        }
    }
    if (setup.commands.length)
        console.log(`Claude Code: ${NAME} registered over ${second} for ${root}.`);
    if (setup.toml)
        console.log(`\n${setup.toml}`);
    for (const note of setup.notes)
        console.log(note);
}
