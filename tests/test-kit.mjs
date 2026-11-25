#!/usr/bin/env node
// Automated tests for the kit. Runs on macOS, Windows and Linux.
// Everything happens inside a new temporary folder, which is removed at the end.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-test-'));
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
    if (ok) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.log(`FAIL  ${name}`); if (detail) console.log(detail); }
}
function put(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}
const read = (file) => fs.readFileSync(file, 'utf8');
const has = (...parts) => fs.existsSync(path.join(...parts));

// Keep the user's own git configuration (global hooks, signing...) out of the tests.
const emptyConfig = path.join(work, 'gitconfig');
put(emptyConfig, '');
const env = { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' };

function run(command, args, cwd = work, extra = {}) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...env, ...extra } });
    return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}` };
}
const node = (script, ...args) => run(process.execPath, [script, ...args]);
const git = (cwd, ...args) => run('git', args, cwd);

// Git for Windows ships sh; a plain "bash" on Windows may be WSL.
let sh = 'sh';
if (process.platform === 'win32') {
    const execPath = git(work, '--exec-path').out.trim();
    sh = path.resolve(execPath, '..', '..', '..', 'bin', 'sh.exe');
}
console.log(`platform: ${process.platform}, node ${process.version}, ${git(work, '--version').out.trim()}`);

// Minimal reader for the 8-bit, non-interlaced PNG files a browser screenshot produces.
function readPng(file) {
    const data = fs.readFileSync(file);
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    const channels = data[25] === 6 ? 4 : 3;
    const parts = [];
    for (let at = 8; at < data.length; at += data.readUInt32BE(at) + 12) {
        if (data.toString('latin1', at + 4, at + 8) === 'IDAT') parts.push(data.subarray(at + 8, at + 8 + data.readUInt32BE(at)));
    }
    const raw = inflateSync(Buffer.concat(parts));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? pixels[y * stride + x - channels] : 0;
            const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
            const corner = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
            const guess = left + up - corner;
            const [a, b, c] = [left, up, corner].map((v) => Math.abs(guess - v));
            const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
            const predicted = [0, left, up, (left + up) >> 1, paeth][filter];
            pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predicted) & 255;
        }
    }
    const pixel = (x, y) => (y < height ? [...pixels.subarray(y * stride + x * channels, y * stride + x * channels + 3)].join(',') : 'outside');
    return { width, height, pixel };
}

// ---------- Skills ----------
for (const name of fs.readdirSync(path.join(kit, 'skills'))) {
    const text = read(path.join(kit, 'skills', name, 'SKILL.md')).replace(/\r/g, '');
    const match = text.match(/^---\nname: ([a-z0-9-]+)\ndescription: "([^"\n]+)"\n---\n/);
    check(`frontmatter ${name}`, match?.[1] === name && match[2].length <= 1024);
    for (const [, script] of text.matchAll(/`(?:node )?(scripts\/[\w.-]+)/g)) {
        check(`${name} refers to an existing ${script}`, has(kit, 'skills', name, script));
    }
}
const rulesBytes = fs.statSync(path.join(kit, 'AGENTS.md')).size;
check(`core rules size (${rulesBytes} bytes) is under 12000`, rulesBytes < 12000);
const assets = path.join(kit, 'skills', 'kit-new-project', 'assets', 'project');
for (const script of ['.ai-kit/scan-secrets.sh', '.ai-kit/checks.sh', '.githooks/pre-commit', '.githooks/pre-push']) {
    const file = path.join(assets, script);
    check(`${script} has LF endings`, !read(file).includes('\r'));
    const syntax = run(sh, ['-n', file]);
    check(`${script} passes sh syntax check`, syntax.code === 0, syntax.out);
}

// ---------- Project setup ----------
const project = path.join(work, 'project with space');
fs.mkdirSync(project);
git(project, 'init', '--quiet', '-b', 'main');
git(project, 'config', 'user.email', 'test@example.invalid');
git(project, 'config', 'user.name', 'kit test');
git(project, 'config', 'core.autocrlf', 'false');
put(path.join(project, 'CLAUDE.md'), 'my own notes\n');
const setup = path.join(kit, 'skills', 'kit-new-project', 'scripts', 'setup-project.mjs');
let r = node(setup, project, '--include', 'design,runbook');
check('setup succeeds', r.code === 0, r.out);
check('setup keeps existing file', read(path.join(project, 'CLAUDE.md')) === 'my own notes\n');
check('setup creates optional docs', has(project, 'docs', 'DESIGN.md') && has(project, 'docs', 'RUNBOOK.md') && !has(project, 'docs', 'ARCHITECTURE.md'));
check('setup enables hooks', git(project, 'config', '--get', 'core.hooksPath').out.trim() === '.githooks');
r = git(project, 'ls-files', '-s', '.githooks');
check('hooks are stored as executable (needed on macOS)', (r.out.match(/^100755 /gm) ?? []).length === 2, r.out);
r = node(setup, project);
check('setup is repeatable', r.code === 0 && read(path.join(project, '.gitignore')).split('\n').filter((l) => l === '.env').length === 1, r.out);

