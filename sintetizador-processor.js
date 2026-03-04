// sintetizador-processor.js
class SintetizadorProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Frecuencias fundamentales (La una octava abajo = 220 Hz)
        this.notas = {
            la:  { freq: 220,  ganancia: 0.5 },
            sol: { freq: 196,  ganancia: 0.5 },
            mi:  { freq: 165,  ganancia: 0.5 }
        };
        
        // Estados de fase para cada nota y cada armónico (fund + 2 armónicos)
        this.fases = {
            la:  [0, 0, 0],
            sol: [0, 0, 0],
            mi:  [0, 0, 0]
        };
        
        // Volúmenes actuales (suavizados) - comenzamos en 0
        this.volumenActual = { la: 0, sol: 0, mi: 0 };
        // Volúmenes objetivo (recibidos del hilo principal)
        this.volumenObjetivo = { la: 0, sol: 0, mi: 0 };
        
        // Coeficiente de suavizado (entre 0 y 1). Más alto = más rápido.
        // Con 0.9, el volumen se acerca al 90% del objetivo en cada bloque de 128 muestras.
        // A 48kHz, un bloque dura ~2.7ms. 0.9 da un tiempo de establecimiento de unos pocos ms.
        this.smoothFactor = 0.9;
        
        // Escuchar mensajes desde el hilo principal
        this.port.onmessage = (event) => {
            if (event.data.tipo === 'volumen') {
                // Actualizar objetivo
                this.volumenObjetivo[event.data.nota] = event.data.valor;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        
        const sampleRate = sampleRate; // global en worklet
        
        // Suponemos mono: usamos el primer canal
        const outputChannel = output[0];
        const numSamples = outputChannel.length;
        
        // Para cada muestra en este bloque
        for (let i = 0; i < numSamples; i++) {
            let muestra = 0;
            
            // Procesar cada nota
            for (const [nombre, datos] of Object.entries(this.notas)) {
                // Aplicar suavizado al volumen de esta nota
                this.volumenActual[nombre] = this.smoothFactor * this.volumenActual[nombre] 
                                            + (1 - this.smoothFactor) * this.volumenObjetivo[nombre];
                
                const vol = this.volumenActual[nombre];
                if (vol < 0.001) continue; // saltear si es muy bajo
                
                const freqBase = datos.freq;
                const gananciaBase = datos.ganancia;
                
                // Fundamental (primer armónico)
                muestra += Math.sin(this.fases[nombre][0]) * vol * gananciaBase * 0.5;
                // 2º armónico (2x frecuencia)
                muestra += Math.sin(this.fases[nombre][1]) * vol * gananciaBase * 0.25;
                // 3er armónico (3x frecuencia)
                muestra += Math.sin(this.fases[nombre][2]) * vol * gananciaBase * 0.15;
                
                // Actualizar fases
                for (let h = 0; h < 3; h++) {
                    const mult = h + 1; // 1,2,3
                    this.fases[nombre][h] += 2 * Math.PI * freqBase * mult / sampleRate;
                    if (this.fases[nombre][h] > 2 * Math.PI) {
                        this.fases[nombre][h] -= 2 * Math.PI;
                    }
                }
            }
            
            // Limitar para evitar saturación (soft clipping suave)
            if (muestra > 1.0) muestra = 1.0;
            if (muestra < -1.0) muestra = -1.0;
            
            outputChannel[i] = muestra;
        }
        
        return true; // mantener vivo
    }
}

registerProcessor('sintetizador-processor', SintetizadorProcessor);
