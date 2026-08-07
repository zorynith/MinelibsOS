// ============================================================
// MENUS.JS — Menus, Spotlight, App Library, Control Center, Weather
// ============================================================

// --- Dropdown Menu Toggle ---
function toggleMenu(menuId, event) {
    if (event) event.stopPropagation();
    hideContextMenu();
    const menus = ['apple-menu', 'control-center', 'calendar-menu', 'notifications-menu', 'chat-menu', 'sliky-apps-menu'];
    menus.forEach(m => {
        const el = document.getElementById(m);
        if (m === menuId) {
            el.classList.toggle('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

// Close menus on outside click
document.addEventListener('click', () => {
    toggleMenu(null);
    hideContextMenu();
});

// --- Notifications ---
function clearNotifications() {
    document.getElementById('notifications-list').innerHTML =
        '<div class="text-center text-sm opacity-50 py-6">No new notifications</div>';
}

// --- Theme Toggle ---
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    const toggle = document.getElementById('cc-theme-toggle');
    if (toggle) {
        toggle.style.transform = isDark ? 'translateX(-16px)' : 'translateX(0)';
    }
    saveState();
}

// --- Calendar ---
function renderCalendar() {
    const now        = new Date();
    const month      = now.getMonth();
    const year       = now.getFullYear();
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const monthEl = document.getElementById('calendar-month');
    if (monthEl) monthEl.innerText = `${monthNames[month]} ${year}`;

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysContainer = document.getElementById('calendar-days');

    if (daysContainer) {
        daysContainer.innerHTML = '';
        for (let i = 0; i < firstDay; i++) daysContainer.innerHTML += '<div></div>';

        for (let i = 1; i <= daysInMonth; i++) {
            const isToday = i === now.getDate();
            const classes = isToday
                ? 'bg-blue-500 text-white rounded-full w-7 h-7 mx-auto flex items-center justify-center font-bold shadow shadow-blue-500/50'
                : 'w-7 h-7 mx-auto flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/20 rounded-full cursor-pointer transition-colors';
            daysContainer.innerHTML += `<div><div class="${classes}">${i}</div></div>`;
        }
    }
}

// --- Control Center Setup ---
function setupControlCenter() {
    // Battery
    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            function updateBattery() {
                const level = Math.round(battery.level * 100);
                const lvlEl = document.getElementById('cc-battery-level');
                if (lvlEl) lvlEl.innerText = level + '%';
                const icon = document.getElementById('cc-battery-icon');
                if (icon) {
                    if (battery.charging) {
                        icon.className = 'w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white shadow transition-colors';
                    } else if (level <= 20) {
                        icon.className = 'w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white shadow transition-colors';
                    } else {
                        icon.className = 'w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shadow transition-colors';
                    }
                }
            }
            updateBattery();
            battery.addEventListener('levelchange',   updateBattery);
            battery.addEventListener('chargingchange', updateBattery);
        });
    }

    // Brightness slider
    const slider  = document.getElementById('brightness-slider');
    const overlay = document.getElementById('brightness-overlay');
    if (slider && overlay) {
        slider.addEventListener('input', (e) => {
            const opacity = 0.8 - (e.target.value / 100) * 0.8;
            overlay.style.backgroundColor = `rgba(0,0,0,${opacity})`;
        });
    }

    // Wi-Fi indicator
    const wifiBtn = document.getElementById('cc-wifi');
    const updateWifi = () => {
        if (!wifiBtn) return;
        if (navigator.onLine) {
            wifiBtn.classList.replace('bg-gray-500', 'bg-blue-500');
        } else {
            wifiBtn.classList.replace('bg-blue-500', 'bg-gray-500');
        }
    };
    window.addEventListener('online',  updateWifi);
    window.addEventListener('offline', updateWifi);
    updateWifi();

    // Bluetooth toggle
    const btBtn = document.getElementById('cc-bt');
    let btOn = false;

    function updateBtBtn() {
        if (!btBtn) return;
        if (btOn) btBtn.classList.replace('bg-gray-500', 'bg-blue-500');
        else       btBtn.classList.replace('bg-blue-500', 'bg-gray-500');
    }

    if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
        navigator.bluetooth.getAvailability().then(available => {
            btOn = available;
            updateBtBtn();
        });
    } else {
        btOn = true;
        updateBtBtn();
    }

    const btContainer = document.getElementById('cc-bt-container');
    if (btContainer) {
        btContainer.onclick = (e) => {
            e.stopPropagation();
            btOn = !btOn;
            updateBtBtn();
        };
    }

    fetchWeather();
}

// --- Weather ---
async function fetchWeather() {
    const widget = document.getElementById('weather-widget-content');
    if (!widget) return;

    widget.innerHTML = '<span class="text-xs opacity-50">Fetching location...</span>';
    const customLoc  = localStorage.getItem('sliky_weather_loc');

    if (customLoc) {
        getWeatherFromCityState(customLoc);
    } else if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => getWeatherFromCoords(pos.coords.latitude, pos.coords.longitude),
            ()  => { widget.innerHTML = '<span class="text-xs text-red-500">Location denied. Set in Settings.</span>'; }
        );
    } else {
        widget.innerHTML = '<span class="text-xs text-red-500">Geolocation unavailable.</span>';
    }
}

