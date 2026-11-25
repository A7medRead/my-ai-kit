#!/usr/bin/env node
// Checks the measurable design mistakes of a page and saves screenshots for visual review.
// Needs Node 22+ and an installed Chrome, Edge or Chromium (set CHROME_PATH to choose one).
//
// Usage: node design-check.mjs <page.html | http://localhost:...>... [options]
//   --out <dir>            where screenshots go (default: a new temporary folder)
//   --mobile 360x700       small phone size
//   --tablet 768x1024      tablet size
//   --desktop 1280x800     desktop size
//   --before "<js>"        run in the page first, to reach a later state
//   --source <dir> --tokens <file>   report color values written outside the token file
//
// Exit codes: 0 no failures, 1 failures, 2 bad usage, 3 the check could not run (unverified).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage(message) {
    console.error(message);
    console.error('Usage: node design-check.mjs <page>... [--out dir] [--mobile WxH] [--tablet WxH] [--desktop WxH] [--before js] [--source dir --tokens file]');
    process.exit(2);
}

const options = { mobile: '360x700', tablet: '768x1024', desktop: '1280x800' };
const pages = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) pages.push(args[i]);
    else {
        const key = args[i].slice(2);
        if (!['out', 'mobile', 'tablet', 'desktop', 'before', 'source', 'tokens'].includes(key)) usage(`Unknown option: ${args[i]}`);
        options[key] = args[++i] ?? usage(`Missing value for --${key}`);
    }
}
if (pages.length === 0 && !options.source) usage('Give at least one page, or --source.');
if (options.source && !options.tokens) usage('--source needs --tokens.');

function size(text) {
    const match = /^(\d{3,4})x(\d{3,4})$/.exec(text);
    if (!match) usage(`Bad size: ${text}`);
    return { width: Number(match[1]), height: Number(match[2]) };
}

function toUrl(page) {
    if (/^https?:/i.test(page)) {
        const host = new URL(page).hostname;
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) usage(`Only local pages are checked: ${page}`);
        return page;
    }
    const file = path.resolve(page);
    if (!fs.existsSync(file)) usage(`No such file: ${file}`);
    return pathToFileURL(file).href;
}

let failures = 0;
let warnings = 0;

// ---------- Color values outside the token file ----------
const NAMED = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen').split(' ').join('|');
const HEX = '#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\\w-])';
const NAME = `(?<![-\\w.$#@])(?:${NAMED})(?![-\\w(])`;
const FUNCTION = /(?<![-\w])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(\s*(?:[\d.]|from\b)|(?<![-\w])color\(\s*(?:srgb|display-p3|rec2020|a98-rgb|prophoto-rgb|xyz)/i;
const COLOR_PROPERTY = /^(?:--|\$|@)|color|background|border|outline|shadow|fill|stroke|caret|accent|decoration/i;
const TAILWIND = new RegExp('(?<![-\\w])(?:(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-' +
    '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)' +
    '|(?:bg|text|border|ring|fill|stroke)-(?:white|black))(?![\\w-])');
const CODE_PATTERNS = [
    new RegExp(`["'\`]${HEX}["'\`]`, 'i'),
    /-\[(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^\]]*)\]/i,
    new RegExp(`(?:color|background|border|fill|stroke|outline|shadow)[-\\w]*\\s*:\\s*[^;"'\`}]*${HEX}`, 'i'),
    new RegExp(`(?<![-\\w])(?:color|background|backgroundColor|borderColor|border|fill|stroke|stopColor|outlineColor|textDecorationColor|caretColor|accentColor|boxShadow)` +
        `\\s*[:=]\\s*\\{?\\s*["'\`][^"'\`]*(?:${NAME}|${HEX})[^"'\`]*["'\`]`, 'i'),
    // A declaration inside CSS-in-JS template text.
    new RegExp(`^\\s*(?:color|background|background-color|border-color|fill|stroke)\\s*:\\s*(?:${NAMED})\\s*;`, 'i'),
    TAILWIND,
    FUNCTION,
];

