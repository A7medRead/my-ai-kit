#!/usr/bin/env node
// Adds the ai-kit files to a project and enables the secret-scan hooks. Never overwrites a file,
// except that --update replaces a scanner or hook that is an unchanged copy of a released version.
// Run it once on every machine that clones the project: the hook setting is local to each clone.
// Usage: node setup-project.mjs <project> [--include design,architecture,runbook] [--update]
// Exit code 1 means something still needs attention; read the ACTION lines.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const assets = path.join(assetRoot, 'project');
const OPTIONAL = ['design', 'architecture', 'runbook'];
const HOOKS = ['.githooks/pre-commit', '.githooks/pre-push'];
// Files that --update may replace, but only when nobody changed them.
const KIT_OWNED = ['.ai-kit/scan-secrets.sh', ...HOOKS];
const SECRET_SAMPLES = ['.env', '.env.local', '.env.production'];
const IGNORE_LINES = ['.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template'];

function stop(message) {
    console.error(message);
    process.exit(1);
}

let target = '';
let update = false;
const extras = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--update') update = true;
    else if (args[i] === '--include') {
        extras.push(...(args[++i] ?? '').split(','));
        while (OPTIONAL.includes(args[i + 1])) extras.push(args[++i]);
    } else if (args[i].startsWith('--') || target) stop(`Unexpected argument: ${args[i]}`);
    else target = args[i];
}
if (!target) stop('Usage: node setup-project.mjs <project> [--include design,architecture,runbook] [--update]');
const project = path.resolve(target);
if (!fs.statSync(project, { throwIfNoEntry: false })?.isDirectory()) stop(`Not a folder: ${project}`);
const chosen = extras.map((e) => e.trim().toLowerCase()).filter(Boolean);
for (const extra of chosen) if (!OPTIONAL.includes(extra)) stop(`Unknown --include value: ${extra}`);

let problems = 0;
function action(...lines) {
    problems++;
    console.log(`ACTION: ${lines.join('\n        ')}`);
}
function finish() {
    if (problems > 0) {
        console.log(`Setup is not complete: ${problems} item(s) need attention.`);
        process.exit(1);
    }
    process.exit(0);
}

const files = [
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md',
    'docs/PLAN.md', 'docs/PROGRESS.md', 'docs/DECISIONS.md', 'docs/LESSONS.md',
    '.ai-kit/scan-secrets.sh', '.ai-kit/checks.sh',
    ...HOOKS,
    '.github/workflows/ai-kit-checks.yml',
    ...chosen.map((extra) => `docs/${extra.toUpperCase()}.md`),
];

const normalized = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const fingerprint = (file) => createHash('sha256').update(normalized(file)).digest('hex');
const released = new Set(
    fs.readFileSync(path.join(assetRoot, 'known-versions.txt'), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(/\s+/).slice(0, 2).join(' ')),
);

for (const relative of files) {
    const destination = path.join(project, relative);
    const source = path.join(assets, relative);
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
        console.log(`created       : ${relative}`);
    } else if (!update || !KIT_OWNED.includes(relative) || normalized(source) === normalized(destination)) {
        console.log(`kept existing : ${relative}`);
    } else if (released.has(`${fingerprint(destination)} ${relative}`)) {
        fs.copyFileSync(source, destination);
        console.log(`replaced      : ${relative} (was an unchanged older version; review and commit)`);
    } else {
        action(`${relative} was customized, so it was NOT updated. Merge the new version by hand:`, source);
    }
}

function addMissingLines(name, lines) {
    const file = path.join(project, name);
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const existing = new Set(text.split(/\r?\n/).map((line) => line.trim()));
    const missing = lines.filter((line) => !existing.has(line));
    if (missing.length === 0) return;
    if (text && !text.endsWith('\n')) text += '\n';
    fs.writeFileSync(file, text + missing.join('\n') + '\n', 'utf8');
    console.log(`updated       : ${name} (+${missing.length} lines)`);
}

