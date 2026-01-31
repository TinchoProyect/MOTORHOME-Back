@echo off
echo [MOTORHOME] === SECUENCIA DE ARRANQUE DE EMERGENCIA ===

:: 1. Limpieza Quirúrgica de Puertos (Solo matamos lo que estorba)
echo [MOTORHOME] Liberando puertos 5656 (Backend) y 2573 (Frontend)...
FOR %%p IN (5656 2573) DO (
    FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :%%p') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: 2. Iniciar el CEREBRO (Backend) en una ventana aparte
echo [MOTORHOME] Levantando Backend en puerto 5656...
:: Llamamos directamente a server.js para evitar el bucle de npm start
start "LAMDA_BACKEND_5656" cmd /k "node src/server.js"

:: 3. Iniciar el CUERPO (Frontend) en otra ventana
echo [MOTORHOME] Levantando Frontend en puerto 2573...
start "LAMDA_FRONTEND_2573" cmd /k "npx http-server . -p 2573 -c-1"

:: 4. Abrir la puerta de acceso
echo [MOTORHOME] Abriendo navegador...
timeout /t 3 >nul
start http://localhost:2573/src/views/acceso.html

echo.
echo ✅ SISTEMA ONLINE. 
echo ⚠️  NO CIERRES las ventanas negras que se abrieron.
echo.
pause
