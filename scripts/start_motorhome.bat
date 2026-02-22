@echo off
echo [MOTORHOME] Iniciando Secuencia de Arranque...

:: 1. Limpieza de Puertos (Frontend 2573 y Backend 5655)
echo [MOTORHOME] Liberando puertos...
FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :2573') do (
    echo Matando proceso frontend PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)
FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :5655') do (
    echo Matando proceso backend PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)

:: 2. Iniciar Backend (en puerto 5555) y Servidor Fronend
echo [MOTORHOME] Levantando Backend (puerto 5655)...
start "Backend Service (DO NOT CLOSE)" /min node src/server.js

echo [MOTORHOME] Levantando Frontend (puerto 2573)...
start "" "%CD%\scripts\splash.html"
call npx -y http-server . -p 2573 -c-1
