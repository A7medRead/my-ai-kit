#!/usr/bin/env node
// Compares what AI sessions said and did, using the transcripts the tools keep on this machine.
// Usage: node session-audit.mjs <project> [--since YYYY-MM-DD] [--wait seconds] [--home dir]
// Read only. Reads Codex and Claude Code transcripts. Neither format is a published interface,
// so unknown records are skipped and a session that yields nothing is reported as unreadable.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const USAGE = 'usage: session-audit.mjs <project> [--since YYYY-MM-DD] [--wait seconds] [--home dir]';
const options = { wait: '120', home: os.homedir(), since: '' };
let target = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    const name = args[i].replace(/^--/, '');
    if (args[i].startsWith('--') && Object.hasOwn(options, name) && args[i + 1]) options[name] = args[++i];
    else if (!args[i].startsWith('--') && !target) target = args[i];
    else { console.error(USAGE); process.exit(2); }
}
const wait = Number(options.wait);
if (!target || !Number.isFinite(wait) || (options.since && Number.isNaN(Date.parse(options.since)))) {
    console.error(USAGE);
    process.exit(2);
}
const project = path.resolve(target);
const git = (...parameters) => spawnSync('git', ['-C', project, ...parameters], { encoding: 'utf8' });
if (git('rev-parse', '--show-toplevel').status !== 0) {
    console.error(`session audit: not a git repository: ${project}`);
    process.exit(2);
}

const normal = (folder) => path.resolve(folder).replace(/\\/g, '/').toLowerCase();
const inProject = (folder) => Boolean(folder) && (normal(folder) === normal(project) || normal(folder).startsWith(`${normal(project)}/`));
const short = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 110);
const clock = (time) => new Date(time).toLocaleString('sv-SE').slice(0, 16);

function walk(folder) {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) return entry.name === 'subagents' ? [] : walk(full);
        return entry.name.endsWith('.jsonl') ? [full] : [];
    });
}
function records(file) {
    // The last line of a running or crashed session may be half written.
    return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => {
        try { return line ? [JSON.parse(line)] : []; } catch { return []; }
    });
}

