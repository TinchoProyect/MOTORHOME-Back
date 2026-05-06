-- 046_omitir_cc_movimientos.sql
-- Agrega soporte de soft-delete financiero a los movimientos históricos

ALTER TABLE public.cuenta_corriente_proveedores
ADD COLUMN IF NOT EXISTS es_omitido BOOLEAN DEFAULT false;
