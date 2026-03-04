// main.js
// Este archivo se ejecuta en el hilo principal y maneja sensores, UI y comunicación con el worklet

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

// Configuración de sensores y umbrales
const MAX_SPEED = 360;        // grados/segundo para volumen máximo
const UMBRAL = 10;            // por debajo de esto, silencio total (evita ruido)
let ultimosValores = { gamma: 0, beta: 0, alpha: 0 };

// --- Funciones de inicialización y audio ---

async function initAudio() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Cargar el worklet (asegurar ruta correcta)
        await audioContext.audioWorklet.addModule('sintetizador-processor.js');
        
        // Crear el nodo del worklet
        workletNode = new AudioWorkletNode(audioContext, 'sintetizador-processor');
        
        // Conectar al destino (altavoces)
        workletNode.connect(audioContext.destination);
        
        // Reanudar el contexto si es necesario
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        console.log('Worklet cargado correctamente');
    } catch (e) {
        console.error('Error al inicializar audio:', e);
        alert('No se pudo inicializar el audio. Verifica que tu navegador soporte AudioWorklet.');
    }
}

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

// --- Manejo de sensores ---

function handleMotion(event) {
    const rotation = event.rotationRate;
    if (!rotation) return;
    
    // Solo actualizamos las variables (no procesamos audio aquí)
    ultimosValores.gamma = Math.abs(rotation.gamma || 0);
    ultimosValores.beta = Math.abs(rotation.beta || 0);
    ultimosValores.alpha = Math.abs(rotation.alpha || 0);
    
    // Actualizar displays numéricos de velocidad
    speedGammaSpan.textContent = Math.round(ultimosValores.gamma);
    speedBetaSpan.textContent = Math.round(ultimosValores.beta);
    speedAlphaSpan.textContent = Math.round(ultimosValores.alpha);
}

// --- Bucle de envío de volúmenes (Fase 1: requestAnimationFrame) ---

function iniciarBucleVolumenes() {
    function enviarVolumenes() {
        if (!isOn || !workletNode) return;
        
        // Calcular volúmenes aplicando umbral mínimo
        const volLa  = ultimosValores.gamma < UMBRAL ? 0 : Math.min(ultimosValores.gamma / MAX_SPEED, 1.0);
        const volSol = ultimosValores.beta  < UMBRAL ? 0 : Math.min(ultimosValores.beta  / MAX_SPEED, 1.0);
        const volMi  = ultimosValores.alpha < UMBRAL ? 0 : Math.min(ultimosValores.alpha / MAX_SPEED, 1.0);
        
        // Enviar al worklet mediante postMessage
        workletNode.port.postMessage({ tipo: 'volumen', nota: 'la',  valor: volLa });
        workletNode.port.postMessage({ tipo: 'volumen', nota: 'sol', valor: volSol });
        workletNode.port.postMessage({ tipo: 'volumen', nota: 'mi',  valor: volMi });
        
        // Actualizar barras visuales
        volGammaFill.style.width = (volLa * 100) + '%';
        volBetaFill.style.width  = (volSol * 100) + '%';
        volAlphaFill.style.width = (volMi * 100) + '%';
        
        // Programar siguiente envío (justo antes del próximo repintado)
        requestAnimationFrame(enviarVolumenes);
    }
    
    // Iniciar el bucle
    requestAnimationFrame(enviarVolumenes);
}

// --- Botón encender/apagar ---

powerButton.addEventListener('click', async () => {
    if (!isOn) {
        await initAudio();
        if (audioContext && workletNode) {
            isOn = true;
            powerButton.textContent = '🔇 APAGAR';
            powerButton.classList.add('off');
            statusText.textContent = 'Encendido - Gira el dispositivo';
            
            // Iniciar el bucle que envía volúmenes al worklet
            iniciarBucleVolumenes();
        }
    } else {
        stopAudio();
        isOn = false;
        powerButton.textContent = '🔊 ENCENDER';
        powerButton.classList.remove('off');
        statusText.textContent = 'Apagado';
        // Las barras se quedan como están, pero el worklet ya no recibe mensajes
        volGammaFill.style.width = '0%';
        volBetaFill.style.width = '0%';
        volAlphaFill.style.width = '0%';
        speedGammaSpan.textContent = '0';
        speedBetaSpan.textContent = '0';
        speedAlphaSpan.textContent = '0';
    }
});

// --- Solicitar permisos de movimiento (iOS 13+) ---

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

// Iniciar al cargar la página
window.addEventListener('load', () => {
    requestMotionPermission();
});

// Si el botón se pulsa y aún no hay listener, lo intentamos de nuevo (por si acaso)
powerButton.addEventListener('click', () => {
    if (!window.hasMotionListener) {
        window.hasMotionListener = true;
        requestMotionPermission();
    }
});

// Pausar cuando la página no es visible (ahorra batería)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isOn) {
        // Enviar volumen cero para silenciar (opcional)
        if (workletNode) {
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'la', valor: 0 });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'sol', valor: 0 });
            workletNode.port.postMessage({ tipo: 'volumen', nota: 'mi', valor: 0 });
        }
    }
});
