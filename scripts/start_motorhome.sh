#!/bin/bash
echo "[MOTORHOME] Iniciando Secuencia de Arranque..."

# 1. Limpieza de Puerto 2573
echo "[MOTORHOME] Liberando puerto 2573..."
pid=$(lsof -ti :2573)
if [ -n "$pid" ]; then
  kill -9 $pid
fi

# 2. Iniciar Servidor
echo "[MOTORHOME] Levantando servidor..."

# Función para abrir navegador tras delay
(sleep 4 && (xdg-open "http://localhost:2573/src/views/acceso.html" || open "http://localhost:2573/src/views/acceso.html")) &

npx -y http-server . -p 2573 -c-1