// Keeps line breaks so reported line numbers stay correct.
const blank = (text) => text.replace(/[^\n]/g, ' ');
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// Looks only at declaration values, so id selectors such as "#add" are not mistaken for colors.
function styleColors(text) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|\s)\/\/[^\n]*/g, blank);
    const lines = [];
    const parts = clean.split(/([;{}])/);
    let offset = 0;
    for (let i = 0; i < parts.length; i += 2) {
        const segment = parts[i];
        const declaration = parts[i + 1] === '{' ? null : /^(\s*)([-\w$@]+)\s*:([\s\S]*)$/.exec(segment);
        if (declaration) {
            const [, , property, raw] = declaration;
            const value = raw.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, blank);
            const hit = new RegExp(HEX, 'i').exec(value) ?? FUNCTION.exec(value) ??
                (COLOR_PROPERTY.test(property) ? new RegExp(NAME, 'i').exec(value) : null);
            if (hit) lines.push(lineAt(clean, offset + segment.length - raw.length + hit.index));
        }
        offset += segment.length + 1;
    }
    return lines;
}

function codeColors(text) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank)
        // Anchors and selectors such as href="#add" are not colors.
        .replace(/(?:\b(?:href|to|id|htmlFor|aria-[\w-]+)\s*=\s*\{?\s*|\b(?:querySelector(?:All)?|getElementById)\(\s*)["'`]#[\w-]*["'`]/g, blank);
    return clean.split('\n').flatMap((line, index) => (CODE_PATTERNS.some((p) => p.test(line)) ? [index + 1] : []));
}

function checkSource(directory, tokens) {
    const root = path.resolve(directory);
    const tokenFile = path.resolve(tokens);
    if (!fs.existsSync(root)) usage(`No such folder: ${root}`);
    if (!fs.statSync(tokenFile, { throwIfNoEntry: false })?.isFile()) usage(`No such token file: ${tokenFile}`);
    const found = [];
    const walk = (folder) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const full = path.join(folder, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', '.git', '.next', 'dist', 'build', 'coverage'].includes(entry.name)) walk(full);
                continue;
            }
            const style = /\.(css|scss|sass|less)$/i.test(entry.name);
            const markup = /\.(vue|svelte|html)$/i.test(entry.name);
            if (!style && !markup && !/\.([cm]?[jt]sx?)$/i.test(entry.name)) continue;
            if (path.relative(full, tokenFile) === '') continue;
            const text = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
            const lines = new Set(style ? styleColors(text) : codeColors(text));
            if (markup) {
                for (const block of text.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/gi)) {
                    const first = lineAt(text, block.index + block[1].length);
                    for (const line of styleColors(block[2])) lines.add(first + line - 1);
                }
            }
            for (const line of [...lines].sort((a, b) => a - b)) found.push(`${path.relative(root, full)}:${line}`);
        }
    };
    walk(root);
    console.log(`\n== colors outside ${path.basename(tokenFile)} ==`);
    for (const location of found.slice(0, 30)) console.log(`FAIL  literal color at ${location}`);
    if (found.length > 30) console.log(`FAIL  ...and ${found.length - 30} more`);
    if (found.length === 0) console.log('ok');
    console.log('This is a text search: a color built at run time or passed as a plain string is not seen.');
    failures += found.length;
}

