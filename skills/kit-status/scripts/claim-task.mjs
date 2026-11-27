#!/usr/bin/env node
// Lets only one session work on a task: the first claim wins, every later one is refused.
// It is an agreement between cooperating sessions, not a security lock: anyone who can write to the
// repository can delete a claim, and "--user-approved" is the caller's word that cannot be verified.
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

const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;
// Agents read this output, so nothing from a file may start a new line or run on at length.
const printable = (text) => String(text).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').slice(0, 200);

const describe = (claim) => claim.tag
    ? `${claim.task} is claimed by ${claim.tool} since ${claim.since} (#${claim.tag}) in ${claim.worktree}`
    : `${claim.task} is claimed, but its claim file cannot be read`;

// Returns null when the task is free. A damaged claim still holds the task and has no tag.
const readClaim = (file) => {
    const task = printable(path.basename(file, '.json'));
    let saved;
    try {
        saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        // Another session may be writing it right now: the task is taken either way.
        return { task, tag: null };
    }
    const valid = /^[0-9a-f]{6}$/.test(saved?.tag) && TOOL_NAME.test(saved.tool)
        && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(saved.since);
    return valid
        ? { task, tool: saved.tool, since: saved.since, tag: saved.tag, worktree: printable(saved.worktree) }
        : { task, tag: null };
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
    if (!TOOL_NAME.test(value)) stop(2, 'claim task: the tool name takes up to 40 letters, digits, spaces, dots, dashes or underscores');
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
// A damaged claim has no tag to match, so only the user's approval releases it.
if (value !== '--user-approved' && value.replace(/^#/, '') !== holder.tag) {
    stop(1, `REFUSED: ${describe(holder)}. Releasing another session's claim needs the user's approval.`);
}
fs.rmSync(file);
console.log(`RELEASED: ${task}`);
