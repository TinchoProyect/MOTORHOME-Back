-- Migration 032: Tabla de Presets de Filtros de Tabla Maestra
-- Almacena el estado JSONB de los filtros (agGrid FilterModel) asignado a un nombre
-- para restitución bajo demanda ("Hydration").

CREATE TABLE IF NOT EXISTS public.master_table_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_preset TEXT NOT NULL,
    filter_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index por si se buscan filtros recientes o por nombre
CREATE INDEX IF NOT EXISTS idx_master_table_presets_nombre ON public.master_table_presets(nombre_preset);

-- Políticas RLS abiertas temporalmente (Esquema por defecto a nivel taller)
ALTER TABLE public.master_table_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users on master_table_presets" 
ON public.master_table_presets 
FOR ALL USING (true);
