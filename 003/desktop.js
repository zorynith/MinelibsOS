// ============================================================
// DESKTOP.JS — Home Screen Rendering & Interaction
// ============================================================

const CELL_W = 80;
const CELL_H = 100;
const PAD_X  = 24;
const PAD_Y  = 48;

// --- Render desktop icons ---
function renderDesktop() {
    const container = document.getElementById('home-screen-apps');
    container.innerHTML = '';

    desktopItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'absolute flex flex-col items-center group cursor-pointer w-16 transition-transform z-10 touch-none';
        el.style.left = `${PAD_X + item.col * CELL_W}px`;
        el.style.top  = `${PAD_Y + item.row * CELL_H}px`;

        if (item.type === 'app') {
            const appData = allSystemApps.find(a => a.name === item.name);
            if (!appData) return;
            el.innerHTML = `
                <div class="app-icon pointer-events-none">${appData.icon}</div>
                <span class="text-white text-xs mt-1.5 font-medium drop-shadow-md text-shadow text-center truncate w-full pointer-events-none">${item.name}</span>
            `;
        } else if (item.type === 'folder') {
            let miniIcons = '<div class="grid grid-cols-2 gap-[2px] w-full h-full p-1.5">';
            item.apps.slice(-4).forEach(appName => {
                const appData = allSystemApps.find(a => a.name === appName);
                if (appData) miniIcons += `<div class="w-full h-full flex items-center justify-center transform scale-[0.6] origin-center">${appData.icon}</div>`;
            });
            miniIcons += '</div>';

            el.innerHTML = `
                <div class="w-14 h-14 bg-white/20 dark:bg-black/20 backdrop-blur-xl shadow-lg rounded-2xl flex border border-white/30 dark:border-white/10 pointer-events-none overflow-hidden app-icon">${miniIcons}</div>
                <span class="text-white text-xs mt-1.5 font-medium drop-shadow-md text-shadow text-center truncate w-full pointer-events-none">${item.name}</span>
            `;
        }

        makeDesktopItemInteractive(el, item);
        container.appendChild(el);
    });
}

// --- Render Sliky apps menu list ---
function renderSlikyMenu() {
    const container = document.getElementById('sliky-apps-list');
    if (!container) return;
    container.innerHTML = '';

    allSystemApps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'px-4 py-2 hover:bg-blue-500 hover:text-white cursor-pointer flex items-center space-x-3 transition-colors';
        item.innerHTML = `
            <div class="w-6 h-6 rounded flex items-center justify-center overflow-hidden relative shadow-sm pointer-events-none">
                <div style="transform: scale(0.42); transform-origin: top left; position: absolute; left: 0; top: 0; width: 56px; height: 56px;">${app.icon}</div>
            </div>
            <span class="font-medium text-sm truncate pointer-events-none">${app.name}</span>
        `;
        item.onclick = () => {
            toggleMenu(null);
            app.action();
        };
        container.appendChild(item);
    });
}

// --- Double-tap desktop to create folder ---
const homeScreen = document.getElementById('home-screen-apps');
let lastBgTap = 0;
homeScreen.addEventListener('pointerdown', (e) => {
    if (e.target !== homeScreen) return;
    const now = Date.now();
    if (now - lastBgTap < 350) {
        let newCol = Math.round((e.clientX - PAD_X - 32) / CELL_W);
        let newRow = Math.round((e.clientY - PAD_Y - 40) / CELL_H);
        if (newCol < 0) newCol = 0;
        if (newRow < 0) newRow = 0;

        if (!desktopItems.some(i => i.col === newCol && i.row === newRow)) {
            desktopItems.push({
                id:   'folder-' + Date.now(),
                type: 'folder',
                name: 'New Folder',
                apps: [],
                col:  newCol,
                row:  newRow
            });
            saveState();
            renderDesktop();
        }
    }
    lastBgTap = now;
});

