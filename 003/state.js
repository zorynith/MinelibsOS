// ============================================================
// STATE.JS — App Registry, Desktop State, Persistence
// ============================================================

// --- Central App Registry ---
const allSystemApps = [
    { name: 'Browser',  type: 'System App',   action: () => openApp('Browser'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg></div>` },
    { name: 'Notes',    type: 'System App',   action: () => openApp('Notes'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-yellow-300 to-yellow-500 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg class="h-8 w-8 text-yellow-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>` },
    { name: 'To-Dos',   type: 'System App',   action: () => openApp('To-Dos'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></div>` },
    { name: 'Files',    type: 'System App',   action: () => openApp('Files'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-blue-200 to-blue-400 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-900"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>` },
    { name: 'Camera',   type: 'System App',   action: () => openApp('Camera'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-gray-700 to-black rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></div>` },
    { name: 'Settings', type: 'System App',   action: () => openApp('Settings'),
      icon: `<div class="w-14 h-14 bg-gradient-to-b from-gray-600 to-gray-800 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg class="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>` },
    { name: 'Genjutsu', type: 'System App',   action: () => openApp('Genjutsu'),
      icon: `<div class="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>` },
    { name: 'JoshAI',   type: 'System App',   action: () => openApp('JoshAI'),
      icon: `<div class="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7v3a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-1H5a2 2 0 0 1-2-2v-3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"></path><path d="M8.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M15.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M9 16h6"></path></svg></div>` },
    { name: 'URL Save', type: 'System App',   action: () => openApp('URL Save'),
      icon: `<div class="w-14 h-14 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>` },
    { name: 'Messages', type: 'External App', action: () => launchExternalApp('Messages'),
      icon: `<div class="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9h8" /><path d="M8 13h6" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" /></svg></div>` },
    { name: 'Gmail',          type: 'External App', action: () => launchExternalApp('Gmail'),
      icon: `<div class="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg viewBox="0 0 24 24" class="h-8 w-8 text-red-500" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></div>` },
    { name: 'Google Calendar', type: 'External App', action: () => launchExternalApp('Google Calendar'),
      icon: `<div class="w-14 h-14 bg-white rounded-2xl flex flex-col items-center justify-center text-blue-600 shadow-inner border border-white/20"><div class="text-[10px] font-bold uppercase -mb-1 mt-1">Cal</div><div class="text-xl font-bold">31</div></div>` },
    { name: 'Google Tasks',   type: 'External App', action: () => launchExternalApp('Google Tasks'),
      icon: `<div class="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg></div>` },
    { name: 'Google Maps',    type: 'External App', action: () => launchExternalApp('Google Maps'),
      icon: `<div class="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg class="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg></div>` },
    { name: 'Spotify',        type: 'External App', action: () => launchExternalApp('Spotify'),
      icon: `<div class="w-14 h-14 bg-[#1DB954] rounded-2xl flex items-center justify-center shadow-inner border border-white/20"><svg viewBox="0 0 24 24" class="h-8 w-8 text-white" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.6 14.4c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 4.1-1 7.6-.5 10.4 1.2.3.2.4.5.2.8zm1.2-2.7c-.2.4-.7.5-1.1.3-2.9-1.8-7.3-2.3-10.7-1.3-.4.1-.9-.1-1-.6-.1-.4.1-.9.6-1 3.9-1.2 8.8-.6 12 1.4.3.3.4.8.2 1.2zm.1-2.9c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.3-.6-.2-.5.1-1.1.6-1.3 3.8-1.2 10-.9 13.9 1.4.5.3.6 1 .3 1.4-.2.4-.8.5-1.3.3z"/></svg></div>` }
];

// --- Desktop Layout State ---
let desktopItems = [
    { id: 'item-1', type: 'app', name: 'Browser',   col: 0, row: 0 },
    { id: 'item-2', type: 'app', name: 'Notes',     col: 0, row: 1 },
    { id: 'item-3', type: 'app', name: 'Files',     col: 0, row: 2 },
    { id: 'item-4', type: 'app', name: 'Settings',  col: 0, row: 3 },
    { id: 'item-5', type: 'app', name: 'Genjutsu',  col: 1, row: 0 },
    { id: 'item-6', type: 'app', name: 'To-Dos',    col: 1, row: 1 },
    { id: 'item-7', type: 'app', name: 'JoshAI',    col: 2, row: 0 },
    { id: 'item-8', type: 'app', name: 'URL Save',  col: 2, row: 1 },
    { id: 'item-9', type: 'app', name: 'Camera',    col: 3, row: 0 }
];

// --- Todos State (shared with todos.js) ---
let myTodos = [
    { id: 1, name: 'Personal', tasks: [
        { id: 101, text: 'Set up custom background', done: false },
        { id: 102, text: 'Test window snapping',     done: false }
    ]}
];

let currentDockScale = 1;

// --- Persistence ---
function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem('sliky_state'));

        if (saved && saved.theme === 'light') {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }

        setTimeout(() => {
            const toggle = document.getElementById('cc-theme-toggle');
            if (toggle) {
                toggle.style.transform = document.documentElement.classList.contains('dark')
                    ? 'translateX(-16px)'
                    : 'translateX(0)';
            }
        }, 100);

        if (!saved) return;

        if (saved.bgUrl) document.getElementById('bg-layer').style.backgroundImage = saved.bgUrl;

        if (saved.dockScale) {
            currentDockScale = saved.dockScale;
            document.getElementById('dock-scale-wrapper').style.transform = `scale(${currentDockScale})`;
        }

        if (saved.customApps) {
            saved.customApps.forEach(ca => {
                if (!allSystemApps.some(a => a.name === ca.name)) {
                    allSystemApps.push({
                        name: ca.name,
                        type: 'Custom App',
                        action: () => window.open(ca.url, '_blank'),
                        icon: ca.iconHtml,
                        iconHtml: ca.iconHtml,
                        url: ca.url
                    });
                }
            });
        }

        if (saved.desktopItems) desktopItems = saved.desktopItems;
        if (saved.myTodos)      myTodos      = saved.myTodos;

    } catch (e) { /* ignore */ }
}

function saveState() {
    const state = {
        bgUrl:        document.getElementById('bg-layer').style.backgroundImage,
        theme:        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        dockScale:    currentDockScale,
        desktopItems: desktopItems,
        myTodos:      myTodos,
        customApps:   allSystemApps
            .filter(a => a.type === 'Custom App')
            .map(a => ({ name: a.name, url: a.url, iconHtml: a.icon }))
    };
    localStorage.setItem('sliky_state', JSON.stringify(state));

    fetch('https://web-os-api.sawyerbobk563.workers.dev/api/state', {
        method: 'POST',
        body: JSON.stringify(state)
    }).catch(() => {});
}

// Run on page load (DOM is ready because scripts are at bottom of <body>)
loadState();
