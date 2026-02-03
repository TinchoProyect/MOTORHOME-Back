# PROTOLO DE RESOLUCIÓN DE INCIDENTES Y LECCIONES APRENDIDAS

Este documento detalla soluciones técnicas a problemas críticos encontrados durante el desarrollo del sistema. Úselo como referencia principal cuando enfrente problemas de conexión, persistencia de procesos o actualizaciones visuales fallidas.

## 1. Gestión de Claves de Base de Datos (Supabase)

### El Problema
El uso incorrecto de las claves de API (`ANON_KEY` vs `SERVICE_ROLE_KEY`) provoca errores de permisos (401/403) o violaciones de seguridad críticas.

### Protocolo
*   **Frontend (`src/views/config.js`):** Debe usar **EXCLUSIVAMENTE** la `SUPABASE_ANON_KEY`.
    *   *Razón:* Esta clave respeta las políticas RLS (Row Level Security). El cliente (navegador) nunca debe tener acceso total.
*   **Backend (`src/server.js` / `.env`):** Debe usar **EXCLUSIVAMENTE** la `SUPABASE_SERVICE_ROLE_KEY`.
    *   *Razón:* El backend actúa como administrador (proxy) y necesita saltarse las reglas RLS para realizar escrituras privilegiadas o actualizaciones masivas.

**Síntoma de Error:** Si ve errores de "Policy Violation" al intentar guardar desde el front, **NO CAMBIE LA CLAVE DEL FRONT**. En su lugar, cree un endpoint en el backend para manejar esa operación de forma segura.

---

## 2. Incidente del Navegador: Zombie Processes (Error 404 / Puerto Ocupado)

### El Problema
Al cerrar la terminal o la ventana del navegador, el proceso `node.js` del servidor backend (puerto 5655) a menudo queda activo en segundo plano ("Zombie Node"). Al intentar reiniciar con `npm start`, el nuevo proceso falla silenciosamente o el navegador intenta comunicarse con el proceso viejo.

### Síntoma
*   Error `404 Not Found` en rutas que usted sabe que existen.
*   Error `EADDRINUSE` en la terminal.
*   Comportamiento "fantasma" donde los cambios en el código backend no se reflejan.

### Solución Implementada
Use siempre el script de inicio robusto `scripts/start_motorhome.bat`. Este script ejecuta:
1.  Búsqueda de procesos en puertos 2573 (Front) y 5655 (Back).
2.  `taskkill /F /PID <pid>` para forzar el cierre de cualquier proceso remanente.
3.  Inicio limpio de los nuevos servicios.

**Comando Manual de Limpieza:**
```powershell
netstat -ano | findstr :5655
taskkill /F /PID <PID_ENCONTRADO>
```

---

## 3. Incidente UI: Actualización Silenciosa (Fallo de Comparación)

### El Problema
El backend confirma una actualización exitosa (Status 200), pero la interfaz de usuario (tabla, encabezados) sigue mostrando el valor anterior hasta que se recarga la página.

### Diagnóstico Técnico
La lógica de JavaScript usaba comparación estricta (`===`) para detectar cambios:
```javascript
if (columnMapping[key] === oldName) { ... }
```
Si `oldName` (traído de la BD) y `columnMapping` (estado local) difieren mínimamente (ej: "Codigo" vs "Código", o "SKU " vs "SKU"), la comparación falla silenciosamente. El código cree que no hay nada que actualizar y no redibuja la tabla.

### Solución Protocolar (Código Robusto)
Siempre que compare entradas de usuario o datos visuales con claves de base de datos, **NORMALICE** las cadenas:
```javascript
const normalize = (s) => s ? s.toString().trim().toLowerCase() : '';
if (normalize(columnMapping[key]) === normalize(oldName)) {
    // Actualizar
}
```
Además, fuerce explícitamente el re-renderizado (`renderVirtualTable()`) después de actualizar el modelo de datos local y agregue logs (`console.log`) para confirmar que el flujo entró en el bloque de actualización.

---

## 4. UX y Consistencia Backend: Menús y Persistencia (Feb 2026)

### El Problema 1: Menú "Toggle" Fallido (Race Condition de Eventos)
El usuario reportó que al hacer click en el encabezado de columna para cerrar el menú, este se cerraba y se volvía a abrir inmediatamente ("parpadeo"), impidiendo el cierre.
**Diagnóstico:** El evento `click` en el botón se propagaba ("bubbling") hasta el `document`. Allí, el `closeHandler` global detectaba un click fuera del menú (porque el menú aún no se había marcado como cerrado o el target era el botón) y lo cerraba. Inmediatamente después, el handler del botón se ejecutaba y, al no encontrar menú, lo abría de nuevo.
**Solución Protocolar:**
Siempre que implemente un botón "Toggle" con un handler de cierre global (`document.onClick`), debe detener la propagación en el botón:
```javascript
function openMenu(e) {
    if (e) e.stopPropagation(); // CRÍTICO: Evita que llegue al document y dispare closeHandler
    // ... lógica de toggle ...
}
```