// --- Icon drag, drop, tap interactions ---
function makeDesktopItemInteractive(el, item) {
    let isMoving = false;
    let startX, startY;
    let originalCol = item.col;
    let originalRow = item.row;
    let pressTimer;

    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, item);
    });

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.type !== 'touchstart') return;
        startX = e.clientX;
        startY = e.clientY;

        if (e.type === 'touchstart') {
            pressTimer = setTimeout(() => {
                isMoving = true;
                showContextMenu(e.touches[0].clientX, e.touches[0].clientY, item);
            }, 600);
        }

        function onPointerMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!isMoving && Math.sqrt(dx * dx + dy * dy) > 10) {
                clearTimeout(pressTimer);
                isMoving = true;
                el.style.zIndex     = '1000';
                el.style.transition = 'none';
                homeScreen.classList.add('jiggle-mode');
                homeScreen.classList.add('show-grid');
            }
            if (isMoving) {
                el.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
            }
        }

        function onPointerUp(ev) {
            clearTimeout(pressTimer);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup',  onPointerUp);

            if (isMoving && homeScreen.classList.contains('jiggle-mode')) {
                homeScreen.classList.remove('jiggle-mode');
                homeScreen.classList.remove('show-grid');
                el.style.zIndex     = '10';
                el.style.transform  = '';
                el.style.transition = 'transform 0.2s';

                let newCol = Math.round((ev.clientX - PAD_X - 32) / CELL_W);
                let newRow = Math.round((ev.clientY - PAD_Y - 40) / CELL_H);
                if (newCol < 0) newCol = 0;
                if (newRow < 0) newRow = 0;

                const target = desktopItems.find(i => i.id !== item.id && i.col === newCol && i.row === newRow);

                if (target) {
                    if (target.type === 'folder' && item.type === 'app') {
                        target.apps.push(item.name);
                        desktopItems = desktopItems.filter(i => i.id !== item.id);
                    } else {
                        target.col = originalCol;
                        target.row = originalRow;
                        item.col   = newCol;
                        item.row   = newRow;
                    }
                } else {
                    item.col = newCol;
                    item.row = newRow;
                }
                saveState();
                renderDesktop();
            } else if (!isMoving) {
                if (item.type === 'app') {
                    const appData = allSystemApps.find(a => a.name === item.name);
                    if (appData) appData.action();
                } else if (item.type === 'folder') {
                    openFolderWindow(item);
                }
            }
        }

        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup',  onPointerUp);
    });
}

// --- Context Menu ---
function showContextMenu(x, y, item) {
    const cm = document.getElementById('context-menu');

    let posX = x;
    let posY = y;
    if (posX + 192 > window.innerWidth)  posX = window.innerWidth  - 200;
    if (posY + 160 > window.innerHeight) posY = window.innerHeight - 180;

    cm.style.left = `${posX}px`;
    cm.style.top  = `${posY}px`;
    cm.classList.remove('hidden');
    cm.classList.replace('scale-95', 'scale-100');

    document.getElementById('cm-open').onclick = () => {
        hideContextMenu();
        if (item.type === 'app') {
            const appData = allSystemApps.find(a => a.name === item.name);
            if (appData) appData.action();
        } else {
            openFolderWindow(item);
        }
    };

    const renameBtn = document.getElementById('cm-rename');
    if (item.type === 'folder') {
        renameBtn.classList.remove('hidden');
        renameBtn.onclick = () => {
            hideContextMenu();
            const newName = prompt('Enter new folder name:', item.name);
            if (newName !== null && newName.trim() !== '') {
                item.name = newName.trim();
                saveState();
                renderDesktop();
            }
        };
    } else {
        renameBtn.classList.add('hidden');
    }

    document.getElementById('cm-info').onclick = () => {
        hideContextMenu();
        alert(`App Info\n\nName: ${item.name}\nType: ${item.type === 'app' ? 'Application' : 'Folder'}\nLocation: Grid Row ${item.row}, Col ${item.col}`);
    };

    document.getElementById('cm-uninstall').onclick = () => {
        hideContextMenu();
        const confirmMsg = item.type === 'folder'
            ? `Are you sure you want to delete the folder "${item.name}" and remove its contents from the grid?`
            : `Are you sure you want to remove "${item.name}" from your layout?`;

        if (confirm(confirmMsg)) {
            desktopItems = desktopItems.filter(i => i.id !== item.id);
            saveState();
            renderDesktop();
        }
    };

    const uninstallBtn = document.getElementById('cm-uninstall');
    uninstallBtn.innerText = item.type === 'folder' ? 'Delete Folder' : 'Uninstall';
}

function hideContextMenu() {
    const cm = document.getElementById('context-menu');
    if (cm) {
        cm.classList.add('hidden');
        cm.classList.replace('scale-100', 'scale-95');
    }
}

