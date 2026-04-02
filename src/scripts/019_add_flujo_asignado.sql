-- =========================================================================
-- MIGRATION 019: Agregar asignación de flujo a archivos procesados
-- FECHA: 2026-04-02
-- =========================================================================

-- Añadir columna flujo_asignado_id a proveedor_listas_raw para persistencia de la plantilla/flujo por defecto
ALTER TABLE public.proveedor_listas_raw 
ADD COLUMN IF NOT EXISTS flujo_asignado_id UUID REFERENCES public.flujos_extraccion(id_flujo) ON DELETE SET NULL;

-- Indización para consultas veloces
CREATE INDEX IF NOT EXISTS idx_listas_raw_flujo_asignado ON public.proveedor_listas_raw(flujo_asignado_id);
