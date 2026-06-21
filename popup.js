// --- State ---
let allSnippets = [];
let allCollections = {};
let activeTab = 'all';
let sortMode = 'date';
let searchQuery = '';
let expandedSections = {}; // tracks collapsed/expanded site groups
let currentPage = 1;
let currentListItems = [];
let currentPageType = 'none';
let currentPageMeta = null;
let currentQuoteModalSnippet = null;
const pageSize = 20;
let selectionMode = false;
let selectedItems = new Set(); // stores unique keys: "snippet:INDEX" or "collection:NAME:INDEX"

// --- Init ---

function loadAll(callback) {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        allSnippets = result.saved_snippets || [];
        allCollections = result.collections || {};
        if (!allCollections.favorites) {
            allCollections.favorites = [];
            chrome.storage.local.set({ collections: allCollections }, () => {
                if (callback) callback();
                else renderCurrentTab();
            });
            return;
        }
        if (callback) callback();
        else renderCurrentTab();
    });
}

function renderCurrentTab() {
    if (activeTab === 'all') {
        renderAllQuotes();
    }
    if (activeTab === 'by-site') {
        if (currentPageType === 'pageDetail' && currentPageMeta?.type === 'page') {
            currentListItems = sortQuoteItems(currentListItems);
            renderPageDetailList(paginateItems(currentListItems));
            updatePager();
        } else {
            currentPageType = 'none';
            renderBySite();
            updatePager();
        }
    }
    if (activeTab === 'collections') {
        if (currentPageType === 'collectionDetail' && currentPageMeta?.type === 'collection') {
            currentListItems = sortQuoteItems(currentListItems);
            renderCollectionDetailList(currentPageMeta.name, paginateItems(currentListItems));
            updatePager();
        } else {
            currentPageType = 'none';
            renderCollections();
            updatePager();
        }
    }
}

function sortQuoteItems(items) {
    if (sortMode === 'alpha') {
        return [...items].sort((a, b) => {
            const aText = typeof a.snippet === 'object' ? a.snippet.text || '' : String(a.snippet);
            const bText = typeof b.snippet === 'object' ? b.snippet.text || '' : String(b.snippet);
            return aText.localeCompare(bText, undefined, { sensitivity: 'base' });
        });
    }
    return [...items].sort((a, b) => {
        const aDate = new Date(typeof a.snippet === 'object' ? a.snippet.savedAt : null).getTime() || 0;
        const bDate = new Date(typeof b.snippet === 'object' ? b.snippet.savedAt : null).getTime() || 0;
        return bDate - aDate;
    });
}

function sortPageGroups(groups) {
    if (sortMode === 'alpha') {
        return [...groups].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }
    return [...groups].sort((a, b) => {
        const aDate = Math.max(0, ...a.items.map((item) => new Date(item.snippet?.savedAt || null).getTime() || 0));
        const bDate = Math.max(0, ...b.items.map((item) => new Date(item.snippet?.savedAt || null).getTime() || 0));
        return bDate - aDate;
    });
}

function sortCollections(names) {
    if (sortMode === 'alpha') {
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return [...names].sort((a, b) => {
        const aDate = Math.max(0, ...(allCollections[a] || []).map((snippet) => new Date(snippet.savedAt || null).getTime() || 0));
        const bDate = Math.max(0, ...(allCollections[b] || []).map((snippet) => new Date(snippet.savedAt || null).getTime() || 0));
        return bDate - aDate;
    });
}

function normalizeQuery(text) {
    return String(text || '').trim().toLowerCase();
}

function quoteMatchesQuery(snippet, query) {
    if (!query) return true;
    const fields = [];
    if (typeof snippet === 'object') {
        fields.push(snippet.text, snippet.title, snippet.url);
    } else {
        fields.push(snippet);
    }
    const haystack = fields.filter(Boolean).join(' ').toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightQueryText(value, query) {
    const termText = normalizeQuery(query);
    if (!termText) {
        return escapeHtml(value);
    }

    const terms = termText
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (!terms.length) {
        return escapeHtml(value);
    }

    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    return escapeHtml(value).replace(regex, '<mark class="search-highlight">$1</mark>');
}

function paginateItems(items) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

function updatePager() {
    const pagerRow = document.getElementById('pager-row');
    const pagerInfo = document.getElementById('pager-info');
    const prev = document.getElementById('pager-prev');
    const next = document.getElementById('pager-next');
    if (!pagerRow || !pagerInfo || !prev || !next) return;

    if (currentPageType === 'all' || currentPageType === 'pageDetail' || currentPageType === 'collectionDetail') {
        pagerRow.style.display = 'flex';
        const total = currentListItems.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const end = Math.min(total, currentPage * pageSize);
        pagerInfo.textContent = `${start}-${end} of ${total}`;
        prev.disabled = currentPage <= 1;
        next.disabled = currentPage >= totalPages;
    } else {
        pagerRow.style.display = 'none';
    }
}

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(currentListItems.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage + delta), totalPages);
    if (currentPageType === 'all') {
        renderQuoteCards(paginateItems(currentListItems));
        updatePager();
    } else if (currentPageType === 'pageDetail') {
        renderPageDetailList(paginateItems(currentListItems));
    } else if (currentPageType === 'collectionDetail') {
        renderCollectionDetailList(currentPageMeta.name, paginateItems(currentListItems));
    }
}

function renderQuoteCards(quotes) {
    const container = document.getElementById('all-quotes-list');
    container.innerHTML = '';
    quotes.forEach(({ snippet, index, fromCollection }) => {
        container.appendChild(makeSnippetCard(snippet, index, fromCollection, true));
    });
}

function renderPageDetailList(items) {
    const detailList = document.getElementById('page-detail-list');
    if (!detailList) return;
    detailList.innerHTML = '';
    items.forEach(({ snippet, index, fromCollection }) => {
        detailList.appendChild(makeSnippetCard(snippet, index, fromCollection, false, true));
    });
    updatePager();
}

