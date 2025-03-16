// Éléments du DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const debug = document.getElementById('debug');
const startAlarmBtn = document.getElementById('startAlarm');
const stopAlarmBtn = document.getElementById('stopAlarm');
const alarmStatus = document.getElementById('alarmStatus');
const poseStatus = document.getElementById('poseStatus');
const poseContainers = document.querySelectorAll('.pose-container');

// Variables globales
let isAlarmActive = false;
let audioContext = null;
let oscillator = null;
let net = null;
let selectedPose = 'mainDroite';
let isTracking = false;
let videoWidth = 640;
let videoHeight = 480;
let lastKeypoints = null;
let smoothingFactor = 0.5; // Facteur de lissage pour le mouvement

// Configuration de la webcam
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: videoWidth },
                height: { ideal: videoHeight },
                frameRate: { ideal: 30 }
            } 
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Ajuster la taille du canvas pour correspondre exactement à la vidéo
                videoWidth = video.videoWidth;
                videoHeight = video.videoHeight;
                video.width = videoWidth;
                video.height = videoHeight;
                canvas.width = videoWidth;
                canvas.height = videoHeight;
                resolve(video);
            };
        });
    } catch (err) {
        console.error("Erreur d'accès à la webcam:", err);
        status.textContent = "Erreur: Impossible d'accéder à la webcam";
        throw err;
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
    status.textContent = "Système actif - En attente de la pose";
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

// Fonction de lissage des points
function smoothKeypoints(newKeypoints) {
    if (!lastKeypoints) {
        lastKeypoints = newKeypoints;
        return newKeypoints;
    }

    const smoothedKeypoints = newKeypoints.map((point, index) => {
        const lastPoint = lastKeypoints[index];
        if (point.score > 0.3 && lastPoint.score > 0.3) {
            return {
                ...point,
                position: {
                    x: lastPoint.position.x + (point.position.x - lastPoint.position.x) * smoothingFactor,
                    y: lastPoint.position.y + (point.position.y - lastPoint.position.y) * smoothingFactor
                }
            };
        }
        return point;
    });

    lastKeypoints = smoothedKeypoints;
    return smoothedKeypoints;
}

// Dessiner les points de détection et les connexions
function drawKeypoints(keypoints) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Appliquer le lissage aux points
    const smoothedKeypoints = smoothKeypoints(keypoints);
    
    // Définir les connexions entre les points
    const connections = [
        ['leftShoulder', 'rightShoulder'],
        ['leftShoulder', 'leftElbow'],
        ['leftElbow', 'leftWrist'],
        ['rightShoulder', 'rightElbow'],
        ['rightElbow', 'rightWrist'],
        ['leftShoulder', 'leftHip'],
        ['rightShoulder', 'rightHip'],
        ['leftHip', 'rightHip'],
        ['nose', 'leftEye'],
        ['nose', 'rightEye'],
        ['leftEye', 'leftEar'],
        ['rightEye', 'rightEar']
    ];

    // Créer un objet pour un accès facile aux keypoints
    const keypointDict = {};
    smoothedKeypoints.forEach(point => {
        keypointDict[point.part] = point;
    });

    // Dessiner les connexions
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    connections.forEach(([p1, p2]) => {
        const point1 = keypointDict[p1];
        const point2 = keypointDict[p2];
        if (point1 && point2 && point1.score > 0.3 && point2.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(point1.position.x, point1.position.y);
            ctx.lineTo(point2.position.x, point2.position.y);
            ctx.stroke();
        }
    });

    // Dessiner les points
    smoothedKeypoints.forEach(point => {
        if (point.score > 0.3) {
            // Halo extérieur
            ctx.beginPath();
            ctx.arc(point.position.x, point.position.y, 12, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.fill();

            // Point central
            ctx.beginPath();
            ctx.arc(point.position.x, point.position.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#00ff00';
            ctx.fill();

            // Bordure brillante
            ctx.beginPath();
            ctx.arc(point.position.x, point.position.y, 8, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Afficher le nom du point
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(point.part, point.position.x + 10, point.position.y);
        }
    });
}

// Vérification des poses
function checkPose(pose) {
    if (!pose.keypoints || pose.score < 0.2) {
        debug.textContent = "Score de pose trop faible - Rapprochez-vous de la caméra";
        return false;
    }

    const keypoints = {};
    pose.keypoints.forEach(point => {
        keypoints[point.part] = {
            position: point.position,
            score: point.score
        };
    });

    // Fonction pour vérifier si un point est plus haut qu'un autre
    const isHigher = (point1, point2, minDiff = 50) => {
        return point1 && point2 && 
               point1.score > 0.3 && 
               point2.score > 0.3 && 
               (point2.position.y - point1.position.y) > minDiff;
    };

    let result = false;
    let debugMsg = "";

    switch (selectedPose) {
        case 'mainDroite':
            result = isHigher(keypoints.rightWrist, keypoints.rightShoulder);
            debugMsg = `Main droite: ${keypoints.rightWrist?.score.toFixed(2)}, Épaule: ${keypoints.rightShoulder?.score.toFixed(2)}`;
            break;

        case 'mainGauche':
            result = isHigher(keypoints.leftWrist, keypoints.leftShoulder);
            debugMsg = `Main gauche: ${keypoints.leftWrist?.score.toFixed(2)}, Épaule: ${keypoints.leftShoulder?.score.toFixed(2)}`;
            break;

        case 'mainsTete':
            result = keypoints.rightWrist?.position.y < keypoints.nose?.position.y &&
                    keypoints.leftWrist?.position.y < keypoints.nose?.position.y &&
                    keypoints.rightWrist?.score > 0.3 &&
                    keypoints.leftWrist?.score > 0.3;
            debugMsg = `Mains: D=${keypoints.rightWrist?.score.toFixed(2)}, G=${keypoints.leftWrist?.score.toFixed(2)}`;
            break;

        case 'brasCroises':
            const centerX = (keypoints.rightShoulder?.position.x + keypoints.leftShoulder?.position.x) / 2;
            result = Math.abs(keypoints.rightWrist?.position.x - keypoints.leftWrist?.position.x) < 150 &&
                    Math.abs(keypoints.rightWrist?.position.y - keypoints.leftWrist?.position.y) < 100 &&
                    Math.abs(keypoints.rightWrist?.position.x - centerX) < 150 &&
                    keypoints.rightWrist?.score > 0.3 &&
                    keypoints.leftWrist?.score > 0.3;
            debugMsg = `Distance mains: ${Math.abs(keypoints.rightWrist?.position.x - keypoints.leftWrist?.position.x).toFixed(0)}px`;
            break;
    }

    debug.textContent = debugMsg;
    return result;
}

// Détection des poses en temps réel
async function detectPoseInRealTime() {
    if (!net) return;

    async function poseDetectionFrame() {
        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: true,
            decodingMethod: 'single-person'
        });

        // Ajuster les coordonnées en fonction de la taille réelle de la vidéo
        const scaleX = videoWidth / video.width;
        const scaleY = videoHeight / video.height;
        
        const adjustedKeypoints = pose.keypoints.map(point => ({
            ...point,
            position: {
                x: point.position.x * scaleX,
                y: point.position.y * scaleY
            }
        }));

        drawKeypoints(adjustedKeypoints);

        if (isAlarmActive) {
            const poseDetected = checkPose({ ...pose, keypoints: adjustedKeypoints });
            poseStatus.textContent = `Pose actuelle: ${poseDetected ? 'Pose correcte détectée!' : 'En attente de la pose'}`;
            
            if (poseDetected) {
                status.textContent = "Pose correcte ! Alarme désactivée.";
                stopAlarm();
            }
        }

        requestAnimationFrame(poseDetectionFrame);
    }

    poseDetectionFrame();
}

// Sélection de pose
function selectPose(pose) {
    selectedPose = pose;
    poseContainers.forEach(container => {
        container.classList.remove('pose-selected');
        if (container.dataset.pose === pose) {
            container.classList.add('pose-selected');
        }
    });
    poseStatus.textContent = "Pose actuelle: En attente de la pose";
    status.textContent = isAlarmActive ? "Système actif - En attente de la pose" : "Système en attente";
}

// Événements
startAlarmBtn.addEventListener('click', startAlarm);
stopAlarmBtn.addEventListener('click', stopAlarm);
poseContainers.forEach(container => {
    container.addEventListener('click', () => selectPose(container.dataset.pose));
});

// Initialisation
async function init() {
    await setupCamera();
    status.textContent = "Chargement de PoseNet...";
    
    net = await posenet.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        inputResolution: { width: videoWidth, height: videoHeight },
        multiplier: 1.0,
        quantBytes: 2,
        scoreThreshold: 0.3
    });
    
    status.textContent = "Système prêt ! Placez-vous bien en face de la caméra.";
    detectPoseInRealTime();
}

init(); 