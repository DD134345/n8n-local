#!/usr/bin/env node
// Build ready-to-import n8n workflows for one or more campuses.
//
//   node scripts/build-workflows.mjs [--config infra/campuses.json] [--out infra/import] [--allow-missing]
//
// Reads the canonical (VI) exports in workflows/*.json and, for every campus in the config, writes
// infra/import/<CODE>/*.json with:
//   - the campus Sheet ID and credential IDs filled in (YOUR_*_CREDENTIAL_ID, [YOUR_GOOGLE_SHEET_ID])
//   - a fixed workflow id per campus+workflow, and errorWorkflow pointing at that campus's workflow H
//   - names prefixed "[CODE] " and webhook paths prefixed "<code>-", so campuses never collide
//   - $env.ZALO_BOT_TOKEN renamed to the campus's own variable (e.g. ZALO_BOT_TOKEN_TL3)
// Any placeholder left unfilled stops the build (pass --allow-missing to write anyway).
// Then, where Docker runs:  docker compose exec n8n n8n import:workflow --separate --input=/import/<CODE>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const configPath = resolve(root, opt('--config', 'infra/campuses.json'));
const outDir = resolve(root, opt('--out', 'infra/import'));
const allowMissing = args.includes('--allow-missing');
const srcDir = join(root, 'workflows');

let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch (e) {
  console.error(`Cannot read ${configPath}: ${e.message}\nCopy infra/campuses.example.json to infra/campuses.json and fill it in.`);
  process.exit(1);
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const hash = (s) => createHash('sha256').update(s).digest();
const wfId = (s) => [...hash(s).subarray(0, 16)].map((b) => B62[b % 62]).join('');
const uuid = (s) => {
  const h = hash(s).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const sources = readdirSync(srcDir)
  .filter((f) => /^workflow-.+\.json$/.test(f))
  .map((f) => ({ file: f, key: f.replace(/^workflow-/, '').replace(/\.json$/, ''), json: readFileSync(join(srcDir, f), 'utf8') }));
const isErrorWf = (key) => key.startsWith('h-');

const problems = [];
for (const campus of config.campuses || []) {
  const code = String(campus.code || '').trim();
  if (!/^[A-Za-z0-9]{2,10}$/.test(code)) { problems.push(`campus code "${code}" must be 2-10 letters/digits`); continue; }
  if (!campus.sheetId) problems.push(`${code}: sheetId is empty`);
  const creds = { ...(config.credentials || {}), ...(campus.credentials || {}) };
  const tokenEnv = campus.zaloTokenEnv || `ZALO_BOT_TOKEN_${code.toUpperCase()}`;
  const wanted = campus.workflows; // optional list of key prefixes, e.g. ["c", "d", "z"]
  const picked = sources.filter((s) => !wanted || isErrorWf(s.key) || wanted.some((w) => s.key.startsWith(w)));
  const errorSrc = picked.find((s) => isErrorWf(s.key));
  const errorId = errorSrc ? wfId(`${code}:${errorSrc.key}`) : '';
  const dir = join(outDir, code);
  mkdirSync(dir, { recursive: true });
  const names = [];

  for (const src of picked) {
    const missing = new Set();
    const fill = (str) => str
      .replace(/\[?YOUR_GOOGLE_SHEET_ID\]?/g, () => campus.sheetId || (missing.add('sheetId'), '[YOUR_GOOGLE_SHEET_ID]'))
      .replace(/\[?YOUR_ERROR_WORKFLOW_ID\]?/g, () => errorId || (missing.add('error workflow H'), '[YOUR_ERROR_WORKFLOW_ID]'))
      .replace(/\[?YOUR_([A-Z0-9_]+?)_CREDENTIAL_ID\]?/g, (m, k) => creds[k] || (missing.add(`credentials.${k}`), m))
      .replace(/\$env\.ZALO_BOT_TOKEN\b(?!_)/g, `$env.${tokenEnv}`);
    const walk = (v) => {
      if (typeof v === 'string') return fill(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    const wf = walk(JSON.parse(src.json));
    wf.id = wfId(`${code}:${src.key}`);
    wf.name = `[${code}] ${wf.name}`;
    wf.active = false;
    delete wf.pinData;
    wf.settings = { ...(wf.settings || {}) };
    if (isErrorWf(src.key)) delete wf.settings.errorWorkflow; else if (errorId) wf.settings.errorWorkflow = errorId;
    for (const node of wf.nodes || []) {
      if (node.webhookId) node.webhookId = uuid(`${code}:${src.key}:${node.name}`);
      if (node.type === 'n8n-nodes-base.webhook' && node.parameters?.path) {
        node.parameters.path = `${code.toLowerCase()}-${node.parameters.path}`;
      }
    }
    const left = JSON.stringify(wf).match(/YOUR_[A-Z0-9_]+/g);
    if (left && !missing.size) left.forEach((m) => missing.add(m)); // placeholders this script doesn't know
    if (missing.size) problems.push(`${code}/${src.file}: ${[...missing].join(', ')}`);
    writeFileSync(join(dir, src.file), JSON.stringify(wf, null, 2) + '\n');
    if (!isErrorWf(src.key)) names.push(wf.name);
  }
  console.log(`\n${code}: ${picked.length} workflows -> ${dir}`);
  console.log(`  Config tab EXPECTED_WORKFLOWS = ${names.join(', ')}`);
  console.log(`  Zalo token variable (infra/zalo.env): ${tokenEnv}`);
  console.log(`  Import: docker compose exec n8n n8n import:workflow --separate --input=/import/${code}`);
}

if (problems.length) {
  console.error(`\n${allowMissing ? 'WARNING' : 'ERROR'}: unfilled values:\n  - ${problems.join('\n  - ')}`);
  if (!allowMissing) process.exit(2);
}
