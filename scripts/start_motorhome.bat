@echo off
echo [MOTORHOME] === RE-UBICANDO SISTEMA ===

:: 1. SALIR DE LA CARPETA SCRIPTS (Paso crucial)
cd ..

:: 2. Limpieza Quirúrgica de Puertos
echo [MOTORHOME] Liberando puertos...
FOR %%p IN (5656 2573) DO (
    FOR /F "tokens=5" %%a in ('netstat -aon ^| findstr :%%p') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: 3. Iniciar el CEREBRO (Backend)
echo [MOTORHOME] Levantando Backend en puerto 5656...
:: Usamos server.js que ya lo dejamos impecable
start "LAMDA_BACKEND_5656" cmd /k "node src/server.js"

:: 4. Iniciar el CUERPO (Frontend)
echo [MOTORHOME] Levantando Frontend en puerto 2573...
start "LAMDA_FRONTEND_2573" cmd /k "npx http-server . -p 2573 -c-1"

:: 5. Abrir la puerta de acceso
timeout /t 4 >nul
start http://localhost:2573/src/views/acceso.html

echo.
echo ✅ SISTEMA RE-UBICADO Y ONLINE.
echo.
pause