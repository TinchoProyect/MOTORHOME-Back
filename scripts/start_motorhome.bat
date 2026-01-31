@echo off
echo [MOTORHOME] Iniciando Secuencia de Arranque...

:: 1. Limpieza de Puerto 2573 (Motorhome Safe Port)
echo [MOTORHOME] Liberando puerto 2573...
FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :2573') do (
    echo Matando proceso %%a...
    taskkill /f /pid %%a >nul 2>&1
)

:: 2. Iniciar Backend (en puerto 5555) y Servidor Fronend
echo [MOTORHOME] Levantando Backend (puerto 5655)...
start "Backend Service (DO NOT CLOSE)" /min node src/server.js

echo [MOTORHOME] Levantando Frontend (puerto 2573)...
start /b cmd /c "timeout /t 4 >nul & start "" http://localhost:2573/src/views/acceso.html"
call npx -y http-server . -p 2573 -c-1
