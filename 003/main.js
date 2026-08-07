// ============================================================
// MAIN.JS — Initialization, Login, Clock, Keyboard Shortcuts
// ============================================================

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swCode = `
            const CACHE_NAME = 'sliky-os-v1.7';
            self.addEventListener('install',  e => e.waitUntil(self.skipWaiting()));
            self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
            self.addEventListener('fetch',    e => e.respondWith(fetch(e.request).catch(() => new Response('Offline PWA Mode Supported'))));
        `;
        try {
            const blob = new Blob([swCode], { type: 'text/javascript' });
            const url  = URL.createObjectURL(blob);
            navigator.serviceWorker.register(url)
                .catch(() => console.log('SW blob scope restricted. Upload a real sw.js to fully deploy.'));
        } catch (err) { /* ignore */ }
    });
}

// --- Clock ---
function updateClock() {
    const now     = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    document.getElementById('menu-clock').innerText =
        now.toLocaleDateString('en-US', options).replace(',', '');
}

setInterval(updateClock, 1000);
updateClock();

// --- Login ---
function handleLoginKeyPress(e) {
    if (e.key === 'Enter') login();
}

function login() {
    const pwd     = document.getElementById('password-input').value;
    const remember = document.getElementById('remember-me');

    localStorage.setItem('sliky_password', pwd || 'No password entered');

    if (remember && remember.checked) {
        localStorage.setItem('sliky_remember', 'true');
    } else {
        localStorage.removeItem('sliky_remember');
    }

    executeLogin();
}

function executeLogin() {
    const loginScreen = document.getElementById('login-screen');
    const desktop     = document.getElementById('desktop');
    const bgLayer     = document.getElementById('bg-layer');

    loginScreen.style.opacity   = '0';
    bgLayer.style.filter        = 'blur(0px)';

    setTimeout(() => {
        loginScreen.style.display = 'none';
        desktop.classList.remove('hidden');
        setupControlCenter();
        renderCalendar();
        renderSlikyMenu();
        renderDesktop();
    }, 700);
}

// Auto-login if "remember me" was checked
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('sliky_remember') === 'true') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('bg-layer').style.filter      = 'blur(0px)';
        document.getElementById('desktop').classList.remove('hidden');

        setupControlCenter();
        renderCalendar();
        renderSlikyMenu();
        renderDesktop();
    }
});

// --- Shutdown ---
function shutdown() {
    toggleMenu(null);
    closeSpotlight();
    closeAppLibrary();

    document.getElementById('desktop').classList.add('hidden');

    const login = document.getElementById('login-screen');
    login.style.display = 'flex';
    setTimeout(() => {
        login.style.opacity = '1';
        document.getElementById('bg-layer').style.filter = 'blur(10px)';
        document.getElementById('password-input').value  = '';
    }, 50);

    document.getElementById('window-container').innerHTML = '';
    openApps.clear();
    document.getElementById('minimized-apps-container').innerHTML = '';
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === ' ')) {
        e.preventDefault();
        openSpotlight();
    }
    if (e.key === 'Escape') {
        closeSpotlight();
        closeAppLibrary();

        const windows = Array.from(document.querySelectorAll('.resizable-window:not(.hidden)'));
        if (windows.length > 0) {
            windows.sort((a, b) => parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0));
            const topWin  = windows[0];
            const appName = topWin.id.replace('window-', '');
            closeApp(appName, topWin);
        }
    }
});

// --- External App Launcher ---
const externalAppLinks = {
    'Messages':        { url: 'https://messages.google.com',  scheme: 'sms:' },
    'Gmail':           { url: 'https://mail.google.com',       scheme: 'googlegmail://' },
    'Google Calendar': { url: 'https://calendar.google.com',   scheme: 'googlecalendar://' },
    'Google Tasks':    { url: 'https://tasks.google.com',      scheme: 'googletasks://' },
    'Google Maps':     { url: 'https://maps.google.com',       scheme: 'comgooglemaps://' },
    'Spotify':         { url: 'https://open.spotify.com',      scheme: 'spotify://' }
};

function launchExternalApp(appName) {
    const app      = externalAppLinks[appName];
    if (!app) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        const start = Date.now();
        window.location.href = app.scheme;
        setTimeout(() => {
            if (Date.now() - start < 1500) window.open(app.url, '_blank');
        }, 1000);
    } else {
        window.open(app.url, '_blank');
    }
}
