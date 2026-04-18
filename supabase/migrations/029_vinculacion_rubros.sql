-- Migración 029: Vínculo Relacional Tabla Maestra y Gestión de Rubros

-- 1. Añadimos el constraint a la tabla maestra operativa
ALTER TABLE public.tabla_maestra_operativa 
ADD COLUMN IF NOT EXISTS rubro_id UUID REFERENCES public.maestro_rubros(id) ON DELETE SET NULL;

-- 2. Backfill de datos existentes: 
-- Identificamos la clave 'Rubro' (o similar) dentro de datos_maestros y hacemos UPDATE
-- NOTA: Esto se hace sólo si hay datos_maestros->>'Rubro'

UPDATE public.tabla_maestra_operativa tmo
SET rubro_id = mr.id
FROM public.maestro_rubros mr
WHERE 
  -- Coincidencia Insensible a mayúsculas
  LOWER(TRIM(tmo.datos_maestros->>'Rubro')) = LOWER(TRIM(mr.nombre_rubro))
  AND tmo.rubro_id IS NULL;

-- 3. Creamos un índice para acelerar el JOIN dinámico del visor
CREATE INDEX IF NOT EXISTS idx_tabla_maestra_op_rubro ON public.tabla_maestra_operativa(rubro_id);
