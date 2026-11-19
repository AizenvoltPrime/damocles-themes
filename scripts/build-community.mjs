// Checks themes/<id>.json submissions against their pinned release files and Damocles' validator, and builds community.json's entries.
// node scripts/build-community.mjs check --base <sha> | publish, with --validator <theme-validate.js> --work <dir>
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const RELEASE_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
const THUMB_BASE = 'https://raw.githubusercontent.com/AizenvoltPrime/damocles-themes/main/thumbs/';
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const ENTRY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const SUBMISSION_KEYS = ['id', 'version', 'author', 'url', 'sha256', 'minAppVersion'];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { base: { type: 'string' }, validator: { type: 'string' }, work: { type: 'string' } },
});
const mode = positionals[0];
if ((mode !== 'check' && mode !== 'publish') || !values.validator || !values.work || (mode === 'check' && !values.base)) {
  console.error('usage: build-community.mjs check --base <sha> | publish, with --validator <theme-validate.js> --work <dir>');
  process.exit(2);
}
const validator = path.resolve(values.validator);
const work = path.resolve(values.work);
const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');
const releaseUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048 || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && url.port === '' && url.username === '' && url.password === '' && RELEASE_HOSTS.includes(url.hostname);
};

/** The submission at `file`, its shape checked; throws naming what is wrong. */
function readSubmission(file) {
  const name = path.basename(file);
  const submission = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof submission !== 'object' || submission === null || Array.isArray(submission)) throw new Error(`${name}: not a JSON object`);
  const unknown = Object.keys(submission).filter((key) => !SUBMISSION_KEYS.includes(key));
  if (unknown.length > 0) throw new Error(`${name}: unknown keys ${unknown.join(', ')}`);
  if (!ENTRY_ID.test(submission.id ?? '') || name !== `${submission.id}.json`) throw new Error(`${name}: id must be lowercase letters, digits and dashes, and equal the file name`);
  if (typeof submission.version !== 'string' || submission.version.trim() === '' || submission.version.length > 64) throw new Error(`${name}: version is missing`);
  if (typeof submission.author !== 'string' || submission.author.trim() === '' || submission.author.length > 200) throw new Error(`${name}: author is missing`);
  if (!releaseUrl(submission.url)) throw new Error(`${name}: url must be an https GitHub release download`);
  if (!SHA256.test(submission.sha256 ?? '')) throw new Error(`${name}: sha256 must be 64 lowercase hex characters`);
  if (!VERSION.test(submission.minAppVersion ?? '')) throw new Error(`${name}: minAppVersion must be x.y.z`);
  return submission;
}

/** The bytes at a release URL: every hop https on a GitHub release host, at most 100 MB counted as they stream. */
async function download(url) {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!releaseUrl(current)) throw new Error(`refused to fetch ${current}: not https on a GitHub release host`);
    const response = await fetch(current, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) throw new Error(`${current}: a redirect without a location, or too many`);
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) throw new Error(`${current}: HTTP ${response.status}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > MAX_ARCHIVE_BYTES) throw new Error(`${url}: larger than 100 MB`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

/** The validator's verdict on `file`, its thumbnails written to `thumbs`; exit 1 is a refusal with errors, anything else a failure. */
async function validate(file, thumbs) {
  mkdirSync(thumbs, { recursive: true });
  try {
    const { stdout } = await run(process.execPath, [validator, file, '--thumbs', thumbs], { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.code === 1 && typeof err.stdout === 'string') return JSON.parse(err.stdout);
    throw new Error(`the validator failed on ${path.basename(file)}: ${err.stderr || err.message}`);
  }
}

/** A submission's store entry; throws with every reason the validator gave. */
async function buildEntry(submission, thumbs) {
  const bytes = await download(submission.url);
  const sha256 = sha256Of(bytes);
  if (sha256 !== submission.sha256) throw new Error(`${submission.id}: the file's sha256 is ${sha256}, not the submitted ${submission.sha256}`);
  const file = path.join(work, 'files', `${submission.id}.damocles-theme`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  const verdict = await validate(file, thumbs);
  if (!verdict.ok) throw new Error(`${submission.id}: refused by the validator:\n  ${(verdict.errors ?? ['no reason given']).join('\n  ')}`);
  if (verdict.sha256 !== sha256 || verdict.bytes !== bytes.byteLength) throw new Error(`${submission.id}: the validator read other bytes than were downloaded`);
  const { entry } = verdict;
  const thumbnails = {};
  for (const kind of ['dark', 'light']) {
    if (!entry.thumbnails?.[kind]) continue;
    thumbnails[kind] = entry.thumbnails[kind].map(({ panel, file: thumb, sha256: thumbSha }) => {
      if (!SHA256.test(thumbSha) || thumb !== `${thumbSha}.webp` || sha256Of(readFileSync(path.join(thumbs, thumb))) !== thumbSha) {
        throw new Error(`${submission.id}: thumbnail ${thumb} does not match its sha256`);
      }
      return { panel, url: `${THUMB_BASE}${thumb}`, sha256: thumbSha };
    });
  }
  return {
    id: submission.id,
    name: entry.name,
    author: submission.author,
    description: entry.description ?? '',
    kinds: entry.kinds,
    version: submission.version,
    file: { url: submission.url, sha256, bytes: bytes.byteLength },
    colors: entry.colors,
    fonts: entry.fonts,
    thumbnails,
    licenses: entry.licenses,
    hasCss: entry.hasCss,
    hasLayout: entry.hasLayout,
    hasCharacters: entry.hasCharacters,
    hasMoving: entry.hasMoving,
    minAppVersion: submission.minAppVersion,
  };
}

/** The submission files a pull request adds or changes; anything else it adds under themes/ is refused. */
async function changedSubmissions(base) {
  const { stdout } = await run('git', ['diff', '--name-only', '-z', '--diff-filter=ACMR', `${base}...HEAD`, '--', 'themes/']);
  const names = stdout.split('\0').filter((name) => name !== '');
  const stray = names.filter((name) => !/^themes\/[a-z0-9][a-z0-9-]{0,63}\.json$/.test(name));
  if (stray.length > 0) throw new Error(`only themes/<id>.json files belong under themes/: ${stray.join(', ')}`);
  return names;
}

const allSubmissions = () => readdirSync('themes').filter((name) => name.endsWith('.json')).sort().map((name) => path.join('themes', name));

const files = mode === 'check' ? await changedSubmissions(values.base) : (existsSync('themes') ? allSubmissions() : []);
const thumbs = path.join(work, 'thumbs');
const entries = [];
const failures = [];
for (const file of files) {
  try {
    entries.push(await buildEntry(readSubmission(file), thumbs));
    console.log(`ok: ${file}`);
  } catch (err) {
    failures.push(err.message);
    console.error(`refused: ${err.message}`);
  }
}
if (failures.length > 0) {
  console.error(`${failures.length} of ${files.length} submissions refused`);
  process.exit(1);
}
if (mode === 'publish') {
  const community = JSON.parse(readFileSync('community.json', 'utf8'));
  writeFileSync('community.json', `${JSON.stringify({ ...community, entries }, null, 2)}\n`);
  const named = new Set(entries.flatMap((entry) => [...(entry.thumbnails.dark ?? []), ...(entry.thumbnails.light ?? [])]).map((thumb) => `${thumb.sha256}.webp`));
  mkdirSync('thumbs', { recursive: true });
  for (const name of named) copyFileSync(path.join(thumbs, name), path.join('thumbs', name));
  for (const name of readdirSync('thumbs')) if (!named.has(name)) rmSync(path.join('thumbs', name));
}
console.log(`${entries.length} submissions accepted`);
