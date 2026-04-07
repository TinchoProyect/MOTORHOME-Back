-- Migration 028: Agrega la columna cacheada nombre_proveedor a la Tabla Maestra Operativa

ALTER TABLE public.tabla_maestra_operativa 
ADD COLUMN IF NOT EXISTS nombre_proveedor TEXT;
