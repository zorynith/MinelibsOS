# Sliky OS

A browser-based desktop OS experience built as a single-page web app. Features a login screen, draggable/resizable windows, a dock, home screen app grid, spotlight search, control center, and more.

## File Structure

```
sliky-os/
├── index.html              # HTML shell — all markup, no inline JS or CSS
├── css/
│   └── styles.css          # All custom styles (animations, login, dock, etc.)
└── js/
    ├── state.js            # App registry, desktop layout state, save/load (localStorage)
    ├── app-contents.js     # Inner HTML templates for each built-in app window
    ├── windows.js          # Window open/close/minimize/maximize/drag/resize/snap
    ├── desktop.js          # Desktop icon rendering, drag-to-move, folders, context menu
    ├── menus.js            # Dropdown menus, spotlight, app library, control center, weather
    ├── main.js             # Init, clock, login/logout, keyboard shortcuts, external apps
    └── apps/
        ├── notes.js        # Notes app logic
        ├── todos.js        # To-Dos app logic
        ├── files.js        # Files app logic (local upload/download)
        ├── camera.js       # Camera app logic (getUserMedia)
        └── settings.js     # Settings: wallpaper, dock size, custom apps, reset
```

> **Script load order matters.** `index.html` loads scripts in the correct dependency order: `state.js` → `app-contents.js` → `apps/*` → `windows.js` → `desktop.js` → `menus.js` → `main.js`

## Features

- 🔐 Neo-brutalist login screen with "remember me"
- 🪟 Draggable, resizable, snappable windows (edge snap, maximize, minimize)
- 🗂 Home screen grid with drag-to-rearrange icons and folder support
- 🔦 Spotlight search (Cmd/Ctrl+K)
- 📚 App Library overlay
- 🎛 Control Center (brightness, dark mode, battery, Wi-Fi, weather)
- 📝 Notes, ✅ To-Dos, 📁 Files, 📷 Camera — all built-in
- ⚙️ Settings: wallpaper presets, custom web apps, dock size, weather location
- 💾 State persisted via localStorage (layout, todos, custom apps, theme)
- 📱 PWA-ready with inline service worker bootstrap

## Deployment

Works on any static host — GitHub Pages, Netlify, EdgeOne Pages, etc. Just serve the folder root.

```bash
# Quick local preview (Python)
python3 -m http.server 8080
```
