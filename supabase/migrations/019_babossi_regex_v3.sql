-- Migración para actualizar la Regla Regex de Babossi (Ajuste Quirurgico v3)
-- Objetivo: corregir falsos positivos H2/P3 y soportar multiplicadores sin unidad explicita.

-- ID Objetivo: 1afa5c9a-b477-4595-bd96-4db314921952 (DESCIP + PRESENT)

UPDATE user_diccionario_nomenclatura
SET reglas_procesamiento = '{
    "type": "regex_split",
    "pattern": "/(?:^|\\s)(?:(?:(?:x|por|\\d+\\s*(?:x|por))\\s*[\\d,.]+(?:\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ|BOL|BOLSA|PAQ|PK))?)|(?:[\\d,.]+\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ|BOL|BOLSA|PAQ|PK)))$/i",
    "targets": ["virtual_desc", "virtual_pres"],
    "target_labels": ["Descripción", "Presentación"]
}'::jsonb
WHERE id = '1afa5c9a-b477-4595-bd96-4db314921952';