// ---------- Runs inside the page ----------
function audit(small) {
    const results = [];
    const add = (level, message) => results.push({ level, message });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = (color) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
    };
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
    const luminance = (c) => {
        const [r, g, b] = c.slice(0, 3).map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
    };
    // Returns null when an image or gradient makes the background unmeasurable.
    const background = (element) => {
        const layers = [];
        for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.backgroundImage !== 'none') return null;
            const color = rgba(style.backgroundColor);
            if (color[3] > 0) layers.push(color);
            if (color[3] >= 0.999) break;
        }
        return layers.reverse().reduce((below, layer) => over(layer, below), [255, 255, 255, 1]);
    };
    const opacity = (element) => {
        let value = 1;
        for (let node = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
        return value;
    };
    const visible = (element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 2 && box.height > 2 && style.visibility !== 'hidden' && opacity(element) > 0.05;
    };
    const name = (element) => {
        const text = (element.innerText || element.value || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        return `<${element.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}`;
    };
    const isDisabled = (element) =>
        Boolean(element.closest(':disabled, [aria-disabled="true"]') || element.closest('label')?.querySelector(':disabled'));

    const still = document.createElement('style');
    still.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.append(still);

    const root = document.documentElement;
    if (!document.querySelector('meta[name="viewport"]')) add('FAIL', 'missing <meta name="viewport">');
    if (!root.lang) add('FAIL', 'missing lang on <html>');
    else if (/^(ar|he|fa|ur)\b/i.test(root.lang) && getComputedStyle(root).direction !== 'rtl') add('FAIL', `lang="${root.lang}" without right-to-left direction`);

    if (root.scrollWidth > root.clientWidth + 1) {
        const wide = [...document.body.querySelectorAll('*')].filter((el) => {
            const box = el.getBoundingClientRect();
            return box.right > root.clientWidth + 1 || box.left < -1;
        });
        add('FAIL', `horizontal overflow (${root.scrollWidth}px in ${root.clientWidth}px) ${wide.slice(0, 3).map(name).join(', ')}`);
    }

    for (const font of document.fonts) if (font.status === 'error') add('FAIL', `font failed to load: ${font.family}`);

    let unmeasured = 0;
    for (const element of document.body.querySelectorAll('*')) {
        const ownText = [...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!ownText || ['SCRIPT', 'STYLE', 'OPTION'].includes(element.tagName) || !visible(element)) continue;
        const style = getComputedStyle(element);
        if (style.textDecorationLine.includes('line-through') && element.textContent.includes('٠')) {
            add('FAIL', `line-through over an Arabic-Indic zero hides it: ${name(element)}`);
        }
        if (isDisabled(element)) continue;
        const back = background(element);
        if (!back) { unmeasured++; continue; }
        const color = rgba(style.color);
        color[3] *= opacity(element);
        const ratio = contrast(over(color, back), back);
        const px = parseFloat(style.fontSize);
        const needed = px >= 24 || (px >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
        if (ratio < needed) add('FAIL', `text contrast ${ratio.toFixed(2)}:1, needs ${needed}:1: ${name(element)}`);
    }
    if (unmeasured) add('WARN', `${unmeasured} text element(s) sit on an image or gradient: check their contrast by eye`);

    for (const image of document.images) {
        if (!image.hasAttribute('alt')) add('FAIL', `image without alt: ${image.src.slice(0, 60)}`);
        if (image.getAttribute('src') && image.complete && image.naturalWidth === 0) add('FAIL', `image failed to load: ${image.src.slice(0, 60)}`);
    }
    for (const field of document.querySelectorAll('input, select, textarea')) {
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(field.type)) continue;
        if (!field.labels?.length && !field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby') && !field.title) {
            add('FAIL', `field without a label: ${name(field)} ${field.name || field.type}`);
        }
    }

    // A choice drawn as a label around a radio button or checkbox is judged by the label.
    const controls = new Set();
    for (const element of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]')) {
        const wrapper = ['radio', 'checkbox'].includes(element.type) ? element.closest('label') : null;
        controls.add(wrapper || element);
    }
    for (const control of controls) {
        if (!visible(control)) continue;
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        const inlineLink = control.tagName === 'A' && style.display === 'inline';
        if (!inlineLink) {
            if (box.width < 24 || box.height < 24) add('FAIL', `target smaller than 24px: ${name(control)} ${Math.round(box.width)}x${Math.round(box.height)}`);
            else if (small && (box.width < 44 || box.height < 44)) add('WARN', `target under 44px on a phone: ${name(control)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
        if (isDisabled(control) || !control.parentElement) continue;
        const outside = background(control.parentElement);
        const inside = background(control);
        if (!outside || !inside || style.borderTopStyle === 'none' || parseFloat(style.borderTopWidth) === 0) continue;
        const border = over(rgba(style.borderTopColor), outside);
        if (contrast(inside, outside) < 3 && contrast(border, outside) < 3) {
            add('WARN', `control edge below 3:1: ${name(control)} (${contrast(border, outside).toFixed(2)}:1)`);
        }
    }

    // Enable each disabled control for a moment: if nothing changes, users cannot tell the states apart.
    const properties = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth', 'borderTopStyle', 'opacity', 'textDecorationLine', 'boxShadow', 'filter', 'fontWeight'];
    const look = (element) => [element, ...element.querySelectorAll('*')]
        .map((node) => properties.map((p) => getComputedStyle(node)[p]).join('|')).join('/');
    for (const element of document.querySelectorAll('button:disabled, input:disabled, select:disabled, textarea:disabled')) {
        const target = ['radio', 'checkbox'].includes(element.type) ? element.closest('label') || element : element;
        if (!visible(target)) continue;
        const disabled = look(target);
        element.disabled = false;
        const enabled = look(target);
        element.disabled = true;
        if (disabled === enabled) add('FAIL', `disabled control looks the same as enabled: ${name(target)}`);
    }

    if (small) {
        for (const primary of document.querySelectorAll('[data-primary], button[type="submit"], input[type="submit"]')) {
            if (visible(primary) && primary.getBoundingClientRect().bottom > innerHeight) {
                add('WARN', `primary action is below the first screen: ${name(primary)}`);
            }
        }
    }

    still.remove();
    return results;
}

// ---------- Browser ----------
function findBrowser() {
    if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
    const candidates = [];
    if (process.platform === 'win32') {
        for (const base of [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean)) {
            candidates.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
        }
    } else if (process.platform === 'darwin') {
        for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
            for (const app of ['Google Chrome', 'Microsoft Edge', 'Chromium']) candidates.push(`${base}/${app}.app/Contents/MacOS/${app}`);
        }
    } else {
        for (const folder of (process.env.PATH ?? '').split(':')) {
            for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) candidates.push(path.join(folder, bin));
        }
    }
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const within = (promise, ms, what) => {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), ms); }),
    ]).finally(() => clearTimeout(timer));
};

async function checkPages(urls) {
    if (typeof WebSocket === 'undefined') throw new Error('Node 22 or newer is needed.');
    const executable = findBrowser();
    if (!executable) throw new Error('No Chrome, Edge or Chromium found (set CHROME_PATH).');
    const out = path.resolve(options.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'design-check-')));
    fs.mkdirSync(out, { recursive: true });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'design-check-profile-'));
    const browser = spawn(executable, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: 'ignore' });
    let socket;
    let send;
    try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        let lines = [];
        for (let i = 0; i < 150 && lines.length < 2; i++) {
            await sleep(100);
            if (fs.existsSync(portFile)) lines = fs.readFileSync(portFile, 'utf8').split('\n').filter(Boolean);
        }
        if (lines.length < 2) throw new Error('The browser did not start.');
        socket = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
        await within(new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('connection failed')); }), 10000, 'connect');
        let id = 0;
        const waiting = new Map();
        const listeners = new Set();
        socket.onmessage = ({ data }) => {
            const message = JSON.parse(data);
            if (message.id && waiting.has(message.id)) {
                const { resolve, reject } = waiting.get(message.id);
                waiting.delete(message.id);
                if (message.error) reject(new Error(message.error.message));
                else resolve(message.result);
            } else for (const listener of listeners) listener(message);
        };
        send = (method, params = {}, sessionId) => within(new Promise((resolve, reject) => {
            waiting.set(++id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params, sessionId }));
        }), 20000, method);

        const sizes = ['mobile', 'tablet', 'desktop'].map((label) => [label, size(options[label])]);
        for (const [index, url] of urls.entries()) {
            for (const [label, viewport] of sizes) {
                const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
                const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
                await send('Page.enable', {}, sessionId);
                // Errors and failed requests are collected from the first moment of loading.
                const runtime = [];
                const requests = new Map();
                const report = (message) => runtime.push({ level: 'FAIL', message });
                const watch = ({ sessionId: from, method, params }) => {
                    if (from !== sessionId) return;
                    if (method === 'Runtime.exceptionThrown') {
                        const detail = params.exceptionDetails;
                        report(`JavaScript error: ${(detail.exception?.description ?? detail.text).split('\n')[0].slice(0, 120)}`);
                    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
                        report(`console error: ${params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 120)}`);
                    } else if (method === 'Network.requestWillBeSent') {
                        requests.set(params.requestId, params.request.url);
                    } else if (method === 'Network.responseReceived' && params.response.status >= 400) {
                        if (!/\/favicon\.ico$/.test(params.response.url)) report(`request failed (${params.response.status}): ${params.response.url.slice(0, 100)}`);
                    } else if (method === 'Network.loadingFailed' && !params.canceled) {
                        const failed = requests.get(params.requestId) ?? '';
                        if (!/\/favicon\.ico$/.test(failed)) report(`request failed (${params.errorText}): ${failed.slice(0, 100)}`);
                    }
                };
                listeners.add(watch);
                await send('Runtime.enable', {}, sessionId);
                await send('Network.enable', {}, sessionId);
                // mobile:false keeps the layout at this exact size. Mobile emulation widens the page to fit
                // overflowing content, which would hide the very problem being checked.
                await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false }, sessionId);
                let listener;
                const loaded = new Promise((resolve) => {
                    listener = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') resolve(); };
                    listeners.add(listener);
                });
                const navigation = await send('Page.navigate', { url }, sessionId);
                if (navigation.errorText) throw new Error(`Could not open ${url}: ${navigation.errorText}`);
                await within(loaded, 20000, `load ${url}`);
                listeners.delete(listener);
                const evaluate = async (expression) => {
                    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
                    if (reply.exceptionDetails) throw new Error(`Script error in the page: ${reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text}`);
                    return reply.result.value;
                };
                await evaluate('document.fonts.ready.then(() => true)');
                if (options.before) await evaluate(`(async () => { ${options.before}\n })()`);
                await sleep(300);
                const results = await evaluate(`(${audit.toString()})(${label === 'mobile'})`);
                const { cssContentSize } = await send('Page.getLayoutMetrics', {}, sessionId);
                // A taller viewport shows the whole page. captureBeyondViewport is not used because it
                // shifts right-to-left pages sideways and cuts them off.
                const height = Math.min(Math.max(viewport.height, Math.ceil(cssContentSize.height)), 6000);
                if (height > viewport.height) {
                    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
                    await sleep(200);
                }
                const shot = await send('Page.captureScreenshot', {}, sessionId);
                const stem = path.basename(new URL(url).pathname).replace(/\.\w+$/, '') || 'page';
                const file = path.join(out, `${index + 1}-${stem}-${label}.png`);
                fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

                console.log(`\n== ${pages[index]} [${label} ${viewport.width}x${viewport.height}] ==`);
                listeners.delete(watch);
                const unique = [...new Map([...runtime, ...results].map((r) => [r.level + r.message, r])).values()];
                for (const { level, message } of unique) console.log(`${level}  ${message}`);
                if (unique.length === 0) console.log('ok');
                console.log(`screenshot: ${file}`);
                failures += unique.filter((r) => r.level === 'FAIL').length;
                warnings += unique.filter((r) => r.level === 'WARN').length;
                await send('Target.closeTarget', { targetId });
            }
        }
    } finally {
        const exited = new Promise((resolve) => browser.once('exit', resolve));
        if (send) await send('Browser.close').catch(() => {});
        socket?.close();
        await within(exited, 3000, 'exit').catch(() => browser.kill());
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temporary profile is harmless */ }
    }
}

const urls = pages.map(toUrl);
if (options.source) checkSource(options.source, options.tokens);
if (urls.length > 0) {
    try {
        await checkPages(urls);
    } catch (error) {
        console.error(`design check could not run: ${error.message}`);
        process.exit(3);
    }
}
console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
if (urls.length > 0) console.log('Only the state on load (plus --before) was measured. Look at the screenshots: taste and layout are not measured.');
process.exit(failures > 0 ? 1 : 0);
