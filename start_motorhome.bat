@echo off
echo [MOTORHOME] Iniciando Backend 5656...
taskkill /F /IM node.exe
start /B "BACKEND_5656" npm start
echo Backend Iniciado en Segundo Plano.
pause
