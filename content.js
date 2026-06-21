const popupBtn = document.createElement('button');
popupBtn.textContent = 'Save';
popupBtn.className = 'ts-ext-save-btn';
document.body.appendChild(popupBtn);

let pendingRange = null;

function isExtensionValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (e) {
        return false;
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
        nodeRange.surroundContents(highlight);
    });
}

function getSurroundingContext(range) {
    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;

    const block = container.closest('p, li, td, blockquote, div, section, article') || container;
    const fullText = block.innerText || block.textContent || '';
    const selectedText = range.toString();

    const selectionStart = fullText.indexOf(selectedText);
    if (selectionStart === -1) return { before: '', after: '' };

    const before = fullText.slice(0, selectionStart).trim();
    const after = fullText.slice(selectionStart + selectedText.length).trim();

    const lastSentenceBefore = before.split(/(?<=[.!?])\s+/).pop() || '';
    const firstSentenceAfter = after.split(/(?<=[.!?])\s+/).shift() || '';

    return {
        before: lastSentenceBefore,
        after: firstSentenceAfter
    };
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

popupBtn.addEventListener('click', () => {
    if (!pendingRange) return;
    if (!isExtensionValid()) {
        popupBtn.remove();
        return;
    }

    const selectedText = pendingRange.toString().trim();
    if (!selectedText) return;

    highlightRange(pendingRange);

    const context = getSurroundingContext(pendingRange);

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
                contextBefore: context.before,
                contextAfter: context.after,
                savedAt: new Date().toISOString()
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
});