function renderCollectionDetailList(name, items) {
    const detailList = document.getElementById('collection-detail-list');
    if (!detailList) return;
    detailList.innerHTML = '';
    items.forEach(({ snippet, index, fromCollection }) => {
        detailList.appendChild(makeSnippetCard(snippet, index, fromCollection || name, true));
    });
    updatePager();
}

function getItemKey(snippet, index, fromCollection) {
    return fromCollection ? `col:${fromCollection}:${index}` : `snip:${index}`;
}

function enterSelectionMode() {
    selectionMode = true;
    selectedItems.clear();
    const btn = document.getElementById('select-mode-btn');
    if (btn) { btn.textContent = '✓ Selecting'; btn.style.background = '#c21b1b'; btn.style.color = '#fff'; }
    renderCurrentTab();
    updateHotbar();
}

function exitSelectionMode() {
    selectionMode = false;
    selectedItems.clear();
    const btn = document.getElementById('select-mode-btn');
    if (btn) { btn.textContent = 'Select'; btn.style.background = ''; btn.style.color = ''; }
    const hotbar = document.getElementById('selection-hotbar');
    if (hotbar) hotbar.style.display = 'none';
    renderCurrentTab();
}

function updateHotbar() {
    const hotbar = document.getElementById('selection-hotbar');
    const countEl = document.getElementById('hotbar-count');
    if (!hotbar || !countEl) return;
    const n = selectedItems.size;
    if (!selectionMode) { hotbar.style.display = 'none'; return; }
    hotbar.style.display = 'flex';
    countEl.textContent = `${n} selected`;

    const selectAllBtn = document.getElementById('hotbar-select-all');
    if (selectAllBtn) {
        const allKeys = currentListItems.map(({ snippet, index, fromCollection }) =>
            getItemKey(snippet, index, fromCollection)
        );
        const allSelected = allKeys.length > 0 && allKeys.every(key => selectedItems.has(key));
        selectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
    }
}

function toggleItemSelection(key) {
    if (selectedItems.has(key)) selectedItems.delete(key);
    else selectedItems.add(key);
    syncCheckboxes();
    updateHotbar();
}

function selectAllVisible() {
    const allKeys = currentListItems.map(({ snippet, index, fromCollection }) =>
        getItemKey(snippet, index, fromCollection)
    );
    const allSelected = allKeys.every(key => selectedItems.has(key));
    if (allSelected) {
        allKeys.forEach(key => selectedItems.delete(key));
    } else {
        allKeys.forEach(key => selectedItems.add(key));
    }
    syncCheckboxes();
    updateHotbar();
}

function getSelectedItemObjects() {
    // resolve selectedItems keys back to actual snippet objects
    const result = [];
    currentListItems.forEach(({ snippet, index, fromCollection }) => {
        const key = getItemKey(snippet, index, fromCollection);
        if (selectedItems.has(key)) result.push({ snippet, index, fromCollection, key });
    });
    return result;
}

function deleteSelected() {
    if (selectedItems.size === 0) return;
    if (!confirm(`Delete ${selectedItems.size} quote${selectedItems.size !== 1 ? 's' : ''}?`)) return;
    const toDelete = getSelectedItemObjects();
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const savedSnippets = result.saved_snippets || [];
        const collections = result.collections || {};
        // group by collection to splice in reverse index order
        const byCollection = {};
        toDelete.forEach(({ index, fromCollection }) => {
            const key = fromCollection === null ? '__main__' : fromCollection;
            if (!byCollection[key]) byCollection[key] = [];
            byCollection[key].push(index);
        });
        Object.entries(byCollection).forEach(([colKey, indices]) => {
            indices.sort((a, b) => b - a); // splice in reverse so indices stay valid
            if (colKey === '__main__') indices.forEach(i => savedSnippets.splice(i, 1));
            else if (collections[colKey]) indices.forEach(i => collections[colKey].splice(i, 1));
        });
        chrome.storage.local.set({ saved_snippets: savedSnippets, collections }, () => {
            selectedItems.clear();
            exitSelectionMode();
            loadAll();
        });
    });
}

