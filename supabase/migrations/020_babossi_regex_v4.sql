-- Migración para actualizar la Regla Regex de Babossi ("Antitodo" v4)
-- Objetivo: Split Híbrido. Cortar sin espacio SI hay multiplicador, cortar SOLO con espacio SI no hay multiplicador.

-- ID Objetivo: 1afa5c9a-b477-4595-bd96-4db314921952 (DESCIP + PRESENT)

-- Nota: La regex compleja usa lookaheads/lookbehinds.
-- JSON String escape: \s -> \\s, \d -> \\d

UPDATE user_diccionario_nomenclatura
SET reglas_procesamiento = '{
    "type": "regex_split",
    "pattern": "/(?:\\s+|(?=[0-9]+(?:x|por))|(?<=[a-z])(?=x|por))((?:(?:x|por)\\s*[\\d,.]+|[\\d,.]+\\s*(?:x|por)|(?<=\\s)[\\d,.]+)(?:\\s*(?:KG|G|GR|L|ML|CC|KGS|GRS|UNI|UN|CAP|PZ|BOL|BOLSA|PAQ|PK|UNID|U))?)$/i",
    "targets": ["virtual_desc", "virtual_pres"],
    "target_labels": ["Descripción", "Presentación"]
}'::jsonb
WHERE id = '1afa5c9a-b477-4595-bd96-4db314921952';
