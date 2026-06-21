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