function exportSelected() {
    const items = getSelectedItemObjects();
    if (items.length === 0) return;
    const snippets = items.map(({ snippet }) => snippet);
    const blob = new Blob([JSON.stringify({ saved_snippets: snippets }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `highlighter-export-${new Date().toISOString().slice(0, 10)}.db`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
    exitSelectionMode();
}

function copySelected() {
    const items = getSelectedItemObjects();
    if (items.length === 0) return;

    const modal = document.getElementById('copy-options-modal');
    if (modal) modal.style.display = 'flex';
}

function executeCopySelected() {
    const items = getSelectedItemObjects();
    const includeSource = document.getElementById('copy-opt-source')?.checked;
    const includeUrl = document.getElementById('copy-opt-url')?.checked;
    const includeDate = document.getElementById('copy-opt-date')?.checked;

    const text = items.map(({ snippet }) => {
        const t = typeof snippet === 'object' ? snippet.text : String(snippet);
        const title = typeof snippet === 'object' ? snippet.title : null;
        const url = typeof snippet === 'object' ? snippet.url : null;
        const savedAt = typeof snippet === 'object' ? snippet.savedAt : null;
        const dateLabel = savedAt ? new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        const lines = [
            `"${t}"`,
            includeSource && title ? `Source: ${title}` : null,
            includeUrl && url ? `URL: ${url}` : null,
            includeDate && dateLabel ? `Saved: ${dateLabel}` : null
        ].filter(Boolean);
        return lines.join('\n');
    }).join('\n\n---\n\n');

    copyTextToClipboard(text);

    const modal = document.getElementById('copy-options-modal');
    if (modal) modal.style.display = 'none';
    exitSelectionMode();
}

function openMoveModalForSelected() {
    const items = getSelectedItemObjects();
    if (items.length === 0) return;
    // reuse pendingMove but store array; patch confirmMove to handle array
    pendingMove = { bulk: items };
    const modal = document.getElementById('move-modal');
    const options = document.getElementById('move-modal-options');
    options.innerHTML = '';
    const destinations = Object.keys(allCollections).filter(name =>
        !items.every(({ fromCollection }) => fromCollection === name)
    );
    if (destinations.length === 0) {
        options.innerHTML = '<p class="empty-msg">No other destinations available.</p>';
    } else {
        destinations.forEach((label) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = 'display:block;width:100%;padding:8px 10px;margin-bottom:6px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;cursor:pointer;font-size:13px;text-align:left;';
            btn.addEventListener('mouseover', () => btn.style.background = '#e9ecef');
            btn.addEventListener('mouseout', () => btn.style.background = '#f8f9fa');
            btn.addEventListener('click', () => confirmBulkMove(label));
            options.appendChild(btn);
        });
    }
    modal.style.display = 'flex';
}

function confirmBulkMove(destination) {
    const { bulk } = pendingMove;
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const savedSnippets = result.saved_snippets || [];
        const collections = result.collections || {};
        if (!collections[destination]) collections[destination] = [];
        // group by source, splice in reverse
        const bySource = {};
        bulk.forEach(({ snippet, index, fromCollection }) => {
            const key = fromCollection === null ? '__main__' : fromCollection;
            if (!bySource[key]) bySource[key] = [];
            bySource[key].push({ index, snippet });
        });
        Object.entries(bySource).forEach(([srcKey, items]) => {
            items.sort((a, b) => b.index - a.index);
            items.forEach(({ index, snippet }) => {
                if (srcKey === '__main__') savedSnippets.splice(index, 1);
                else if (collections[srcKey]) collections[srcKey].splice(index, 1);
                collections[destination].push(snippet);
            });
        });
        chrome.storage.local.set({ saved_snippets: savedSnippets, collections }, () => {
            closeMoveModal();
            selectedItems.clear();
            exitSelectionMode();
            loadAll();
        });
    });
}

