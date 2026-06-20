const clearBtn = document.getElementById('clear-btn');
const container = document.getElementById('collections-container');
const newCollectionInput = document.getElementById('new-collection-input');
const newCollectionBtn = document.getElementById('new-collection-btn');

function loadAll() {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const unsorted = result.saved_snippets || [];
        const collections = result.collections || {};
        renderAll(unsorted, collections);
    });
}

function renderAll(unsorted, collections) {
    container.innerHTML = '';
    const collectionNames = Object.keys(collections);

    renderSection('Unsorted', unsorted, collectionNames, false);

    collectionNames.forEach((name) => {
        renderSection(name, collections[name], [], true);
    });
}

function renderSection(title, snippets, moveTargets, isDeletable) {
    const block = document.createElement('div');
    block.className = 'collection-block';

    const header = document.createElement('div');
    header.className = 'collection-header';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = `${title} (${snippets.length})`;
    header.appendChild(titleSpan);

    if (isDeletable) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-collection-btn';
        deleteBtn.textContent = '✕ Delete';
        deleteBtn.addEventListener('click', () => deleteCollection(title));
        header.appendChild(deleteBtn);
    }

    block.appendChild(header);

    const ul = document.createElement('ul');

    if (snippets.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = 'No snippets here yet.';
        block.appendChild(empty);
    } else {
        snippets.forEach((snippet, index) => {
            const li = document.createElement('li');

            // Handle both plain strings and objects
            const snippetText = typeof snippet === 'object' ? snippet.text : snippet;
            const snippetUrl = typeof snippet === 'object' ? snippet.url : null;
            const snippetTitle = typeof snippet === 'object' ? snippet.title : null;

            const textWrapper = document.createElement('div');
            textWrapper.className = 'snippet-text';

            const text = document.createElement('span');
            text.textContent = snippetText;
            textWrapper.appendChild(text);

            // Show source page link if available
            if (snippetUrl) {
                const source = document.createElement('a');
                source.href = snippetUrl;
                source.textContent = snippetTitle || snippetUrl;
                source.target = '_blank';
                source.style.cssText = 'display:block; font-size:11px; color:#007bff; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;';
                textWrapper.appendChild(source);
            }

            li.appendChild(textWrapper);

            if (moveTargets.length > 0) {
                const controls = document.createElement('div');
                controls.className = 'snippet-controls';

                const select = document.createElement('select');
                select.className = 'move-select';
                moveTargets.forEach((name) => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });

                const moveBtn = document.createElement('button');
                moveBtn.className = 'move-btn';
                moveBtn.textContent = 'Move';
                moveBtn.addEventListener('click', () => moveToCollection(index, select.value));

                controls.appendChild(select);
                controls.appendChild(moveBtn);
                li.appendChild(controls);
            }

            ul.appendChild(li);
        });
    }

    block.appendChild(ul);
    container.appendChild(block);
}

function createCollection(name) {
    const trimmed = name.trim();
    if (!trimmed) return;

    chrome.storage.local.get(['collections'], (result) => {
        const collections = result.collections || {};

        if (collections[trimmed]) {
            alert(`"${trimmed}" already exists.`);
            return;
        }

        collections[trimmed] = [];
        chrome.storage.local.set({ collections }, loadAll);
    });
}

function deleteCollection(name) {
    if (!confirm(`Delete "${name}" and all its snippets?`)) return;

    chrome.storage.local.get(['collections'], (result) => {
        const collections = result.collections || {};
        delete collections[name];
        chrome.storage.local.set({ collections }, loadAll);
    });
}

function moveToCollection(snippetIndex, targetCollection) {
    chrome.storage.local.get(['saved_snippets', 'collections'], (result) => {
        const unsorted = result.saved_snippets || [];
        const collections = result.collections || {};

        const [snippet] = unsorted.splice(snippetIndex, 1);
        collections[targetCollection].push(snippet);

        chrome.storage.local.set({ saved_snippets: unsorted, collections }, loadAll);
    });
}

function clearAll() {
    if (!confirm('Clear everything?')) return;
    chrome.storage.local.set({ saved_snippets: [], collections: {} }, loadAll);
}

newCollectionBtn.addEventListener('click', () => {
    createCollection(newCollectionInput.value);
    newCollectionInput.value = '';
});

newCollectionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        createCollection(newCollectionInput.value);
        newCollectionInput.value = '';
    }
});

clearBtn.addEventListener('click', clearAll);

document.addEventListener('DOMContentLoaded', loadAll);