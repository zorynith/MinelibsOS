// ============================================================
// NOTES.JS — Notes App Logic
// ============================================================

let myNotes = [
    {
        id: 1,
        title: 'Welcome to Notes',
        content: 'This is your native notes application.\n\nYou can:\n- Create multiple notes\n- Rename them automatically\n- Delete them\n- Close the app and everything saves locally!'
    }
];
let currentNoteId = 1;

function initNotesApp() {
    renderNotesList();
    loadNote(currentNoteId || (myNotes.length > 0 ? myNotes[0].id : null));
}

function renderNotesList() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    list.innerHTML = '';
    myNotes.forEach(n => {
        const isSelected = n.id === currentNoteId;
        list.innerHTML += `
            <div class="p-3 border-b border-black/10 dark:border-white/10 cursor-pointer ${isSelected ? 'bg-black/10 dark:bg-white/10 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80'}" onclick="loadNote(${n.id})">
                <div class="truncate text-sm">${n.title || 'New Note'}</div>
            </div>`;
    });
}

function loadNote(id) {
    currentNoteId = id;
    const note        = myNotes.find(n => n.id === id);
    const titleInput  = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');

    if (note && titleInput && contentInput) {
        titleInput.value   = note.title;
        contentInput.value = note.content;
        titleInput.disabled   = false;
        contentInput.disabled = false;
    } else if (titleInput && contentInput) {
        titleInput.value   = '';
        contentInput.value = '';
        titleInput.disabled   = true;
        contentInput.disabled = true;
    }
    renderNotesList();
}

function createNewNote() {
    const newId = Date.now();
    myNotes.push({ id: newId, title: 'New Note', content: '' });
    loadNote(newId);
}

function saveCurrentNote() {
    if (!currentNoteId) return;
    const note = myNotes.find(n => n.id === currentNoteId);
    if (note) {
        note.title   = document.getElementById('note-title').value;
        note.content = document.getElementById('note-content').value;
        renderNotesList();
    }
}

function deleteCurrentNote() {
    if (!currentNoteId) return;
    myNotes = myNotes.filter(n => n.id !== currentNoteId);
    loadNote(myNotes.length > 0 ? myNotes[0].id : null);
}
