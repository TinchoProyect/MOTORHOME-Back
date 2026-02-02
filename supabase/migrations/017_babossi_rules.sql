-- 1. Agregar columna JSONB (si no existe) para reglas de UI
ALTER TABLE user_diccionario_nomenclatura 
ADD COLUMN IF NOT EXISTS reglas_procesamiento JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_diccionario_nomenclatura.reglas_procesamiento IS 'Configuración JSON para transformación automática (ej: regex_split) en el frontend.';

-- 2. Asignar regla ESPECÍFICA al ID del término 'DESCIP + PRESENT'
-- ID Objetivo: 1afa5c9a-b477-4595-bd96-4db314921952
UPDATE user_diccionario_nomenclatura
SET reglas_procesamiento = '{
    "type": "regex_split",
    "pattern": "/(?:(?:x|\\d+\\s*x)?\\s*[\\d,.]+\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ))$/i",
    "targets": ["virtual_desc", "virtual_pres"],
    "target_labels": ["Descripción", "Presentación"]
}'::jsonb
WHERE id = '1afa5c9a-b477-4595-bd96-4db314921952';
