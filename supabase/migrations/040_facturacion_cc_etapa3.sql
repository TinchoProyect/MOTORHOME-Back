-- Migration: 040_facturacion_cc_etapa3.sql
-- Description: Etapa 3 - Conciliación Operativa (Matchmaking)

-- Extender facturas_raw para alojar los resultados del Matchmaking
ALTER TABLE public.facturas_raw 
ADD COLUMN IF NOT EXISTS pedido_b2b_id UUID REFERENCES public.pedidos_b2b_cabecera(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_conciliacion TEXT DEFAULT 'PENDIENTE_MATCH', -- PENDIENTE_MATCH, CONCILIADO_OK, OBSERVADO_POR_DESVIOS
ADD COLUMN IF NOT EXISTS match_report JSONB;

-- Índices para búsquedas de conciliación
CREATE INDEX IF NOT EXISTS idx_facturas_raw_pedido ON public.facturas_raw(pedido_b2b_id);
CREATE INDEX IF NOT EXISTS idx_facturas_raw_conciliacion ON public.facturas_raw(status_conciliacion);