// --- UI initialization (attach DOM listeners safely) ---
function initUI() {
    // Tab switching
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            const page = document.getElementById(`page-${activeTab}`);
            if (page) page.classList.add('active');
            renderCurrentTab();
        });
    });

    // Back button for collection detail
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const collectionDetail = document.getElementById('collection-detail');
            const collectionsList = document.getElementById('collections-list');
            const toolbar = document.querySelector('.toolbar');
            if (collectionDetail) collectionDetail.style.display = 'none';
            if (toolbar) toolbar.style.display = 'flex';
            if (collectionsList) {
                collectionsList.style.display = 'grid';
            }
            currentPageType = 'none';
            currentListItems = [];
            currentPageMeta = null;
            renderCollections();
        });
    }

    // Back button for page detail
    const pageBack = document.getElementById('page-back-btn');
    if (pageBack) {
        pageBack.addEventListener('click', () => {
            const listContainer = document.getElementById('by-site-list');
            const detail = document.getElementById('page-detail');
            if (detail) detail.style.display = 'none';
            if (listContainer) listContainer.style.display = 'block';
            currentPageType = 'none';
            currentListItems = [];
            currentPageMeta = null;
            updatePager();
        });
    }

    // Delete collection button in collection detail view
    const deleteCollectionBtn = document.getElementById('delete-collection-btn');
    if (deleteCollectionBtn) {
        deleteCollectionBtn.addEventListener('click', () => {
            if (!currentPageMeta || currentPageMeta.type !== 'collection') return;
            const collectionName = currentPageMeta.name;
            if (confirm(`Delete collection "${collectionName}"? This will not delete the saved quotes.`)) {
                chrome.storage.local.get(['collections'], (data) => {
                    const collections = data.collections || {};
                    delete collections[collectionName];
                    chrome.storage.local.set({ collections }, () => {
                        allCollections = collections;
                        // Navigate back to collections view
                        const collectionDetail = document.getElementById('collection-detail');
                        const collectionsList = document.getElementById('collections-list');
                        const toolbar = document.querySelector('.toolbar');
                        if (collectionDetail) collectionDetail.style.display = 'none';
                        if (toolbar) toolbar.style.display = 'flex';
                        if (collectionsList) {
                            collectionsList.style.display = 'grid';
                        }
                        currentPageType = 'none';
                        currentListItems = [];
                        currentPageMeta = null;
                        renderCollections();
                    });
                });
            }
        });
    }

    // Collection popup toggle
    const showCollectionPopup = document.getElementById('show-collection-popup');
    const newCollectionPopup = document.getElementById('new-collection-popup');
    const newCollectionInput = document.getElementById('new-collection-input');
    if (showCollectionPopup && newCollectionPopup) {
        showCollectionPopup.addEventListener('click', (e) => {
            e.stopPropagation();
            newCollectionPopup.classList.toggle('visible');
            if (newCollectionPopup.classList.contains('visible') && newCollectionInput) {
                newCollectionInput.focus();
            }
        });
    }
    document.addEventListener('click', (e) => {
        if (newCollectionPopup && showCollectionPopup && !newCollectionPopup.contains(e.target) && e.target !== showCollectionPopup) {
            newCollectionPopup.classList.remove('visible');
        }
    });

    // Move modal cancellation
    const moveCancel = document.getElementById('move-modal-cancel');
    if (moveCancel) moveCancel.addEventListener('click', closeMoveModal);
    const moveModal = document.getElementById('move-modal');
    if (moveModal) {
        moveModal.addEventListener('click', (e) => {
            if (e.target === moveModal) closeMoveModal();
        });
    }

    // Reset data button in settings modal
    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const ok = confirm('This will permanently delete ALL saved quotes and collections and cannot be undone. Are you sure you want to reset all data?');
            if (!ok) return;
            chrome.storage.local.set({ saved_snippets: [], collections: {} }, () => {
                // reload state and UI
                loadAll();
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal) settingsModal.style.display = 'none';
                alert('All data has been reset.');
            });
        });
    }

    // New collection events
    const newCollectionBtn = document.getElementById('new-collection-btn');
    if (newCollectionBtn) {
        newCollectionBtn.addEventListener('click', () => {
            const input = document.getElementById('new-collection-input');
            if (input) {
                createCollection(input.value);
                input.value = '';
                const popup = document.getElementById('new-collection-popup');
                if (popup) popup.classList.remove('visible');
            }
        });
    }
    if (newCollectionInput) {
        newCollectionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createCollection(e.target.value);
                e.target.value = '';
                const popup = document.getElementById('new-collection-popup');
                if (popup) popup.classList.remove('visible');
            }
        });
    }

    // Pager buttons (visual)
    const pagerPrev = document.getElementById('pager-prev');
    const pagerNext = document.getElementById('pager-next');
    if (pagerPrev) pagerPrev.addEventListener('click', () => changePage(-1));
    if (pagerNext) pagerNext.addEventListener('click', () => changePage(1));

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.value = sortMode;
        sortSelect.addEventListener('change', (e) => {
            sortMode = e.target.value;
            renderCurrentTab();
            showSettingsFeedback(`Sort set to ${sortMode === 'date' ? 'Date' : 'A–Z'}.`);
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = searchQuery;
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            currentPage = 1;
            renderCurrentTab();
        });
    }

    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-modal-close');
    const exportDbBtn = document.getElementById('export-db-btn');
    const importDbBtn = document.getElementById('import-db-btn');
    const importDbInput = document.getElementById('import-db-input');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
        });
    }
    if (settingsClose && settingsModal) {
        settingsClose.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
    }
    if (exportDbBtn) {
        exportDbBtn.addEventListener('click', () => exportDatabase());
    }
    // Highlight color settings
    const colorSwatches = document.getElementById('color-swatches');
    const customColorInput = document.getElementById('custom-color-input');
    const applyCustom = document.getElementById('apply-custom-color');
    function setSelectedSwatch(color) {
        if (!colorSwatches) return;
        colorSwatches.querySelectorAll('.color-swatch').forEach((btn) => {
            if (btn.dataset.color && btn.dataset.color.toLowerCase() === (color || '').toLowerCase()) {
                btn.style.outline = '3px solid rgba(194,27,27,0.18)';
            } else {
                btn.style.outline = 'none';
            }
        });
        if (customColorInput) customColorInput.value = color || '#fff59d';
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
    // Initialize current highlight color UI
    chrome.storage.local.get(['highlight_color'], (res) => {
        const c = res.highlight_color || '#ffd54f';
        setSelectedSwatch(c);
    });
    if (importDbBtn && importDbInput) {
        importDbBtn.addEventListener('click', () => importDbInput.click());
    }
    if (importDbInput) {
        importDbInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                importDatabaseFile(file);
            }
            event.target.value = '';
        });
    }

    const quoteModalCancel = document.getElementById('quote-modal-cancel');
    if (quoteModalCancel) quoteModalCancel.addEventListener('click', () => {
        document.getElementById('quote-modal').style.display = 'none';
    });
    const quoteModalCopy = document.getElementById('quote-modal-copy');
    if (quoteModalCopy) quoteModalCopy.addEventListener('click', () => copyQuoteFullText(currentQuoteModalSnippet));
    const quoteModalPng = document.getElementById('quote-modal-png');
    if (quoteModalPng) quoteModalPng.addEventListener('click', () => {
        saveQuoteAsPng(currentQuoteModalSnippet);
        showQuoteModalFeedback('PNG saved!');
    });
    const quoteModal = document.getElementById('quote-modal');
    if (quoteModal) quoteModal.addEventListener('click', (e) => {
        if (e.target === quoteModal) quoteModal.style.display = 'none';
    });

    //select mode and bulk actions

    const selectModeBtn = document.getElementById('select-mode-btn');
    if (selectModeBtn) {
        selectModeBtn.addEventListener('click', () => {
            if (selectionMode) exitSelectionMode();
            else enterSelectionMode();
        });
    }
    const hotbarSelectAll = document.getElementById('hotbar-select-all');
    if (hotbarSelectAll) hotbarSelectAll.addEventListener('click', selectAllVisible);
    const hotbarDelete = document.getElementById('hotbar-delete');
    if (hotbarDelete) hotbarDelete.addEventListener('click', deleteSelected);
    const hotbarExport = document.getElementById('hotbar-export');
    if (hotbarExport) hotbarExport.addEventListener('click', exportSelected);
    const hotbarMove = document.getElementById('hotbar-move');
    if (hotbarMove) hotbarMove.addEventListener('click', openMoveModalForSelected);
    const hotbarCopy = document.getElementById('hotbar-copy');
    if (hotbarCopy) hotbarCopy.addEventListener('click', copySelected);

    //copy options menu
    const copyOptionsConfirm = document.getElementById('copy-options-confirm');
    if (copyOptionsConfirm) copyOptionsConfirm.addEventListener('click', executeCopySelected);

    const copyOptionsCancel = document.getElementById('copy-options-cancel');
    if (copyOptionsCancel) copyOptionsCancel.addEventListener('click', () => {
        document.getElementById('copy-options-modal').style.display = 'none';
    });

    const copyOptionsModal = document.getElementById('copy-options-modal');
    if (copyOptionsModal) copyOptionsModal.addEventListener('click', (e) => {
        if (e.target === copyOptionsModal) copyOptionsModal.style.display = 'none';
    });


    // info page modal

    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const infoModalClose = document.getElementById('info-modal-close');
    const infoModalDone = document.getElementById('info-modal-done');

    if (infoBtn && infoModal) {
        infoBtn.addEventListener('click', () => infoModal.style.display = 'flex');
    }
    if (infoModalClose && infoModal) {
        infoModalClose.addEventListener('click', () => infoModal.style.display = 'none');
    }
    if (infoModalDone && infoModal) {
        infoModalDone.addEventListener('click', () => infoModal.style.display = 'none');
    }
    if (infoModal) {
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) infoModal.style.display = 'none';
        });
    }
}

