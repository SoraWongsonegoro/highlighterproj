// Create the hidden Popup Button
const popupBtn = document.createElement('button');
popupBtn.textContent = 'Save';
popupBtn.className = 'ts-ext-save-btn';
document.body.appendChild(popupBtn);

// Store the selection before the click clears it
let pendingRange = null;

document.addEventListener('mouseup', (e) => {
    if (popupBtn.contains(e.target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        pendingRange = range.cloneRange(); // Save a copy of the range

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

function highlightRange(range) {
    const living = [];
    const rangeWalker = document.createTreeWalker(
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode  // walk from parent if it's a text node
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

popupBtn.addEventListener('click', () => {
    if (!pendingRange) return;
    if (!isExtensionValid()) {
        popupBtn.remove();
        return;
    }

    const selectedText = pendingRange.toString().trim();
    if (!selectedText) return;

    // Highlight first — pure DOM, no extension context needed
    highlightRange(pendingRange);
    pendingRange = null;
    popupBtn.style.display = 'none';
    window.getSelection().removeAllRanges();

    // Save separately — if context dies here, highlight already succeeded
    try {
        chrome.storage.local.get(['saved_snippets'], (result) => {
            if (chrome.runtime.lastError) {
                console.warn('Storage error:', chrome.runtime.lastError.message);
                return;
            }
            const snippets = result.saved_snippets || [];
            snippets.push(selectedText);
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