// ---------- Secret scan through real hooks ----------
git(project, 'add', '-A');
r = git(project, 'commit', '-m', 'initial');
check('clean project (including the kit files) commits', r.code === 0, r.out);

// Fake values are assembled here so this file never contains a secret-shaped string.
const fake = {
    'aws key': 'key = ' + 'AKIA' + 'Q'.repeat(16),
    'github token': 't ' + 'ghp_' + 'a1'.repeat(18),
    'ai key': 'x="' + 'sk-' + 'ant-' + 'b2'.repeat(20) + '"',
    'private key': '-'.repeat(5) + 'BEGIN RSA PRIVATE KEY' + '-'.repeat(5),
    'database url': 'url=' + 'postgres://admin:' + 'S3cretPw9@db.prod.invalid/app',
    password: 'DB_PASSWORD = "' + 'hunter2hunter2' + '"',
    'google key': 'g ' + 'AIza' + 'c'.repeat(35),
};
for (const [name, value] of Object.entries(fake)) {
    const file = path.join(project, 'src', '[id] page.js');
    put(file, value + '\n');
    git(project, 'add', '-A');
    r = git(project, 'commit', '-m', `add ${name}`);
    check(`blocks ${name}, hides the value`, r.code !== 0 && r.out.includes('BLOCKED') && !r.out.includes(value), r.out);
    git(project, 'rm', '--cached', '--quiet', '-f', '--', ':(literal)src/[id] page.js');
    fs.rmSync(file);
}

put(path.join(project, '.env'), 'A=1\n');
git(project, 'add', '-f', '.env');
r = git(project, 'commit', '-m', 'env');
check('blocks a forced .env file', r.code !== 0 && r.out.includes('blocked-file-name'), r.out);
git(project, 'rm', '--cached', '--quiet', '-f', '.env');

put(path.join(project, 'ok.js'),
    "const url = 'postgres://postgres:postgres@localhost:5432/dev';\n" +
    'const password = process.env.PASSWORD;\n' +
    'API_KEY="your_api_key_goes_here"\n' +
    'token = "' + 'z9'.repeat(10) + '" // ai-kit:allow-secret\n');
put(path.join(project, '.env.example'), 'API_KEY=\n');
// A byte that is not valid UTF-8 next to a harmless match must not break the scan.
fs.writeFileSync(path.join(project, 'latin1.txt'), Buffer.from('secret = "your_caf\xe9_example_value"\n', 'latin1'));
git(project, 'add', '-A');
r = git(project, 'commit', '-m', 'safe content');
check('allows local, placeholder, approved and non-UTF-8 lines', r.code === 0, r.out);