### El Problema 2: Datos no guardados (Mismatch de Parámetros)
La descripción de los términos no se guardaba al editar.
**Diagnóstico:** Frontend enviaba el objeto `{ descripcion_uso: "..." }` (coincidiendo con la BD), pero el Controlador Backend destructuraba `{ descripcion }` (nombre variable incorrecto).
**Lección:** Verificar siempre la alineación triple: **Schema BD == Payload Fetch == Controller Destructuring**.

### El Problema 3: UX Destructiva (Alerts Nativos)
El uso de `confirm()` (alerta nativa del navegador) rompe la estética de aplicaciones reactivas modernas.
**Solución:** Se implementó `renderConfirmDialog` (Modal Glassmorphism) que inyecta HTML directo en el DOM y usa promesas (`async/await`) para esperar la confirmación del usuario antes de proceder, manteniendo la fluidez visual sin bloquear el hilo principal del navegador.

---

## 5. Infraestructura Drive & Automatización (Nuevo Core v2.5)

### Hito Crítico: Permisos de Service Account
Si obtiene el error `Insufficient permissions for the specified parent` al crear carpetas:
*   **Causa:** La Service Account (`service-account.json`) tiene acceso "Viewer" pero no "Editor" en la carpeta raíz.
*   **Solución:** Compartir la carpeta padre en Drive con el email de la SA (`client_email`) asignando rol de **EDITOR**.

### Error 405 (Method Not Allowed) en Fetch
*   **Causa:** El frontend intenta llamar a `/api/...` (ruta relativa) sin definir `backendBaseUrl`. Si el frontend corre en puerto 2573 y backend en 5655, la ruta relativa golpea al frontend (2573) que no tiene ese endpoint.
*   **Solución:** Definir globalmente en `monitor_proveedores.html`:
    ```javascript
    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    ```
    Y usar `${backendBaseUrl}/api/...` en todos los fetch.

### ReferenceError: backendBaseUrl is not defined
*   **Contexto:** Ocurre al limpiar código "obsoleto" (ej: borrar funciones de carga antigua) y accidentalmente borrar variables de configuración global que estaban en el mismo bloque.
*   **Protocolo:** Antes de borrar un bloque de código, verificar si declara constantes (`const`, `let`) que se usan en funciones subsiguientes.

### Script de Migración
Se creó `scripts/migrate_folders.js` para retro-activar proveedores antiguos.
*   **Uso:** `node scripts/migrate_folders.js`
*   **Función:** Detecta proveedores sin subcarpetas (Precios/Extraídas) y las crea automáticamente bajo la misma raíz existente.

---

## 6. Incidente Crítico: Bloqueo de Worker y Buffer Desconectado (03 Feb 2026)

### El Problema
Al refactorizar el motor de visualización de Excel (`viewer_engine.js`), el sistema se colgaba y arrojaba dos errores fatales:
1.  `Uncaught NetworkError: Failed to execute 'importScripts'`: El navegador bloqueaba la carga de la librería `xlsx.full.min.js` desde una ruta local dentro del Blob Worker.
2.  `TypeError: Cannot perform Construct on a detached ArrayBuffer`: Al fallar el Worker, el modo de rescate fallaba porque el buffer del archivo había sido "transferido" (vaciado) al Worker muerto.

### Diagnóstico Técnico
*   **Seguridad de Blob Workers:** Los Workers creados dinámicamente (`URL.createObjectURL(blob)`) tienen restricciones severas para cargar scripts locales (`file://` o rutas relativas complejas).
*   **Transferencia de Memoria:** Al usar `postMessage(..., [buffer])`, el hilo principal pierde el acceso al archivo. Si el Worker muere, el archivo se pierde y no hay posibilidad de recuperación (fallback).

### Solución Protocolar (Implementada en `viewer_engine.js`)
1.  **Carga remota (CDN):** Usar siempre una URL absoluta de CDN confiable para las dependencias dentro de un Blob Worker dinámico.
    ```javascript
    // ✅ CORRECTO
    const libUrl = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
    // ❌ EVITAR en Blob Workers
    // const libUrl = "./js/xlsx.full.min.js";
    ```
2.  **Clonado de Buffer:** **NUNCA** transferir la propiedad del ArrayBuffer si existe una posibilidad de fallo y necesidad de fallback local.
    ```javascript
    // ✅ CORRECTO (Clona, mantiene original en Main Thread)
    viewerWorker.postMessage({ type: 'INIT_FILE', payload: arrayBuffer });
    
    // ❌ EVITAR (Transfiere y vacía el original)
    // viewerWorker.postMessage({ type: 'INIT_FILE', payload: arrayBuffer }, [arrayBuffer]);
    ```
