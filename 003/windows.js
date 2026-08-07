// ============================================================
// WINDOWS.JS — Window Lifecycle & Interactions
// ============================================================

let zIndexCounter = 50;
const openApps    = new Set();

// --- Open a built-in app window ---
function openApp(appName) {
    if (openApps.has(appName)) {
        const existingWindow = document.getElementById(`window-${appName}`);
        if (existingWindow) {
            existingWindow.classList.remove('hidden');
            bringToFront(existingWindow);
            const minIcon = document.getElementById(`min-icon-${appName}`);
            if (minIcon) minIcon.remove();
        }
        return;
    }

    openApps.add(appName);

    const win = document.createElement('div');
    win.id    = `window-${appName}`;
    win.className = `absolute pointer-events-auto rounded-xl shadow-2xl border border-black/10 dark:border-white/20 bg-white/90 dark:bg-black/90 text-black dark:text-white backdrop-blur-3xl resizable-window window-open-anim flex flex-col transition-colors`;
    win.onclick = (e) => e.stopPropagation();

    const offset   = (openApps.size * 20) % 100;
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
        win.style.width  = '90%';
        win.style.height = '70%';
        win.style.left   = '5%';
        win.style.top    = '10%';
    } else {
        win.style.width  = '700px';
        win.style.height = '480px';
        win.style.left   = `${100 + offset}px`;
        win.style.top    = `${80  + offset}px`;
    }
    win.style.zIndex = ++zIndexCounter;

    // --- Title bar ---
    const header = document.createElement('div');
    header.className = 'h-10 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-3 cursor-default bg-black/5 dark:bg-white/5 backdrop-blur-sm select-none touch-none';

    const trafficLights = document.createElement('div');
    trafficLights.className = 'flex space-x-2 items-center group/lights';

    const closeBtn = document.createElement('div');
    closeBtn.className = 'w-[14px] h-[14px] rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center cursor-pointer';
    closeBtn.innerHTML = '<svg class="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeApp(appName, win); };

    const minBtn = document.createElement('div');
    minBtn.className = 'w-[14px] h-[14px] rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center cursor-pointer';
    minBtn.innerHTML = '<svg class="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"></path></svg>';
    minBtn.onclick = (e) => { e.stopPropagation(); minimizeApp(appName, win); };

    const maxBtn = document.createElement('div');
    maxBtn.className = 'w-[14px] h-[14px] rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center cursor-pointer';
    maxBtn.innerHTML = '<svg class="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>';
    maxBtn.onclick = (e) => { e.stopPropagation(); toggleMaximize(win); };

    trafficLights.appendChild(closeBtn);
    trafficLights.appendChild(minBtn);
    trafficLights.appendChild(maxBtn);

    const title = document.createElement('div');
    title.className = 'text-xs font-semibold opacity-70 absolute left-1/2 -translate-x-1/2 pointer-events-none';
    title.innerText = appName;

    header.appendChild(trafficLights);
    header.appendChild(title);
    header.appendChild(document.createElement('div'));

    // --- Content ---
    const content = document.createElement('div');
    content.className = 'flex-1 overflow-hidden relative';
    content.innerHTML = appContents[appName] || '<div class="p-4">App not found.</div>';

    // --- Resize handle ---
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

    // Post-open app init
    if      (appName === 'Notes')    setTimeout(initNotesApp,  50);
    else if (appName === 'To-Dos')   setTimeout(initTodosApp,  50);
    else if (appName === 'Files')    setTimeout(renderFiles,   50);
    else if (appName === 'Camera')   setTimeout(initCamera,    50);
    else if (appName === 'Settings') {
        setTimeout(() => {
            const pwdEl    = document.getElementById('settings-pwd-display');
            if (pwdEl)  pwdEl.innerText = localStorage.getItem('sliky_password') || 'None';
            const sliderEl = document.getElementById('dock-size-slider');
            if (sliderEl) sliderEl.value = currentDockScale;
        }, 50);
    }
}

// --- Window Controls ---
function minimizeApp(appName, windowElement) {
    windowElement.classList.add('hidden');

    const minContainer = document.getElementById('minimized-apps-container');
    if (document.getElementById(`min-icon-${appName}`)) return;

    const appData  = allSystemApps.find(a => a.name === appName);
    const iconHtml = appData ? appData.icon : '';

    const minIcon = document.createElement('div');
    minIcon.id    = `min-icon-${appName}`;
    minIcon.className = 'text-[11px] font-semibold bg-black/5 dark:bg-white/20 hover:bg-black/10 dark:hover:bg-white/30 pr-2 pl-1 py-1 rounded cursor-pointer transition-colors flex items-center space-x-1.5 shadow-sm text-black dark:text-white';
    minIcon.innerHTML = `
        <div class="w-[18px] h-[18px] rounded overflow-hidden relative flex items-center justify-center shadow-sm pointer-events-none">
            <div class="absolute inset-0 origin-top-left transform scale-[0.32]">${iconHtml}</div>
        </div>
        <span class="max-w-[80px] truncate pointer-events-none">${appName}</span>
    `;
    minIcon.onclick = () => {
        windowElement.classList.remove('hidden');
        bringToFront(windowElement);
        minIcon.remove();
    };
    minContainer.appendChild(minIcon);
}

