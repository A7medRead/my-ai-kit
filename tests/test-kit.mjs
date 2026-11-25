#!/usr/bin/env node
// Automated tests for the kit. Runs on macOS, Windows and Linux.
// Everything happens inside a new temporary folder, which is removed at the end.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ---------- Cleanup ----------
fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
