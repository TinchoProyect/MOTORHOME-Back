-- ==============================================================================
-- TICKET #038: MIGRACIÓN DE CATEGORÍAS ESTÁTICAS A ENTIDADES RELACIONALES
-- ==============================================================================
-- Instrucciones: Ejecutar este script completo en el SQL Editor de Supabase.

-- 1. CREACIÓN DE LA NUEVA TABLA MAESTRA
CREATE TABLE IF NOT EXISTS categorias_proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. POLÍTICAS DE SEGURIDAD (RLS)
ALTER TABLE categorias_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura y escritura a usuarios autenticados" 
ON categorias_proveedores 
FOR ALL 
USING (auth.role() = 'authenticated');

-- 3. MIGRACIÓN DE DATOS (Preservar estado actual)
-- Insertar las categorías únicas que ya existen en los proveedores (evitar duplicados y nulos)
INSERT INTO categorias_proveedores (nombre)
SELECT DISTINCT categoria 
FROM proveedores 
WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
ON CONFLICT (nombre) DO NOTHING;

-- Insertar una categoría general por si hiciera falta como default
INSERT INTO categorias_proveedores (nombre) VALUES ('General')
ON CONFLICT (nombre) DO NOTHING;

-- 4. ADAPTACIÓN DE LA TABLA PRINCIPAL (proveedores)
-- Agregar la columna temporal/definitiva de Foreign Key
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias_proveedores(id) ON DELETE RESTRICT;

-- Mapear los UUIDs correspondientes a los textos existentes
UPDATE proveedores p
SET categoria_id = c.id
FROM categorias_proveedores c
WHERE p.categoria = c.nombre;

-- 5. PURGA DE LA DEUDA TÉCNICA
-- Eliminar la columna vieja harcodeada
ALTER TABLE proveedores DROP COLUMN IF EXISTS categoria;

-- ==============================================================================
-- FIN DEL SCRIPT
-- ==============================================================================