// ---------- Attempts to slip a secret past the scan ----------
function attempt(name, files) {
    for (const [relative, content] of Object.entries(files)) put(path.join(project, relative), content);
    git(project, 'add', '-A');
    const result = git(project, 'commit', '-m', name);
    check(`blocks ${name}`, result.code !== 0 && result.out.includes('BLOCKED'), result.out);
    git(project, 'reset', '--quiet', 'HEAD');
    for (const relative of Object.keys(files)) fs.rmSync(path.join(project, relative));
}
const line = fake['aws key'] + '\n';
attempt('a secret in a file containing a NUL byte', { 'blob.bin': Buffer.from(`\0\x01\n${line}`, 'latin1') });
attempt('a secret in a UTF-16 file', { 'notes16.txt': Buffer.from('﻿first\r\n' + line, 'utf16le') });
attempt('a secret in a file marked binary by .gitattributes', {
    'sub/.gitattributes': '*.dat binary\n',
    'sub/config.dat': line,
});
attempt('the allow marker outside a comment', { 'm.js': `const note = "ai-kit:allow-secret"; ${fake.password}\n` });
attempt('a password with a placeholder word elsewhere on the line', { 'p.js': `${fake.password} // example\n` });
attempt('a password with ${} elsewhere on the line', { 'q.js': `${fake.password}; const t = \`\${x}\`;\n` });
attempt('a remote database URL next to a local one', { 'u.txt': `postgres://a:b@localhost/x ${fake['database url']}\n` });
attempt('a database host that only starts with localhost', {
    'h.txt': 'postgres://admin:' + 'S3cretPw9@localhost.evil.invalid/app\n',
});
if (process.platform !== 'win32') {
    attempt('a file whose name contains the allow marker', { '# ai-kit:allow-secret example.txt': line });
}
// Only a whole env(UPPER_CASE_NAME) value is a variable reference.
attempt('a password wrapped to look like a lower-case env reference', { 'r.toml': 'password = "env(' + 'hunter2hunter2' + ')"\n' });
attempt('a secret appended to an env reference', { 's.toml': 'secret = "env(NAME)' + 'hunter2hunter2' + '"\n' });
attempt('a secret before an env reference', { 't.toml': 'token = "' + 'hunter2' + 'env(LONG_NAME)"\n' });
attempt('a real secret on the same line as an env reference', { 'u.toml': 'secret = "env(SECRET_VALUE)" ' + fake.password + '\n' });
attempt('a known token format inside env()', { 'v.toml': 'secret = "env(' + 'AKIA' + 'Q'.repeat(16) + ')"\n' });
attempt('long upper-case text without an underscore inside env()', { 'w.toml': 'secret = "env(' + 'ABCDEFGHJKLMNPQRSTUVWXYZ234567' + ')"\n' });
attempt('an overlong name inside env()', { 'x.toml': 'secret = "env(' + 'AB_'.repeat(30) + ')"\n' });
put(path.join(project, 'refs.toml'),
    'openai_api_key = "env(OPENAI_API_KEY)"\nauth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"\n' +
    '# secret_key = "env(SECRET_VALUE)"\ns3_secret_key = \'env(S3_SECRET_KEY)\'\n');
git(project, 'add', '-A');
r = git(project, 'commit', '-m', 'environment references');
check('allows env(NAME) variable references', r.code === 0, r.out);
put(path.join(project, 'image.bin'), Buffer.from([0, 1, 2, 255, 0, 10, 0, 200]));
put(path.join(project, 'empty.txt'), '');
put(path.join(project, 'allowed.py'), fake.password + '  # ai-kit:allow-secret\n');
put(path.join(project, 'local.txt'), 'redis://u:p@127.0.0.1:6379 postgres://u:${DB_PASS}@db.prod.invalid/x\n');
git(project, 'add', '-A');
r = git(project, 'commit', '-m', 'harmless binary and approved lines');
check('allows clean binary, empty, commented-marker, local and variable lines', r.code === 0, r.out);

// ---------- Push ----------
const remote = path.join(work, 'remote.git');
git(work, 'init', '--quiet', '--bare', '-b', 'main', remote);
git(project, 'remote', 'add', 'origin', remote);
git(project, 'push', '--quiet', '-u', 'origin', 'main');
git(project, 'switch', '--quiet', '-c', 'task');
r = git(project, 'push', '-u', 'origin', 'task');
check('clean push succeeds', r.code === 0, r.out);

// ---------- The CI workflow commands, run as GitHub would run them ----------
function ciSteps(clone) {
    const yml = read(path.join(clone, '.github', 'workflows', 'ai-kit-checks.yml'));
    return [...yml.matchAll(/^\s+run: (.+)$/gm)].map((m) => ({
        command: m[1].trim(),
        ...run(sh, ['-c', m[1].trim()], clone, { GITHUB_BASE_REF: 'main' }),
    }));
}
put(path.join(project, 'feature.txt'), 'new work\n');
git(project, 'add', '-A');
git(project, 'commit', '--quiet', '-m', 'feature');
git(project, 'push', '--quiet', 'origin', 'task');
const clone = path.join(work, 'ci-clone');
git(work, 'clone', '--quiet', '--branch', 'task', remote, clone);
let steps = ciSteps(clone);
check('CI: both secret scan steps pass on a clean pull request',
    steps.length === 3 && steps[0].code === 0 && steps[1].code === 0, steps.map((s) => s.out).join('\n'));
check('CI: unconfigured project checks fail on purpose', steps[2]?.code === 1 && steps[2].out.includes('not configured'), steps[2]?.out);
put(path.join(clone, '.ai-kit', 'checks.sh'), '#!/bin/sh\necho "level=$1"\n');
steps = ciSteps(clone);
check('CI: configured checks run at full level', steps[2]?.code === 0 && steps[2].out.includes('level=full'), steps[2]?.out);

