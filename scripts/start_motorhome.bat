@echo off
echo [MOTORHOME] Iniciando Secuencia de Arranque...

:: 1. Limpieza de Puertos (Frontend 2573, Backend 5555/5655)
echo [MOTORHOME] Limpiando puertos...
FOR %%p IN (2573 5555 5655 5656) DO (
    FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :%%p') do (
        echo Matando PID %%a en puerto %%p...
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: 2. Iniciar Backend (en puerto 5555) y Servidor Fronend
echo [MOTORHOME] Levantando Backend (puerto 5656)...
start "Backend Service (DEBUG MODO)" cmd /k "node src/debug_server.js"

echo [MOTORHOME] Levantando Frontend (puerto 2573)...
start /b cmd /c "timeout /t 4 >nul & start "" http://localhost:2573/src/views/acceso.html"
call npx -y http-server . -p 2573 -c-1
