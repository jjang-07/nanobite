import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentSetup } from '../scripts/connect-agent.ts';
const env = { root: '/repo', port: 8788, token: 'a'.repeat(48) };
test('Claude Code over HTTP registers one local-scope server with the bearer header', () => {
    const s = agentSetup('claude', 'http', env);
    assert.deepEqual(s.commands[0], ['claude', 'mcp', 'remove', 'contextpr', '-s', 'local']);
    assert.deepEqual(s.commands[1], ['claude', 'mcp', 'add', '--transport', 'http', '-s', 'local', 'contextpr', 'http://127.0.0.1:8788/mcp', '--header', `Authorization: Bearer ${'a'.repeat(48)}`]);
});
test('Claude Code over stdio launches the server with absolute paths and the shared .env', () => {
    const s = agentSetup('claude', 'stdio', env);
    assert.deepEqual(s.commands[1], ['claude', 'mcp', 'add', '-s', 'local', 'contextpr', '--', 'node', '--env-file-if-exists=/repo/.env', '/repo/src/mcp/server.ts']);
});
test('Codex config never embeds the token and uses absolute paths for stdio', () => {
    const http = agentSetup('codex', 'http', env);
    assert.match(http.toml!, /url = "http:\/\/127\.0\.0\.1:8788\/mcp"/);
    assert.match(http.toml!, /bearer_token_env_var = "CONTEXTPR_MCP_TOKEN"/);
    assert.doesNotMatch(http.toml!, /a{48}/);
    assert.match(agentSetup('codex', 'stdio', env).toml!, /args = \["--env-file-if-exists=\/repo\/\.env", "\/repo\/src\/mcp\/server\.ts"\]/);
});
test('HTTP without a token is refused with a fix', () => {
    assert.throws(() => agentSetup('claude', 'http', { ...env, token: '' }), /MCP_HTTP_TOKEN/);
});
