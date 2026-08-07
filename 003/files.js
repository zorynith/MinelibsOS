// ============================================================
// FILES.JS — Files App Logic
// ============================================================

const simulatedFiles = [];

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    simulatedFiles.push({ name: file.name, type: file.type, url, size: file.size });
    renderFiles();
}

function renderFiles() {
    const container = document.getElementById('files-container');
    if (!container) return;
    container.innerHTML = '';

    if (simulatedFiles.length === 0) {
        container.innerHTML = '<div class="col-span-4 text-center opacity-50 mt-10 w-full">No files uploaded locally.</div>';
        return;
    }

    simulatedFiles.forEach((f, i) => {
        container.innerHTML += `
            <div class="flex flex-col items-center p-3 border border-black/10 dark:border-white/10 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 relative group transition-colors shadow-sm">
                <div class="text-3xl mb-2">📄</div>
                <div class="text-[11px] text-center truncate w-full font-medium" title="${f.name}">${f.name}</div>
                <div class="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center space-x-3 rounded-lg backdrop-blur-sm">
                    <a href="${f.url}" target="_blank" download="${f.name}" class="text-white hover:text-blue-300" title="Download">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                    <button onclick="deleteFile(${i})" class="text-white hover:text-red-400" title="Delete">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>`;
    });
}

function deleteFile(index) {
    simulatedFiles.splice(index, 1);
    renderFiles();
}
