// 获取 DOM 元素
const inputArea = document.getElementById('inputArea');
const outputArea = document.getElementById('outputArea');
const outputAreaRaw = document.getElementById('outputAreaRaw');
const formatBtn = document.getElementById('formatBtn');
const minifyBtn = document.getElementById('minifyBtn');
const escapeBtn = document.getElementById('escapeBtn');
const unescapeBtn = document.getElementById('unescapeBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const errorMessage = document.getElementById('errorMessage');
const inputCharCount = document.getElementById('inputCharCount');
const outputCharCount = document.getElementById('outputCharCount');

const STORAGE_KEYS = {
    input: 'jsonBeautify.input',
    output: 'jsonBeautify.output',
    outputHighlight: 'jsonBeautify.outputHighlight'
};

// 显示错误信息
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

// 隐藏错误信息
function hideError() {
    errorMessage.classList.remove('show');
}

// 更新字符计数
function updateCharCount() {
    inputCharCount.textContent = `${inputArea.value.length} 字符`;
    const outputText = outputAreaRaw.value || outputArea.textContent || '';
    outputCharCount.textContent = `${outputText.length} 字符`;
}

function syncOutputFromInput() {
    const input = inputArea.value.trim();
    if (!input) {
        setOutputContent('', false);
        hideError();
        return;
    }

    try {
        const parsed = JSON.parse(input);
        const formatted = JSON.stringify(parsed, null, 2);
        setOutputContent(formatted, true);
        hideError();
    } catch (e) {
        // 输入未完成时不强制报错，避免频繁闪烁
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.input, inputArea.value || '');
        localStorage.setItem(STORAGE_KEYS.output, outputAreaRaw.value || '');
    } catch (e) {
        // ignore storage errors
    }
}

function saveOutputMode(shouldHighlight) {
    try {
        localStorage.setItem(STORAGE_KEYS.outputHighlight, shouldHighlight ? '1' : '0');
    } catch (e) {
        // ignore storage errors
    }
}

function restoreState() {
    try {
        const savedInput = localStorage.getItem(STORAGE_KEYS.input) || '';
        const savedOutput = localStorage.getItem(STORAGE_KEYS.output) || '';
        const savedHighlight = localStorage.getItem(STORAGE_KEYS.outputHighlight);
        const shouldHighlight = savedHighlight !== '0';

        if (savedInput) {
            inputArea.value = savedInput;
        }

        if (savedOutput) {
            outputAreaRaw.value = savedOutput;
            if (shouldHighlight) {
                outputArea.innerHTML = renderJSONFromText(savedOutput);
                setTimeout(() => {
                    bindCollapseEvents();
                }, 0);
            } else {
                outputArea.textContent = savedOutput;
            }
        }

        updateCharCount();
    } catch (e) {
        // ignore storage errors
    }
}

