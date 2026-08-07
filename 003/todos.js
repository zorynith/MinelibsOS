// ============================================================
// TODOS.JS — To-Dos App Logic
// (myTodos array lives in state.js)
// ============================================================

let currentTodoListId = 1;

function initTodosApp() {
    renderTodoLists();
    loadTodoList(currentTodoListId || (myTodos.length > 0 ? myTodos[0].id : null));
}

function renderTodoLists() {
    const list = document.getElementById('todos-sidebar');
    if (!list) return;
    list.innerHTML = '';
    myTodos.forEach(l => {
        const isSelected = l.id === currentTodoListId;
        list.innerHTML += `
            <div class="p-3 border-b border-black/10 dark:border-white/10 cursor-pointer flex items-center space-x-2 ${isSelected ? 'bg-black/10 dark:bg-white/10 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80'}" onclick="loadTodoList(${l.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-50"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <div class="truncate text-sm flex-1">${l.name}</div>
            </div>`;
    });
}

function loadTodoList(id) {
    currentTodoListId = id;
    const listData     = myTodos.find(l => l.id === id);
    const titleEl      = document.getElementById('todos-current-list-title');
    const tasksContainer = document.getElementById('todos-tasks-container');
    const input        = document.getElementById('new-task-input');

    if (listData && titleEl && tasksContainer) {
        titleEl.innerText = listData.name;
        renderTodoTasks();
        if (input) input.disabled = false;
    } else if (titleEl) {
        titleEl.innerText = 'Select or Create a List';
        if (tasksContainer) tasksContainer.innerHTML = '';
        if (input) input.disabled = true;
    }
    renderTodoLists();
}

function renderTodoTasks() {
    const container = document.getElementById('todos-tasks-container');
    if (!container) return;
    const listData = myTodos.find(l => l.id === currentTodoListId);
    if (!listData) { container.innerHTML = ''; return; }

    container.innerHTML = '';
    if (listData.tasks.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-xs opacity-50">No tasks yet.</div>';
        return;
    }

    listData.tasks.forEach(t => {
        container.innerHTML += `
            <div class="flex items-center justify-between p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg group transition-colors">
                <div class="flex items-center space-x-3 overflow-hidden cursor-pointer flex-1" onclick="toggleTodoTask(${t.id})">
                    <div class="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center transition-colors ${t.done ? 'bg-blue-500' : ''}">
                        ${t.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    </div>
                    <span class="text-sm truncate ${t.done ? 'line-through opacity-50' : ''} transition-all">${t.text}</span>
                </div>
                <button onclick="deleteTodoTask(${t.id})" class="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/20 p-1.5 rounded transition-all"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>`;
    });
}

function createNewTodoList() {
    const name = prompt('New List Name:');
    if (name) {
        const newId = Date.now();
        myTodos.push({ id: newId, name: name.trim(), tasks: [] });
        saveState();
        loadTodoList(newId);
    }
}

function deleteCurrentTodoList() {
    if (!currentTodoListId) return;
    if (confirm('Delete this entire list?')) {
        myTodos = myTodos.filter(l => l.id !== currentTodoListId);
        saveState();
        loadTodoList(myTodos.length > 0 ? myTodos[0].id : null);
    }
}

function handleNewTaskKeyPress(e) {
    if (e.key === 'Enter') createNewTodoTask();
}

function createNewTodoTask() {
    const input = document.getElementById('new-task-input');
    const text  = input.value.trim();
    if (!text || !currentTodoListId) return;

    const listData = myTodos.find(l => l.id === currentTodoListId);
    if (listData) {
        listData.tasks.push({ id: Date.now(), text, done: false });
        input.value = '';
        saveState();
        renderTodoTasks();
    }
}

function toggleTodoTask(taskId) {
    const listData = myTodos.find(l => l.id === currentTodoListId);
    if (listData) {
        const task = listData.tasks.find(t => t.id === taskId);
        if (task) {
            task.done = !task.done;
            saveState();
            renderTodoTasks();
        }
    }
}

function deleteTodoTask(taskId) {
    const listData = myTodos.find(l => l.id === currentTodoListId);
    if (listData) {
        listData.tasks = listData.tasks.filter(t => t.id !== taskId);
        saveState();
        renderTodoTasks();
    }
}