// Later "!" lines must stay after the ignore patterns.
addMissingLines('.gitignore', IGNORE_LINES);
// Shell scripts break with Windows line endings.
addMissingLines('.gitattributes', ['.githooks/* text eol=lf', '.ai-kit/*.sh text eol=lf']);

if (!fs.existsSync(path.join(project, '.git'))) {
    console.log('ACTION: this folder has no git repository of its own. Run "git init", then run this script again');
    console.log('        to enable the hooks and to verify that secret files are ignored.');
    finish();
}

const git = (...parameters) => spawnSync('git', ['-C', project, ...parameters], { encoding: 'utf8' });

// Lines being present is not enough: a later "!" rule can expose a secret file again.
// The user's global excludes are switched off because other machines will not have them.
const noGlobalExcludes = `core.excludesFile=${path.join(os.tmpdir(), 'ai-kit-no-global-excludes')}`;
const exposed = () => SECRET_SAMPLES.filter((name) => {
    const result = git('-c', noGlobalExcludes, 'check-ignore', '--no-index', '-q', '--', name);
    if (result.status !== 0 && result.status !== 1) stop(`git check-ignore failed: ${result.stderr}`);
    return result.status === 1;
});
if (exposed().length > 0) {
    const file = path.join(project, '.gitignore');
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, `${text}${text.endsWith('\n') ? '' : '\n'}# ai-kit: keep these last so earlier rules cannot expose secret files\n${IGNORE_LINES.join('\n')}\n`);
    console.log('updated       : .gitignore (an earlier rule exposed secret files)');
}
if (exposed().length > 0) action(`git still does not ignore: ${exposed().join(', ')}. Fix the ignore rules.`);

const tracked = git('ls-files', '-z');
if (tracked.status !== 0) stop('git ls-files failed.');
const trackedSecrets = tracked.stdout.split('\0').filter((name) => {
    const base = name.split('/').pop();
    return /^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base);
});
if (trackedSecrets.length > 0) {
    action(`secret files are already tracked by git, so ignoring them has no effect: ${trackedSecrets.join(', ')}`,
        'Ask the user, then "git rm --cached <file>" and commit. Real secrets stay in history: rotate them.');
}

const current = git('config', '--get', 'core.hooksPath').stdout?.trim();
const hooksResult = git('rev-parse', '--git-path', 'hooks');
if (hooksResult.status !== 0) stop('git failed; hooks are NOT enabled.');
const hooksDir = path.resolve(project, hooksResult.stdout.trim());
const ownHooks = fs.existsSync(hooksDir) && current !== '.githooks'
    ? fs.readdirSync(hooksDir).filter((name) => !name.endsWith('.sample'))
    : [];

if (current !== '.githooks' && (current || ownHooks.length > 0 || fs.existsSync(path.join(project, '.husky')))) {
    console.log('ACTION: this project already has git hooks, so they were not replaced.');
    console.log('        Add "sh .ai-kit/scan-secrets.sh --staged" to pre-commit, and');
    console.log('        \'sh .ai-kit/scan-secrets.sh --pre-push "$1"\' to pre-push.');
    finish();
}

// macOS and Linux silently ignore hooks that are not executable.
for (const hook of HOOKS) fs.chmodSync(path.join(project, hook), 0o755);
const marked = git('update-index', '--add', '--chmod=+x', '--', ...HOOKS);
if (marked.status !== 0) stop(`Could not mark the hooks executable; hooks are NOT enabled.\n${marked.stderr}`);
console.log('hooks         : staged as executable');

if (current !== '.githooks') {
    if (git('config', 'core.hooksPath', '.githooks').status !== 0) stop('git config failed; hooks are NOT enabled.');
}
console.log('hooks         : enabled (core.hooksPath=.githooks)');
console.log('NOTE: run this script again after cloning the project on another machine.');
if (fs.readFileSync(path.join(project, '.ai-kit/checks.sh'), 'utf8').includes('not configured')) {
    console.log('NOTE: fill .ai-kit/checks.sh; until then CI fails on purpose.');
}
finish();