// --- All Quotes page ---

function renderAllQuotes() {
    const container = document.getElementById('all-quotes-list');
    container.innerHTML = '';
    const collectionNames = Object.keys(allCollections);

    const allQuotes = [
        ...allSnippets.map((snippet, index) => ({ snippet, index, fromCollection: null })),
        ...collectionNames.flatMap(name =>
            allCollections[name].map((snippet, index) => ({ snippet, index, fromCollection: name }))
        )
    ];

    const filteredQuotes = allQuotes.filter((item) => quoteMatchesQuery(item.snippet, normalizeQuery(searchQuery)));
    const sortedQuotes = sortQuoteItems(filteredQuotes);

    if (sortedQuotes.length === 0) {
        currentPageType = 'none';
        currentListItems = [];
        container.innerHTML = `<p class="empty-msg">${searchQuery ? 'No saved quotes match your search.' : 'No saved quotes yet.'}</p>`;
        updatePager();
        return;
    }

    currentPageType = 'all';
    currentListItems = sortedQuotes;
    currentPage = 1;
    renderQuoteCards(paginateItems(sortedQuotes));
    updatePager();
}

// --- By Website page ---

function renderBySite() {
    const container = document.getElementById('by-site-list');
    const detail = document.getElementById('page-detail');
    if (detail) detail.style.display = 'none';
    if (container) container.style.display = 'block';
    container.innerHTML = '';

    // Build list of pages (grouped by URL/title)
    const collectionNames = Object.keys(allCollections);
    const allQuotes = [
        ...allSnippets.map((snippet, index) => ({ snippet, index, fromCollection: null })),
        ...collectionNames.flatMap(name =>
            allCollections[name].map((snippet, index) => ({ snippet, index, fromCollection: name }))
        )
    ];

    currentPageType = 'none';
    currentListItems = [];
    currentPageMeta = null;

    const filteredQuotes = allQuotes.filter((item) => quoteMatchesQuery(item.snippet, normalizeQuery(searchQuery)));
    if (filteredQuotes.length === 0) {
        container.innerHTML = '<p class="empty-msg">No saved quotes match your search.</p>';
        return;
    }

    const pages = {}; // key: url (or generated key), value: { title, url, items[] }
    filteredQuotes.forEach((item) => {
        const url = typeof item.snippet === 'object' ? item.snippet.url || '__no_url__' : '__no_url__';
        const title = typeof item.snippet === 'object' ? item.snippet.title || url : (typeof item.snippet === 'string' ? '' : '');
        const key = url;
        if (!pages[key]) pages[key] = { title, url, items: [] };
        pages[key].items.push(item);
    });

    const header = document.createElement('div');
    header.id = 'page-count-header';
    header.textContent = `${Object.keys(pages).length} Pages`;
    container.appendChild(header);

    // Render each page as a card: title + count
    sortPageGroups(Object.values(pages)).forEach((p) => {
        const card = document.createElement('div');
        card.className = 'page-item fade';
        card.innerHTML = `
            <div class="meta">
                <div class="title">${p.title || p.url}</div>
                <div class="count">${p.items.length} Highlight${p.items.length!==1?'s':''}</div>
            </div>
            <div class="chev">›</div>
        `;
        card.addEventListener('click', () => openPageDetail(p.url, p.title || p.url, p.items));
        container.appendChild(card);
    });
}

function openPageDetail(url, title, items) {
    const listContainer = document.getElementById('by-site-list');
    const detail = document.getElementById('page-detail');
    const detailTitle = document.getElementById('page-detail-title');

    if (!detail || !detailTitle) return;
    const sortedItems = sortQuoteItems(items);
    currentPageType = 'pageDetail';
    currentListItems = sortedItems;
    currentPageMeta = { type: 'page', url, title, items: sortedItems };
    currentPage = 1;

    listContainer.style.display = 'none';
    detail.style.display = 'flex';
    detailTitle.innerHTML = '';
    const titleLink = document.createElement('a');
    titleLink.className = 'title-link';
    titleLink.href = url || '#';
    titleLink.target = '_blank';
    titleLink.rel = 'noopener';
    titleLink.textContent = `${items.length} Highlights in ${title}`;
    // make page title link less prominent (unbolded); CSS handles hover color
    titleLink.style.color = '#111';
    titleLink.style.fontWeight = '400';
    detailTitle.appendChild(titleLink);

    renderPageDetailList(paginateItems(items));
}


// --- Collections page ---

function renderCollections() {
    const collectionsPage = document.getElementById('collections-list');
    const detailView = document.getElementById('collection-detail');
    const toolbar = document.querySelector('.toolbar');

    currentPageType = 'none';
    currentListItems = [];
    currentPageMeta = null;

    if (toolbar) toolbar.style.display = 'flex';
    collectionsPage.style.display = 'grid';
    detailView.style.display = 'none';
    collectionsPage.innerHTML = '';

    const names = Object.keys(allCollections);
    const filteredNames = names.filter((name) => {
        if (!searchQuery) return true;
        const lowerName = name.toLowerCase();
        if (lowerName.includes(searchQuery.toLowerCase())) return true;
        return (allCollections[name] || []).some((snippet) => quoteMatchesQuery(snippet, normalizeQuery(searchQuery)));
    });
    const sortedNames = sortCollections(filteredNames);

    if (sortedNames.length === 0) {
        collectionsPage.innerHTML = '<p class="empty-msg">No collections yet. Add one above.</p>';
        return;
    }

    sortedNames.forEach((name) => {
        const card = document.createElement('div');
        card.className = 'collection-card fade';
        card.innerHTML = `
            <div class="card-actions">
                <button class="icon-btn delete-collection-btn" title="Delete collection">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="meta">
                <div class="title">${name}</div>
                <div class="count">${allCollections[name].length} Highlight${allCollections[name].length!==1?'s':''}</div>
            </div>
            <div class="chev">›</div>
        `;
        const deleteBtn = card.querySelector('.delete-collection-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCollection(name);
            });
        }
        card.addEventListener('click', () => openCollectionDetail(name));
        collectionsPage.appendChild(card);
    });

    updatePager();
}

