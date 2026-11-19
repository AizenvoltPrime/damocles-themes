// Signs community.json into community.signed.json (node:crypto only). Usage: STORE_SIGNING_KEY=<PEM> node scripts/sign.mjs [--built <file>]
// Refuses what the app's verify.ts would refuse; a built file supplies only computed fields, checked against themes/<id>.json.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const EXPECTED_KEY_ID = '187953e23cec5c03';
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_DAYS = 30;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const SEEDS = ['background', 'panel', 'text', 'accent', 'success', 'warning', 'danger', 'info'];
const PANELS = ['sidebar', 'chat', 'editor', 'terminal', 'titlebar'];
const ENTRY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
// the characters the app's oneLine drops (Damocles src/core/pi-session/untrusted-text.ts); text left empty refuses the whole list
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function fail(message) {
  console.error(`sign: ${message}`);
  process.exit(1);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max && value.replace(CONTROL, ' ').replace(BIDI, '').trim() !== '';
const https = (value) => typeof value === 'string' && value.length <= 2048 && value.startsWith('https://') && URL.canParse(value);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function checkEntry(entry, at) {
  if (!isObject(entry)) fail(`${at}: not an object`);
  if (!ENTRY_ID.test(entry.id ?? '')) fail(`${at}/id: not a store id`);
  for (const [key, max] of [['name', 256], ['author', 800], ['version', 256]]) if (!text(entry[key], max)) fail(`${at}/${key}: missing, too long, or only control characters`);
  if (typeof entry.description !== 'string' || entry.description.length > 4000) fail(`${at}/description: not a string of at most 4000 characters`);
  if (!Array.isArray(entry.kinds) || entry.kinds.length < 1 || entry.kinds.length > 2 || new Set(entry.kinds).size !== entry.kinds.length) fail(`${at}/kinds: not one or two kinds`);
  for (const kind of entry.kinds) {
    if (kind !== 'dark' && kind !== 'light') fail(`${at}/kinds: ${kind} is not dark or light`);
    const seeds = entry.colors?.[kind];
    if (!isObject(seeds) || SEEDS.some((seed) => !HEX.test(seeds[seed] ?? ''))) fail(`${at}/colors/${kind}: not the 8 seeds as #rrggbb`);
  }
  const file = entry.file;
  if (!isObject(file) || !https(file.url) || !SHA256.test(file.sha256 ?? '') || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_ARCHIVE_BYTES) fail(`${at}/file: not {url https, sha256, bytes}`);
  if (!Array.isArray(entry.fonts) || entry.fonts.length > 16 || entry.fonts.some((font) => !isObject(font) || !text(font.family, 256) || !text(font.license, 256))) fail(`${at}/fonts: not [{family, license}]`);
  if (!isObject(entry.thumbnails)) fail(`${at}/thumbnails: not an object`);
  for (const [kind, list] of Object.entries(entry.thumbnails)) {
    if ((kind !== 'dark' && kind !== 'light') || !Array.isArray(list) || list.length > 40) fail(`${at}/thumbnails/${kind}: not a list of at most 40`);
    for (const thumb of list) if (!isObject(thumb) || !PANELS.includes(thumb.panel) || !https(thumb.url) || !SHA256.test(thumb.sha256 ?? '')) fail(`${at}/thumbnails/${kind}: not [{panel, url https, sha256}]`);
  }
  if (!Array.isArray(entry.licenses) || entry.licenses.length > 64 || entry.licenses.some((license) => !text(license, 256))) fail(`${at}/licenses: not a list of license names`);
  for (const flag of ['hasCss', 'hasLayout', 'hasCharacters', 'hasMoving']) if (typeof entry[flag] !== 'boolean') fail(`${at}/${flag}: not a boolean`);
  if (!VERSION.test(entry.minAppVersion ?? '')) fail(`${at}/minAppVersion: not x.y.z`);
}

function checkRemoved(removed, at) {
  if (!isObject(removed) || !ENTRY_ID.test(removed.id ?? '') || !text(removed.reason, 2000)) fail(`${at}: not {id, reason}`);
  if (removed.sha256 !== undefined && !SHA256.test(removed.sha256)) fail(`${at}/sha256: not a sha256`);
  if (removed.version !== undefined && !text(removed.version, 256)) fail(`${at}/version: not a version`);
}

// each entry must be the committed submission of its id, field for field, and every submission must have its entry
function checkAgainstSubmissions(entries) {
  const names = existsSync('themes') ? readdirSync('themes').filter((name) => name.endsWith('.json')) : [];
  const submissions = new Map(names.map((name) => {
    const submission = readJson(`themes/${name}`);
    if (!isObject(submission) || `${submission.id}.json` !== name) fail(`themes/${name}: its id is not its file name`);
    return [submission.id, submission];
  }));
  const ids = entries.map((entry) => entry.id);
  const missing = [...submissions.keys()].filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !submissions.has(id));
  if (missing.length > 0 || extra.length > 0) fail(`the entries do not match themes/: missing ${missing.join(', ') || 'none'}, not submitted ${extra.join(', ') || 'none'}`);
  for (const entry of entries) {
    const submission = submissions.get(entry.id);
    const pairs = [['version', entry.version, submission.version], ['author', entry.author, submission.author], ['url', entry.file.url, submission.url], ['sha256', entry.file.sha256, submission.sha256], ['minAppVersion', entry.minAppVersion, submission.minAppVersion]];
    for (const [key, built, committed] of pairs) if (built !== committed) fail(`${entry.id}: ${key} is ${JSON.stringify(built)}, but themes/${entry.id}.json says ${JSON.stringify(committed)}`);
  }
}