// --- Folder Windows ---
function openFolderWindow(folderItem) {
    const winId = `Folder-${folderItem.id}`;
    if (openApps.has(winId)) {
        bringToFront(document.getElementById(`window-${winId}`));
        return;
    }

    openApps.add(winId);

    const win = document.createElement('div');
    win.id        = `window-${winId}`;
    win.className = `absolute pointer-events-auto rounded-xl shadow-2xl border border-black/10 dark:border-white/20 bg-white/90 dark:bg-black/90 text-black dark:text-white backdrop-blur-3xl resizable-window window-open-anim flex flex-col transition-colors`;
    win.onclick   = (e) => e.stopPropagation();

    const offset   = (openApps.size * 20) % 100;
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
        win.style.width  = '90%';
        win.style.height = '50%';
        win.style.left   = '5%';
        win.style.top    = '15%';
    } else {
        win.style.width  = '420px';
        win.style.height = '340px';
        win.style.left   = `${150 + offset}px`;
        win.style.top    = `${120 + offset}px`;
    }
    win.style.zIndex = ++zIndexCounter;

    // Title bar
    const header = document.createElement('div');
    header.className = 'h-10 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-3 bg-black/5 dark:bg-white/5 backdrop-blur-sm select-none cursor-pointer touch-none';

    const trafficLights = document.createElement('div');
    trafficLights.className = 'flex space-x-2 items-center group/lights';

    const closeBtn = document.createElement('div');
    closeBtn.className = 'w-[14px] h-[14px] rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center cursor-pointer';
    closeBtn.innerHTML = '<svg class="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeApp(winId, win); };
    trafficLights.appendChild(closeBtn);

    const titleInput = document.createElement('input');
    titleInput.className = 'text-sm font-bold bg-transparent border-none outline-none text-center w-32 focus:ring-2 focus:ring-blue-500 rounded';
    titleInput.value   = folderItem.name;
    titleInput.oninput = (e) => {
        folderItem.name = e.target.value;
        saveState();
        renderDesktop();
    };

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex items-center space-x-2';

    const deleteFolderBtn = document.createElement('button');
    deleteFolderBtn.className = 'text-red-500 hover:bg-red-500/20 p-1.5 rounded-lg transition-colors touch-manipulation';
    deleteFolderBtn.title     = 'Delete Folder';
    deleteFolderBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteFolderBtn.onclick   = (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this folder and remove its apps from the Home Screen?')) {
            desktopItems = desktopItems.filter(i => i.id !== folderItem.id);
            saveState();
            renderDesktop();
            closeApp(winId, win);
        }
    };
    actionsDiv.appendChild(deleteFolderBtn);

    header.appendChild(trafficLights);
    header.appendChild(titleInput);
    header.appendChild(actionsDiv);

    // Content grid
    const content = document.createElement('div');
    content.className = 'flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-4 content-start relative';

    const renderContents = () => {
        content.innerHTML = '';
        folderItem.apps.forEach((appName, index) => {
            const appData = allSystemApps.find(a => a.name === appName);
            if (!appData) return;

            const el = document.createElement('div');
            el.className = 'flex flex-col items-center group cursor-pointer z-10 touch-none';
            el.innerHTML = `
                <div class="app-icon pointer-events-none">${appData.icon}</div>
                <span class="text-xs mt-1.5 font-medium text-center truncate w-full pointer-events-none text-black dark:text-white">${appData.name}</span>
            `;

            let isMoving = false;
            let startX, startY;
            let clone = null;

            el.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 && e.type !== 'touchstart') return;
                startX = e.clientX;
                startY = e.clientY;

                function onPointerMove(ev) {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    if (!isMoving && Math.sqrt(dx * dx + dy * dy) > 10) {
                        isMoving = true;
                        clone = el.cloneNode(true);
                        clone.style.position = 'fixed';
                        clone.style.zIndex   = '70000';
                        clone.style.left     = `${startX - 32}px`;
                        clone.style.top      = `${startY - 40}px`;
                        document.body.appendChild(clone);
                        el.style.opacity = '0.3';
                        homeScreen.classList.add('show-grid');
                    }
                    if (isMoving && clone) {
                        clone.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px) scale(1.1)`;
                    }
                }

                function onPointerUp(ev) {
                    document.removeEventListener('pointermove', onPointerMove);
                    document.removeEventListener('pointerup',  onPointerUp);

                    if (isMoving) {
                        isMoving = false;
                        homeScreen.classList.remove('show-grid');
                        if (clone) clone.remove();
                        el.style.opacity = '1';

                        const winRect = win.getBoundingClientRect();
                        if (ev.clientX < winRect.left || ev.clientX > winRect.right ||
                            ev.clientY < winRect.top  || ev.clientY > winRect.bottom) {

                            folderItem.apps.splice(index, 1);

                            let newCol = Math.round((ev.clientX - PAD_X - 32) / CELL_W);
                            let newRow = Math.round((ev.clientY - PAD_Y - 40) / CELL_H);
                            if (newCol < 0) newCol = 0;
                            if (newRow < 0) newRow = 0;

                            while (desktopItems.some(i => i.col === newCol && i.row === newRow)) {
                                newCol++;
                            }

                            desktopItems.push({
                                id:   'item-' + Date.now(),
                                type: 'app',
                                name: appName,
                                col:  newCol,
                                row:  newRow
                            });

                            saveState();
                            renderDesktop();
                            renderContents();
                        }
                    } else {
                        appData.action();
                    }
                }

                document.addEventListener('pointermove', onPointerMove, { passive: false });
                document.addEventListener('pointerup',  onPointerUp);
            });

            content.appendChild(el);
        });
    };

    renderContents();

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'absolute bottom-0 right-0 w-10 h-10 cursor-se-resize flex items-end justify-end p-2 z-[100] opacity-30 hover:opacity-100 transition-opacity bg-transparent touch-none';
    resizeHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="9" y1="1" x2="1" y2="9"/><line x1="9" y1="5" x2="5" y2="9"/></svg>`;

    win.appendChild(header);
    win.appendChild(content);
    win.appendChild(resizeHandle);

    document.getElementById('window-container').appendChild(win);

    makeDraggableWindow(win, header);
    makeResizable(win, resizeHandle);

    win.addEventListener('mousedown', () => bringToFront(win));
    win.addEventListener('touchstart', () => bringToFront(win), { passive: true });
}
