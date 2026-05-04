-- Migration: 035_recepcion_fisica.sql
-- Description: Estructura de tablas para el módulo de Recepción Física de Mercadería

CREATE TABLE IF NOT EXISTS public.recepciones_fisicas_cabecera (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos_b2b_cabecera(id) ON DELETE CASCADE,
    fecha_recepcion TIMESTAMPTZ DEFAULT now(),
    numero_remito TEXT,
    estado TEXT NOT NULL DEFAULT 'Parcial', -- 'Parcial', 'Completa'
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recepciones_fisicas_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recepcion_id UUID NOT NULL REFERENCES public.recepciones_fisicas_cabecera(id) ON DELETE CASCADE,
    pedido_item_id UUID NOT NULL REFERENCES public.pedidos_b2b_items(id) ON DELETE CASCADE,
    cantidad_esperada NUMERIC NOT NULL,
    cantidad_recibida NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_recepciones_cab_pedido ON public.recepciones_fisicas_cabecera(pedido_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_item_recepcion ON public.recepciones_fisicas_items(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_item_pedido_item ON public.recepciones_fisicas_items(pedido_item_id);