function readCodex(file, rows) {
    const meta = rows.find((row) => row.type === 'session_meta')?.payload;
    // Sub-agents record an object here; their work belongs to the session that started them.
    if (!meta || typeof meta.source !== 'string' || !inProject(meta.cwd)) return null;
    const events = [];
    const calls = new Map();
    for (const row of rows) {
        const item = row.payload ?? {};
        const time = Date.parse(row.timestamp);
        if (item.type === 'message' && (item.role === 'user' || item.role === 'assistant')) {
            const text = (item.content ?? []).map((part) => part.text ?? '').join('\n');
            // Text the app injects in the user's name starts with a tag or the instructions heading.
            if (item.role === 'user' && /^\s*(<|# AGENTS)/.test(text)) continue;
            if (text.trim()) events.push({ time, kind: item.role === 'user' ? 'user' : 'say', text });
        } else if (item.type === 'custom_tool_call' || item.type === 'function_call') {
            const input = String(item.input ?? item.arguments ?? '');
            const files = [...input.matchAll(/\*\*\* (?:Add|Update|Delete) File: ((?:(?!\\n|\n|"|`).)+)/g)].map((m) => m[1].trim());
            if (files.length) events.push({ time, kind: 'write', files });
            for (const m of input.matchAll(/\bcmd["']?\s*:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs)) {
                const command = { time, kind: 'command', text: m[2].replace(/\\n/g, '\n').replace(/\\(["'`\\])/g, '$1'), failed: false };
                events.push(command);
                calls.set(item.call_id, [...(calls.get(item.call_id) ?? []), command]);
            }
        } else if (item.type?.endsWith('_output') && calls.has(item.call_id)) {
            const output = JSON.stringify(item.output ?? '');
            // One call may run several commands; the exit codes cannot be told apart.
            const failed = /exit_code[\\"]*:\s*[1-9]/.test(output) || output.includes('Script failed');
            for (const command of calls.get(item.call_id)) command.failed = failed;
        } else if (item.type === 'task_complete') events.push({ time, kind: 'end' });
    }
    return { tool: 'codex', events };
}

function readClaude(file, rows) {
    // The folder the session started in. A session may visit other folders later.
    if (!inProject(rows.find((row) => row.cwd)?.cwd)) return null;
    const events = [];
    const calls = new Map();
    const heard = [];
    const hear = (time, text) => {
        if (!text?.trim() || /^\s*(<|\[Request interrupted)/.test(text)) return;
        // A message typed during a turn is recorded when queued and again when delivered.
        if (heard.some((old) => old.text === text && time - old.time < 10 * 60e3)) return;
        heard.push({ time, text });
        events.push({ time, kind: 'user', text });
    };
    for (const row of rows) {
        const time = Date.parse(row.timestamp);
        if (row.type === 'queue-operation' && typeof row.content === 'string') hear(time, row.content);
        const content = row.message?.content;
        if (row.type === 'user' && !row.isMeta && !row.isSidechain) {
            if (typeof content === 'string') hear(time, content);
            else for (const part of content ?? []) {
                if (part.type === 'text') hear(time, part.text);
                if (part.type === 'tool_result' && calls.has(part.tool_use_id)) calls.get(part.tool_use_id).failed = part.is_error === true;
            }
        }
        if (row.type !== 'assistant' || row.isSidechain || !Array.isArray(content)) continue;
        for (const part of content) {
            if (part.type === 'text' && part.text.trim()) events.push({ time, kind: 'say', text: part.text });
            if (part.type !== 'tool_use') continue;
            if (part.name === 'Bash' || part.name === 'PowerShell') {
                const command = { time, kind: 'command', text: String(part.input.command ?? ''), failed: false };
                calls.set(part.id, command);
                events.push(command);
            }
            if (part.name === 'Write' || part.name === 'Edit') events.push({ time, kind: 'write', files: [String(part.input.file_path)] });
        }
        if (row.message.stop_reason === 'end_turn') events.push({ time, kind: 'end' });
    }
    return { tool: 'claude', events };
}

const since = options.since ? Date.parse(options.since) : 0;
const sessions = [];
for (const [folder, reader] of [[['.codex', 'sessions'], readCodex], [['.claude', 'projects'], readClaude]]) {
    for (const file of walk(path.join(options.home, ...folder))) {
        if (fs.statSync(file).mtimeMs < since) continue;
        const rows = records(file);
        const session = reader(file, rows);
        if (!session) continue;
        session.events.sort((a, b) => a.time - b.time);
        session.id = path.basename(file, '.jsonl').slice(-12);
        session.kit = /Kit version: (\d+\.\d+\.\d+)/.exec(rows.map((row) => JSON.stringify(row)).join('\n'))?.[1];
        session.start = session.events[0]?.time ?? Date.parse(rows[0]?.timestamp);
        sessions.push(session);
    }
}
sessions.sort((a, b) => a.start - b.start);

const relative = (file) => {
    const full = normal(path.isAbsolute(file) ? file : path.join(project, file));
    return full.startsWith(`${normal(project)}/`) ? full.slice(normal(project).length + 1) : null;
};
const CHECK = /checks\.sh|\bnpm (run )?(test|lint|typecheck|build|format:check)|test-kit\.mjs|\bnode --test\b|\bpytest\b|\b(cargo|go|dotnet) test\b/;
const CLAIM_PASSED = /(الفحوص|الفحوصات|الاختبارات|\bchecks?\b|\btests?\b|Tested)[^\n]{0,90}(نجح|نجحت|نجاح|\bpass(ed)?\b)|(نجحت?|\bpassed\b)[^\n]{0,60}(الفحوص|الفحوصات|الاختبارات|\bchecks\b|\btests\b)/i;
const NOT_DONE = /\bnone\b|\bno\b|مفيش|لم يتم|لم |ماتعمل|ما اتعمل|بدون|من غير/i;
// Actions the core rules keep for an explicit request, and the words such a request uses.
const SENSITIVE = [
    ['merge into main', /git[^\n;&|]*\b(switch|checkout) (main|master)\b[\s\S]*git[^\n;&|]*\bmerge\b|gh pr merge/, /merge|ادمج|دمج/i],
    ['push to main', /git[^\n;&|]*\bpush\b[^\n;&|]*\b(main|master)\b/, /push|ارفع|رفع/i],
    ['force push or history rewrite', /git[^\n;&|]*\bpush\b[^\n;&|]*(--force|\s-f\b)|git[^\n;&|]*\breset --hard/, /force|reset|امسح|ارجع/i],
    ['database reset', /\bdb:reset\b|\bdb reset\b/, /reset|امسح|صفّر/i],
    ['kit install', /install\.mjs[^\n;&|]*--apply/, /install|ثبت|ثبّت/i],
];

function review(session) {
    const found = [];
    const add = (level, time, text) => found.push({ level, time, text });
    const { events } = session;
    const commands = events.filter((e) => e.kind === 'command');
    const said = events.filter((e) => e.kind === 'say');
    const asked = events.filter((e) => e.kind === 'user');

    for (const message of asked) {
        const answer = events.find((e) => e.time >= message.time && (e.kind === 'say' || e.kind === 'end'));
        const seconds = answer ? Math.round((answer.time - message.time) / 1000) : null;
        // Waiting for the user to allow a command looks the same here, so this is only a suspicion.
        if (seconds > wait) add('SUSPECT', message.time, `no reply for ${seconds}s after: "${short(message.text)}"`);
    }

    const reported = new Set();
    for (const reply of said) {
        for (const line of reply.text.split('\n')) {
            // Report lines start with the capitalised label; sentences about committing do not.
            const commit = /^[\s*•>-]*[`*]*Commit\b[`*]*\s*(.*)$/.exec(line);
            if (!commit || reported.has(line)) continue;
            reported.add(line);
            const hash = /\b[0-9a-f]{7,40}\b/.exec(commit[1])?.[0];
            if (hash && git('cat-file', '-e', `${hash}^{commit}`).status !== 0) add('SUSPECT', reply.time, `the reply names commit ${hash}, which is not in this repository (it may belong to another)`);
            else if (!hash && !NOT_DONE.test(commit[1])) add('FAIL', reply.time, `Commit line without a hash or "none": "${short(line)}"`);
        }
        if (!CLAIM_PASSED.test(reply.text)) continue;
        const before = commands.filter((c) => c.time <= reply.time && CHECK.test(c.text));
        if (!before.length) add('SUSPECT', reply.time, 'the reply says checks passed, but this session ran no known check command before it');
        else if (before.at(-1).failed) add('SUSPECT', reply.time, `the reply says checks passed after a failed run: "${short(before.at(-1).text)}"`);
    }

    const claimsScan = said.find((r) => /(فحص الأسرار|secret scan)[^\n]{0,60}(نجح|نضيف|passed|clean)|(نجح|passed)[^\n]{0,40}(فحص الأسرار|secret scan)/i.test(r.text));
    if (claimsScan && !commands.some((c) => c.time <= claimsScan.time && /scan-secrets|checks\.sh|git[^\n]*\bcommit\b/.test(c.text))) {
        add('SUSPECT', claimsScan.time, 'the reply says the secret scan passed, but no scan, checks or commit ran in this session');
    }

    for (const [name, pattern, request] of SENSITIVE) {
        const run = commands.find((c) => pattern.test(c.text));
        if (run && !asked.some((m) => m.time <= run.time && request.test(m.text))) {
            add('SUSPECT', run.time, `${name} without a message asking for it in this session: "${short(run.text)}"`);
        }
    }

    const task = asked.map((m) => /\bT-\d{3,}\b/.exec(m.text)?.[0]).find(Boolean);
    const firstWrite = events.find((e) => e.kind === 'write' && e.files.some((f) => relative(f)));
    const [major, minor, patch] = (session.kit ?? '0.0.0').split('.').map(Number);
    const hasClaims = major > 0 || minor > 4 || (minor === 4 && patch >= 12);
    if (task && firstWrite && hasClaims && !commands.some((c) => c.time <= firstWrite.time && /claim-task\.mjs\W+claim/.test(c.text))) {
        add('FAIL', firstWrite.time, `changed files for ${task} without claiming the task first`);
    }
    session.task = task;
    return found;
}

for (const session of sessions) session.found = review(session);

// Two writers: one session changes a file that another changed within ten minutes while that other
// session was still in the middle of its turn. After a finished turn it is a handover.
const RECENT = 10 * 60e3;
const stillWorking = (session, from, to) => session.events.at(-1).time > to
    && !session.events.some((e) => e.kind === 'end' && e.time >= from && e.time <= to);
for (const [index, first] of sessions.entries()) {
    for (const second of sessions.slice(index + 1)) {
        const history = new Map();
        for (const session of [first, second]) {
            for (const event of session.events.filter((e) => e.kind === 'write')) {
                for (const name of event.files.map(relative).filter(Boolean)) {
                    history.set(name, [...(history.get(name) ?? []), { session, time: event.time }]);
                }
            }
        }
        const shared = [];
        let when;
        for (const [name, writes] of history) {
            writes.sort((a, b) => a.time - b.time);
            const clash = writes.find((write, i) => {
                const before = writes[i - 1];
                return before && before.session !== write.session && write.time - before.time <= RECENT
                    && stillWorking(before.session, before.time, write.time);
            });
            if (clash) {
                shared.push(name);
                when = Math.min(when ?? clash.time, clash.time);
            }
        }
        if (shared.length) {
            second.found.push({ level: 'FAIL', time: when, text: `wrote the same files as session ${first.id} at the same time: ${shared.slice(0, 5).join(', ')}` });
        }
    }
}

const totals = { FAIL: 0, SUSPECT: 0 };
for (const session of sessions) {
    console.log(`\n== ${session.tool} ${clock(session.start)} · session ${session.id} · kit ${session.kit ?? 'unknown'}${session.task ? ` · ${session.task}` : ''}`);
    if (!session.events.length) console.log('  UNKNOWN  no readable records: the transcript format may have changed');
    else if (!session.found.length) console.log('  no problem found by these checks');
    for (const finding of session.found.sort((a, b) => a.time - b.time)) {
        totals[finding.level]++;
        console.log(`  ${finding.level.padEnd(8)} ${clock(finding.time).slice(11)}  ${finding.text}`);
    }
}
console.log(`\n${sessions.length} session(s) read: ${totals.FAIL} failed, ${totals.SUSPECT} suspected.`);
console.log('Not judged from transcripts: whether product decisions were put to the user, whether design differences were all shown, how a design looks, and other statements in replies.');
