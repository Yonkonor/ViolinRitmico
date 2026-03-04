// sintetizador-processor.js
// Este archivo se ejecuta en el hilo de audio de alta prioridad (AudioWorklet)

class SintetizadorProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Configuración de las notas (fundamental y armónicos)
        this.notas = {
            la:  { freq: 220, ganancia: 0.5 }, // La una octava abajo
            sol: { freq: 196, ganancia: 0.5 },
            mi:  { freq: 165, ganancia: 0.5 }
        };
        
        // Estados de fase para cada oscilador (3 por nota: fundamental, 2º armónico, 3º armónico)
        this.fases = {
            la:  [0, 0, 0],
            sol: [0, 0, 0],
            mi:  [0, 0, 0]
        };
        
        // Volúmenes actuales (recibidos desde el hilo principal)
        this.volumenes = { la: 0, sol: 0, mi: 0 };
        
        // Para suavizado interno (opcional, podemos usar el setTarget ya implementado)
        // pero como los mensajes llegan a 60 fps, no es necesario un suavizado extra
        
        // Escuchar mensajes desde el hilo principal
        this.port.onmessage = (event) => {
            if (event.data.tipo === 'volumen') {
                this.volumenes[event.data.nota] = event.data.valor;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        
        // Trabajamos en mono (primer canal)
        const outputChannel = output[0];
        const sampleRate = sampleRate; // variable global en el worklet
        
        // Limpiamos el buffer (opcional, pero por seguridad)
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] = 0;
        }
        
        // Generamos muestra por muestra
        for (let i = 0; i < outputChannel.length; i++) {
            let muestra = 0;
            
            // Mezclamos las tres notas
            for (const [nota, datos] of Object.entries(this.notas)) {
                const vol = this.volumenes[nota];
                if (vol <= 0.001) continue; // umbral para ahorrar CPU
                
                const fBase = datos.freq;
                const gan = datos.ganancia * vol;
                
                // Fundamental (índice 0)
                muestra += Math.sin(this.fases[nota][0]) * gan * 0.5;
                // 1er armónico (2*f)
                muestra += Math.sin(this.fases[nota][1]) * gan * 0.25;
                // 2do armónico (3*f)
                muestra += Math.sin(this.fases[nota][2]) * gan * 0.15;
                
                // Actualizar fases (para la próxima muestra)
                for (let h = 0; h < 3; h++) {
                    const mult = h + 1; // 1,2,3
                    this.fases[nota][h] += 2 * Math.PI * fBase * mult / sampleRate;
                    // Mantener las fases en rango para evitar overflow
                    if (this.fases[nota][h] > 2 * Math.PI) {
                        this.fases[nota][h] -= 2 * Math.PI;
                    }
                }
            }
            
            // Saturación suave (opcional, para evitar clipping duro)
            if (muestra > 1.0) muestra = 1.0;
            if (muestra < -1.0) muestra = -1.0;
            
            outputChannel[i] = muestra;
        }
        
        return true; // Mantener el procesador vivo
    }
}

// Registrar el procesador con el nombre que usaremos en main.js
registerProcessor('sintetizador-processor', SintetizadorProcessor);
