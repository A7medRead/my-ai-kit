#!/usr/bin/env node
// Lets only one session work on a task: the first claim wins, every later one is refused.
// Usage: node claim-task.mjs claim <project> <task-id> <tool>
//        node claim-task.mjs release <project> <task-id> <tag | --user-approved>
//        node claim-task.mjs list <project>
// Exit codes: 0 done, 1 refused, 2 wrong use or not a repository.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const USAGE = 'usage: claim-task.mjs claim <project> <task-id> <tool> | release <project> <task-id> <tag|--user-approved> | list <project>';
const [command, target, rawTask, value] = process.argv.slice(2);

function stop(code, message) {
    console.error(message);
    process.exit(code);
}
if (!['claim', 'release', 'list'].includes(command) || !target) stop(2, USAGE);

// The common git folder is shared by every worktree and never committed.
const found = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: path.resolve(target), encoding: 'utf8' });
if (found.status !== 0) stop(2, `claim task: not a git repository: ${path.resolve(target)}`);
const folder = path.join(path.resolve(target, found.stdout.trim()), 'ai-kit', 'claims');

const describe = (claim) => `${claim.task} is claimed by ${claim.tool} since ${claim.since} (#${claim.tag}) in ${claim.worktree}`;
const readClaim = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        // Another session may be writing it right now: the task is taken either way.
        return { task: path.basename(file, '.json'), tool: 'an unreadable claim', since: 'unknown', tag: 'unknown', worktree: 'unknown' };
    }
};

if (command === 'list') {
    const names = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith('.json')) : [];
    for (const name of names) console.log(describe(readClaim(path.join(folder, name))));
    if (names.length === 0) console.log('no claimed tasks');
    process.exit(0);
}

// The ID becomes a file name, and "t-1" and "T-1" are the same task.
const task = rawTask?.replace(/^\[|\]$/g, '').toUpperCase();
if (!task || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(task) || !value) stop(2, USAGE);
const file = path.join(folder, `${task}.json`);

if (command === 'claim') {
    const now = new Date();
    const pad = (number) => String(number).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const claim = {
        task,
        tool: value,
        since: `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        tag: randomBytes(3).toString('hex'),
        worktree: path.resolve(target),
    };
    fs.mkdirSync(folder, { recursive: true });
    try {
        // "wx" creates the file only when it does not exist, in one step: two sessions cannot both win.
        fs.writeFileSync(file, `${JSON.stringify(claim)}\n`, { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const holder = readClaim(file);
        stop(1, `REFUSED: ${holder ? describe(holder) : `${task} was just released, claim it again`}.\n`
            + 'Continue only if this conversation made that claim. Otherwise change nothing and ask the user.');
    }
    console.log(`CLAIMED: ${task} #${claim.tag}`);
    console.log(`Write in docs/PLAN.md: In progress: ${task} · ${value} · ${claim.since} · #${claim.tag}`);
    process.exit(0);
}

const holder = readClaim(file);
if (!holder) {
    console.log(`${task} is not claimed`);
    process.exit(0);
}
if (value !== '--user-approved' && value.replace(/^#/, '') !== holder.tag) {
    stop(1, `REFUSED: ${describe(holder)}. Releasing another session's claim needs the user's approval.`);
}
fs.rmSync(file);
console.log(`RELEASED: ${task}`);
