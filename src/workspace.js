import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// Hidden dotfolder in the user's home on every OS (home resolved per-OS by os.homedir()).
// Override with FIREBASE_RC_MCP_WORKSPACE.
export const DEFAULT_WORKSPACE = path.join(os.homedir(), '.firebase-rc-mcp');
export function workspaceRoot() {
    return process.env.FIREBASE_RC_MCP_WORKSPACE || DEFAULT_WORKSPACE;
}
export function projectDir(project) {
    return path.join(workspaceRoot(), project);
}
export function keyFilePath(project, key) {
    return path.join(projectDir(project), `${key}.json`);
}
export function metaFilePath(project, key) {
    return path.join(projectDir(project), `.${key}.meta.json`);
}
export function backupsDir(project) {
    return path.join(projectDir(project), '.backups');
}
function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
export function writeKeyFile(project, key, value, meta) {
    ensureDir(projectDir(project));
    const filePath = keyFilePath(project, key);
    const metaPath = metaFilePath(project, key);
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(filePath, text);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    return { filePath, metaPath };
}
export function readKeyFile(project, key) {
    const filePath = keyFilePath(project, key);
    const metaPath = metaFilePath(project, key);
    if (!fs.existsSync(filePath))
        return { exists: false, filePath, metaPath };
    const raw = fs.readFileSync(filePath, 'utf8');
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : undefined;
    let parsed = raw;
    if (meta?.valueType === 'JSON') {
        try {
            parsed = JSON.parse(raw);
        }
        catch (e) {
            throw new Error(`Local file ${filePath} is not valid JSON: ${e.message}`);
        }
    }
    else if (meta?.valueType === 'NUMBER') {
        parsed = Number(raw);
    }
    else if (meta?.valueType === 'BOOLEAN') {
        parsed = raw.trim() === 'true';
    }
    return { exists: true, raw, parsed, meta, filePath, metaPath };
}
export function writeBackup(project, key, value, label) {
    ensureDir(backupsDir(project));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(backupsDir(project), `${key}__${label}__${stamp}.json`);
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(file, text);
    return file;
}
export function listWorkspace() {
    const root = workspaceRoot();
    const out = [];
    if (!fs.existsSync(root))
        return { root, projects: [] };
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.'))
            continue;
        const dir = path.join(root, entry.name);
        const keys = [];
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.json') || f.startsWith('.'))
                continue;
            const key = f.slice(0, -5);
            const filePath = path.join(dir, f);
            const stat = fs.statSync(filePath);
            const metaPath = path.join(dir, `.${key}.meta.json`);
            let pulledAt;
            let pulledVersion;
            if (fs.existsSync(metaPath)) {
                try {
                    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    pulledAt = m.pulledAt;
                    pulledVersion = m.pulledTemplateVersion;
                }
                catch (_) { /* ignore */ }
            }
            keys.push({ key, sizeChars: stat.size, pulledAt, pulledVersion });
        }
        out.push({ project: entry.name, keys });
    }
    return { root, projects: out };
}
