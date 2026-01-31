-- =============================================================================
-- SCRIPT: 08_schema_rescue.sql
-- DESCRIPCION: Auditoría y Limpieza de "Basura" en Base de Datos (Rescue Mission)
-- FECHA: 30 Enero 2026
-- =============================================================================

-- 1. LIMPIEZA DE SCHEMA (proveedor_formatos_guia)
-- Identificar y eliminar formatos "zombies" (sin nombre, sin fingerprint válido o creados por error)
-- El usuario mencionó "campo vacío/sin nombre".

DELETE FROM proveedor_formatos_guia
WHERE nombre_formato IS NULL 
   OR trim(nombre_formato) = ''
   OR fingerprint IS NULL
   OR jsonb_typeof(fingerprint) = 'null';

-- Opcional: Si hay campos "sin nombre" que tienen datos válidos, los nombramos "Recovered Format"
-- UPDATE proveedor_formatos_guia
-- SET nombre_formato = 'Formato Recuperado ' || substring(id::text, 1, 8)
-- WHERE nombre_formato IS NULL OR trim(nombre_formato) = '';


-- 2. CONTROL DE BASURA EN RAW (proveedor_listas_raw)
-- Tenemos "60 registros para 4 proveedores". Muchos duplicados.
-- Eliminamos los que quedaron en 'ANALYZING' hace más de 24 horas y no tienen items extraídos.

DELETE FROM proveedor_listas_raw
WHERE status_global = 'ANALYZING'
  AND created_at < NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
      SELECT 1 FROM proveedor_items_extraidos 
      WHERE proveedor_items_extraidos.lista_raw_id = proveedor_listas_raw.id
  );

-- 3. UNIFICACION DE PENDING
-- (Esto se maneja mejor en lógica de backend, pero aquí podemos marcar duplicados como OBSOLETE)
-- Marcamos como ERROR_DUPLICADO los registros viejos del mismo archivo que no terminaron de procesar.
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY proveedor_id, archivo_id ORDER BY created_at DESC) as rn
    FROM proveedor_listas_raw
    WHERE status_global IN ('ANALYZING', 'PENDING')
)
UPDATE proveedor_listas_raw
SET status_global = 'OBSOLETE_DUPLICATE'
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
