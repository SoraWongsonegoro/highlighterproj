// --- State ---
let allSnippets = [];
let allCollections = {};
let activeTab = 'all';
let expandedSections = {}; // tracks collapsed/expanded site groups

// --- Init ---

function loadAll(callback) {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        allSnippets = result.saved_snippets || [];
        allCollections = result.collections || {};
        if (callback) callback();
        else renderCurrentTab();
    });
}

function renderCurrentTab() {
    if (activeTab === 'all') renderAllQuotes();
    if (activeTab === 'by-site') renderBySite();
    if (activeTab === 'collections') renderCollections();
}

// --- Tab switching ---

document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        document.getElementById(`page-${activeTab}`).classList.add('active');
        renderCurrentTab();
    });
});

// --- All Quotes page ---

function renderAllQuotes() {
    const container = document.getElementById('all-quotes-list');
    container.innerHTML = '';
    const collectionNames = Object.keys(allCollections);

    // Merge unsorted and all collection snippets
    const collectionSnippets = collectionNames.flatMap(name => allCollections[name]);
    const allQuotes = [...allSnippets, ...collectionSnippets];

    if (allQuotes.length === 0) {
        container.innerHTML = '<p class="empty-msg">No saved quotes yet.</p>';
        return;
    }

    allSnippets.forEach((snippet, index) => {
        container.appendChild(makeSnippetCard(snippet, index, 'unsorted', null));
    });
    collectionSnippets.forEach((snippet, collectionName) => {
        const name = collectionNames.find(n => allCollections[n].includes(snippet));
        container.appendChild(makeSnippetCard(snippet, null, 'collection', name));
    });
}

// --- By Website page ---

function renderBySite() {
    const container = document.getElementById('by-site-list');
    container.innerHTML = '';

    if (allSnippets.length === 0) {
        container.innerHTML = '<p class="empty-msg">No saved quotes yet.</p>';
        return;
    }

    // Group by hostname
    const groups = {};
    allSnippets.forEach((snippet, index) => {
        const url = typeof snippet === 'object' ? snippet.url : null;
        const host = url ? new URL(url).hostname : 'Unknown site';
        if (!groups[host]) groups[host] = [];
        groups[host].push({ snippet, index });
    });

    const collectionNames = Object.keys(allCollections);

    Object.entries(groups).forEach(([host, items]) => {
        const isExpanded = expandedSections[host] !== false; // default expanded

        // Section header
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `
            <span>${host} <span style="font-weight:normal;color:#888;font-size:12px">(${items.length})</span></span>
            <span class="chevron">${isExpanded ? '▲' : '▼'}</span>
        `;

        const list = document.createElement('div');
        list.className = 'snippet-list';
        list.style.display = isExpanded ? 'block' : 'none';

        header.addEventListener('click', () => {
            expandedSections[host] = list.style.display === 'none';
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
            header.querySelector('.chevron').textContent = list.style.display === 'none' ? '▼' : '▲';
        });

        items.forEach(({ snippet, index }) => {
            list.appendChild(makeSnippetCard(snippet, index, 'unsorted', null));
        });

        container.appendChild(header);
        container.appendChild(list);
    });
}

// --- Collections page ---

function renderCollections() {
    const collectionsPage = document.getElementById('collections-list');
    const detailView = document.getElementById('collection-detail');

    collectionsPage.style.display = 'block';
    detailView.style.display = 'none';
    collectionsPage.innerHTML = '';

    const names = Object.keys(allCollections);

    if (names.length === 0) {
        collectionsPage.innerHTML = '<p class="empty-msg">No collections yet. Add one above.</p>';
        return;
    }

    names.forEach((name) => {
        const card = document.createElement('div');
        card.className = 'collection-card';
        card.innerHTML = `
            <span>${name}</span>
            <span class="count">${allCollections[name].length} quote${allCollections[name].length !== 1 ? 's' : ''}</span>
        `;
        card.addEventListener('click', () => openCollectionDetail(name));
        collectionsPage.appendChild(card);
    });
}

function openCollectionDetail(name) {
    const collectionsPage = document.getElementById('collections-list');
    const newCollectionRow = document.querySelector('.toolbar');
    const detailView = document.getElementById('collection-detail');
    const detailTitle = document.getElementById('collection-detail-title');
    const detailList = document.getElementById('collection-detail-list');

    collectionsPage.style.display = 'none';
    newCollectionRow.style.display = 'none';
    detailView.style.display = 'flex';
    detailTitle.textContent = name;
    detailList.innerHTML = '';

    const snippets = allCollections[name];

    if (snippets.length === 0) {
        detailList.innerHTML = '<p class="empty-msg">No quotes in this collection yet.</p>';
        return;
    }

    snippets.forEach((snippet) => {
        detailList.appendChild(makeSnippetCard(snippet, index, 'collection', name));
    });
}

