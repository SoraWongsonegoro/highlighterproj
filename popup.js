const snippetList = document.getElementById('snippet-list');
const clearBtn = document.getElementById('clear-btn');

function renderSnippets(snippets) {
    snippetList.innerHTML = '';

    if (!snippets || snippets.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = 'No saved snippets yet.';
        snippetList.appendChild(emptyItem);
        return;
    }

    snippets.forEach((snippet) => {
        const listItem = document.createElement('li');
        listItem.textContent = snippet;
        snippetList.appendChild(listItem);
    });
}

function loadSnippets() {
    chrome.storage.local.get(['saved_snippets'], (result) => {
        const snippets = result.saved_snippets || [];
        renderSnippets(snippets);
    });
}

function clearSnippets() {
    chrome.storage.local.set({ saved_snippets: [] }, () => {
        renderSnippets([]);
    });
}

clearBtn.addEventListener('click', clearSnippets);

document.addEventListener('DOMContentLoaded', loadSnippets);