// ---------- A second machine ----------
check('a fresh clone has no hook setting', git(clone, 'config', '--get', 'core.hooksPath').out.trim() === '');
r = node(setup, clone);
check('running setup on a fresh clone enables the hooks', r.code === 0 && git(clone, 'config', '--get', 'core.hooksPath').out.trim() === '.githooks', r.out);

// A secret committed with the hooks bypassed, then deleted, must still block the push.
put(path.join(project, 'leak.txt'), fake['aws key'] + '\n');
git(project, 'add', '-A');
git(project, 'commit', '--no-verify', '--quiet', '-m', 'leak');
git(project, 'rm', '--quiet', 'leak.txt');
git(project, 'commit', '--quiet', '-m', 'cleanup');
r = git(project, 'push', 'origin', 'task');
check('push blocks a secret hidden in history', r.code !== 0 && r.out.includes('leak.txt'), r.out);
r = git(project, 'push', 'origin', 'task:other');
check('push of a new remote branch is also blocked', r.code !== 0 && r.out.includes('BLOCKED'), r.out);
// History that already reached one remote must still be scanned before it goes to another.
git(project, 'push', '--quiet', '--no-verify', 'origin', 'task');
const second = path.join(work, 'second.git');
git(work, 'init', '--quiet', '--bare', '-b', 'main', second);
git(project, 'remote', 'add', 'second', second);
r = git(project, 'push', 'second', 'task');
check('push to a second remote scans history already on the first', r.code !== 0 && r.out.includes('leak.txt'), r.out);
r = git(project, 'push', second, 'task');
check('push to a bare URL scans the history', r.code !== 0 && r.out.includes('leak.txt'), r.out);

// ---------- Scan modes ----------
const scan = (...args) => run(sh, ['.ai-kit/scan-secrets.sh', ...args], project);
r = scan('--range', 'HEAD~2..HEAD');
check('--range finds a secret removed later', r.code === 1 && r.out.includes('leak.txt:1'), r.out);
r = scan('--all');
check('--all passes on a clean tree', r.code === 0, r.out);
const arabic = String.fromCodePoint(0x0645, 0x0644, 0x0641);
put(path.join(project, `${arabic} x.txt`), fake['github token'] + '\n');
git(project, 'add', '-A');
r = scan('--all');
check('--all finds a secret in a non-English file name', r.code === 1 && r.out.includes('github-token'), r.out);
check('scan fails closed on an invalid range', scan('--range', 'no-such-ref..HEAD').code === 2);
check('scan fails closed without a mode', scan().code === 2);

// ---------- Existing hooks are not replaced ----------
const hooked = path.join(work, 'hooked');
fs.mkdirSync(path.join(hooked, '.husky'), { recursive: true });
git(hooked, 'init', '--quiet');
r = node(setup, hooked);
check('existing hook manager is respected', r.code === 0 && git(hooked, 'config', '--get', 'core.hooksPath').out.trim() === '', r.out);
check('setup rejects an unknown option value', node(setup, hooked, '--include', 'nope').code === 1);

// ---------- Status ----------
const status = path.join(kit, 'skills', 'kit-status', 'scripts', 'project-status.mjs');
r = node(status, project);
check('status reports commits made after PLAN.md', r.code === 0 && /Commits after PLAN\.md was last committed: [1-9]/.test(r.out) && r.out.includes('Current position') && r.out.includes('no entries'), r.out);
const empty = path.join(work, 'empty');
fs.mkdirSync(empty);
git(empty, 'init', '--quiet');
r = node(status, empty);
check('status handles a repository without commits', r.code === 0 && r.out.includes('no commits yet'), r.out);

check('status gives no parent warning at a repository root', !r.out.includes('inside a larger repository'), r.out);
const nested = path.join(project, 'nested app');
fs.mkdirSync(nested);
r = node(status, nested);
check('status stops when a folder has no repository of its own', r.code === 1 && r.out.includes('inside a larger repository') && !r.out.includes('== Branch'), r.out);
r = node(status, nested, '--allow-parent');
check('status continues in a parent repository only when allowed', r.code === 0 && r.out.includes('== Branch') && r.out.includes('inside a larger repository'), r.out);

