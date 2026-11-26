#!/usr/bin/env node
// Prints the Commit and Pushed lines of the delivery report from git, so neither is written from memory.
// Usage: node delivery-facts.mjs [project] [task-id | commit-hash | HEAD]
// Read only: it never fetches, stages or commits.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [target = '.', wanted] = process.argv.slice(2);
const isCommit = /^(HEAD|[0-9a-f]{7,40})$/i.test(wanted ?? '');
const task = isCommit ? undefined : wanted?.replace(/^\[|\]$/g, '');
const cwd = path.resolve(target);

function git(...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

const status = git('status', '--porcelain', '--untracked-files=all');
if (!status.ok) {
    console.error(`delivery facts: cannot read a git work tree at ${cwd}`);
    process.exit(2);
}
const dirty = status.out ? status.out.split('\n').length : 0;
const files = `${dirty} ${dirty === 1 ? 'file' : 'files'}`;
const branch = git('branch', '--show-current').out || 'a detached HEAD';
const hasRemote = git('remote').out !== '';
const log = git('log', '--format=%h%x09%s', 'HEAD');

// "none" states a fact. When git cannot tell which commit is this delivery, the answer is "unknown".
let hash;
let missing;
if (!log.ok) missing = 'none (no commits yet)';
else if (isCommit) {
    const named = git('rev-parse', '--verify', '--quiet', '--short', `${wanted}^{commit}`);
    if (named.ok && git('merge-base', '--is-ancestor', named.out, 'HEAD').ok) hash = named.out;
    else missing = `unknown (${wanted} is not a commit on ${branch})`;
} else if (task) {
    hash = log.out.split('\n').map((line) => line.split('\t')).find(([, subject]) => subject.includes(`[${task}]`))?.[0];
    if (!hash) missing = `none (no commit for ${task} on ${branch}${dirty ? `; ${files} not committed` : ''})`;
} else if (dirty) {
    missing = `unknown (${files} not committed, so the last commit may not be this delivery; give its hash or the task ID)`;
} else hash = log.out.split('\t')[0];

const commit = missing ?? `${hash} on ${branch}${dirty ? `; ${files} still not committed` : ''}`;

let pushed;
if (!hash) {
    // Without a remote nothing was pushed, whichever commit is meant.
    if (commit.startsWith('none')) pushed = `no (nothing committed${hasRemote ? '' : '; the repository has no remote'})`;
    else pushed = hasRemote ? 'unknown (name the commit first)' : 'no (the repository has no remote)';
} else if (!hasRemote) pushed = 'no (the repository has no remote)';
else {
    // "origin/HEAD" shortens to the bare remote name, which says nothing about a branch.
    const on = git('branch', '-r', '--contains', hash, '--format=%(refname:short)').out
        .split('\n')
        .filter((name) => name.includes('/') && !name.endsWith('/HEAD'));
    pushed = on.length
        ? `yes (on ${on.join(', ')}, as of the last fetch)`
        : `no (${hash} is not on any remote branch, as of the last fetch)`;
}

console.log(`Commit:      ${commit}`);
console.log(`Pushed:      ${pushed}`);
