#!/usr/bin/env node
// Collects the real state of a project in one run. Changes nothing except "git fetch".
// Usage: node project-status.mjs [project] [--no-fetch]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const noFetch = args.includes('--no-fetch');
const project = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');

function git(cwd, ...parameters) {
    const result = spawnSync('git', ['-C', cwd, '-c', 'core.quotepath=false', ...parameters], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
    return {
        ok: result.status === 0,
        out: (result.stdout ?? '').trimEnd(),
        err: (result.stderr ?? result.error?.message ?? '').trim(),
    };
}

const top = git(project, 'rev-parse', '--show-toplevel');
if (!top.ok) {
    console.log('Not a git repository: state cannot be verified from history. Inspect the files directly.');
    process.exit(1);
}
const root = top.out;
const section = (title) => console.log(`\n== ${title} ==`);
const show = (result) => {
    if (!result.ok) console.log(`git failed (UNVERIFIED): ${result.err}`);
    else if (result.out) console.log(result.out);
};

section('Remote');
if (noFetch) console.log('fetch skipped: remote state UNVERIFIED');
else if (!git(root, 'remote').out) console.log('no remote configured');
else console.log(git(root, 'fetch', '--all', '--prune', '--quiet').ok ? 'fetched' : 'fetch FAILED: remote state UNVERIFIED');

section('Branch and uncommitted changes');
show(git(root, 'status', '-sb'));

const hasCommits = Number(git(root, 'rev-list', '--all', '--count').out) > 0;
if (!hasCommits) {
    section('History');
    console.log('no commits yet');
} else {
    section('Recent commits (current branch)');
    show(git(root, 'log', '--date=short', '--pretty=%h %ad %an: %s', '-15'));
    section('Branches by latest commit');
    show(git(root, 'for-each-ref', '--sort=-committerdate', '--count=10',
        '--format=%(committerdate:short) %(refname:short) %(upstream:track)', 'refs/heads', 'refs/remotes'));
    section('Stashes');
    show(git(root, 'stash', 'list'));
}

const read = (relative) => {
    const file = path.join(root, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/) : null;
};

section('docs/PLAN.md - current position');
const plan = read('docs/PLAN.md');
if (!plan) console.log('missing');
else {
    let inside = false;
    for (const line of plan) {
        if (/^##\s/.test(line)) inside = /^##\s+Current position/.test(line);
        if (inside && line.trim()) console.log(line);
    }
    if (hasCommits) {
        const planCommit = git(root, 'log', '-1', '--pretty=%H', '--', 'docs/PLAN.md').out;
        if (!planCommit) console.log('WARNING: PLAN.md has never been committed.');
        else {
            const after = git(root, 'log', '--date=short', '--pretty=%h %ad %s', `${planCommit}..HEAD`)
                .out.split('\n').filter(Boolean);
            section(`Commits after PLAN.md was last committed: ${after.length} (possible stale docs)`);
            for (const line of after.slice(0, 20)) console.log(line);
        }
    }
}

section('docs/PROGRESS.md - latest entry');
const progress = read('docs/PROGRESS.md');
if (!progress) console.log('missing');
else {
    let entries = 0;
    for (const line of progress) {
        if (/^##\s/.test(line)) entries++;
        if (entries > 1) break;
        if (entries === 1 && line.trim()) console.log(line);
    }
    if (entries === 0) console.log('no entries');
}