// ---------- Updating an older project ----------
const older = path.join(work, 'older');
fs.mkdirSync(older);
git(older, 'init', '--quiet', '-b', 'main');
git(older, 'config', 'user.email', 'test@example.invalid');
git(older, 'config', 'user.name', 'kit test');
node(setup, older);
const lf = (text) => text.replace(/\r\n/g, '\n');
const fingerprint = (text) => createHash('sha256').update(lf(text)).digest('hex');
const knownFile = path.join(kit, 'skills', 'kit-new-project', 'assets', 'known-versions.txt');
for (const owned of ['.ai-kit/scan-secrets.sh', '.githooks/pre-commit', '.githooks/pre-push']) {
    check(`the current ${owned} is listed in known-versions.txt`, read(knownFile).includes(`${fingerprint(read(path.join(assets, owned)))} ${owned}`),
        `add: ${fingerprint(read(path.join(assets, owned)))} ${owned}`);
}
// A copy of the skill that also knows one invented "older release".
const oldKit = path.join(work, 'old-kit');
fs.cpSync(path.join(kit, 'skills', 'kit-new-project'), oldKit, { recursive: true });
const released = '#!/bin/sh\n# an older release\nexit 0\n';
fs.appendFileSync(path.join(oldKit, 'assets', 'known-versions.txt'), `${fingerprint(released)} .ai-kit/scan-secrets.sh\n`);
const upgrade = path.join(oldKit, 'scripts', 'setup-project.mjs');
const oldScanner = path.join(older, '.ai-kit', 'scan-secrets.sh');
const hookFile = path.join(older, '.githooks', 'pre-commit');
const currentScanner = read(path.join(assets, '.ai-kit', 'scan-secrets.sh'));
put(oldScanner, released.replace(/\n/g, '\r\n'));
put(path.join(older, '.ai-kit', 'checks.sh'), 'custom checks\n');
const customHook = `${read(hookFile)}# my own extra check\n`;
put(hookFile, customHook);
git(older, 'add', '-A');
git(older, 'commit', '--quiet', '--no-verify', '-m', 'old scanner and custom hook');
r = node(upgrade, older);
check('setup without --update keeps the old scanner', read(oldScanner) === released.replace(/\n/g, '\r\n'), r.out);
r = node(upgrade, older, '--update');
check('--update replaces an unchanged older release', lf(read(oldScanner)) === lf(currentScanner), r.out);
check('--update keeps a customized hook, even when committed', r.code === 1 && read(hookFile) === customHook && r.out.includes('.githooks/pre-commit was customized'), r.out);
check('--update leaves project-owned files alone', read(path.join(older, '.ai-kit', 'checks.sh')) === 'custom checks\n');
check('setup does not ask to fill checks that are already configured', !r.out.includes('fill .ai-kit/checks.sh'), r.out);

// ---------- Secret files ----------
function freshRepo(name) {
    const dir = path.join(work, name);
    fs.mkdirSync(dir);
    git(dir, 'init', '--quiet', '-b', 'main');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'kit test');
    return dir;
}
const negated = freshRepo('negated');
put(path.join(negated, '.gitignore'), '.env\n!.env\n!.env.*\n');
r = node(setup, negated);
const ignored = (name) => git(negated, 'check-ignore', '--no-index', '-q', name).code === 0;
check('setup repairs a rule that exposed .env', r.code === 0 && ignored('.env') && ignored('.env.local') && !ignored('.env.example'), r.out);
const nestedRule = freshRepo('nested-rule');
put(path.join(nestedRule, '.gitignore'), '');
put(path.join(nestedRule, 'app', '.env'), 'A=1\n');
git(nestedRule, 'add', '-f', 'app/.env');
git(nestedRule, 'commit', '--quiet', '-m', 'tracked secret file');
r = node(setup, nestedRule);
check('setup reports an already tracked secret file and fails', r.code === 1 && r.out.includes('already tracked') && r.out.includes('app/.env'), r.out);
check('setup does not remove the tracked file itself', git(nestedRule, 'ls-files', 'app/.env').out.trim() === 'app/.env');


// ---------- Installer ----------
const install = path.join(kit, 'install.mjs');
const home = path.join(work, 'home');
const codexFile = path.join(home, '.codex', 'AGENTS.md');
const original = `# mine\r\n${String.fromCodePoint(0x0642, 0x0648, 0x0627, 0x0639, 0x062F)}\r\n`;
put(codexFile, original);
put(path.join(home, '.claude', 'skills', 'design', 'SKILL.md'), 'unrelated');
const installer = (...args) => node(install, '--home', home, ...args);