// JSON 语法高亮函数
function highlightJSON(jsonString) {
    if (!jsonString) return '';
    
    // 转义 HTML 特殊字符
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    let highlighted = escapeHtml(jsonString);
    
    // 使用临时标记来避免重复处理
    // 第一步：标记所有 JSON key（"key": 格式），使用唯一的临时标记
    const keyMarkers = [];
    let keyCounter = 0;
    
    highlighted = highlighted.replace(
        /"([^"\\]|\\.)*"\s*:/g,
        (match) => {
            const marker = `__KEY_MARKER_${keyCounter++}__`;
            keyMarkers.push({ marker, original: match });
            return marker;
        }
    );
    
    // 第二步：标记字符串值（: "value" 格式），但要排除 key 标记
    const stringMarkers = [];
    let stringCounter = 0;
    
    highlighted = highlighted.replace(
        /:\s*"([^"\\]|\\.)*"/g,
        (match) => {
            // 如果包含 key 标记，说明这是 key 的一部分，跳过
            if (match.includes('__KEY_MARKER_')) return match;
            
            // 只标记字符串值部分
            return match.replace(
                /"([^"\\]|\\.)*"/g,
                (strMatch) => {
                    const marker = `__STRING_MARKER_${stringCounter++}__`;
                    stringMarkers.push({ marker, original: strMatch });
                    return marker;
                }
            );
        }
    );
    
    // 第三步：标记数组中的独立字符串（不在 key 或已标记的字符串中）
    highlighted = highlighted.replace(
        /(?:^|\[|,|\n)\s*"([^"\\]|\\.)*"/g,
        (match) => {
            // 如果已经包含任何标记，跳过
            if (match.includes('__KEY_MARKER_') || match.includes('__STRING_MARKER_')) {
                return match;
            }
            
            return match.replace(
                /"([^"\\]|\\.)*"/g,
                (strMatch) => {
                    const marker = `__STRING_MARKER_${stringCounter++}__`;
                    stringMarkers.push({ marker, original: strMatch });
                    return marker;
                }
            );
        }
    );
    
    // 第四步：标记数字
    const numberMarkers = [];
    let numberCounter = 0;
    
    highlighted = highlighted.replace(
        /:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
        (match) => {
            if (match.includes('__KEY_MARKER_') || match.includes('__STRING_MARKER_')) {
                return match;
            }
            const marker = `__NUMBER_MARKER_${numberCounter++}__`;
            numberMarkers.push({ marker, original: match });
            return match.replace(
                /(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
                () => marker
            );
        }
    );
    
    // 第五步：标记布尔值
    const booleanMarkers = [];
    let booleanCounter = 0;
    
    highlighted = highlighted.replace(
        /:\s*(true|false)\b/g,
        (match) => {
            if (match.includes('__KEY_MARKER_') || match.includes('__STRING_MARKER_') || match.includes('__NUMBER_MARKER_')) {
                return match;
            }
            const marker = `__BOOLEAN_MARKER_${booleanCounter++}__`;
            booleanMarkers.push({ marker, original: match });
            return match.replace(
                /(true|false)/g,
                () => marker
            );
        }
    );
    
    // 第六步：标记 null
    const nullMarkers = [];
    let nullCounter = 0;
    
    highlighted = highlighted.replace(
        /:\s*(null)\b/g,
        (match) => {
            if (match.includes('__KEY_MARKER_') || match.includes('__STRING_MARKER_') || 
                match.includes('__NUMBER_MARKER_') || match.includes('__BOOLEAN_MARKER_')) {
                return match;
            }
            const marker = `__NULL_MARKER_${nullCounter++}__`;
            nullMarkers.push({ marker, original: match });
            return match.replace(
                /(null)/g,
                () => marker
            );
        }
    );
    
    // 第七步：标记标点符号
    const punctMarkers = [];
    let punctCounter = 0;
    
    highlighted = highlighted.replace(
        /([{}[\]])/g,
        (match) => {
            if (match.includes('__')) return match;
            const marker = `__PUNCT_MARKER_${punctCounter++}__`;
            punctMarkers.push({ marker, original: match });
            return marker;
        }
    );
    
    // 最后：将所有标记替换为实际的 HTML
    // 注意顺序：先替换值，最后替换 key，避免 key 的 HTML 被误处理
    // 使用 split 和 join 来确保所有匹配都被替换
    stringMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-string">${m.original}</span>`);
    });
    
    numberMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-number">${m.original}</span>`);
    });
    
    booleanMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-boolean">${m.original}</span>`);
    });
    
    nullMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-null">${m.original}</span>`);
    });
    
    punctMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-punctuation">${m.original}</span>`);
    });
    
    // 最后替换 key，确保所有 key 都被高亮
    keyMarkers.forEach(m => {
        highlighted = highlighted.split(m.marker).join(`<span class="json-key">${m.original}</span>`);
    });
    
    return highlighted;
}

// 设置输出内容（带高亮和折叠）
function setOutputContent(text, shouldHighlight = true) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:209',message:'setOutputContent called',data:{textLength:text?.length,shouldHighlight},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    outputAreaRaw.value = text;
    if (shouldHighlight && text) {
        const rendered = renderJSONFromText(text);
        outputArea.innerHTML = rendered;
        // 使用 setTimeout 确保 DOM 更新完成后再绑定事件
        setTimeout(() => {
            bindCollapseEvents();
        }, 0);
    } else {
        outputArea.textContent = text;
    }
    saveOutputMode(shouldHighlight);
    saveState();
    updateCharCount();
}