const { values } = parseArgs({ options: { built: { type: 'string' } } });

const pem = process.env.STORE_SIGNING_KEY;
if (!pem) fail('STORE_SIGNING_KEY is not set');
const privateKey = createPrivateKey(pem);
if (privateKey.asymmetricKeyType !== 'ed25519') fail(`the key is ${privateKey.asymmetricKeyType}, not Ed25519`);
const publicKey = createPublicKey(privateKey);
const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
if (keyId !== EXPECTED_KEY_ID) fail(`the key's id is ${keyId}, not ${EXPECTED_KEY_ID}, the key the app ships`);

const community = readJson('community.json');
if (!isObject(community) || !Number.isSafeInteger(community.sequence) || community.sequence < 0) fail('community.json has no sequence');
if (!Array.isArray(community.removed) || community.removed.length > 2000) fail('community.json removed is not a list of at most 2000');
const entries = values.built === undefined ? community.entries : readJson(values.built).entries;
if (!Array.isArray(entries) || entries.length > 2000) fail('the entries are not a list of at most 2000');
entries.forEach((entry, i) => checkEntry(entry, `/entries/${i}`));
community.removed.forEach((removed, i) => checkRemoved(removed, `/removed/${i}`));
if (new Set(entries.map((entry) => entry.id)).size !== entries.length) fail('an entry id is listed twice');
checkAgainstSubmissions(entries);
// every thumbnail the list names is committed beside it, under its own hash
for (const entry of entries) {
  for (const thumb of [...(entry.thumbnails.dark ?? []), ...(entry.thumbnails.light ?? [])]) {
    const file = `thumbs/${thumb.sha256}.webp`;
    if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== thumb.sha256) fail(`${entry.id}: ${file} is missing or does not match its sha256`);
  }
}

// the app refuses a sequence below the highest it saw, so the new one is above both the source's and the last signed list's
let lastSigned = 0;
try {
  lastSigned = JSON.parse(readJson('community.signed.json').payload).sequence;
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
const sequence = Math.max(community.sequence, lastSigned) + 1;
const issued = Date.now();
const payload = JSON.stringify({
  sequence,
  issuedAt: new Date(issued).toISOString(),
  expiresAt: new Date(issued + VALID_DAYS * DAY_MS).toISOString(),
  entries,
  removed: community.removed,
});
if (Buffer.byteLength(payload, 'utf8') > 1.5 * 1024 * 1024) fail('the payload is over 1.5 MB; the app reads at most 2 MB of list');
const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
const envelope = { format: 1, keyId, payload, signature };

writeFileSync('community.signed.json', `${JSON.stringify(envelope, null, 2)}\n`);
writeFileSync('community.json', `${JSON.stringify({ ...community, sequence, entries }, null, 2)}\n`);

const written = readJson('community.signed.json');
if (written.keyId !== EXPECTED_KEY_ID || !verify(null, Buffer.from(written.payload, 'utf8'), publicKey, Buffer.from(written.signature, 'base64'))) {
  fail('the signature written does not verify');
}
console.log(`sign: community.signed.json sequence ${sequence}, ${entries.length} entries, ${community.removed.length} removed, expires ${new Date(issued + VALID_DAYS * DAY_MS).toISOString()}`);
