-- FASE 1: Motor Estructural (Base de Datos)
-- Script para desplegar la entidad "maestro_rubros" (Cuadernito de Rubros)
-- Permite clasificaciones globales deterministas y human-verified.

CREATE TABLE IF NOT EXISTS maestro_rubros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_rubro TEXT NOT NULL UNIQUE,
    descripcion_narrativa TEXT NOT NULL,
    base_keywords JSONB DEFAULT '[]', -- Para keywords retrocompatibles o autogeneradas
    es_activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas RLS (Row Level Security) - Adaptables a la política actual de LAMDA
ALTER TABLE maestro_rubros ENABLE ROW LEVEL SECURITY;

-- Asumiendo acceso público o autenticado estándar para LAMDA UI:
CREATE POLICY "Select_All_Rubros"
ON maestro_rubros FOR SELECT 
USING (true);

CREATE POLICY "Insert_Rubro_Admin"
ON maestro_rubros FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Update_Rubro_Admin"
ON maestro_rubros FOR UPDATE 
USING (true);

CREATE POLICY "Delete_Rubro_Admin"
ON maestro_rubros FOR DELETE 
USING (true);

-- Sembrado inicial basado en el plan V1 (Semillas, Condimentos, Lácteos, etc.)
-- El humano lo editará luego.
INSERT INTO maestro_rubros (nombre_rubro, descripcion_narrativa)
VALUES 
('SEMILLAS', 'Abarca cualquier tipo de semilla cruda o tostada, granos agrícolas o pipas destinadas a consumo o plantación. Incluye granos secos (ej: lino, girasol, chía).'),
('CONDIMENTOS', 'Artículos asociados a la cocina que se usan de forma espolvoreada para dar sabor, aroma o color. Incluye pimientas, hierbas secas (orégano, provenzal), sales especiales e infusiones aromáticas.'),
('LÁCTEOS', 'Cualquier producto derivado directamente de la leche, incluyendo leches fluidas, yogures, cremas y mantecas. (Excluye quesos de horma dura si aplican a otro rubro general).')
ON CONFLICT (nombre_rubro) DO NOTHING;