// 绑定折叠按钮的点击事件
function bindCollapseEvents() {
    // #region agent log
    console.log('bindCollapseEvents called', {outputAreaExists: !!outputArea});
    fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:231',message:'bindCollapseEvents called',data:{outputAreaExists:!!outputArea},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    if (!outputArea) {
        console.error('outputArea not found');
        return;
    }
    
    // 移除旧的事件监听器（如果存在）
    if (outputArea._collapseClickHandler) {
        outputArea.removeEventListener('click', outputArea._collapseClickHandler);
    }
    
    // 使用事件委托，在 outputArea 上监听所有点击事件
    outputArea._collapseClickHandler = function(e) {
        // 检查点击的目标是否是折叠按钮或其子元素
        let target = e.target;
        let btn = null;
        
        // 向上查找折叠按钮
        while (target && target !== outputArea) {
            if (target.classList && target.classList.contains('json-collapse-btn')) {
                btn = target;
                break;
            }
            target = target.parentElement;
        }
        
        if (!btn) {
            return; // 点击的不是折叠按钮
        }
        
        // #region agent log
        console.log('Button clicked via delegation:', {collapseId: btn.getAttribute('data-collapse-id'), text: btn.textContent});
        fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:250',message:'collapse button clicked via delegation',data:{buttonText:btn.textContent,collapseId:btn.getAttribute('data-collapse-id')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        
        e.stopPropagation();
        e.preventDefault();
        
        const id = btn.getAttribute('data-collapse-id');
        if (!id) {
            console.error('No collapse-id found on button');
            return;
        }
        
        // 尝试多种方式查找内容元素
        let content = outputArea.querySelector(`.json-collapsible-content[data-collapse-id="${id}"]`);
        
        // 如果找不到，尝试在整个文档中查找
        if (!content) {
            content = document.querySelector(`.json-collapsible-content[data-collapse-id="${id}"]`);
        }
        
        // #region agent log
        console.log('Content element lookup:', {
            found: !!content, 
            id,
            allContents: outputArea.querySelectorAll('.json-collapsible-content').length,
            allButtons: outputArea.querySelectorAll('.json-collapse-btn').length,
            buttonIds: Array.from(outputArea.querySelectorAll('.json-collapse-btn')).map(b => b.getAttribute('data-collapse-id')),
            contentIds: Array.from(outputArea.querySelectorAll('.json-collapsible-content')).map(c => c.getAttribute('data-collapse-id'))
        });
        fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:280',message:'content element lookup',data:{contentExists:!!content,collapseId:id,allContents:outputArea.querySelectorAll('.json-collapsible-content').length,allButtons:outputArea.querySelectorAll('.json-collapse-btn').length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        
        if (!content) {
            console.error('Content element not found for id:', id);
            console.error('Available content IDs:', Array.from(outputArea.querySelectorAll('.json-collapsible-content')).map(c => c.getAttribute('data-collapse-id')));
            return;
        }
        
        const isCollapsed = content.classList.contains('collapsed');
        // #region agent log
        console.log('Toggling collapse:', {isCollapsed, willBe: !isCollapsed});
        fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:270',message:'toggle collapse',data:{isCollapsed,contentExists:!!content,collapseId:id},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        
        if (isCollapsed) {
            content.classList.remove('collapsed');
            btn.textContent = '▾';
            btn.classList.remove('collapsed');
            // #region agent log
            const computedStyle = window.getComputedStyle(content);
            console.log('Expanded content', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                hasCollapsed: content.classList.contains('collapsed'),
                className: content.className,
                innerHTML: content.innerHTML.substring(0, 50)
            });
            fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:298',message:'expanded',data:{display:computedStyle.display,visibility:computedStyle.visibility,hasCollapsed:content.classList.contains('collapsed')},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
        } else {
            content.classList.add('collapsed');
            btn.textContent = '▸';
            btn.classList.add('collapsed');
            // #region agent log
            const computedStyle = window.getComputedStyle(content);
            console.log('Collapsed content', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                hasCollapsed: content.classList.contains('collapsed'),
                className: content.className,
                innerHTML: content.innerHTML.substring(0, 50)
            });
            fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:310',message:'collapsed',data:{display:computedStyle.display,visibility:computedStyle.visibility,hasCollapsed:content.classList.contains('collapsed')},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
        }
    };
    
    outputArea.addEventListener('click', outputArea._collapseClickHandler, true); // 使用捕获阶段
    
    const collapseButtons = outputArea.querySelectorAll('.json-collapse-btn');
    // #region agent log
    console.log('Found collapse buttons:', collapseButtons.length, 'Event delegation set up');
    fetch('http://127.0.0.1:7244/ingest/17417ebb-765d-49ae-8136-a5c27deb461d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:295',message:'collapse buttons found and delegation set',data:{buttonCount:collapseButtons.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
}

// 将 JSON 文本渲染为可折叠的 HTML
function renderJSONFromText(text) {
    try {
        const parsed = JSON.parse(text);
        let collapseCounter = 0;
        return renderJSONValue(parsed, 0, () => `collapse_${collapseCounter++}`);
    } catch (e) {
        return highlightJSON(text);
    }
}

function renderJSONValue(value, indent, nextCollapseId) {
    const indentStr = ' '.repeat(indent);
    const nextIndent = indent + 2;
    const nextIndentStr = ' '.repeat(nextIndent);

    if (value === null) {
        return '<span class="json-null">null</span>';
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        const id = nextCollapseId();
        const items = value.map((item) => `${nextIndentStr}${renderJSONValue(item, nextIndent, nextCollapseId)}`).join(',\n');
        return `<span class="json-collapse-btn" data-collapse-id="${id}">▾</span>[<span class="json-collapsible-content" data-collapse-id="${id}">\n${items}\n${indentStr}</span>]`;
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            return '{}';
        }
        const id = nextCollapseId();
        const props = keys.map((key) => {
            const keyText = `<span class="json-key">${escapeHtml(JSON.stringify(key))}</span>`;
            const valText = renderJSONValue(value[key], nextIndent, nextCollapseId);
            return `${nextIndentStr}${keyText}: ${valText}`;
        }).join(',\n');
        return `<span class="json-collapse-btn" data-collapse-id="${id}">▾</span>{<span class="json-collapsible-content" data-collapse-id="${id}">\n${props}\n${indentStr}</span>}`;
    }

    if (typeof value === 'string') {
        return `<span class="json-string">${escapeHtml(JSON.stringify(value))}</span>`;
    }

    if (typeof value === 'number') {
        return `<span class="json-number">${value}</span>`;
    }

    if (typeof value === 'boolean') {
        return `<span class="json-boolean">${value}</span>`;
    }

    return escapeHtml(JSON.stringify(value));
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}



