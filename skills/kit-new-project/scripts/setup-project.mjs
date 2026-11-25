#!/usr/bin/env node
// Adds the ai-kit files to a project and enables the secret-scan hooks. Never overwrites a file.
// Run it once on every machine that clones the project: the hook setting is local to each clone.
// Usage: node setup-project.mjs <project> [--include design,architecture,runbook]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'project');
const OPTIONAL = ['design', 'architecture', 'runbook'];
const HOOKS = ['.githooks/pre-commit', '.githooks/pre-push'];

function stop(message) {
    console.error(message);
    process.exit(1);
}

let target = '';
const extras = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--include') {
        extras.push(...(args[++i] ?? '').split(','));
        while (OPTIONAL.includes(args[i + 1])) extras.push(args[++i]);
    } else if (args[i].startsWith('--') || target) stop(`Unexpected argument: ${args[i]}`);
    else target = args[i];
}
if (!target) stop('Usage: node setup-project.mjs <project> [--include design,architecture,runbook]');
const project = path.resolve(target);
if (!fs.statSync(project, { throwIfNoEntry: false })?.isDirectory()) stop(`Not a folder: ${project}`);
const chosen = extras.map((e) => e.trim().toLowerCase()).filter(Boolean);
for (const extra of chosen) if (!OPTIONAL.includes(extra)) stop(`Unknown --include value: ${extra}`);

const files = [
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md',
    'docs/PLAN.md', 'docs/PROGRESS.md', 'docs/DECISIONS.md', 'docs/LESSONS.md',
    '.ai-kit/scan-secrets.sh', '.ai-kit/checks.sh',
    ...HOOKS,
    '.github/workflows/ai-kit-checks.yml',
    ...chosen.map((extra) => `docs/${extra.toUpperCase()}.md`),
];

for (const relative of files) {
    const destination = path.join(project, relative);
    if (fs.existsSync(destination)) {
        console.log(`kept existing : ${relative}`);
        continue;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(assets, relative), destination);
    console.log(`created       : ${relative}`);
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
addMissingLines('.gitignore', ['.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template']);
// Shell scripts break with Windows line endings.
addMissingLines('.gitattributes', ['.githooks/* text eol=lf', '.ai-kit/*.sh text eol=lf']);

if (!fs.existsSync(path.join(project, '.git'))) {
    console.log('ACTION: not a git repository. Run "git init", then run this script again to enable the hooks.');
    process.exit(0);
}

const git = (...parameters) => spawnSync('git', ['-C', project, ...parameters], { encoding: 'utf8' });
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
    process.exit(0);
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
console.log('NOTE: fill .ai-kit/checks.sh; until then CI fails on purpose.');
