// ============================================================
// SETTINGS.JS — Settings & Personalization Logic
// ============================================================

function setPresetBg(bgImgStyle) {
    const url = bgImgStyle.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    document.getElementById('bg-layer').style.backgroundImage = `url('${url.replace('w=400', 'w=2560')}')`;
    saveState();
}

function changeBackground() {
    const url = document.getElementById('bg-url-input').value;
    if (url) {
        document.getElementById('bg-layer').style.backgroundImage = `url('${url}')`;
        saveState();
    }
}

function addCustomApp() {
    const name = document.getElementById('custom-app-name').value;
    const url  = document.getElementById('custom-app-url').value;
    const loc  = document.getElementById('custom-app-loc').value;

    if (!name || !url) return alert('Please fill in both the App Name and URL.');

    const initial  = name.substring(0, 1).toUpperCase();
    const iconHtml = `<div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold uppercase shadow-inner border border-white/20">${initial}</div>`;

    allSystemApps.push({
        name,
        type:     'Custom App',
        action:   () => window.open(url, '_blank'),
        icon:     iconHtml,
        iconHtml: iconHtml,
        url
    });

    if (loc === 'home') {
        let newCol = 0, newRow = 0;
        while (desktopItems.some(i => i.col === newCol && i.row === newRow)) {
            newCol++;
            if (newCol > 6) { newCol = 0; newRow++; }
        }
        desktopItems.push({ id: 'item-' + Date.now(), type: 'app', name, col: newCol, row: newRow });
        renderDesktop();
    } else {
        const dock    = document.getElementById('dock-apps');
        const newBtn  = document.createElement('button');
        newBtn.type   = 'button';
        newBtn.setAttribute('data-title', name);
        newBtn.onclick = () => window.open(url, '_blank');
        newBtn.innerHTML = `<div class="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg text-white text-xs font-bold uppercase shadow-sm transition-all">${initial}</div>`;
        dock.insertBefore(newBtn, dock.lastElementChild);
    }

    document.getElementById('custom-app-name').value = '';
    document.getElementById('custom-app-url').value  = '';
    saveState();
    renderSlikyMenu();
    alert(`${name} successfully added!`);
}

function updateDockSize(val) {
    currentDockScale = val;
    document.getElementById('dock-scale-wrapper').style.transform = `scale(${val})`;
    saveState();
}

function saveWeatherLocation() {
    const loc = document.getElementById('weather-city-input').value;
    if (loc) {
        localStorage.setItem('sliky_weather_loc', loc);
        saveState();
        fetchWeather();
        alert('Weather location saved successfully!');
    }
}

function resetSystem() {
    if (confirm('Are you sure you want to reset Sliky OS to defaults? This will erase all custom apps, layout, and settings.')) {
        localStorage.clear();
        location.reload();
    }
}
