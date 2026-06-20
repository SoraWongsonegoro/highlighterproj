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
    // Extract all the individual text nodes the range touches
    const fragment = range.cloneContents();
    const treeWalker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    
    const textNodes = [];
    let node;
    while ((node = treeWalker.nextNode())) {
        textNodes.push(node);
    }

    // If surroundContents is safe (single element), use it directly
    if (textNodes.length <= 1) {
        const highlight = document.createElement('mark');
        highlight.className = 'ts-ext-highlight';
        try {
            range.surroundContents(highlight);
        } catch (e) {
            console.warn('surroundContents failed:', e.message);
        }
        return;
    }

    // Otherwise, wrap each text node in the live DOM individually
    const living = [];
    const rangeWalker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT
    );

    while ((node = rangeWalker.nextNode())) {
        if (range.intersectsNode(node)) {
            living.push(node);
        }
    }

    living.forEach((textNode) => {
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(textNode);

        // Clamp the range to only the selected portion
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

    const selectedText = pendingRange.toString().trim();

    if (selectedText) {
        chrome.storage.local.get(['saved_snippets'], (result) => {
            const snippets = result.saved_snippets || [];
            snippets.push(selectedText);

            chrome.storage.local.set({ saved_snippets: snippets }, () => {
                // Apply highlight only after save succeeds
                highlightRange(pendingRange);
                pendingRange = null;

                popupBtn.style.display = 'none';
                window.getSelection().removeAllRanges();
            });
        });
    }
});