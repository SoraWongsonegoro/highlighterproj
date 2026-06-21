// Settings page logic. Runs in a full extension tab (not the action popup), so the
// import file picker stays open and parsing works reliably in Firefox.

function showSettingsFeedback(message) {
    const feedback = document.getElementById('settings-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.style.opacity = '1';
    clearTimeout(feedback.hideTimeout);
    feedback.hideTimeout = setTimeout(() => {
        feedback.style.opacity = '0';
    }, 2400);
}

function exportDatabase() {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const data = {
            saved_snippets: result.saved_snippets || [],
            collections: result.collections || {}
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `fireflybook-quotes-${new Date().toISOString().slice(0, 10)}.db`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
        showSettingsFeedback('Export complete.');
    });
}

function importDatabaseFile(file) {
    const handleText = (raw) => {
        const text = String(raw == null ? '' : raw).replace(/^﻿/, '').trim();
        if (!text) {
            showSettingsFeedback('Import failed: file is empty.');
            return;
        }
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (err) {
            console.error('[import] JSON parse failed:', err, 'first 100 chars:', text.slice(0, 100));
            showSettingsFeedback('Import failed: file is not valid JSON.');
            return;
        }
        try {
            mergeImportedDatabase(payload);
        } catch (err) {
            console.error('[import] merge failed:', err);
            showSettingsFeedback(`Import failed: ${err.message}`);
        }
    };

    if (typeof file.text === 'function') {
        file.text().then(handleText).catch((err) => {
            console.error('[import] read failed:', err);
            showSettingsFeedback('Import failed: unable to read file.');
        });
    } else {
        const reader = new FileReader();
        reader.onload = (event) => handleText(event.target && event.target.result);
        reader.onerror = () => showSettingsFeedback('Import failed: unable to read file.');
        reader.readAsText(file);
    }
}

