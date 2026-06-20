// Create the hidden Popup Button
const popupBtn = document.createElement('button');
popupBtn.textContent = 'Save';
popupBtn.className = 'ts-ext-save-btn'; // Links to styles.css
document.body.appendChild(popupBtn);

// Tooltip Logic: Show button on mouseup
document.addEventListener('mouseup', (e) => {
    if (popupBtn.contains(e.target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        popupBtn.style.top = `${rect.top + window.scrollY - 35}px`;
        popupBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 25}px`;
        popupBtn.style.display = 'block';
    } else {
        popupBtn.style.display = 'none';
    }
});

// Hide popup on mousedown (clicking away)
document.addEventListener('mousedown', (e) => {
    if (!popupBtn.contains(e.target)) {
        popupBtn.style.display = 'none';
    }
});

// Save Logic
popupBtn.addEventListener('click', () => {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText) {
        // 1. Fetch current snippets from storage
        chrome.storage.local.get(['saved_snippets'], (result) => {
            const snippets = result.saved_snippets || [];
            
            // 2. Add the new text
            snippets.push(selectedText);
            
            // 3. Save it back to storage
            chrome.storage.local.set({ saved_snippets: snippets }, () => {
                popupBtn.style.display = 'none';
                window.getSelection().removeAllRanges(); // Clear highlight
            });
        });
    }
});