r = installer();
check('preview changes nothing', r.code === 0 && read(codexFile) === original && !has(home, '.agents'), r.out);
r = installer('--apply');
check('install succeeds', r.code === 0, r.out);
let text = read(codexFile);
check('install keeps user text, including Arabic', text.startsWith(original) && text.includes('ai-kit:end'));
check('install writes a backup', fs.readdirSync(path.dirname(codexFile)).filter((n) => n.startsWith('AGENTS.md.ai-kit-backup-')).length === 1);
const expected = [
    '.claude/CLAUDE.md', '.gemini/GEMINI.md', '.copilot/copilot-instructions.md',
    '.claude/skills/kit-design/SKILL.md', '.agents/skills/kit-status/scripts/project-status.mjs',
    '.gemini/config/skills/kit-deliver/SKILL.md',
    '.agents/skills/kit-new-project/assets/project/.githooks/pre-push',
];
const missing = expected.filter((p) => !has(home, p));
check('install creates every target', missing.length === 0, missing.join('\n'));
const installedSetup = path.join(home, '.agents', 'skills', 'kit-new-project', 'scripts', 'setup-project.mjs');
const fresh = path.join(work, 'fresh');
fs.mkdirSync(fresh);
git(fresh, 'init', '--quiet');
r = node(installedSetup, fresh);
check('the installed copy of setup works', r.code === 0 && has(fresh, '.ai-kit', 'scan-secrets.sh'), r.out);

const before = read(codexFile);
r = installer('--apply');
check('second install changes nothing', r.code === 0 && read(codexFile) === before && !/^(create|update) /m.test(r.out), r.out);

const edited = path.join(home, '.agents', 'skills', 'kit-debug', 'SKILL.md');
put(edited, 'hand edit');
r = installer('--apply');
check('hand-edited skill is preserved', r.code === 1 && read(edited) === 'hand edit', r.out);
r = installer('--apply', '--force');
check('--force restores the kit version', r.code === 0 && read(edited) !== 'hand edit', r.out);

const review = path.join(home, '.claude', 'skills', 'kit-review');
put(path.join(review, 'keep.txt'), 'x');
fs.rmSync(path.join(review, '.ai-kit-managed'));
r = installer('--apply', '--force');
check('unmanaged folder is never replaced', r.code === 1 && has(review, 'keep.txt'), r.out);

r = installer('--apply', '--uninstall', '--tools', 'codex');
check('partial uninstall keeps shared skills', r.code === 0 && has(home, '.agents', 'skills', 'kit-design'), r.out);
check('uninstall restores user text', read(codexFile) === original);
r = installer('--apply', '--uninstall');
check('full uninstall removes kit skills only', !has(home, '.agents', 'skills', 'kit-design') && has(home, '.claude', 'skills', 'design', 'SKILL.md'), r.out);

const claudeFile = path.join(home, '.claude', 'CLAUDE.md');
const broken = '<!-- ai-kit:start only\nkeep me\n';
put(claudeFile, broken);
r = installer('--apply', '--tools', 'claude');
check('damaged markers are left untouched', r.code === 1 && read(claudeFile) === broken, r.out);
const utf16 = Buffer.from('﻿mine\r\n', 'utf16le');
fs.writeFileSync(claudeFile, utf16);
r = installer('--apply', '--tools', 'claude');
check('a non-UTF-8 instruction file is left untouched', r.code === 1 && fs.readFileSync(claudeFile).equals(utf16), r.out);
check('unknown tool is rejected', installer('--tools', 'nope').code === 2);

// ---------- Taste library ----------
const initTaste = path.join(kit, 'skills', 'kit-taste', 'scripts', 'init-taste.mjs');
const fakeKit = path.join(work, 'fake kit');
put(path.join(fakeKit, 'AGENTS.md'), 'rules\n');
git(fakeKit, 'init', '--quiet', '-b', 'main');
r = node(initTaste, fakeKit);
check('taste library is created with its own repository', r.code === 0 && has(fakeKit, 'taste', 'principles.md') && has(fakeKit, 'taste', 'index.md') && has(fakeKit, 'taste', '.git'), r.out);
put(path.join(fakeKit, 'taste', 'principles.md'), 'my taste\n');
r = node(initTaste, fakeKit);
check('taste setup never overwrites', r.code === 0 && read(path.join(fakeKit, 'taste', 'principles.md')) === 'my taste\n' && read(path.join(fakeKit, '.gitignore')).split('\n').filter((l) => l === '/taste/').length === 1, r.out);
git(fakeKit, 'add', '-A');
r = git(fakeKit, 'ls-files');
check('the kit repository never includes the taste library', !r.out.includes('taste/'), r.out);
check('the real kit ignores taste/', read(path.join(kit, '.gitignore')).split(/\r?\n/).includes('/taste/'));
check('taste setup refuses a folder that is not the kit', node(initTaste, empty).code === 1);
const leaky = freshRepo('leaky kit');
put(path.join(leaky, 'AGENTS.md'), 'rules\n');
put(path.join(leaky, 'taste', 'private.md'), 'mine\n');
git(leaky, 'add', '-A');
git(leaky, 'commit', '--quiet', '-m', 'tracked taste');
r = node(initTaste, leaky);
check('taste setup stops when the kit tracks taste files', r.code === 1 && r.out.includes('taste/private.md') && !has(leaky, 'taste', 'principles.md'), r.out);
git(leaky, 'rm', '-r', '--quiet', '--cached', 'taste');
git(leaky, 'commit', '--quiet', '-m', 'untrack');
r = node(initTaste, leaky);
check('taste setup warns about taste files in history', r.code === 0 && r.out.includes('appears in the kit history'), r.out);

