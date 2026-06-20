const snippetList = document.getElementById('snippet-list');
const clearBtn = document.getElementById('clear-btn');

function renderSnippets(snippets) {
    snippetList.innerHTML = '';

    if (!snippets || snippets.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = 'No saved snippets yet.';
        emptyItem.style.textAlign = 'center';
        emptyItem.style.color = '#888';
        snippetList.appendChild(emptyItem);
        return;
    }

    snippets.forEach((snippet) => {
        const listItem = document.createElement('li');

        // Create the clickable Title link
        const titleLink = document.createElement('a');
        titleLink.href = snippet.url;
        titleLink.textContent = snippet.title;
        titleLink.target = '_blank'; // Opens in a new tab
        titleLink.className = 'snippet-title';

        // Create the quote text container
        const textBlock = document.createElement('div');
        textBlock.textContent = `"${snippet.text}"`;
        textBlock.className = 'snippet-text';

        // Append to the list item
        listItem.appendChild(titleLink);
        listItem.appendChild(textBlock);

        // Append to the main list
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