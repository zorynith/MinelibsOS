// ============================================================
// APP-CONTENTS.JS — Inner HTML for each app window
// ============================================================

const appContents = {
    'Browser': `
        <div class="h-full w-full bg-white relative">
            <iframe src="https://chrome-browser.edgeone.app/" class="w-full h-full border-none rounded-b-xl absolute inset-0 z-0 bg-white"></iframe>
        </div>
    `,

    'Notes': `
        <div class="h-full flex">
            <div class="w-1/3 border-r border-black/10 dark:border-white/10 flex flex-col bg-black/5 dark:bg-white/5">
                <div class="p-2 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-black/5 dark:bg-white/5">
                    <span class="font-bold text-xs uppercase tracking-wider px-2 opacity-50">Notes</span>
                    <button onclick="createNewNote()" class="text-blue-500 hover:bg-black/10 dark:hover:bg-white/10 p-1.5 rounded-lg transition-colors" title="New Note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg></button>
                </div>
                <div id="notes-list" class="flex-1 overflow-y-auto"></div>
            </div>
            <div class="flex-1 flex flex-col relative">
                <div class="p-3 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-white/50 dark:bg-black/50">
                    <input type="text" id="note-title" class="font-bold text-lg bg-transparent border-none outline-none px-2 w-full" placeholder="Note Title" oninput="saveCurrentNote()">
                    <button onclick="deleteCurrentNote()" class="text-red-500 hover:bg-red-500/20 p-1.5 rounded-lg transition-colors" title="Delete Note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
                <textarea id="note-content" class="flex-1 bg-transparent border-none outline-none p-5 resize-none font-medium text-sm leading-relaxed" placeholder="Type your notes here..." oninput="saveCurrentNote()"></textarea>
            </div>
        </div>
    `,

    'To-Dos': `
        <div class="h-full flex bg-white dark:bg-black text-black dark:text-white">
            <div class="w-1/3 border-r border-black/10 dark:border-white/10 flex flex-col bg-black/5 dark:bg-white/5">
                <div class="p-2 border-b border-black/10 dark:border-white/10 flex justify-between items-center">
                    <span class="font-bold text-xs uppercase tracking-wider px-2 opacity-50">Lists</span>
                    <button onclick="createNewTodoList()" class="text-blue-500 hover:bg-black/10 dark:hover:bg-white/10 p-1.5 rounded-lg transition-colors" title="New List"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg></button>
                </div>
                <div id="todos-sidebar" class="flex-1 overflow-y-auto"></div>
            </div>
            <div class="flex-1 flex flex-col relative bg-white dark:bg-gray-900">
                <div class="p-3 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-white/50 dark:bg-black/50">
                    <h2 id="todos-current-list-title" class="font-bold text-lg px-2 truncate w-full">Select a List</h2>
                    <button onclick="deleteCurrentTodoList()" class="text-red-500 hover:bg-red-500/20 p-1.5 rounded-lg transition-colors" title="Delete List"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
                <div id="todos-tasks-container" class="flex-1 overflow-y-auto p-2"></div>
                <div class="p-3 border-t border-black/10 dark:border-white/10 flex items-center">
                    <input type="text" id="new-task-input" class="flex-1 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 outline-none px-4 py-2 rounded-lg text-sm text-black dark:text-white placeholder-black/50 dark:placeholder-white/50" placeholder="Add a new task..." onkeypress="handleNewTaskKeyPress(event)">
                    <button onclick="createNewTodoTask()" class="ml-2 bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg></button>
                </div>
            </div>
        </div>
    `,

    'Files': `
        <div class="h-full flex flex-col">
            <div class="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-black/5 dark:bg-white/5">
                <h2 class="text-lg font-bold">Local Files</h2>
                <label class="bg-blue-500 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-600 text-sm font-medium shadow-sm transition-colors">
                    Upload File
                    <input type="file" class="hidden" id="file-upload-input" onchange="handleFileUpload(event)">
                </label>
            </div>
            <div class="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto flex-1 content-start" id="files-container"></div>
        </div>
    `,

    'Genjutsu': `
        <div class="h-full w-full bg-black">
            <iframe src="https://genjutsu-social.vercel.app/" class="w-full h-full border-none rounded-b-xl"></iframe>
        </div>
    `,

    'JoshAI': `
        <div class="h-full w-full bg-black">
            <iframe src="https://joshai.edgeone.app/" class="w-full h-full border-none rounded-b-xl"></iframe>
        </div>
    `,

    'URL Save': `
        <div class="h-full w-full bg-white">
            <iframe src="https://url-save.edgeone.app/" class="w-full h-full border-none rounded-b-xl"></iframe>
        </div>
    `,

    'Camera': `
        <div class="h-full w-full bg-black flex flex-col relative rounded-b-xl overflow-hidden">
            <video id="camera-feed" class="flex-1 object-cover w-full h-full bg-black" autoplay playsinline></video>
            <div class="absolute bottom-6 left-0 right-0 flex justify-center items-center space-x-12 z-10">
                <button onclick="switchCamera()" class="p-3 bg-white/20 hover:bg-white/40 rounded-full backdrop-blur-md transition-colors"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg></button>
                <button onclick="takePhoto()" class="w-16 h-16 bg-white border-4 border-gray-300 rounded-full active:scale-95 transition-transform shadow-lg"></button>
                <div class="w-12 h-12"></div>
            </div>
            <canvas id="camera-canvas" class="hidden"></canvas>
        </div>
    `,

    'Settings': `
        <div class="h-full flex flex-col overflow-y-auto p-6 space-y-6">
            <h2 class="text-3xl font-bold">Settings</h2>

            <section class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-1">Security & Source</h3>
                <p class="text-sm font-medium mb-3 opacity-70">Current Password: <span class="font-mono bg-black/10 dark:bg-white/10 px-2 py-1 rounded select-all" id="settings-pwd-display"></span></p>
                <button onclick="window.open('https://github.com/sawyerbobk563-code', '_blank')" class="bg-gray-900 dark:bg-white dark:text-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-80 transition-opacity w-full flex justify-center items-center">
                    <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
                    View Source Code
                </button>
            </section>

            <section class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-3">Display & Layout</h3>
                <label class="block text-sm font-medium mb-1.5 opacity-70">Dock Size</label>
                <div class="flex items-center space-x-3 mb-5">
                    <span class="text-xs opacity-70">Small</span>
                    <input type="range" id="dock-size-slider" min="0.6" max="1.4" step="0.05" class="w-full" oninput="updateDockSize(this.value)">
                    <span class="text-xs opacity-70">Large</span>
                </div>
                <p class="text-sm font-medium mb-2 opacity-70">Preset Wallpapers</p>
                <div class="grid grid-cols-4 gap-2 mb-5">
                    <div class="h-16 rounded-lg bg-cover bg-center cursor-pointer border-2 border-transparent hover:border-blue-500 transition-colors shadow-sm" style="background-image: url('https://images.unsplash.com/photo-1444790925621-0342dd3ca58d?w=400&q=80')" onclick="setPresetBg(this.style.backgroundImage)"></div>
                    <div class="h-16 rounded-lg bg-cover bg-center cursor-pointer border-2 border-transparent hover:border-blue-500 transition-colors shadow-sm" style="background-image: url('https://images.unsplash.com/photo-1506744626753-140285315259?w=400&q=80')" onclick="setPresetBg(this.style.backgroundImage)"></div>
                    <div class="h-16 rounded-lg bg-cover bg-center cursor-pointer border-2 border-transparent hover:border-blue-500 transition-colors shadow-sm" style="background-image: url('https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&q=80')" onclick="setPresetBg(this.style.backgroundImage)"></div>
                    <div class="h-16 rounded-lg bg-cover bg-center cursor-pointer border-2 border-transparent hover:border-blue-500 transition-colors shadow-sm" style="background-image: url('https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=80')" onclick="setPresetBg(this.style.backgroundImage)"></div>
                </div>
                <label class="block text-sm font-medium mb-1.5 opacity-70">Custom Image URL</label>
                <div class="flex space-x-2">
                    <input type="text" id="bg-url-input" class="flex-1 bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="https://images.unsplash.com/...">
                    <button onclick="changeBackground()" class="bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">Apply</button>
                </div>
            </section>

            <section class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-3">Weather Location</h3>
                <p class="text-xs opacity-70 mb-3">If browser location access is denied, manually enter your City and State below to enable the Weather widget.</p>
                <div class="flex space-x-2">
                    <input type="text" id="weather-city-input" class="flex-1 bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="e.g. Minnetonka, MN">
                    <button onclick="saveWeatherLocation()" class="bg-green-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors shadow-sm">Save</button>
                </div>
            </section>

            <section class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-4">Add Custom Web App</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider mb-1 opacity-70">App Name</label>
                        <input type="text" id="custom-app-name" placeholder="e.g. YouTube" class="w-full bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                    </div>
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider mb-1 opacity-70">Website URL</label>
                        <input type="text" id="custom-app-url" placeholder="https://youtube.com" class="w-full bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                    </div>
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider mb-1 opacity-70">Add Location</label>
                        <select id="custom-app-loc" class="w-full bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                            <option value="home" class="text-black">Home Screen</option>
                            <option value="dock" class="text-black">Dock Menu</option>
                        </select>
                    </div>
                    <button onclick="addCustomApp()" class="bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-bold w-full hover:bg-blue-600 transition-colors shadow-sm">Install App</button>
                </div>
            </section>

            <section class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/50">
                <h3 class="text-lg font-bold text-red-600 dark:text-red-400 mb-2">System Reset</h3>
                <p class="text-sm opacity-70 mb-4">Reset OS to defaults. Clears background, layout, folders, and custom apps.</p>
                <button onclick="resetSystem()" class="bg-red-500 text-white px-4 py-2 rounded-lg font-bold w-full hover:bg-red-600 transition-colors shadow-sm">Reset to Default</button>
            </section>
        </div>
    `
};