// ---------- Design check ----------
const designCheck = path.join(kit, 'skills', 'kit-design', 'scripts', 'design-check.mjs');
const ui = path.join(work, 'ui');
const bad = path.join(ui, 'bad.html');
const good = path.join(ui, 'good.html');
put(bad, `<!doctype html><html lang="ar"><head><meta charset="utf-8"><style>
body{margin:0;background:#fff} .faint{color:#bbb} .wide{width:900px;height:10px}
.tiny{width:16px;height:16px;padding:0} .same,.same:disabled{color:#111;background:#eee;border:1px solid #333;width:120px;height:48px}
</style></head><body><p class="faint">faint text</p><div class="wide"></div><button class="tiny"></button>
<button class="same" disabled>next</button><s>٥:٠٠</s><img src="data:,"><input type="text">
<div style="height:900px"></div><button type="submit" class="same">send</button></body></html>`);
put(good, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{margin:0;padding:16px;background:#fff;color:#111} button{min-width:120px;height:48px;background:#123;color:#fff;border:2px solid #123}
button:disabled{background:#fff;color:#666;border-style:dashed} input{height:48px;border:2px solid #555}
</style></head><body><h1>title</h1><label>name <input type="text"></label><button type="submit" disabled>send</button></body></html>`);
put(path.join(ui, 'src', 'tokens.css'), ':root { --text: #111111; }\n');
put(path.join(ui, 'src', 'ok.tsx'), 'export const A = () => <a href="#faq" style={{ color: "var(--text)" }}>x</a>;\n');
r = node(designCheck, '--source', path.join(ui, 'src'), '--tokens', path.join(ui, 'src', 'tokens.css'));
check('design check accepts colors kept in the token file', r.code === 0, r.out);
put(path.join(ui, 'src', 'card.module.css'), '.card { color: #ff0000; }\n.b { background: rgb(0, 0, 0); }\n');
r = node(designCheck, '--source', path.join(ui, 'src'), '--tokens', path.join(ui, 'src', 'tokens.css'));
check('design check reports literal colors outside the token file', r.code === 1 && r.out.includes('card.module.css:1') && r.out.includes('card.module.css:2'), r.out);
check('design check refuses remote pages', node(designCheck, 'https://example.com').code === 2);
check('design check refuses a missing token file', node(designCheck, '--source', path.join(ui, 'src'), '--tokens', path.join(ui, 'none.css')).code === 2);

const colors = path.join(work, 'colors');
put(path.join(colors, 'tokens.css'), ':root { --red: #f00; }\n');
const mustFind = {
    'a.tsx': 'const a = "bg-[#ff0000]";',
    'b.tsx': 'const b = "#fff";',
    'c.tsx': 'const c = <i style={{ color: "red" }} />;',
    'd.tsx': 'const d = <i className="p-2 text-red-500" />;',
    'e.tsx': 'const e = <i className="hover:bg-white" />;',
    'f.tsx': 'const f = <path fill="tomato" />;',
    'g.css': '.g { color: red; }',
    'h.css': '.h { border: 1px solid rebeccapurple; }',
    'i.css': '.i { color: color(display-p3 1 0 0); }',
    'j.css': '.j { color: hwb(0 0% 0%); }',
    'k.css': '.k {\n  background: linear-gradient(\n    var(--a),\n    #abc 50%\n  );\n}',
    'l.scss': '$brand: navy;',
    'm.html': '<style>\n.m { color: #123456 }\n</style>',
    'n.tsx': 'const n = <div style="outline-color: #0f0" />;',
    'o.tsx': 'const o = { boxShadow: "0 0 2px #000" };',
    'p.tsx': 'const p = styled.div`\n  color: crimson;\n`;',
};
const mustIgnore = {
    'ok1.css': '#add { color: var(--red); }\n#bad:hover .x { margin: 0 }',
    'ok2.css': '.a { color: transparent; border-color: currentColor; white-space: nowrap; }\n/* color: red */',
    'ok3.css': '.gold { font-family: "Gold"; background: url(red.png); }',
    'ok4.tsx': 'const a = <a href="#add" id="#bed">red team</a>; document.querySelector("#fab");',
    'ok5.tsx': '// color: "red"\nconst status = "green"; const c = "text-sm border-2 bg-surface text-primary";',
    'ok6.tsx': 'const s = { color: "var(--red)" };',
};
for (const [name, content] of Object.entries(mustFind)) put(path.join(colors, 'bad', name), content + '\n');
for (const [name, content] of Object.entries(mustIgnore)) put(path.join(colors, 'good', name), content + '\n');
r = node(designCheck, '--source', path.join(colors, 'bad'), '--tokens', path.join(colors, 'tokens.css'));
for (const name of Object.keys(mustFind)) check(`color check finds the color in ${name}`, r.out.includes(`${name}:`), r.out);
check('color check reports the right line of a multi-line value', r.out.includes('k.css:4') && r.out.includes('m.html:2'), r.out);
r = node(designCheck, '--source', path.join(colors, 'good'), '--tokens', path.join(colors, 'tokens.css'));
check('color check ignores selectors, anchors, keywords, comments and tokens', r.code === 0, r.out);

const shots = path.join(ui, 'shots');
r = node(designCheck, good, '--out', shots);
if (r.code === 3) {
    console.log(`SKIP  design check in a browser: ${r.out.trim()}`);
} else {
    check('design check passes a clean page', r.code === 0 && r.out.includes('0 failure(s)'), r.out);
    check('design check saves phone, tablet and desktop screenshots', fs.readdirSync(shots).filter((n) => n.endsWith('.png')).length === 3);
    const broken = path.join(ui, 'broken.html');
    put(broken, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body><img src="missing-picture.png" alt="x"><script src="missing-script.js"></script>
<script>console.error('boom-console'); throw new Error('boom-thrown');</script></body></html>`);
    r = node(designCheck, broken, '--out', path.join(ui, 'broken-shots'));
    for (const [what, text] of Object.entries({
        'a thrown JavaScript error': 'boom-thrown', 'a console error': 'boom-console',
        'a broken image': 'image failed to load', 'a script that did not load': 'missing-script.js',
    })) check(`design check finds: ${what}`, r.code === 1 && r.out.includes(text), r.out);
    r = node(designCheck, bad, '--out', path.join(ui, 'bad-shots'));
    check('design check fails a bad page', r.code === 1, r.out);
    const findings = {
        'viewport meta': 'missing <meta name="viewport">',
        'right-to-left': 'without right-to-left direction',
        overflow: 'horizontal overflow',
        contrast: 'text contrast',
        'small target': 'target smaller than 24px',
        'disabled look': 'disabled control looks the same as enabled',
        'struck zero': 'line-through over an Arabic-Indic zero',
        'image alt': 'image without alt',
        'field label': 'field without a label',
        'hidden primary action': 'primary action is below the first screen',
    };
    for (const [what, text] of Object.entries(findings)) check(`design check finds: ${what}`, r.out.includes(text), r.out);
    r = node(designCheck, good, '--before', 'document.querySelector("h1").style.color = "#ddd"', '--out', shots);
    check('design check measures the state reached by --before', r.code === 1 && r.out.includes('text contrast'), r.out);

    // Right-to-left screenshots must show the full width, on short and on tall pages.
    for (const [kind, filler] of [['short', 0], ['tall', 1500]]) {
        const page = path.join(ui, `rtl-${kind}.html`);
        put(page, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{margin:0;background:#fff} .bar{height:40px;background:rgb(255,0,0)} .end{height:40px;background:rgb(0,0,255)}</style></head>
<body><div class="bar"></div><div style="height:${filler}px"></div><div class="end"></div></body></html>`);
        const out = path.join(ui, `rtl-shots-${kind}`);
        r = node(designCheck, page, '--out', out);
        for (const label of ['mobile', 'tablet', 'desktop']) {
            const image = readPng(path.join(out, `1-rtl-${kind}-${label}.png`));
            const edges = [image.pixel(1, 10), image.pixel(image.width - 2, 10)];
            const bottom = image.pixel(Math.floor(image.width / 2), 40 + filler + 10);
            check(`${kind} right-to-left ${label} screenshot is complete`,
                image.width === { mobile: 360, tablet: 768, desktop: 1280 }[label] && edges.every((c) => c === '255,0,0') && bottom === '0,0,255',
                `${image.width}x${image.height} edges=${edges.join(' | ')} bottom=${bottom}`);
        }
    }
}

// ---------- Cleanup ----------
fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
