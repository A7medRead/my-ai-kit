#!/usr/bin/env node
// Connects the kit to Claude Code, Codex, Gemini CLI / Antigravity and GitHub Copilot.
// Works on macOS, Windows and Linux (Node 18+). Without --apply it only shows what would change.
// Existing instruction files keep their content: the kit owns only its marked block,
// and a backup is written before any change.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = path.dirname(fileURLToPath(import.meta.url));
const MARKER = '.ai-kit-managed';
const START = '<!-- ai-kit:start';
const END = '<!-- ai-kit:end -->';
const ALL = ['claude', 'codex', 'gemini', 'copilot'];

function usage(message) {
    console.error(message);
    console.error('Usage: node install.mjs [--apply] [--uninstall] [--force] [--tools claude,codex,gemini,copilot] [--home <dir>]');
    process.exit(2);
}

let apply = false;
let uninstall = false;
let force = false;
let tools = ALL;
let homeArg = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    const value = () => inline ?? args[++i] ?? usage(`Missing value for ${flag}`);
    if (flag === '--apply') apply = true;
    else if (flag === '--uninstall') uninstall = true;
    else if (flag === '--force') force = true;
    else if (flag === '--home') homeArg = path.resolve(value());
    else if (flag === '--tools') {
        tools = [...new Set(value().split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
        // PowerShell splits "a,b" into separate arguments, so accept following tool names too.
        while (ALL.includes(args[i + 1])) tools.push(args[++i]);
    } else usage(`Unknown option: ${flag}`);
}
for (const tool of tools) if (!ALL.includes(tool)) usage(`Unknown tool: ${tool}`);

// An explicit --home (used for testing) ignores the tools' environment overrides.
const useEnv = !homeArg;
const home = homeArg || os.homedir();
const toolHome = (variable, fallback) => (useEnv && process.env[variable]) || path.join(home, fallback);

if (apply && !uninstall && useEnv && !force && /scratch-workspaces|[\\/]Temp[\\/]|^(\/private)?\/(tmp|var\/folders)\//i.test(kit)) {
    console.error(`The kit is in a temporary folder (${kit}). Move it to a permanent folder first.`);
    process.exit(1);
}

const claudeHome = toolHome('CLAUDE_CONFIG_DIR', '.claude');
const codexHome = toolHome('CODEX_HOME', '.codex');
const copilotHome = toolHome('COPILOT_HOME', '.copilot');
const geminiHome = path.join(home, '.gemini');
const sharedSkills = path.join(home, '.agents', 'skills');

const instructionFiles = {
    claude: path.join(claudeHome, 'CLAUDE.md'),
    codex: path.join(codexHome, 'AGENTS.md'),
    gemini: path.join(geminiHome, 'GEMINI.md'),
    copilot: path.join(copilotHome, 'copilot-instructions.md'),
};
const skillDirs = {
    claude: [path.join(claudeHome, 'skills')],
    codex: [sharedSkills],
    gemini: [sharedSkills, path.join(geminiHome, 'config', 'skills')],
    copilot: [sharedSkills],
};

let problems = 0;
const say = (status, text) => console.log(`${status.padEnd(10)} ${text}`);
const skip = (text) => { say('SKIPPED', text); problems++; };
const count = (text, part) => text.split(part).length - 1;

function backup(file) {
    const stamp = new Date().toISOString().replace(/\D/g, '');
    let target = `${file}.ai-kit-backup-${stamp}`;
    for (let n = 1; fs.existsSync(target); n++) target = `${file}.ai-kit-backup-${stamp}-${n}`;
    fs.copyFileSync(file, target);
}

function updateInstructions(file) {
    const exists = fs.existsSync(file);
    let old = '';
    if (exists) {
        try {
            old = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
        } catch {
            return skip(`${file} is not UTF-8 text; convert it to UTF-8 first.`);
        }
    }
    const starts = count(old, START);
    const ends = count(old, END);
    const from = old.indexOf(START);
    const to = old.indexOf(END);
    if (!((starts === 0 && ends === 0) || (starts === 1 && ends === 1 && from < to))) {
        return skip(`${file} has damaged ai-kit markers; fix it by hand.`);
    }
    const newline = old.includes('\r\n') ? '\r\n' : '\n';
    let next;

    if (uninstall) {
        if (starts === 0) return;
        const parts = [old.slice(0, from).trimEnd(), old.slice(to + END.length).trimStart()].filter(Boolean);
        next = parts.join(newline + newline);
        if (next) next = next.trimEnd() + newline;
        say('remove', `kit block from ${file}`);
    } else {
        const rules = fs.readFileSync(path.join(kit, 'AGENTS.md'), 'utf8').trim();
        const block = [
            `${START} (managed by install.mjs: edit the kit, not this block) -->`,
            rules,
            '',
            `Kit folder: ${kit}`,
            `Design history: ${path.join(kit, 'design-history.md')}`,
            `Taste library (private): ${path.join(kit, 'taste')}`,
            END,
        ].join('\n').replace(/\r\n/g, '\n').replace(/\n/g, newline);
        if (starts === 1) next = old.slice(0, from) + block + old.slice(to + END.length);
        else if (old.trim()) next = old.trimEnd() + newline + newline + block + newline;
        else next = block + newline;
        if (next === old) return say('unchanged', file);
        say(exists ? 'update' : 'create', file);
        const bytes = Buffer.byteLength(next);
        if (bytes > 24000) say('WARNING', `${file} is ${bytes} bytes; some tools truncate large rule files (Antigravity 24000, Codex 32768).`);
    }

    if (!apply) return;
    if (exists) backup(file);
    if (uninstall && !next) return fs.rmSync(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
}

// "relative-path|sha256" lines for every file in a skill folder.
function manifest(dir) {
    const lines = [];
    const walk = (current, prefix) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(full, relative);
            else if (entry.name !== MARKER && entry.name !== '.DS_Store') {
                lines.push(`${relative}|${createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`);
            }
        }
    };
    walk(dir, '');
    return lines.sort().join('\n');
}

