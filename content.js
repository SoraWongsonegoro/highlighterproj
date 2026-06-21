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

        // Position the button just above where the cursor was released.
        const BTN_SIZE = 42;
        const GAP = 8;
        let topPx = e.clientY - BTN_SIZE - GAP;
        if (topPx < 0) topPx = e.clientY + GAP; // flip below if no room above
        let leftPx = e.clientX - BTN_SIZE / 2;
        leftPx = Math.max(2, Math.min(leftPx, window.innerWidth - BTN_SIZE - 2));

        popupBtn.style.top = `${topPx + window.scrollY}px`;
        popupBtn.style.left = `${leftPx + window.scrollX}px`;
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

// --- Restore saved highlights on page load ---

function normalizeWs(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

// Walk every visible text node and build a whitespace-normalized string plus a
// per-character map back to the originating { node, offset } so a match in the
// normalized string can be turned into a precise DOM Range.
function buildTextIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.nodeName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let norm = '';
    const map = []; // map[i] -> { node, offset } for normalized char i
    let prevWasSpace = false;
    let node;
    while ((node = walker.nextNode())) {
        const text = node.nodeValue;
        for (let i = 0; i < text.length; i++) {
            const isSpace = /\s/.test(text[i]);
            if (isSpace) {
                if (prevWasSpace) continue;
                norm += ' ';
                map.push({ node, offset: i });
                prevWasSpace = true;
            } else {
                norm += text[i];
                map.push({ node, offset: i });
                prevWasSpace = false;
            }
        }
    }
    return { norm, map };
}

// Locate one saved snippet on the page and re-wrap it. Returns true if it was
// found (or already highlighted), false if the text isn't on the page yet.
function highlightSavedSnippet(snippet) {
    try {
        const target = normalizeWs(snippet.text);
        if (!target) return false;

        const { norm, map } = buildTextIndex(document.body);
        const before = normalizeWs(snippet.contextBefore);
        const after = normalizeWs(snippet.contextAfter);

        // Find the occurrence whose neighbouring text best matches the stored context.
        let bestIdx = -1;
        let bestScore = -1;
        let from = 0;
        while (true) {
            const idx = norm.indexOf(target, from);
            if (idx === -1) break;
            const pre = norm.slice(0, idx).trimEnd();
            const post = norm.slice(idx + target.length).trimStart();
            let score = 0;
            if (before && pre.endsWith(before)) score++;
            if (after && post.startsWith(after)) score++;
            if (score > bestScore) { bestScore = score; bestIdx = idx; }
            if (score === 2) break; // perfect context match, stop early
            from = idx + 1;
        }
        if (bestIdx === -1) return false;

        const startInfo = map[bestIdx];
        const endInfo = map[bestIdx + target.length - 1];
        if (!startInfo || !endInfo) return false;

        // Already wrapped by an earlier pass / live save — treat as done.
        const startParent = startInfo.node.parentNode;
        if (startParent && startParent.closest && startParent.closest('.ts-ext-highlight')) return true;

        const range = document.createRange();
        range.setStart(startInfo.node, startInfo.offset);
        range.setEnd(endInfo.node, endInfo.offset + 1);
        highlightRange(range);
        return true;
    } catch (e) {
        return false;
    }
}

let restorePending = null;

function attemptRestore() {
    if (!restorePending || restorePending.length === 0) return;
    const stillPending = [];
    restorePending.forEach((snippet) => {
        if (!highlightSavedSnippet(snippet)) stillPending.push(snippet);
    });
    restorePending = stillPending;
}

function restoreHighlights() {
    if (!isExtensionValid()) return;
    try {
        chrome.storage.local.get(['saved_snippets', 'collections'], (res) => {
            if (chrome.runtime.lastError) return;
            const url = window.location.href;
            const candidates = [];
            (res.saved_snippets || []).forEach((s) => candidates.push(s));
            const collections = res.collections || {};
            Object.values(collections).forEach((arr) => (arr || []).forEach((s) => candidates.push(s)));

            // Keep only quotes from this exact page, de-duplicated by text + context.
            const seen = new Set();
            restorePending = [];
            candidates.forEach((s) => {
                if (!s || typeof s !== 'object' || s.url !== url || !s.text) return;
                const key = `${s.text}|${s.contextBefore || ''}|${s.contextAfter || ''}`;
                if (seen.has(key)) return;
                seen.add(key);
                restorePending.push(s);
            });

            attemptRestore();
            // Retry once for content that renders slightly after load.
            setTimeout(attemptRestore, 1200);
        });
    } catch (e) {
        // extension context invalidated; ignore
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreHighlights);
} else {
    restoreHighlights();
}