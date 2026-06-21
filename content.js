const popupBtn = document.createElement('button');
popupBtn.className = 'ts-ext-save-btn';
popupBtn.setAttribute('aria-label', 'Save highlight');
popupBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;
document.body.appendChild(popupBtn);

let pendingRange = null;
let highlightColor = '#ffd54f'; // default soft yellow

function hexToLuma(hex) {
    if (!hex) return 1;
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    // relative luminance
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function getContrastColor(hex) {
    const luma = hexToLuma(hex || '#ffffff');
    return luma > 0.6 ? '#000000' : '#ffffff';
}

function applyHighlightStyle(el, color) {
    // 'transparent' = invisible highlight: keep the text styling untouched.
    if (color === 'transparent' || color === 'none') {
        el.style.backgroundColor = 'transparent';
        el.style.color = 'inherit';
        el.style.padding = '0';
        el.style.borderRadius = '0';
        return;
    }
    el.style.backgroundColor = color;
    el.style.color = getContrastColor(color);
    el.style.padding = '0 0.1em';
    el.style.borderRadius = '2px';
}

function updateExistingHighlights(color) {
    try {
        const nodes = document.querySelectorAll('.ts-ext-highlight');
        nodes.forEach((el) => applyHighlightStyle(el, color));
    } catch (e) {
        // ignore
    }
}

// Load configured highlight color and apply to existing highlights
try {
    chrome.storage.local.get(['highlight_color'], (res) => {
        if (res && res.highlight_color) {
            highlightColor = res.highlight_color;
        }
        updateExistingHighlights(highlightColor);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.highlight_color) {
            highlightColor = changes.highlight_color.newValue;
            updateExistingHighlights(highlightColor);
        }
    });
} catch (e) {
    // ignore in page context if chrome storage unavailable
}

function isExtensionValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (e) {
        return false;
    }
}

function lastSentence(text) {
    const parts = (text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

function firstSentence(text) {
    const parts = (text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts[0] : '';
}

// Extract the sentence immediately before and after the selected quote, using the
// surrounding block element as the source of context.
function getQuoteContext(range) {
    try {
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) container = container.parentNode;
        const block = (container.closest &&
            container.closest('p, li, blockquote, article, section, td, dd, dt, div')) || container;

        const fullText = (block.textContent || '').replace(/\s+/g, ' ').trim();
        const selected = range.toString().replace(/\s+/g, ' ').trim();
        if (!fullText || !selected) return { before: '', after: '' };

        const idx = fullText.indexOf(selected);
        if (idx === -1) return { before: '', after: '' };

        const beforeSlice = fullText.slice(0, idx);
        const afterSlice = fullText.slice(idx + selected.length);
        let before = lastSentence(beforeSlice);
        let after = firstSentence(afterSlice);
        // Preserve the whitespace that joined the context to the quote so it flows
        // seamlessly without the modal having to inject its own spaces.
        if (before && /\s$/.test(beforeSlice)) before += ' ';
        if (after && /^\s/.test(afterSlice)) after = ' ' + after;
        return { before, after };
    } catch (e) {
        return { before: '', after: '' };
    }
}

function highlightRange(range) {
    const living = [];
    const rangeWalker = document.createTreeWalker(
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode
            : range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT
    );

    let node;
    while ((node = rangeWalker.nextNode())) {
        if (range.intersectsNode(node)) {
            living.push(node);
        }
    }

    living.forEach((textNode) => {
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(textNode);

        if (textNode === range.startContainer) {
            nodeRange.setStart(textNode, range.startOffset);
        }
        if (textNode === range.endContainer) {
            nodeRange.setEnd(textNode, range.endOffset);
        }

        const highlight = document.createElement('mark');
        highlight.className = 'ts-ext-highlight';
        // apply configured highlight color
        try {
            applyHighlightStyle(highlight, highlightColor);
        } catch (e) {
            // ignore styling errors
        }
        nodeRange.surroundContents(highlight);
    });
}

document.addEventListener('mouseup', (e) => {
    if (popupBtn.contains(e.target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        pendingRange = range.cloneRange();

        const rect = range.getBoundingClientRect();
        popupBtn.style.top = `${rect.top + window.scrollY - 35}px`;
        popupBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 25}px`;
        popupBtn.style.display = 'block';
    } else {
        popupBtn.style.display = 'none';
    }
});

document.addEventListener('mousedown', (e) => {
    if (!popupBtn.contains(e.target)) {
        popupBtn.style.display = 'none';
        pendingRange = null;
    }
});

document.addEventListener('keydown', (e) => {

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();
        if (!selectedText) return;

        e.preventDefault();

        const range = selection.getRangeAt(0);
        const context = getQuoteContext(range);
        highlightRange(range);
        selection.removeAllRanges();
        popupBtn.style.display = 'none';
        pendingRange = null;

        if (!isExtensionValid()) return;

        try {
            chrome.storage.local.get(['saved_snippets'], (result) => {
                if (chrome.runtime.lastError) {
                    console.warn('Storage error:', chrome.runtime.lastError.message);
                    return;
                }
                const snippets = result.saved_snippets || [];
                snippets.push({
                    text: selectedText,
                    title: document.title || 'Untitled Page',
                    url: window.location.href,
                    savedAt: new Date().toISOString(),
                    contextBefore: context.before,
                    contextAfter: context.after
                });
                chrome.storage.local.set({ saved_snippets: snippets }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('Storage error:', chrome.runtime.lastError.message);
                    }
                });
            });
        } catch (err) {
            console.warn('Extension context lost during save:', err.message);
        }
    }
}, true);

popupBtn.addEventListener('click', () => {
    if (!pendingRange) return;
    if (!isExtensionValid()) {
        popupBtn.remove();
        return;
    }

    const selectedText = pendingRange.toString().trim();
    if (!selectedText) return;

    const context = getQuoteContext(pendingRange);

    highlightRange(pendingRange);

    pendingRange = null;
    popupBtn.style.display = 'none';
    window.getSelection().removeAllRanges();

    try {
        chrome.storage.local.get(['saved_snippets'], (result) => {
            if (chrome.runtime.lastError) {
                console.warn('Storage error:', chrome.runtime.lastError.message);
                return;
            }
            const snippets = result.saved_snippets || [];

            const newSnippet = {
                text: selectedText,
                title: document.title || 'Untitled Page',
                url: window.location.href,
                savedAt: new Date().toISOString(),
                contextBefore: context.before,
                contextAfter: context.after
            };

            snippets.push(newSnippet);

            chrome.storage.local.set({ saved_snippets: snippets }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Storage error:', chrome.runtime.lastError.message);
                }
            });
        });
    } catch (e) {
        console.warn('Extension context lost during save:', e.message);
        popupBtn.remove();
    }
}


);