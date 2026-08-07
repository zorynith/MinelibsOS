// ============================================================
// CAMERA.JS — Camera App Logic
// ============================================================

let currentFacingMode = 'environment';
let cameraStream      = null;

async function initCamera() {
    const video = document.getElementById('camera-feed');
    if (!video) return;

    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: false
        });
        video.srcObject = cameraStream;
    } catch (e) {
        console.error('Camera error:', e);
    }
}

function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    initCamera();
}

function takePhoto() {
    const video  = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    if (!video || !canvas || !cameraStream) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const dataUrl  = canvas.toDataURL('image/jpeg');
    const fileName = `IMG_${Date.now()}.jpg`;

    simulatedFiles.push({
        name: fileName,
        type: 'image/jpeg',
        url:  dataUrl,
        size: Math.round(dataUrl.length * 0.75)
    });

    // Flash effect
    const flash = document.createElement('div');
    flash.className = 'absolute inset-0 bg-white z-50 transition-opacity duration-300';
    video.parentElement.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; }, 50);
    setTimeout(() => { flash.remove(); }, 350);
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
}
