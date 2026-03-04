// main.js

// Elementos del DOM
const speedGammaSpan = document.getElementById('speedGamma');
const speedBetaSpan = document.getElementById('speedBeta');
const speedAlphaSpan = document.getElementById('speedAlpha');
const volGammaFill = document.getElementById('volGammaFill');
const volBetaFill = document.getElementById('volBetaFill');
const volAlphaFill = document.getElementById('volAlphaFill');
const powerButton = document.getElementById('powerButton');
const statusText = document.getElementById('statusText');

// Variables de audio
let audioContext = null;
let workletNode = null;
let isOn = false;

// Últimos valores de sensores (actualizados en handleMotion)
let ultimosValores = {
    gamma: 0,
    beta: 0,
    alpha: 0
};

// Constantes
const MAX_SPEED = 360;        // grados/segundo para volumen máximo
const UMBRAL = 10;             // por debajo de esto, silencio total (evita ruido)

// Función para inicializar audio con worklet
async function initAudio() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Cargar el procesador (ajusta la ruta si es necesario)
        await audioContext.audioWorklet.addModule('sintetizador-processor.js');
        
        // Crear el nodo del worklet
        workletNode = new AudioWorkletNode(audioContext, 'sintetizador-processor');
        
        // Conectar al destino (altavoces)
        workletNode.connect(audioContext.destination);
        
        // Reanudar el contexto si está suspendido
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        console.log('Worklet cargado y listo');
    } catch (e) {
        console.error('Error al inicializar worklet:', e);
        alert('Error al cargar el procesador de audio. Verifica la consola.');
    }
}

// Función para detener audio
function stopAudio() {
    if (workletNode) {
        workletNode.disconnect();
        workletNode = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

// Botón encender/apagar
powerButton.addEventListener('click', async () => {
    if (!isOn) {
        await initAudio();
        if (audioContext && workletNode) {
            isOn = true;
            powerButton.textContent = '🔇 APAGAR';
            powerButton.classList.add('off');
            statusText.textContent = 'Encendido - Gira el dispositivo';
            
            // Iniciar el bucle de envío de sensores
            iniciarBucleSensores();
        }
    } else {
        stopAudio();
        isOn = false;
        powerButton.textContent = '🔊 ENCENDER';
        powerButton.classList.remove('off');
        statusText.textContent = 'Apagado';
        detenerBucleSensores();
        
        // Resetear UI
        speedGammaSpan.textContent = '0';
        speedBetaSpan.textContent = '0';
        speedAlphaSpan.textContent = '0';
        volGammaFill.style.width = '0%';
        volBetaFill.style.width = '0%';
        volAlphaFill.style.width = '0%';
    }
});

// Variables para el bucle de animación
let rafId = null;

function iniciarBucleSensores() {
    if (rafId) return;
    
    function bucle() {
        if (!isOn) return;
        
        // Leer los últimos valores de los sensores
        const gamma = ultimosValores.gamma;
        const beta = ultimosValores.beta;
        const alpha = ultimosValores.alpha;
        
        // Calcular volúmenes (con umbral)
        const volLa = gamma < UMBRAL ? 0 : Math.min(gamma / MAX_SPEED, 1.0);
        const volSol = beta < UMBRAL ? 0 : Math.min(beta / MAX_SPEED, 1.0);
        const volMi = alpha < UMBRAL ? 0 : Math.min(alpha / MAX_SPEED, 1.0);
        
        // Enviar al worklet mediante el puerto de mensajes
        if (workletNode) {
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'la', valor: volLa });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'sol', valor: volSol });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'mi', valor: volMi });
        }
        
        // Actualizar UI
        speedGammaSpan.textContent = Math.round(gamma);
        speedBetaSpan.textContent = Math.round(beta);
        speedAlphaSpan.textContent = Math.round(alpha);
        volGammaFill.style.width = (volLa * 100) + '%';
        volBetaFill.style.width = (volSol * 100) + '%';
        volAlphaFill.style.width = (volMi * 100) + '%';
        
        // Solicitar el próximo frame
        rafId = requestAnimationFrame(bucle);
    }
    
    rafId = requestAnimationFrame(bucle);
}

function detenerBucleSensores() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

// Manejador de eventos de movimiento
function handleMotion(event) {
    const rotation = event.rotationRate;
    if (!rotation) return;
    
    // Actualizar las variables con los últimos valores
    ultimosValores.gamma = Math.abs(rotation.gamma || 0);
    ultimosValores.beta = Math.abs(rotation.beta || 0);
    ultimosValores.alpha = Math.abs(rotation.alpha || 0);
}

// Solicitar permisos de movimiento (iOS)
function requestMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                } else {
                    alert('Permiso denegado para usar el giroscopio.');
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotion);
    }
}

// Iniciar escucha al cargar la página
window.addEventListener('load', () => {
    requestMotionPermission();
});

// Reintentar al pulsar el botón (por si acaso)
powerButton.addEventListener('click', () => {
    if (!window.hasMotionListener) {
        window.hasMotionListener = true;
        requestMotionPermission();
    }
});

// Pausar cuando la página no es visible (opcional, para ahorrar batería)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isOn) {
        // Enviar silencio al worklet (opcional)
        if (workletNode) {
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'la', valor: 0 });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'sol', valor: 0 });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'mi', valor: 0 });
        }
    }
});