function openCollectionDetail(name) {
    const collectionsPage = document.getElementById('collections-list');
    const newCollectionRow = document.querySelector('.toolbar');
    const detailView = document.getElementById('collection-detail');
    const detailTitle = document.getElementById('collection-detail-title');

    const filteredSnippets = (allCollections[name] || []).map((snippet, index) => ({ snippet, index, fromCollection: name }))
        .filter((item) => quoteMatchesQuery(item.snippet, normalizeQuery(searchQuery)));
    const sortedSnippets = sortQuoteItems(filteredSnippets);
    currentPageType = 'collectionDetail';
    currentListItems = sortedSnippets;
    currentPageMeta = { type: 'collection', name, items: sortedSnippets };
    currentPage = 1;

    collectionsPage.style.display = 'none';
    if (newCollectionRow) newCollectionRow.style.display = 'none';
    detailView.style.display = 'flex';
    detailTitle.textContent = name;

    if (sortedSnippets.length === 0) {
        const detailList = document.getElementById('collection-detail-list');
        if (detailList) {
            detailList.innerHTML = `<p class="empty-msg">${searchQuery ? 'No saved quotes match your search in this collection.' : 'No quotes in this collection yet.'}</p>`;
        }
        updatePager();
        return;
    }

    renderCollectionDetailList(name, paginateItems(sortedSnippets));
}



// --- Move Modal ---

let pendingMove = null; // { snippet, index, fromCollection }

function openMoveModal(snippet, index, fromCollection) {
    pendingMove = { snippet, index, fromCollection };

    const modal = document.getElementById('move-modal');
    const options = document.getElementById('move-modal-options');
    options.innerHTML = '';

    // Build destination list
    const destinations = [];

    // All collections except the one it's already in
    Object.keys(allCollections).forEach((name) => {
        if (name !== fromCollection) {
            destinations.push({ label: name, value: name });
        }
    });

    if (destinations.length === 0) {
        options.innerHTML = '<p class="empty-msg">No other destinations available.</p>';
    } else {
        destinations.forEach(({ label, value }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = 'display:block; width:100%; padding:8px 10px; margin-bottom:6px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:4px; cursor:pointer; font-size:13px; text-align:left;';
            btn.addEventListener('mouseover', () => btn.style.background = '#e9ecef');
            btn.addEventListener('mouseout', () => btn.style.background = '#f8f9fa');
            btn.addEventListener('click', () => confirmMove(value));
            options.appendChild(btn);
        });
    }

    modal.style.display = 'flex';
}

function confirmMove(destination) {
    if (pendingMove?.bulk) { confirmBulkMove(destination); return; }

    const { snippet, index, fromCollection } = pendingMove;

    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const savedSnippets = result.saved_snippets || [];
        const collections = result.collections || {};

        if (fromCollection === null) {
            savedSnippets.splice(index, 1);
        } else if (collections[fromCollection]) {
            collections[fromCollection].splice(index, 1);
        }

        if (!collections[destination]) collections[destination] = [];
        collections[destination].push(snippet);

        chrome.storage.local.set({ saved_snippets: savedSnippets, collections }, () => {
            closeMoveModal();
            loadAll();
        });
    });
}

function deleteSnippet(index, fromCollection) {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const savedSnippets = result.saved_snippets || [];
        const collections = result.collections || {};

        if (fromCollection === null) {
            savedSnippets.splice(index, 1);
        } else if (collections[fromCollection]) {
            collections[fromCollection].splice(index, 1);
        }

        chrome.storage.local.set({ saved_snippets: savedSnippets, collections }, () => loadAll());
    });
}

function syncCheckboxes() {
    document.querySelectorAll('.snippet-card[data-sel-key]').forEach((card) => {
        const cb = card.querySelector('.sel-checkbox');
        if (cb) cb.checked = selectedItems.has(card.dataset.selKey);
    });
}

