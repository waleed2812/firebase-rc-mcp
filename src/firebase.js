import { getAccessToken } from './auth.js';
const API = 'https://firebaseremoteconfig.googleapis.com/v1';
const MGMT_API = 'https://firebase.googleapis.com/v1beta1';
async function authedFetch(project, path, init = {}) {
    const token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json; charset=UTF-8');
    headers.set('Accept-Encoding', 'gzip');
    const res = await fetch(`${API}/projects/${encodeURIComponent(project)}${path}`, { ...init, headers });
    return res;
}
export async function listFirebaseProjects() {
    const token = await getAccessToken();
    const out = [];
    let pageToken;
    do {
        const url = new URL(`${MGMT_API}/projects`);
        url.searchParams.set('pageSize', '100');
        if (pageToken)
            url.searchParams.set('pageToken', pageToken);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok)
            throw await asError(res, 'listFirebaseProjects');
        const j = (await res.json());
        if (j.results)
            out.push(...j.results);
        pageToken = j.nextPageToken;
    } while (pageToken);
    return out;
}
async function asError(res, action) {
    let body = '';
    try {
        body = await res.text();
    }
    catch (_) { /* ignore */ }
    let message = `${action} failed: HTTP ${res.status}`;
    try {
        const j = JSON.parse(body);
        if (j?.error?.message)
            message += ` — ${j.error.message}`;
    }
    catch (_) {
        if (body)
            message += ` — ${body.slice(0, 300)}`;
    }
    return new Error(message);
}
export async function getTemplate(project) {
    const res = await authedFetch(project, '/remoteConfig');
    if (!res.ok)
        throw await asError(res, 'getTemplate');
    const etag = res.headers.get('etag') || '';
    const template = (await res.json());
    return { template, etag };
}
export async function getTemplateAtVersion(project, versionNumber) {
    const res = await authedFetch(project, `/remoteConfig?versionNumber=${encodeURIComponent(String(versionNumber))}`);
    if (!res.ok)
        throw await asError(res, `getTemplateAtVersion(${versionNumber})`);
    const etag = res.headers.get('etag') || '';
    const template = (await res.json());
    return { template, etag };
}
export async function publishTemplate(project, template, options = { ifMatch: '*' }) {
    const qs = options.validateOnly ? '?validate_only=true' : '';
    const res = await authedFetch(project, `/remoteConfig${qs}`, {
        method: 'PUT',
        body: JSON.stringify(template),
        headers: { 'If-Match': options.ifMatch },
    });
    if (!res.ok)
        throw await asError(res, options.validateOnly ? 'validateTemplate' : 'publishTemplate');
    return (await res.json());
}
export async function listVersions(project, pageSize = 15) {
    const res = await authedFetch(project, `/remoteConfig:listVersions?pageSize=${pageSize}`);
    if (!res.ok)
        throw await asError(res, 'listVersions');
    const j = (await res.json());
    return j.versions ?? [];
}
// Firebase RC parameter names are unique across the whole template — a key can live at
// the top level OR inside exactly one parameter group, never both. So a key-only lookup
// that also searches parameterGroups is unambiguous, and callers need no group qualifier.
export function findParam(template, key) {
    const top = template.parameters?.[key];
    if (top)
        return { param: top, group: undefined };
    const groups = template.parameterGroups ?? {};
    for (const [groupName, g] of Object.entries(groups)) {
        const p = g?.parameters?.[key];
        if (p)
            return { param: p, group: groupName };
    }
    return null;
}
export function extractParamValue(template, key) {
    const found = findParam(template, key);
    if (!found)
        return { exists: false };
    const p = found.param;
    const raw = p.defaultValue?.value;
    let parsed = raw;
    if (p.valueType === 'JSON' && typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        }
        catch (_) { /* leave as string */ }
    }
    else if (p.valueType === 'NUMBER' && typeof raw === 'string') {
        parsed = Number(raw);
    }
    else if (p.valueType === 'BOOLEAN' && typeof raw === 'string') {
        parsed = raw === 'true';
    }
    return {
        exists: true,
        parsed,
        raw,
        valueType: p.valueType,
        description: p.description,
        conditionalValues: p.conditionalValues,
        group: found.group,
    };
}
export function setParamValue(template, key, parsed, valueType) {
    const found = findParam(template, key);
    if (!found)
        throw new Error(`Parameter "${key}" does not exist in the remote template.`);
    // `found.param` is a live reference into either template.parameters or a group's
    // parameters map, so mutating it below writes back into the template in place.
    const p = found.param;
    const vt = valueType || p.valueType || 'STRING';
    let serialized;
    if (vt === 'JSON')
        serialized = JSON.stringify(parsed);
    else if (vt === 'NUMBER')
        serialized = String(parsed);
    else if (vt === 'BOOLEAN')
        serialized = parsed ? 'true' : 'false';
    else
        serialized = String(parsed);
    p.defaultValue = { value: serialized };
}