document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('collection-detail').style.display = 'none';
    document.getElementById('collections-list').style.display = 'block';
    document.querySelector('.toolbar').style.display = 'flex';
});

// --- Move Modal ---

let pendingMove = null; // { snippet, index, fromContext, fromCollection }

function openMoveModal(snippet, index, fromContext, fromCollection) {
    pendingMove = { snippet, index, fromContext, fromCollection };

    const modal = document.getElementById('move-modal');
    const options = document.getElementById('move-modal-options');
    options.innerHTML = '';

    // Build destination list
    const destinations = [];

    // Unsorted is a valid destination if snippet isn't already there
    if (fromContext !== 'unsorted') {
        destinations.push({ label: 'Unsorted', value: '__unsorted__' });
    }

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
    const { snippet, index, fromContext, fromCollection } = pendingMove;

    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const unsorted = result.saved_snippets || [];
        const collections = result.collections || {};

        // Remove from source using index directly
        if (fromContext === 'unsorted') {
            unsorted.splice(index, 1);
        } else {
            collections[fromCollection].splice(index, 1);
        }

        // Add to destination
        if (destination === '__unsorted__') {
            unsorted.push(snippet);
        } else {
            collections[destination].push(snippet);
        }

        chrome.storage.local.set({ saved_snippets: unsorted, collections }, () => {
            closeMoveModal();
            loadAll();
        });
    });
}

function deleteSnippet(index, fromContext, fromCollection) {
    if (!confirm('Delete this quote?')) return;

    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const unsorted = result.saved_snippets || [];
        const collections = result.collections || {};

        if (fromContext === 'unsorted') {
            unsorted.splice(index, 1);
        } else {
            collections[fromCollection].splice(index, 1);
        }

        chrome.storage.local.set({ saved_snippets: unsorted, collections }, () => loadAll());
    });
}

function makeSnippetCard(snippet, index, context, fromCollection) {
    const snippetText = typeof snippet === 'object' ? snippet.text : snippet;
    const snippetUrl = typeof snippet === 'object' ? snippet.url : null;
    const snippetTitle = typeof snippet === 'object' ? snippet.title : null;

    const card = document.createElement('div');
    card.className = 'snippet-card';

    const body = document.createElement('div');
    body.className = 'snippet-body';

    const text = document.createElement('div');
    text.className = 'snippet-text';
    text.textContent = snippetText;
    body.appendChild(text);

    if (snippetUrl) {
        const source = document.createElement('a');
        source.className = 'snippet-source';
        source.href = snippetUrl;
        source.textContent = snippetTitle || snippetUrl;
        source.target = '_blank';
        body.appendChild(source);
    }

    card.appendChild(body);

    // Button group
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex; flex-direction:column; gap:4px; align-self:flex-start;';

    const moveBtn = document.createElement('button');
    moveBtn.textContent = 'Move';
    moveBtn.style.cssText = 'font-size:11px; padding:4px 8px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer; white-space:nowrap;';
    moveBtn.addEventListener('mouseover', () => moveBtn.style.background = '#0056b3');
    moveBtn.addEventListener('mouseout', () => moveBtn.style.background = '#007bff');
    moveBtn.addEventListener('click', () => openMoveModal(snippet, index, context, fromCollection));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.cssText = 'font-size:11px; padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer; white-space:nowrap;';
    deleteBtn.addEventListener('mouseover', () => deleteBtn.style.background = '#c82333');
    deleteBtn.addEventListener('mouseout', () => deleteBtn.style.background = '#dc3545');
    deleteBtn.addEventListener('click', () => deleteSnippet(index, context, fromCollection));

    btnGroup.appendChild(moveBtn);
    btnGroup.appendChild(deleteBtn);
    card.appendChild(btnGroup);

    return card;
}

function closeMoveModal() {
    document.getElementById('move-modal').style.display = 'none';
    pendingMove = null;
}

document.getElementById('move-modal-cancel').addEventListener('click', closeMoveModal);
document.getElementById('move-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('move-modal')) closeMoveModal();
});


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

function clearAll() {
    if (!confirm('Clear everything?')) return;
    chrome.storage.local.set({ saved_snippets: [], collections: {} }, () => loadAll());
}

// --- Events ---

document.getElementById('new-collection-btn').addEventListener('click', () => {
    const input = document.getElementById('new-collection-input');
    createCollection(input.value);
    input.value = '';
});

document.getElementById('new-collection-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        createCollection(e.target.value);
        e.target.value = '';
    }
});

document.getElementById('clear-btn').addEventListener('click', clearAll);

document.addEventListener('DOMContentLoaded', () => loadAll());