function mergeImportedDatabase(payload) {
    const importedSnippets = Array.isArray(payload?.saved_snippets)
        ? payload.saved_snippets
        : Array.isArray(payload?.savedQuotes)
            ? payload.savedQuotes
            : Array.isArray(payload?.quotes)
                ? payload.quotes
                : Array.isArray(payload?.highlights)
                    ? payload.highlights
                    : Array.isArray(payload?.items)
                        ? payload.items
                        : Array.isArray(payload?.snippets)
                            ? payload.snippets
                            : Array.isArray(payload?.data)
                                ? payload.data
                                : Array.isArray(payload)
                                    ? payload
                                    : [];
    const importedCollections = payload?.collections && typeof payload.collections === 'object'
        ? payload.collections
        : {};

    if (!Array.isArray(importedSnippets)) {
        showSettingsFeedback('Import failed: no valid quotes found.');
        return;
    }

    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const existingSnippets = result.saved_snippets || [];
        const existingCollections = result.collections || {};

        const snippetKey = (snippet) => [snippet.text || '', snippet.url || '', snippet.title || '', snippet.savedAt || ''].join('||');
        const existingKeys = new Set(existingSnippets.map(snippetKey));

        let added = 0;
        const mergedSnippets = [...existingSnippets];
        importedSnippets.forEach((snippet) => {
            if (snippet && typeof snippet === 'object') {
                if (!existingKeys.has(snippetKey(snippet))) {
                    mergedSnippets.push({
                        text: snippet.text || '',
                        url: snippet.url || '',
                        title: snippet.title || '',
                        savedAt: snippet.savedAt || new Date().toISOString(),
                        annotation: snippet.annotation || '',
                        contextBefore: snippet.contextBefore || '',
                        contextAfter: snippet.contextAfter || ''
                    });
                    existingKeys.add(snippetKey(snippet));
                    added++;
                }
            }
        });

        const mergedCollections = { ...existingCollections };
        Object.entries(importedCollections).forEach(([collectionName, snippets]) => {
            if (!Array.isArray(snippets)) return;
            if (!Array.isArray(mergedCollections[collectionName])) {
                mergedCollections[collectionName] = [];
            }
            const collectionKeys = new Set((mergedCollections[collectionName] || []).map(snippetKey));
            snippets.forEach((snippet) => {
                if (snippet && typeof snippet === 'object' && !collectionKeys.has(snippetKey(snippet))) {
                    mergedCollections[collectionName].push({
                        text: snippet.text || '',
                        url: snippet.url || '',
                        title: snippet.title || '',
                        savedAt: snippet.savedAt || new Date().toISOString(),
                        annotation: snippet.annotation || '',
                        contextBefore: snippet.contextBefore || '',
                        contextAfter: snippet.contextAfter || ''
                    });
                    collectionKeys.add(snippetKey(snippet));
                    added++;
                }
            });
        });

        chrome.storage.local.set({ saved_snippets: mergedSnippets, collections: mergedCollections }, () => {
            showSettingsFeedback(`Import complete — ${added} new quote${added === 1 ? '' : 's'} added.`);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Export / Import
    const exportBtn = document.getElementById('export-db-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportDatabase);

    const importBtn = document.getElementById('import-db-btn');
    const importInput = document.getElementById('import-db-input');
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) importDatabaseFile(file);
            event.target.value = '';
        });
    }

    // Sort order (persisted so the popup picks it up on next open)
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const mode = e.target.value === 'alpha' ? 'alpha' : 'date';
            chrome.storage.local.set({ sort_mode: mode }, () => {
                showSettingsFeedback(`Sort set to ${mode === 'date' ? 'Date' : 'A–Z'}.`);
            });
        });
    }

    // Highlight color
    const colorSwatches = document.getElementById('color-swatches');
    const customColorInput = document.getElementById('custom-color-input');
    const applyCustom = document.getElementById('apply-custom-color');
    const transparentToggle = document.getElementById('transparent-highlight');

    function setSelectedSwatch(color) {
        const isTransparent = color === 'transparent';
        if (colorSwatches) {
            colorSwatches.querySelectorAll('.color-swatch').forEach((btn) => {
                if (!isTransparent && btn.dataset.color && btn.dataset.color.toLowerCase() === (color || '').toLowerCase()) {
                    btn.style.outline = '3px solid rgba(194,27,27,0.18)';
                } else {
                    btn.style.outline = 'none';
                }
            });
        }
        if (customColorInput && !isTransparent) customColorInput.value = color || '#fff59d';
        if (transparentToggle) transparentToggle.checked = isTransparent;
    }

    if (colorSwatches) {
        colorSwatches.addEventListener('click', (e) => {
            const btn = e.target.closest('.color-swatch');
            if (!btn) return;
            const color = btn.dataset.color;
            chrome.storage.local.set({ highlight_color: color }, () => {
                setSelectedSwatch(color);
                showSettingsFeedback('Highlight color saved.');
            });
        });
    }
    if (applyCustom && customColorInput) {
        applyCustom.addEventListener('click', () => {
            const color = customColorInput.value;
            chrome.storage.local.set({ highlight_color: color }, () => {
                setSelectedSwatch(color);
                showSettingsFeedback('Highlight color saved.');
            });
        });
    }
    if (transparentToggle) {
        transparentToggle.addEventListener('change', () => {
            const color = transparentToggle.checked
                ? 'transparent'
                : (customColorInput && customColorInput.value) || '#ffd54f';
            chrome.storage.local.set({ highlight_color: color }, () => {
                setSelectedSwatch(color);
                showSettingsFeedback(transparentToggle.checked ? 'Highlights are now invisible on the page.' : 'Highlight color saved.');
            });
        });
    }

    // Reset
    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const ok = confirm('This will permanently delete ALL saved quotes and collections and cannot be undone. Are you sure?');
            if (!ok) return;
            chrome.storage.local.set({ saved_snippets: [], collections: {} }, () => {
                showSettingsFeedback('All data has been reset.');
            });
        });
    }

    // Initialize current values from storage
    chrome.storage.local.get(['highlight_color', 'sort_mode'], (res) => {
        setSelectedSwatch(res.highlight_color || '#ffd54f');
        if (sortSelect) sortSelect.value = res.sort_mode === 'alpha' ? 'alpha' : 'date';
    });
});
