// 针对 issue #7 的回归测试：页面美化、压缩需支持顶层 JSON 数组。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'script.js');
const scriptSource = readFileSync(SCRIPT_PATH, 'utf8');

const ELEMENT_IDS = [
    'inputArea',
    'outputArea',
    'outputAreaRaw',
    'formatBtn',
    'minifyBtn',
    'escapeBtn',
    'unescapeBtn',
    'clearBtn',
    'copyBtn',
    'errorMessage',
    'inputCharCount',
    'outputCharCount'
];

function createElement(id) {
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        style: {},
        classList: {
            _classes: new Set(),
            add(name) {
                this._classes.add(name);
            },
            remove(name) {
                this._classes.delete(name);
            },
            contains(name) {
                return this._classes.has(name);
            }
        },
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute() {
            return null;
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
}

// 在 Node 中加载页面脚本，用最小的 DOM/存储桩驱动真实的 formatJSON / minifyJSON。
function createPage() {
    const elements = new Map(ELEMENT_IDS.map((id) => [id, createElement(id)]));
    const storage = new Map();

    const document = {
        getElementById(id) {
            return elements.get(id) || null;
        },
        createElement() {
            return createElement('created');
        },
        addEventListener() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    const context = {
        document,
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            }
        },
        navigator: {},
        fetch() {
            return Promise.resolve({ ok: true });
        },
        console: { log() {}, error() {}, warn() {} },
        // 只执行 0ms 定时器，避免 showError 的 5 秒定时器拖住测试进程。
        setTimeout(fn, delay) {
            if (!delay) {
                queueMicrotask(fn);
            }
            return 0;
        },
        clearTimeout() {}
    };
    context.window = context;

    vm.runInNewContext(scriptSource, context, { filename: 'script.js' });

    return { context, elements };
}

function input(page, text) {
    page.elements.get('inputArea').value = text;
}

function formatted(inputText) {
    const page = createPage();
    input(page, inputText);
    page.context.formatJSON();
    return page;
}

function minified(inputText) {
    const page = createPage();
    input(page, inputText);
    page.context.minifyJSON();
    return page;
}

function output(page) {
    return page.elements.get('outputAreaRaw').value;
}

function errorState(page) {
    const element = page.elements.get('errorMessage');
    return {
        text: element.textContent,
        shown: element.classList.contains('show')
    };
}

test('美化：顶层数字数组', () => {
    const page = formatted('[1,2,3]');
    const html = page.elements.get('outputArea').innerHTML;

    assert.equal(output(page), '[\n  1,\n  2,\n  3\n]');
    assert.equal(errorState(page).shown, false);
    // 数组应按数组渲染（方括号 + 可折叠内容），而不是被当成对象渲染。
    assert.match(html, /<\/span>\[<span class="json-collapsible-content"/);
    assert.match(html, /<span class="json-number">1<\/span>/);
    assert.doesNotMatch(html, /json-key/);
});

test('美化：顶层数组保持元素顺序与类型', () => {
    const page = formatted('[1,"2",true,false,null]');

    assert.equal(output(page), '[\n  1,\n  "2",\n  true,\n  false,\n  null\n]');
    assert.equal(errorState(page).shown, false);
});

test('美化：顶层对象数组', () => {
    const page = formatted('[{"a":1},{"a":2}]');

    assert.equal(output(page), '[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]');
    assert.equal(errorState(page).shown, false);
});

test('美化：顶层字符串数组', () => {
    const page = formatted('["a","b"]');

    assert.equal(output(page), '[\n  "a",\n  "b"\n]');
    assert.equal(errorState(page).shown, false);
});

test('美化：空数组', () => {
    const page = formatted('[]');

    assert.equal(output(page), '[]');
    assert.equal(errorState(page).shown, false);
});

test('美化：嵌套数组', () => {
    const page = formatted('[[1,2],[3,4]]');

    assert.equal(output(page), '[\n  [\n    1,\n    2\n  ],\n  [\n    3,\n    4\n  ]\n]');
    assert.equal(errorState(page).shown, false);
});

test('美化：对象内的数组保持原有行为', () => {
    const page = formatted('{"a":[1,2]}');

    assert.equal(output(page), '{\n  "a": [\n    1,\n    2\n  ]\n}');
    assert.equal(errorState(page).shown, false);
});

test('美化：非法数组与非法对象一致地报错并清空输出', () => {
    const arrayPage = formatted('[1,2,]');
    const objectPage = formatted('{"a":1,}');

    assert.equal(errorState(arrayPage).shown, true);
    assert.equal(errorState(arrayPage).text, '格式化失败: 无效的 JSON 格式');
    assert.equal(output(arrayPage), '');
    assert.deepEqual(errorState(arrayPage), errorState(objectPage));
});

test('压缩：顶层数字数组', () => {
    const page = minified('[ 1, 2, 3 ]');

    assert.equal(output(page), '[1,2,3]');
    assert.equal(errorState(page).shown, false);
});

test('压缩：顶层对象数组', () => {
    const page = minified('[ {"a": 1}, {"a": 2} ]');

    assert.equal(output(page), '[{"a":1},{"a":2}]');
    assert.equal(errorState(page).shown, false);
});

test('压缩：空数组', () => {
    const page = minified('[]');

    assert.equal(output(page), '[]');
    assert.equal(errorState(page).shown, false);
});

test('压缩：嵌套数组', () => {
    const page = minified('[[1, 2], [3, 4]]');

    assert.equal(output(page), '[[1,2],[3,4]]');
    assert.equal(errorState(page).shown, false);
});

test('压缩：非法数组与非法对象一致地报错并清空输出', () => {
    const arrayPage = minified('[1,2,]');
    const objectPage = minified('{"a":1,}');

    assert.equal(errorState(arrayPage).shown, true);
    assert.equal(errorState(arrayPage).text, '压缩失败: 无效的 JSON 格式');
    assert.equal(output(arrayPage), '');
    assert.deepEqual(errorState(arrayPage), errorState(objectPage));
});
