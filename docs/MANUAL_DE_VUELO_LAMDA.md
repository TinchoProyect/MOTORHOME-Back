# 🦅 MANUAL DE VUELO - PROYECTO LAMDA (MOTORHOME)

> **ESTADO DE ALERTA:** REAJUSTE ESTRUCTURAL
> **FECHA DE VIGENCIA:** 31 Enero 2026
> **MANDATO:** "El Chofer manda. Robustez > Magia."

## 1. PRINCIPIOS DE NAVEGACIÓN (Prioridades)

1.  **CONSISTENCIA DE PROCESOS (Prioridad #1):**
    *   La integridad de los datos es sagrada.
    *   El orden de los archivos es cronológico y determinista.
    *   Si un proceso falla, el sistema debe reportar el error con precisión técnica, NO intentar "arreglarlo" visualmente para que se vea bonito.
    *   **Prohibido:** "Safety Nets" que enmascaran fallos de extracción.

2.  **TRANSPARENCIA (El Tablero de Control):**
    *   El backend no miente. Si la base de datos dice una cosa y el archivo dice otra, se reporta la discrepancia.
    *   No se inventan datos de muestra (dummy data) a menos que sea explícitamente un modo "Demo".

3.  **INTELIGENCIA (Prioridad #2):**
    *   La IA es una herramienta de soporte, no el conductor.
    *   La IA solo sugiere; el Usuario (Chofer) confirma.

## 2. MAPA DE RUTA TÉCNICO VIGENTE

Este es el esquema lógico actual que rige las decisiones del sistema:

### A. Flujo de Ingesta (Drive -> App)
*   **Origen:** `driveService.js` consulta API Google Drive.
*   **Regla Actual:** Trae archivos filtrados por Query.
*   **Punto Crítico:** ¿Cómo se ordenan? Actualmente confiamos en el orden natural de la API o fecha de modificación. *Se requiere auditoría aquí.*

### B. Flujo de Procesamiento (App -> DB)
1.  **Identificación:**
    *   Se recibe `fileId`.
    *   Se busca en tabla `proveedor_listas_raw`.
2.  **Bifurcación (Logic Branching):**
    *   **SI EXISTE Y CONFIRMADO:** Se intenta leer de `proveedor_items_extraidos`.
        *   *Patche Detectado (Auto-Heal):* Si está vacío, el sistema intenta re-extraer en silencio. **[A REVISAR]**
    *   **SI NO EXISTE:** Se llama a `ExtractionService`.
        *   *Patche Detectado (Safety Net):* Si la extracción falla pero hay "Huella", el sistema finge éxito para abrir el modal. **[A ELIMINAR]**

## 3. AUDITORÍA DE PARCHES ACTIVOS

Se han identificado los siguientes puntos donde el sistema prioriza la "magia" sobre la robustez:

1.  **FilesController.js (Líneas 211-227):** "SAFETY NET ACTIVATED".
    *   *Qué hace:* Si el extractor falla (error de lectura, archivo corrupto), pero el sistema "cree" conocer el formato, devuelve `success: true` con datos vacíos para forzar la UI.
    *   *Acción Requerida:* **ELIMINAR.** Debe devolver error 422 o 500.

2.  **FilesController.js (Líneas 97-114):** "Auto-Heal".
    *   *Qué hace:* Si la base de datos "perdió" los items, el sistema los regenera al vuelo sin avisar.
    *   *Acción Requerida:* **DESACTIVAR O NOTIFICAR.** El usuario debe saber que la base de datos estaba corrupta.

3.  **ExtractionService.js (Header Hunter):**
    *   *Qué hace:* "Adivina" dónde empieza la cabecera.
    *   *Acción Requerida:* Hacerlo estricto. Si no está claro, pedir intervención manual, no adivinar.

---
*Este documento es la Fuente de Verdad para cualquier agente que trabaje en el proyecto.*
