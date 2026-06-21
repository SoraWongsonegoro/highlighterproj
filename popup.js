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
const pageSize = 20;

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
        fields.push(snippet.text, snippet.title, snippet.url, snippet.contextBefore, snippet.contextAfter);
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
        detailList.appendChild(makeSnippetCard(snippet, index, fromCollection, false));
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

    const sortToggle = document.getElementById('sort-toggle');
    if (sortToggle) {
        sortToggle.addEventListener('click', () => {
            sortMode = sortMode === 'date' ? 'alpha' : 'date';
            sortToggle.textContent = `Sort: ${sortMode === 'date' ? 'Date' : 'A–Z'}`;
            renderCurrentTab();
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

    const quoteModalCancel = document.getElementById('quote-modal-cancel');
    if (quoteModalCancel) quoteModalCancel.addEventListener('click', () => {
        document.getElementById('quote-modal').style.display = 'none';
    });
    const quoteModal = document.getElementById('quote-modal');
    if (quoteModal) quoteModal.addEventListener('click', (e) => {
        if (e.target === quoteModal) quoteModal.style.display = 'none';
    });
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
    titleLink.href = url || '#';
    titleLink.target = '_blank';
    titleLink.rel = 'noopener';
    titleLink.textContent = `${items.length} Highlights in ${title}`;
    titleLink.style.color = '#111';
    titleLink.style.textDecoration = 'none';
    titleLink.style.fontWeight = '700';
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

function makeSnippetCard(snippet, index, fromCollection, allowLink = true) {
    const snippetText = typeof snippet === 'object' ? snippet.text : snippet;
    const snippetUrl = typeof snippet === 'object' ? snippet.url : null;
    const snippetTitle = typeof snippet === 'object' ? snippet.title : null;

    const card = document.createElement('div');
    card.className = 'snippet-card fade';

    const body = document.createElement('div');
    body.className = 'snippet-body';
    body.style.cursor = 'pointer';
    body.addEventListener('click', () => openQuoteModal(snippet));

    const text = document.createElement('div');
    text.className = 'snippet-text';
    text.innerHTML = highlightQueryText(snippetText, searchQuery);
    body.appendChild(text);

    if (snippetUrl && allowLink) {
        // show small title above the snippet text (site/title) as a clickable header
        const titleEl = document.createElement('a');
        titleEl.addEventListener('click', (e) => e.stopPropagation());
        titleEl.className = 'snippet-title';
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

    card.appendChild(body);

    // small right chevron for navigation affordance
    const arrow = document.createElement('div');
    arrow.textContent = '›';
    arrow.style.cssText = 'font-size:20px;color:#111;align-self:center;padding:0 8px;';
    card.appendChild(arrow);

    // Icon actions (folder/move and trash/delete) in upper-right
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const moveIcon = document.createElement('button');
    moveIcon.className = 'icon-btn';
    moveIcon.title = 'Move';
    moveIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    moveIcon.addEventListener('click', (e) => { e.stopPropagation(); openMoveModal(snippet, index, fromCollection); });

    const deleteIcon = document.createElement('button');
    deleteIcon.className = 'icon-btn';
    deleteIcon.title = 'Delete';
    deleteIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteIcon.addEventListener('click', (e) => { e.stopPropagation(); deleteSnippet(index, fromCollection); });

    actions.appendChild(moveIcon);
    actions.appendChild(deleteIcon);
    card.appendChild(actions);
    

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


function openQuoteModal(snippet) {
    const text = typeof snippet === 'object' ? snippet.text : snippet;
    const url = typeof snippet === 'object' ? snippet.url : null;
    const title = typeof snippet === 'object' ? snippet.title : null;
    const before = typeof snippet === 'object' ? snippet.contextBefore : '';
    const after = typeof snippet === 'object' ? snippet.contextAfter : '';
    const savedAt = typeof snippet === 'object' ? snippet.savedAt : null;

    const isTitleQuote = typeof snippet === 'object' && title && text.trim() === title.trim() && !before && !after;

    const beforeEl = document.getElementById('quote-modal-context-before');
    const afterEl = document.getElementById('quote-modal-context-after');
    if (beforeEl) {
        if (!isTitleQuote && before) {
            beforeEl.textContent = `…${before}`;
            beforeEl.style.display = 'block';
        } else {
            beforeEl.textContent = '';
            beforeEl.style.display = 'none';
        }
    }
    if (afterEl) {
        if (!isTitleQuote && after) {
            afterEl.textContent = `${after}…`;
            afterEl.style.display = 'block';
        } else {
            afterEl.textContent = '';
            afterEl.style.display = 'none';
        }
    }

    const quoteTextEl = document.getElementById('quote-modal-text');
    if (quoteTextEl) {
        quoteTextEl.textContent = text;
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

// --- Events ---



// Clear-all removed per UI spec - no clear button in popup anymore.

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadAll();
});

