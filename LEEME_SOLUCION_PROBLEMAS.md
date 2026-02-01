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
