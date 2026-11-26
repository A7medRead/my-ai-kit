#!/usr/bin/env node
// Prints the Commit and Pushed lines of the delivery report from git, so neither is written from memory.
// Usage: node delivery-facts.mjs [project] [task-id]
// Read only: it never fetches, stages or commits.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [target = '.', rawTask] = process.argv.slice(2);
const task = rawTask?.replace(/^\[|\]$/g, '');
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
const commits = log.ok ? log.out.split('\n').map((line) => line.split('\t')) : [];
// Without a task ID the last commit is only certain to be this delivery when nothing is left over.
const found = task ? commits.find(([, subject]) => subject.includes(`[${task}]`)) : dirty ? undefined : commits[0];
const hash = found?.[0];

let commit;
if (hash) commit = `${hash} on ${branch}${dirty ? `; ${files} still not committed` : ''}`;
else if (!log.ok) commit = 'none (no commits yet)';
else if (task) commit = `none (no commit for ${task} on ${branch}${dirty ? `; ${files} not committed` : ''})`;
else commit = `none (${files} not committed; give the task ID to find its commit)`;

let pushed;
if (!hash) pushed = `no (nothing committed${hasRemote ? '' : '; the repository has no remote'})`;
else if (!hasRemote) pushed = 'no (the repository has no remote)';
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