function toggleMaximize(winElement) {
    if (winElement.dataset.maximized === 'true') {
        winElement.style.width  = winElement.dataset.oldW;
        winElement.style.height = winElement.dataset.oldH;
        winElement.style.top    = winElement.dataset.oldT;
        winElement.style.left   = winElement.dataset.oldL;
        winElement.dataset.maximized = 'false';
    } else {
        winElement.dataset.oldW = winElement.style.width;
        winElement.dataset.oldH = winElement.style.height;
        winElement.dataset.oldT = winElement.style.top;
        winElement.dataset.oldL = winElement.style.left;

        winElement.style.top    = '28px';
        winElement.style.left   = '0px';
        winElement.style.width  = '100%';
        winElement.style.height = 'calc(100% - 28px)';
        winElement.dataset.maximized = 'true';
    }
}

function closeApp(appName, windowElement) {
    if (appName === 'Camera') stopCamera();

    windowElement.classList.remove('window-open-anim');
    windowElement.classList.add('window-close-anim');

    setTimeout(() => {
        windowElement.remove();
        openApps.delete(appName);
        const indicator = document.getElementById(`indicator-${appName}`);
        if (indicator) indicator.style.opacity = '0';
        const minIcon = document.getElementById(`min-icon-${appName}`);
        if (minIcon) minIcon.remove();
    }, 200);
}

function bringToFront(element) {
    element.style.zIndex = ++zIndexCounter;
}

// --- Drag & Resize Helpers ---
function unsnapWindow(element, clientX, clientY) {
    if (element.dataset.maximized === 'true' || element.dataset.snapped === 'true') {
        const rect  = element.getBoundingClientRect();
        const ratio = (clientX - rect.left) / rect.width;

        element.style.width  = element.dataset.oldW || '700px';
        element.style.height = element.dataset.oldH || '480px';
        element.dataset.maximized = 'false';
        element.dataset.snapped   = 'false';

        const newWidth = parseInt(element.style.width);
        element.style.left = (clientX - (newWidth * ratio)) + 'px';
    }
}

function makeDraggableWindow(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown  = dragMouseDown;
    handle.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        e.preventDefault();
        bringToFront(element);
        pos3 = e.clientX;
        pos4 = e.clientY;
        unsnapWindow(element, pos3, pos4);
        element.classList.add('dragging');
        document.onmouseup   = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        bringToFront(element);
        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        unsnapWindow(element, pos3, pos4);
        element.classList.add('dragging');
        document.ontouchend  = closeDragElement;
        document.ontouchmove = elementDragTouch;
    }

    function elementDrag(e) {
        e.preventDefault();
        calculateMovement(e.clientX, e.clientY);
    }

    function elementDragTouch(e) {
        const touch = e.touches[0];
        calculateMovement(touch.clientX, touch.clientY);
    }

    function calculateMovement(clientX, clientY) {
        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;

        let newTop  = element.offsetTop  - pos2;
        let newLeft = element.offsetLeft - pos1;
        if (newTop < 28) newTop = 28;

        element.style.top  = newTop  + 'px';
        element.style.left = newLeft + 'px';
    }

    function closeDragElement(e) {
        document.onmouseup   = null;
        document.onmousemove = null;
        document.ontouchend  = null;
        document.ontouchmove = null;
        element.classList.remove('dragging');

        if (!e) return;

        let clientX, clientY;
        if (e.type === 'mouseup') {
            clientX = e.clientX;
            clientY = e.clientY;
        } else if (e.type === 'touchend' && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else { return; }

        const screenW = window.innerWidth;

        if (clientY < 30) {
            if (element.dataset.maximized !== 'true') toggleMaximize(element);
        } else if (clientX < 10) {
            element.dataset.oldW = element.style.width  || '700px';
            element.dataset.oldH = element.style.height || '480px';
            element.dataset.oldT = element.style.top;
            element.dataset.oldL = element.style.left;
            element.style.top    = '28px';
            element.style.left   = '0px';
            element.style.width  = '50%';
            element.style.height = 'calc(100% - 28px)';
            element.dataset.snapped = 'true';
        } else if (clientX > screenW - 10) {
            element.dataset.oldW = element.style.width  || '700px';
            element.dataset.oldH = element.style.height || '480px';
            element.dataset.oldT = element.style.top;
            element.dataset.oldL = element.style.left;
            element.style.top    = '28px';
            element.style.left   = '50%';
            element.style.width  = '50%';
            element.style.height = 'calc(100% - 28px)';
            element.dataset.snapped = 'true';
        }
    }
}

function makeResizable(element, handle) {
    let startX, startY, startWidth, startHeight;

    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();
        bringToFront(element);

        startX      = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        startY      = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        const rect  = element.getBoundingClientRect();
        startWidth  = rect.width;
        startHeight = rect.height;

        element.classList.add('dragging');
        document.addEventListener('mousemove', doResize);
        document.addEventListener('touchmove', doResize, { passive: false });
        document.addEventListener('mouseup',   stopResize);
        document.addEventListener('touchend',  stopResize);
    }

    function doResize(e) {
        e.preventDefault();
        const clientX  = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY  = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const newWidth  = startWidth  + (clientX - startX);
        const newHeight = startHeight + (clientY - startY);
        if (newWidth  > 320) element.style.width  = newWidth  + 'px';
        if (newHeight > 240) element.style.height = newHeight + 'px';
    }

    function stopResize() {
        element.classList.remove('dragging');
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('mouseup',   stopResize);
        document.removeEventListener('touchend',  stopResize);
    }

    handle.addEventListener('mousedown',  initResize);
    handle.addEventListener('touchstart', initResize, { passive: false });
}