// 美化 JSON
function formatJSON() {
    hideError();
    const input = inputArea.value.trim();
    
    if (!input) {
        showError('请输入 JSON 数据');
        return;
    }

    try {
        // 尝试解析 JSON
        let parsed;
        try {
            parsed = JSON.parse(input);
        } catch (e) {
            // 如果不是有效的 JSON，尝试先反转义
            try {
                const unescaped = input.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                parsed = JSON.parse(unescaped);
            } catch (e2) {
                throw new Error('无效的 JSON 格式');
            }
        }
        
        // 格式化 JSON，使用 2 个空格缩进
        const formatted = JSON.stringify(parsed, null, 2);
        setOutputContent(formatted, true);
    } catch (error) {
        showError(`格式化失败: ${error.message}`);
        setOutputContent('', false);
    }
}

// 压缩 JSON
function minifyJSON() {
    hideError();
    const input = inputArea.value.trim();
    
    if (!input) {
        showError('请输入 JSON 数据');
        return;
    }

    try {
        // 解析 JSON
        let parsed;
        try {
            parsed = JSON.parse(input);
        } catch (e) {
            throw new Error('无效的 JSON 格式');
        }
        
        // 压缩 JSON（去除所有空格和换行）
        const minified = JSON.stringify(parsed);
        setOutputContent(minified, false);
    } catch (error) {
        showError(`压缩失败: ${error.message}`);
        setOutputContent('', false);
    }
}

