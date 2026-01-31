-- =============================================================================
-- SCRIPT: 09_link_orphans.sql
-- DESCRIPCION: Reparación de Datos - Vinculación de Huérfanos Babossi
-- =============================================================================

-- 1. Identificar el guía existente de Babossi (asumimos el último activo)
WITH GuiaTarget AS (
    SELECT id, proveedor_id
    FROM proveedor_formatos_guia
    WHERE estado = 'ACTIVA'
    -- AND proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE '%Babossi%') -- Opcional si queremos ser específicos
    ORDER BY created_at DESC
    LIMIT 1
)
-- 2. Actualizar las listas RAW que:
--    - Pertenecen al mismo proveedor que la guía
--    - Tienen formato_guia_id NULL
--    - (Opcional) tienen status 'CONFIRMED' o 'ANALYZING'
UPDATE proveedor_listas_raw
SET formato_guia_id = (SELECT id FROM GuiaTarget),
    modo_procesamiento = 'MAPPED',
    status_global = 'CONFIRMED' -- Forzamos confirmado si ya sabemos que es ese formato
WHERE proveedor_id = (SELECT proveedor_id FROM GuiaTarget)
  AND formato_guia_id IS NULL;

-- 3. Verificación
SELECT COUNT(*) as records_recovered 
FROM proveedor_listas_raw 
WHERE formato_guia_id IS NOT NULL;
