-- =========================================================================
-- MIGRATION 018: Creación de Gestor de Flujos de Mapeo (Plantillas)
-- FECHA: 2026-04-01
-- OBJETIVO: Permitir guardar y rehidratar el estado del Visor Universal
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.flujos_extraccion (
    id_flujo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    nombre_flujo TEXT NOT NULL,
    config_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMPTZ DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.flujos_extraccion ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para desarrollo rápido (Ajustable a futuro)
CREATE POLICY "Permitir full access a authenticated" 
    ON public.flujos_extraccion 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Indexar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_flujos_proveedor ON public.flujos_extraccion(proveedor_id);