async function getWeatherFromCityState(cityState) {
    const widget = document.getElementById('weather-widget-content');
    try {
        const geoRes  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityState)},US&format=json&limit=1`);
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
            getWeatherFromCoords(geoData[0].lat, geoData[0].lon, geoData[0].display_name.split(',')[0]);
        } else {
            widget.innerHTML = '<span class="text-xs text-red-500">Location not found.</span>';
        }
    } catch (e) {
        widget.innerHTML = '<span class="text-xs text-red-500">Geocoding error.</span>';
    }
}

async function getWeatherFromCoords(lat, lon, cityName = null) {
    const widget = document.getElementById('weather-widget-content');
    try {
        widget.innerHTML = '<span class="text-xs opacity-50">Fetching forecast...</span>';
        const pointRes  = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
        if (!pointRes.ok) throw new Error('Points API error');
        const pointData = await pointRes.json();

        const forecastUrl  = pointData.properties.forecast;
        const locationName = cityName || `${pointData.properties.relativeLocation.properties.city}, ${pointData.properties.relativeLocation.properties.state}`;

        const forecastRes  = await fetch(forecastUrl);
        if (!forecastRes.ok) throw new Error('Forecast API error');
        const forecastData = await forecastRes.json();
        const current      = forecastData.properties.periods[0];

        widget.innerHTML = `
            <div class="flex flex-col">
                <span class="font-bold text-lg">${current.temperature}°${current.temperatureUnit}</span>
                <span class="opacity-70 text-xs truncate max-w-[120px]">${locationName}</span>
            </div>
            <div class="flex flex-col items-end text-right">
                <span class="opacity-90 text-sm font-medium w-24 leading-tight">${current.shortForecast}</span>
            </div>
        `;
    } catch (e) {
        console.error(e);
        widget.innerHTML = '<span class="text-xs text-red-500">Weather API unavailable.</span>';
    }
}

// --- Spotlight ---
function openSpotlight() {
    const overlay = document.getElementById('spotlight-overlay');
    const input   = document.getElementById('spotlight-input');
    const results = document.getElementById('spotlight-results');

    overlay.classList.remove('hidden');
    input.value = '';
    results.classList.add('hidden');
    results.innerHTML = '';
    setTimeout(() => input.focus(), 50);
}

function closeSpotlight() {
    const overlay = document.getElementById('spotlight-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function handleSpotlightSearch(e) {
    const query      = e.target.value.toLowerCase().trim();
    const resultsDiv = document.getElementById('spotlight-results');

    if (!query) {
        resultsDiv.classList.add('hidden');
        return;
    }

    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = '';

    allSystemApps
        .filter(app => app.name.toLowerCase().includes(query))
        .forEach(app => {
            const item = document.createElement('div');
            item.className = 'px-4 py-3 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer flex justify-between items-center transition-colors';
            item.innerHTML = `<span class="font-medium">${app.name}</span><span class="text-xs opacity-50">${app.type}</span>`;
            item.onclick   = () => { app.action(); closeSpotlight(); };
            resultsDiv.appendChild(item);
        });

    const webItem = document.createElement('div');
    webItem.className = 'px-4 py-3 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer text-blue-500 flex items-center transition-colors border-t border-black/10 dark:border-white/10 mt-1';
    webItem.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-3"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        Search Google for "${e.target.value}"
    `;
    webItem.onclick = () => {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(e.target.value)}`, '_blank');
        closeSpotlight();
    };
    resultsDiv.appendChild(webItem);
}

document.getElementById('spotlight-input').addEventListener('keypress', function (e) {
    if (e.key !== 'Enter') return;
    const query = this.value.trim();
    if (!query) return;

    const matched = allSystemApps.filter(app => app.name.toLowerCase().includes(query.toLowerCase()));
    if (matched.length > 0) {
        matched[0].action();
    } else {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
    }
    closeSpotlight();
});

// --- App Library ---
function toggleAppLibrary() {
    const overlay = document.getElementById('app-library-overlay');
    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        const searchInput = document.getElementById('app-library-search');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }
        renderAppLibrary('');
    } else {
        closeAppLibrary();
    }
}

function closeAppLibrary() {
    const overlay = document.getElementById('app-library-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function handleAppLibrarySearch(e) {
    renderAppLibrary(e.target.value);
}

function renderAppLibrary(query = '') {
    const container = document.getElementById('app-library-grid');
    if (!container) return;
    container.innerHTML = '';

    const q = query.toLowerCase().trim();
    allSystemApps
        .filter(app => app.name.toLowerCase().includes(q))
        .forEach(app => {
            const appDiv = document.createElement('div');
            appDiv.className = 'flex flex-col items-center group cursor-pointer w-full mx-auto app-icon';
            appDiv.onclick   = () => { closeAppLibrary(); app.action(); };
            appDiv.innerHTML = `
                <div class="shadow-xl rounded-2xl relative overflow-hidden flex items-center justify-center bg-black/10 dark:bg-white/5 backdrop-blur-md transition-all group-hover:shadow-white/20">${app.icon}</div>
                <span class="text-xs mt-2 font-medium text-center leading-tight truncate w-full px-1">${app.name}</span>
            `;
            container.appendChild(appDiv);
        });
}
