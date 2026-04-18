-- Migración 031: Bandera de Bloqueo de Edición Manual en Tabla Maestra Operativa

-- 1. Añadimos la columna booleana para evitar que el Extractor IA pise el trabajo humano.
ALTER TABLE public.tabla_maestra_operativa 
ADD COLUMN IF NOT EXISTS bloqueo_edicion_manual BOOLEAN DEFAULT false;

-- 2. Índice preventivo si vamos a filtrar masivamente por bloqueados/no bloqueados
CREATE INDEX IF NOT EXISTS idx_tabla_maestra_op_bloqueo ON public.tabla_maestra_operativa(bloqueo_edicion_manual);