// 转义 JSON（将 JSON 字符串转义为可嵌入代码的格式）
function escapeJSON() {
    hideError();
    const input = inputArea.value.trim();
    
    if (!input) {
        showError('请输入 JSON 数据');
        return;
    }

    try {
        // 验证 JSON 格式
        JSON.parse(input);
        
        // 转义 JSON 字符串
        const escaped = input
            .replace(/\\/g, '\\\\')  // 转义反斜杠
            .replace(/"/g, '\\"')    // 转义双引号
            .replace(/\n/g, '\\n')    // 转义换行符
            .replace(/\r/g, '\\r')    // 转义回车符
            .replace(/\t/g, '\\t');   // 转义制表符
        
        setOutputContent(escaped, false);
    } catch (error) {
        showError(`转义失败: ${error.message}`);
        setOutputContent('', false);
    }
}

// 反转义 JSON
function unescapeJSON() {
    hideError();
    const input = inputArea.value.trim();
    
    if (!input) {
        showError('请输入需要反转义的 JSON 数据');
        return;
    }

    try {
        // 反转义 JSON 字符串
        const unescaped = input
            .replace(/\\n/g, '\n')    // 反转义换行符
            .replace(/\\r/g, '\r')    // 反转义回车符
            .replace(/\\t/g, '\t')    // 反转义制表符
            .replace(/\\"/g, '"')     // 反转义双引号
            .replace(/\\\\/g, '\\');  // 反转义反斜杠
        
        // 验证结果是否为有效的 JSON
        JSON.parse(unescaped);
        
        setOutputContent(unescaped, true);
    } catch (error) {
        showError(`反转义失败: ${error.message}`);
        setOutputContent('', false);
    }
}

// 清空内容
function clearAll() {
    inputArea.value = '';
    setOutputContent('', false);
    hideError();
    updateCharCount();
    saveState();
}

// 复制结果
async function copyResult() {
    const output = outputAreaRaw.value || outputArea.textContent;
    
    if (!output) {
        showError('没有可复制的内容');
        return;
    }

    try {
        await navigator.clipboard.writeText(output);
        // 临时改变按钮文本
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
        }, 2000);
    } catch (error) {
        // 降级方案：使用传统方法
        outputAreaRaw.select();
        document.execCommand('copy');
        showError('已复制到剪贴板');
    }
}


// 绑定事件监听器
formatBtn.addEventListener('click', formatJSON);
minifyBtn.addEventListener('click', minifyJSON);
escapeBtn.addEventListener('click', escapeJSON);
unescapeBtn.addEventListener('click', unescapeJSON);
clearBtn.addEventListener('click', clearAll);
copyBtn.addEventListener('click', copyResult);

// 实时更新字符计数
inputArea.addEventListener('input', () => {
    updateCharCount();
    saveState();
    syncOutputFromInput();
});
outputAreaRaw.addEventListener('input', updateCharCount);

// 监听粘贴事件，粘贴后自动美化 JSON
inputArea.addEventListener('paste', (e) => {
    // 使用 setTimeout 确保粘贴内容已经插入到输入框
    setTimeout(() => {
        const pastedText = inputArea.value.trim();
        // 如果粘贴的内容不为空，自动执行美化
        if (pastedText) {
            formatJSON();
        }
    }, 10);
});

// 初始化内容与字符计数
restoreState();
updateCharCount();

// 支持键盘快捷键
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter 格式化
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        formatJSON();
    }
    // Ctrl/Cmd + Shift + M 压缩
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        minifyJSON();
    }
});
