#!/usr/bin/env node
// Creates the private taste library inside the kit folder. Never overwrites a file.
// Usage: node init-taste.mjs <kit folder>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'taste');

function stop(message) {
    console.error(message);
    process.exit(1);
}

const argument = process.argv[2];
if (!argument) stop('Usage: node init-taste.mjs <kit folder>');
const kit = path.resolve(argument);
if (!fs.existsSync(path.join(kit, 'AGENTS.md'))) stop(`Not the kit folder (no AGENTS.md): ${kit}`);

// The library holds personal preferences and third-party screenshots, so the kit must not publish it.
const ignoreFile = path.join(kit, '.gitignore');
let ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8') : '';
if (!ignore.split(/\r?\n/).includes('/taste/')) {
    if (ignore && !ignore.endsWith('\n')) ignore += '\n';
    fs.writeFileSync(ignoreFile, `${ignore}/taste/\n`);
    console.log('updated : .gitignore (+/taste/)');
}

const library = path.join(kit, 'taste');
fs.mkdirSync(path.join(library, 'items'), { recursive: true });
for (const name of ['principles.md', 'index.md']) {
    const target = path.join(library, name);
    if (fs.existsSync(target)) console.log(`kept    : taste/${name}`);
    else {
        fs.copyFileSync(path.join(assets, name), target);
        console.log(`created : taste/${name}`);
    }
}

if (!fs.existsSync(path.join(library, '.git'))) {
    const result = spawnSync('git', ['-C', library, 'init', '--quiet', '-b', 'main'], { encoding: 'utf8' });
    if (result.status !== 0) stop(`git init failed in the library: ${result.stderr ?? result.error?.message}`);
    console.log('created : separate git repository in taste/ (no remote)');
}
console.log('NOTE: if you publish it, use a private repository.');
