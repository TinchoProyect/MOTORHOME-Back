const { spawn, execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

console.clear();
console.log("\x1b[36m=====================================================================\x1b[0m");
console.log("\x1b[36m             LAMDA | SISTEMA DE GESTIÓN DE PROVEEDORES                \x1b[0m");
console.log("\x1b[36m=====================================================================\x1b[0m");
console.log("Inicializando secuencia de arranque determinista...\n");

const backendPort = 5655;
const frontendPort = 2573;

function liberarPuerto(port) {
    try {
        const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = stdout.split('\n');
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0' && !isNaN(pid)) {
                    console.log(`[LIMPIEZA] Puerto ${port} ocupado por PID ${pid}. Liberando...`);
                    try {
                        execSync(`taskkill /F /PID ${pid}`);
                    } catch (e) {}
                }
            }
        });
    } catch (e) {
        // Puerto ya libre
    }
}

// 1. Fase de Limpieza
console.log("[1/4] Liberando puertos de red para inicio limpio...");
liberarPuerto(backendPort);
liberarPuerto(frontendPort);
console.log("✔ Puertos de red liberados.\n");

// 2. Levantar Backend
console.log("[2/4] Iniciando Servidor Backend (API Supabase)...");
const backend = spawn('node', ['src/server.js'], {
    stdio: 'ignore',
    detached: false
});

backend.on('error', (err) => {
    console.error("❌ Error al iniciar Backend:", err);
});

// 3. Levantar Frontend
console.log("[3/4] Iniciando Servidor Frontend...");
const frontend = spawn('npx', ['http-server', '.', '-p', `${frontendPort}`, '-c-1'], {
    shell: true,
    stdio: 'ignore'
});

frontend.on('error', (err) => {
    console.error("❌ Error al iniciar Frontend:", err);
});

// 4. Abrir la página del Splash HTML en el navegador
console.log("[4/4] Desplegando interfaz de usuario en el navegador...");
setTimeout(() => {
    try {
        // Usar la ruta de red local del frontend apuntando a splash.html
        const targetUrl = `http://127.0.0.1:${frontendPort}/scripts/splash.html`;
        spawn('cmd.exe', ['/c', 'start', '', targetUrl], { detached: true });
        console.log("✔ Interfaz desplegada con éxito.\n");
        
        console.log("\x1b[32m=====================================================================\x1b[0m");
        console.log("\x1b[32m               ¡EL SISTEMA LAMDA ESTÁ ACTIVO Y EN EJECUCIÓN!         \x1b[0m");
        console.log("\x1b[32m=====================================================================\x1b[0m");
        console.log(" - Backend ejecutándose en puerto: " + backendPort);
        console.log(" - Frontend ejecutándose en puerto: " + frontendPort);
        console.log("\x1b[33m\n >>> Presione ENTER en cualquier momento para CERRAR el sistema limpiamente <<<\x1b[0m");
        console.log("=====================================================================\n");
        
        esperarCierre();
    } catch (e) {
        console.error("Error al abrir navegador:", e);
    }
}, 1500);

function esperarCierre() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', () => {
        console.log("\nDeteniendo servicios de forma ordenada...");
        rl.close();
        apagarTodo();
    });
}

function apagarTodo() {
    console.log("Cerrando servidores...");
    try {
        liberarPuerto(backendPort);
        liberarPuerto(frontendPort);
    } catch (e) {}
    console.log("✔ Servicios finalizados. ¡Hasta luego!");
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

process.on('SIGINT', apagarTodo);
process.on('SIGTERM', apagarTodo);