function makeSnippetCard(snippet, index, fromCollection, allowLink = true, hideTitle = false) {
    const key = getItemKey(snippet, index, fromCollection);
    const snippetText = typeof snippet === 'object' ? snippet.text : snippet;
    const snippetUrl = typeof snippet === 'object' ? snippet.url : null;
    const snippetTitle = typeof snippet === 'object' ? snippet.title : null;

    const card = document.createElement('div');
    card.className = 'snippet-card fade';
    card.dataset.selKey = key;

    const body = document.createElement('div');
    body.className = 'snippet-body';
    body.style.cursor = 'pointer';
    body.addEventListener('click', (e) => {
        if (selectionMode) {
            e.stopPropagation();
            if (dragDidMove) return; // drag just ended, don't double-toggle
            toggleItemSelection(key);
            syncCheckboxes();
            return;
        }
        openQuoteModal(snippet);
    });

    const text = document.createElement('div');
    text.className = 'snippet-text';
    text.innerHTML = highlightQueryText(snippetText, searchQuery);
    body.appendChild(text);

    if (!hideTitle) {
        if (snippetUrl && allowLink) {
            // show small title above the snippet text (site/title) as a clickable header
            const titleEl = document.createElement('a');
            titleEl.addEventListener('click', (e) => e.stopPropagation());
                titleEl.className = 'snippet-title title-link';
            let hostLabel = snippetTitle;
            if (!hostLabel) {
                try {
                    hostLabel = (new URL(snippetUrl)).hostname;
                } catch (e) {
                    hostLabel = snippetUrl;
                }
            }
            titleEl.innerHTML = highlightQueryText(hostLabel, searchQuery);
            titleEl.href = snippetUrl;
            titleEl.target = '_blank';
            titleEl.rel = 'noopener';
            body.insertBefore(titleEl, text);
        } else if (snippetTitle) {
            const titleEl = document.createElement('div');
            titleEl.className = 'snippet-title';
            titleEl.innerHTML = highlightQueryText(snippetTitle, searchQuery);
            body.insertBefore(titleEl, text);
        }
    }

    card.appendChild(body);

   if (selectionMode) {
        card.dataset.selKey = key;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'sel-checkbox';
        cb.checked = selectedItems.has(key);
        cb.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;accent-color:#c21b1b;cursor:pointer;z-index:1;';
        cb.addEventListener('click', (e) => { e.stopPropagation(); });
        cb.addEventListener('change', (e) => { e.stopPropagation(); toggleItemSelection(key); });
        card.style.paddingLeft = '36px';
        card.style.position = 'relative';
        card.insertBefore(cb, card.firstChild);
        initDragSelection(card, key);
    }

    // Icon actions (folder/move and trash/delete) in upper-right
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const moveIcon = document.createElement('button');
    moveIcon.className = 'icon-btn';
    moveIcon.title = 'Move';
    moveIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    moveIcon.addEventListener('click', (e) => { e.stopPropagation(); openMoveModal(snippet, index, fromCollection); });

    const copyIcon = document.createElement('button');
    copyIcon.className = 'icon-btn';
    copyIcon.title = 'Copy text';
    copyIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copyIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(snippetText);
        const tooltip = card.querySelector('.copy-tooltip');
        if (tooltip) {
            tooltip.classList.add('visible');
            clearTimeout(tooltip.hideTimeout);
            tooltip.hideTimeout = setTimeout(() => tooltip.classList.remove('visible'), 1200);
        }
    });

    const deleteIcon = document.createElement('button');
    deleteIcon.className = 'icon-btn';
    deleteIcon.title = 'Delete';
    deleteIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteIcon.addEventListener('click', (e) => { e.stopPropagation(); deleteSnippet(index, fromCollection); });

    actions.appendChild(copyIcon);
    actions.appendChild(moveIcon);
    actions.appendChild(deleteIcon);
    card.appendChild(actions);

    const tooltip = document.createElement('div');
    tooltip.className = 'copy-tooltip';
    tooltip.textContent = 'Copied!';
    card.appendChild(tooltip);

    return card;
}

function closeMoveModal() {
    document.getElementById('move-modal').style.display = 'none';
    pendingMove = null;
}



function createCollection(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (allCollections[trimmed]) {
        alert(`"${trimmed}" already exists.`);
        return;
    }
    const collections = { ...allCollections, [trimmed]: [] };
    chrome.storage.local.set({ collections }, () => loadAll());
}

function deleteCollection(name) {
    if (!name || !allCollections[name]) return;
    const confirmed = confirm(`Delete collection "${name}"? This will remove the collection but keep its saved snippets.`);
    if (!confirmed) return;
    const collections = { ...allCollections };
    delete collections[name];
    chrome.storage.local.set({ collections }, () => loadAll());
}

function getQuoteModalText(snippet) {
    const text = typeof snippet === 'object' ? snippet.text : String(snippet);
    const url = typeof snippet === 'object' ? snippet.url : '';
    const title = typeof snippet === 'object' ? snippet.title : '';
    const savedAt = typeof snippet === 'object' ? snippet.savedAt : null;
    const dateLabel = savedAt ? new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const lines = [`"${text}"`, '', title ? `Source: ${title}` : null, url ? `URL: ${url}` : null, dateLabel ? `Saved: ${dateLabel}` : null].filter(Boolean);
    return lines.join('\n');
}

function showQuoteModalFeedback(message) {
    const tooltip = document.getElementById('quote-modal-tooltip');
    if (!tooltip) return;
    tooltip.textContent = message;
    tooltip.style.opacity = '1';
    clearTimeout(tooltip.hideTimeout);
    tooltip.hideTimeout = setTimeout(() => {
        tooltip.style.opacity = '0';
    }, 1400);
}

function copyTextToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        });
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function copyQuoteFullText(snippet) {
    if (!snippet) return;
    const text = getQuoteModalText(snippet);
    copyTextToClipboard(text);
    showQuoteModalFeedback('Copied!');
}

function showSettingsFeedback(message) {
    const feedback = document.getElementById('settings-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.style.opacity = '1';
    clearTimeout(feedback.hideTimeout);
    feedback.hideTimeout = setTimeout(() => {
        feedback.style.opacity = '0';
    }, 1800);
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
        link.download = `highlighter-quotes-${new Date().toISOString().slice(0, 10)}.db`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
        showSettingsFeedback('Export complete.');
    });
}

function importDatabaseFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const rawText = String(event.target?.result || '').replace(/^\uFEFF/, '');
            const payload = JSON.parse(rawText);
            mergeImportedDatabase(payload);
        } catch (err) {
            showSettingsFeedback('Import failed: invalid database file.');
        }
    };
    reader.onerror = () => {
        showSettingsFeedback('Import failed: unable to read file.');
    };
    reader.readAsText(file);
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

        const mergedSnippets = [...existingSnippets];
        importedSnippets.forEach((snippet) => {
            if (snippet && typeof snippet === 'object') {
                if (!existingKeys.has(snippetKey(snippet))) {
                    mergedSnippets.push({
                        text: snippet.text || '',
                        url: snippet.url || '',
                        title: snippet.title || '',
                        savedAt: snippet.savedAt || new Date().toISOString()
                    });
                    existingKeys.add(snippetKey(snippet));
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
                        savedAt: snippet.savedAt || new Date().toISOString()
                    });
                    collectionKeys.add(snippetKey(snippet));
                }
            });
        });

        chrome.storage.local.set({ saved_snippets: mergedSnippets, collections: mergedCollections }, () => {
            showSettingsFeedback('Import complete.');
            loadAll();
        });
    });
}

