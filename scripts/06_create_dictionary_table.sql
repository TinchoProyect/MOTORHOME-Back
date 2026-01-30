-- =============================================================================
-- SCRIPT 06: DICCIONARIO DE NOMENCLATURA (USER LANGUAGE)
-- Objetivo: Crear tabla para almacenar términos personalizados de mapeo.
-- =============================================================================

-- 1. Crear Tabla
CREATE TABLE IF NOT EXISTS user_diccionario_nomenclatura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Ajuste Post-Motorhome
    termino TEXT NOT NULL UNIQUE,
    descripcion_uso TEXT,
    categoria TEXT DEFAULT 'CUSTOM', -- 'SYSTEM' | 'CUSTOM'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Seed Inicial (Términos del Sistema)
INSERT INTO user_diccionario_nomenclatura (termino, categoria, descripcion_uso)
VALUES 
    ('SKU', 'SYSTEM', 'Código único del producto'),
    ('PRECIO', 'SYSTEM', 'Precio unitario o costo'),
    ('DESCRIPCION', 'SYSTEM', 'Nombre o descripción del producto'),
    ('STOCK', 'SYSTEM', 'Cantidad disponible')
ON CONFLICT (termino) DO NOTHING;

-- 3. Seguridad (RLS)
ALTER TABLE user_diccionario_nomenclatura ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública (para el combobox)
CREATE POLICY "Public Read Access" 
ON user_diccionario_nomenclatura FOR SELECT 
USING (true);

-- Permitir inserción a usuarios autentiados (y anon por si acaso en dev)
CREATE POLICY "Public Insert Access" 
ON user_diccionario_nomenclatura FOR INSERT 
WITH CHECK (true);

COMMENT ON TABLE user_diccionario_nomenclatura IS 'Diccionario de términos de mapeo definidos por el usuario vs sistema';
