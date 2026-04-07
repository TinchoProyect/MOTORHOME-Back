-- Migration 027: Creación de la Tabla Maestra Operativa V4.1
-- Esta tabla almacena los datos reales purgados de la extracción, con estructura dinámica vía JSONB.

CREATE TABLE IF NOT EXISTS public.tabla_maestra_operativa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    archivo_origen_id TEXT NOT NULL,
    timestamp_extraccion TIMESTAMPTZ DEFAULT NOW(),
    datos_maestros JSONB NOT NULL DEFAULT '{}'::jsonb,
    es_delta BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for fast retrieval and filtering on Provider and Origin File
CREATE INDEX IF NOT EXISTS idx_tabla_maestra_op_proveedor ON public.tabla_maestra_operativa(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_tabla_maestra_op_archivo ON public.tabla_maestra_operativa(archivo_origen_id);

-- GIN Index for fast JSON query filtering (e.g. searching by dynamic columns like CODIGO)
CREATE INDEX IF NOT EXISTS idx_tabla_maestra_op_json_gin ON public.tabla_maestra_operativa USING GIN(datos_maestros);

-- Políticas de RLS abiertas temporalmente (Siguiendo el esquema actual)
ALTER TABLE public.tabla_maestra_operativa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users on tabla_maestra_operativa" 
ON public.tabla_maestra_operativa 
FOR ALL USING (true);
