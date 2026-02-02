-- Migración para actualizar la Regla Regex de Babossi ("The 0.5% Fix" v6)
-- Objetivo: Capturar excepciones "3 x22,68" (espacio antes de x) y "10x1" robustamente.

-- ID Objetivo: 1afa5c9a-b477-4595-bd96-4db314921952 (DESCIP + PRESENT)

-- JSON String escape: \s -> \\s, \d -> \\d

UPDATE user_diccionario_nomenclatura
SET reglas_procesamiento = '{
    "type": "regex_split",
    "pattern": "/(?:(?:(?:(?:\\d+\\s*)?(?:x|por)\\s*[\\d,.]+)(?:\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ|BOL|BOLSA|PAQ|PK|UNID|U))?)|(?:(?:^|\\s)[\\d,.]+\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ|BOL|BOLSA|PAQ|PK|UNID|U)))$/i",
    "targets": ["virtual_desc", "virtual_pres"],
    "target_labels": ["Descripción", "Presentación"]
}'::jsonb
WHERE id = '1afa5c9a-b477-4595-bd96-4db314921952';