function wrapCanvasText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = ctx.measureText(testLine).width;
        if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
}

function sanitizeFileName(value) {
    return String(value || 'quote').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'quote';
}

function saveQuoteAsPng(snippet) {
    if (!snippet) return;
    const quoteText = typeof snippet === 'object' ? snippet.text : String(snippet);
    const titleText = typeof snippet === 'object' ? snippet.title : 'Saved Quote';
    const savedAt = typeof snippet === 'object' ? snippet.savedAt : null;
    const canvasSize = 900;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#c81b21';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.fillStyle = '#a5161f';
    ctx.fillRect(0, 0, canvasSize, 120);

    const padding = 64;
    const maxTextWidth = canvasSize - padding * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#fff';
    ctx.font = '700 24px Cambria, serif';
    const titleLines = wrapCanvasText(ctx, titleText.toUpperCase(), maxTextWidth);
    titleLines.forEach((line, index) => {
        ctx.fillText(line, padding, padding / 2 + index * 32);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(padding / 2, 140, canvasSize - padding, 3);

    const quoteTop = 170;
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 40px Cambria, serif';
    const quoteLines = wrapCanvasText(ctx, `“${quoteText}”`, maxTextWidth);
    quoteLines.forEach((line, index) => {
        ctx.fillText(line, padding, quoteTop + index * 52);
    });

    if (savedAt) {
        ctx.font = '16px Cambria, serif';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`Saved on ${new Date(savedAt).toLocaleDateString()}`, padding, canvasSize - padding - 28);
    }

    ctx.font = '20px Cambria, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const footerText = `quote from ${titleText}`;
    const footerLines = wrapCanvasText(ctx, footerText, maxTextWidth);
    footerLines.forEach((line, index) => {
        ctx.fillText(line, padding, canvasSize - padding + index * 26 - 60);
    });

    canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${sanitizeFileName(titleText)}.png`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
    }, 'image/png');
}

function openQuoteModal(snippet) {
    currentQuoteModalSnippet = snippet;
    const text = typeof snippet === 'object' ? snippet.text : snippet;
    const url = typeof snippet === 'object' ? snippet.url : null;
    const title = typeof snippet === 'object' ? snippet.title : null;
    const savedAt = typeof snippet === 'object' ? snippet.savedAt : null;

    const combinedEl = document.getElementById('quote-modal-combined');
    if (combinedEl) {
        combinedEl.innerHTML = `<strong style="color:#111;font-weight:700;">${escapeHtml(text)}</strong>`;
        combinedEl.style.display = 'block';
    }

    const savedAtEl = document.getElementById('quote-modal-saved-at');
    if (savedAtEl) {
        if (savedAt) {
            const date = new Date(savedAt);
            if (!Number.isNaN(date.getTime())) {
                savedAtEl.textContent = `Saved on ${date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
                savedAtEl.style.display = 'block';
            } else {
                savedAtEl.style.display = 'none';
            }
        } else {
            savedAtEl.style.display = 'none';
        }
    }

    const sourceEl = document.getElementById('quote-modal-source');
    if (sourceEl) {
        if (url) {
            sourceEl.href = url;
            sourceEl.textContent = title || url;
            sourceEl.style.display = 'block';
        } else {
            sourceEl.style.display = 'none';
        }
    }

    document.getElementById('quote-modal').style.display = 'flex';
}

// --- Drag scroll ---
let dragScrollInterval = null;
const SCROLL_ZONE = 40;
const SCROLL_SPEED = 6;

function getScrollContainer() {
    return document.querySelector('.page.active');
}

function startDragScroll(clientY) {
    stopDragScroll();
    const container = getScrollContainer();
    if (!container) return;
    dragScrollInterval = setInterval(() => {
        const rect = container.getBoundingClientRect();
        const distFromBottom = rect.bottom - clientY;
        const distFromTop = clientY - rect.top;
        if (distFromBottom < SCROLL_ZONE && distFromBottom > 0) {
            container.scrollTop += SCROLL_SPEED * (1 + (SCROLL_ZONE - distFromBottom) / SCROLL_ZONE);
        } else if (distFromTop < SCROLL_ZONE && distFromTop > 0) {
            container.scrollTop -= SCROLL_SPEED * (1 + (SCROLL_ZONE - distFromTop) / SCROLL_ZONE);
        }
    }, 16);
}

function stopDragScroll() {
    if (dragScrollInterval) {
        clearInterval(dragScrollInterval);
        dragScrollInterval = null;
    }
}

// --- Drag selection ---
let isDragSelecting = false;
let dragStartKey = null;
let dragDidMove = false;
let dragStartSnippet = null;

function initDragSelection(card, key) {
    card.addEventListener('mousedown', (e) => {
        if (!selectionMode || e.button !== 0) return;
        if (e.target.closest('.sel-checkbox, .icon-btn, a, button')) return;
        isDragSelecting = true;
        dragStartKey = key;
        dragDidMove = false;
        e.preventDefault();
    });
}

document.addEventListener('mousemove', (e) => {
    if (!isDragSelecting || !selectionMode) return;
    dragDidMove = true;

    startDragScroll(e.clientY);

    document.querySelectorAll('.snippet-card[data-sel-key]').forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            selectedItems.add(card.dataset.selKey);
        }
    });

    syncCheckboxes();
    updateHotbar();
});

document.addEventListener('mouseup', () => {
    if (!isDragSelecting) return;
    stopDragScroll();
    isDragSelecting = false;
    if (!dragDidMove && dragStartKey) {
        toggleItemSelection(dragStartKey);
    }
    dragStartKey = null;
    dragStartSnippet = null;
    dragDidMove = false;
});

// Clear-all removed per UI spec - no clear button in popup anymore.

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadAll();
});

