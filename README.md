# firebase-rc-mcp

Edit Firebase Remote Config from Claude Code. Works with any project your Google account can access.

Reads and writes parameters that live inside Remote Config **parameter groups**, as well as top-level
parameters. Pull a key to a local file, edit it (by hand or by asking Claude), see a diff, publish. Every
publish is gated by a fresh diff token, so you can't push without seeing what's about to change first.
Versions in Firebase history are attributed to your Google account, not a service account.

## Parameter-group support

Remote Config parameters can live at the top level or inside parameter groups. This MCP resolves both: a
project whose config lives inside groups lists and edits normally, where a top-level-only reader would report
`0 keys`. Because Remote Config parameter names are unique across the whole template, grouped keys are
addressed by their plain key name — no group prefix — so `rc_pull` / `rc_diff` / `rc_push` take the key as-is.

## Install

```bash
claude mcp add firebase_rc -- npx -y firebase-rc-mcp
```

That registers the server with Claude Code. The npm package is `firebase-rc-mcp`; the tool namespace inside
Claude is `firebase_rc` (so tools appear as `mcp__firebase_rc__*`) — pick any name you like for the first
argument. Or add it manually to your MCP config as a stdio server:

```jsonc
// e.g. in ~/.claude.json under "mcpServers"
{
  "firebase_rc": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "firebase-rc-mcp"],
    "env": {}
  }
}
```

The first time you ask Claude to do anything Remote-Config-related, it'll open your browser to a Google
sign-in page. Pick the account that has access to your Firebase project. This MCP keeps its own credentials
(namespace `firebase-rc-mcp`) — a self-contained install with no external dependencies on other MCP servers.
If you've run `firebase login` with the Firebase CLI, that credential is auto-detected and you can skip
sign-in.

### Develop from source

```bash
git clone https://github.com/waleed2812/firebase-rc-mcp.git
cd firebase-rc-mcp
npm install
```

Then register the local entry file instead of the published package:

```jsonc
{
  "firebase_rc": {
    "type": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/firebase-rc-mcp/src/cli.js"],
    "env": {}
  }
}
```

## Tools

| | |
|---|---|
| `rc_login` | Opens the browser for Google sign-in. Auto-called on first use. |
| `rc_auth_status` | Signed in? Which account? |
| `rc_list_projects` | Projects this account can see. |
| `rc_list_keys` | Keys in a project (type, size, **group**). Includes grouped params. |
| `rc_pull` | Download a key's live value to a local file. Works for grouped keys. |
| `rc_diff` | Compare local file vs live. Returns a single-use diff token. |
| `rc_push` | Publish (requires fresh diff token). Writes back into the right group. |
| `rc_list_versions` | Recent versions: who, when, from where. |
| `rc_rollback` | Restore a previous version (requires `confirmPhrase: "rollback"`). |
| `rc_workspace_info` | Where local files live on this machine. |

## Safety

- `rc_push` won't run without a token from a recent `rc_diff`. Tokens are bound to `{project, key, sha256(value)}`, expire in 10 minutes, single-use.
- If live Firebase changed between your `rc_diff` and `rc_push`, the push is refused.
- Every push runs Firebase's `validate_only=true` first.
- Every pull and pre-push writes a timestamped backup under `<workspace>/<project>/.backups/`.
- No allowlist. Access is gated by Google IAM — you can only edit projects where your account has Remote Config Admin (or higher).

## Auth

Standard Google OAuth for installed apps: browser sign-in redirects to a one-off local port, refresh token
stored in this MCP's own namespace (mode 0600), short-lived access tokens minted on demand:

- macOS / Linux: `~/.config/firebase-rc-mcp/auth.json` (or `$XDG_CONFIG_HOME/firebase-rc-mcp/auth.json`)
- Windows: `%LOCALAPPDATA%\firebase-rc-mcp\auth.json`
- Override with `FIREBASE_RC_MCP_AUTH_FILE`.

Pulled RC files live under `~/.firebase-rc-mcp/<project>/` (override with `FIREBASE_RC_MCP_WORKSPACE`).

If you've already done `firebase login` with the `firebase` CLI, that token is auto-detected and you skip
sign-in.

No service-account JSON. No GCP console setup. No secrets shipped in this package.

## Terminal commands (rarely needed)

```
npx firebase-rc-mcp login     Sign in with Google (also triggered automatically).
npx firebase-rc-mcp logout    Remove stored credentials.
npx firebase-rc-mcp status    Show current account + projects.
```

(From a source checkout, use `node src/cli.js <command>` instead.)

## Requirements

- Node.js ≥ 18.
- Your Google account needs `roles/cloudconfig.admin` on the project you want to edit. Without it, reads work and writes return a clean 403.

## License

MIT — see [LICENSE](./LICENSE).
