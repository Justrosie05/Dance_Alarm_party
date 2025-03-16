// Éléments du DOM
const video = document.getElementById('video');
const motionCanvas = document.getElementById('motion');
const ctx = motionCanvas.getContext('2d');
const status = document.getElementById('status');
const startAlarmBtn = document.getElementById('startAlarm');
const stopAlarmBtn = document.getElementById('stopAlarm');
const alarmStatus = document.getElementById('alarmStatus');

// Variables pour la détection de mouvement
let isAlarmActive = false;
let previousFrame = null;
let motionDetected = false;
let audioContext = null;
let oscillator = null;

// Configuration de la webcam
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.addEventListener('loadedmetadata', () => {
            motionCanvas.width = video.videoWidth;
            motionCanvas.height = video.videoHeight;
        });
    } catch (err) {
        console.error("Erreur d'accès à la webcam:", err);
        status.textContent = "Erreur: Impossible d'accéder à la webcam";
    }
}

// Initialisation de l'alarme
function initializeAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioContext.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
}

// Démarrer l'alarme
function startAlarm() {
    if (!audioContext) initializeAudio();
    oscillator.connect(audioContext.destination);
    oscillator.start();
    isAlarmActive = true;
    alarmStatus.textContent = "État: Activée";
}

// Arrêter l'alarme
function stopAlarm() {
    if (oscillator) {
        oscillator.disconnect();
        oscillator = null;
    }
    isAlarmActive = false;
    alarmStatus.textContent = "État: Désactivée";
    initializeAudio();
}

// Détection de mouvement
function detectMotion() {
    ctx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
    let frame = ctx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);

    if (previousFrame) {
        let movement = 0;
        let sensitivity = 30; // Nombre de pixels qui doivent changer
        let threshold = 30; // Seuil de différence pour chaque pixel

        for (let i = 0; i < frame.data.length; i += 4) {
            // Comparer les composantes RGB
            let diffR = Math.abs(frame.data[i] - previousFrame.data[i]);
            let diffG = Math.abs(frame.data[i + 1] - previousFrame.data[i + 1]);
            let diffB = Math.abs(frame.data[i + 2] - previousFrame.data[i + 2]);

            // Si un pixel a changé significativement
            if (diffR > threshold || diffG > threshold || diffB > threshold) {
                movement++;
            }
        }

        // Calculer le pourcentage de pixels qui ont changé
        let totalPixels = frame.data.length / 4;
        let movementPercentage = (movement / totalPixels) * 100;
        
        motionDetected = movementPercentage > 1; // Si plus de 1% des pixels ont changé

        if (motionDetected && isAlarmActive) {
            status.textContent = "Mouvement détecté! (" + movementPercentage.toFixed(2) + "% de changement)";
            stopAlarm();
        } else if (!motionDetected && isAlarmActive) {
            status.textContent = "Surveillance active - Aucun mouvement";
        } else {
            status.textContent = "Système en attente";
        }
    }

    previousFrame = frame;
    requestAnimationFrame(detectMotion);
}

// Événements
startAlarmBtn.addEventListener('click', startAlarm);
stopAlarmBtn.addEventListener('click', stopAlarm);

// Initialisation
setupCamera();
video.addEventListener('play', () => {
    requestAnimationFrame(detectMotion);
}); 