function updateSkill(name, root) {
    const source = path.join(kit, 'skills', name);
    const target = path.join(root, name);
    const inKit = fs.existsSync(source);
    const stat = fs.lstatSync(target, { throwIfNoEntry: false });
    let actual;

    if (stat) {
        const markerFile = path.join(target, MARKER);
        if (stat.isSymbolicLink() || !fs.existsSync(markerFile)) {
            return skip(`${target} exists and was not installed by this kit.`);
        }
        const recorded = fs.readFileSync(markerFile, 'utf8').split(/\r?\n/).filter(Boolean).join('\n');
        actual = manifest(target);
        if (recorded !== actual && !force) {
            return skip(`${target} was edited by hand. Copy your edits into the kit, or use --force.`);
        }
    }

    if (uninstall || !inKit) {
        if (!stat) return;
        say('remove', target);
        if (apply) fs.rmSync(target, { recursive: true, force: true });
        return;
    }

    if (stat && manifest(source) === actual) return say('unchanged', target);
    say(stat ? 'update' : 'create', target);
    if (!apply) return;
    if (stat) fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    fs.writeFileSync(path.join(target, MARKER), manifest(target) + '\n', 'utf8');
}

if (!apply) console.log('PREVIEW ONLY - nothing will change. Add --apply to make these changes.');

for (const tool of tools) updateInstructions(instructionFiles[tool]);

let roots = [...new Set(tools.flatMap((tool) => skillDirs[tool]))];
if (uninstall) {
    const stillUsing = ['codex', 'gemini', 'copilot'].filter((t) => !tools.includes(t));
    if (roots.includes(sharedSkills) && stillUsing.length > 0) {
        roots = roots.filter((root) => root !== sharedSkills);
        say('kept', `${sharedSkills} (still used by: ${stillUsing.join(', ')})`);
    }
}

const kitSkills = fs.readdirSync(path.join(kit, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
for (const root of roots) {
    // Includes skills installed earlier that were since removed from the kit.
    const installed = fs.existsSync(root)
        ? fs.readdirSync(root).filter((n) => n.startsWith('kit-') && fs.existsSync(path.join(root, n, MARKER)))
        : [];
    for (const name of [...new Set([...kitSkills, ...installed])].sort()) updateSkill(name, root);
}

const override = path.join(codexHome, 'AGENTS.override.md');
if (tools.includes('codex') && fs.existsSync(override) && fs.statSync(override).size > 0) {
    say('WARNING', `${override} exists, so Codex ignores AGENTS.md in that folder.`);
}

if (problems > 0) {
    console.log(`Finished with ${problems} skipped item(s). Read the SKIPPED lines.`);
    process.exit(1);
}
console.log('Finished.');
