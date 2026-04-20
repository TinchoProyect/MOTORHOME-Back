-- Migration: 034_pedidos_b2b.sql
-- Description: Estructura de tablas para el módulo B2B (Módulo de Pedidos y Presupuestos)

CREATE TABLE IF NOT EXISTS public.pedidos_b2b_cabecera (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    fecha_emision TIMESTAMPTZ DEFAULT now(),
    estado TEXT NOT NULL DEFAULT 'Borrador', -- 'Borrador', 'Emitido', 'Completado', 'Cancelado'
    tipo_documento TEXT NOT NULL DEFAULT 'Orden de Pedido', -- 'Orden de Pedido', 'Solicitud de Presupuesto'
    notas_adjuntas TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_b2b_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos_b2b_cabecera(id) ON DELETE CASCADE,
    producto_codigo TEXT NOT NULL,
    producto_descripcion TEXT,
    cantidad NUMERIC DEFAULT 0,
    valor_unitario_ref NUMERIC DEFAULT 0,
    unidad_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_pedidos_b2b_prov ON public.pedidos_b2b_cabecera(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_b2b_estado ON public.pedidos_b2b_cabecera(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_b2b_items_pedido ON public.pedidos_b2b_items(pedido_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_pedidos_b2b_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_b2b_updated_at ON public.pedidos_b2b_cabecera;
CREATE TRIGGER trg_pedidos_b2b_updated_at
BEFORE UPDATE ON public.pedidos_b2b_cabecera
FOR EACH ROW
EXECUTE FUNCTION update_pedidos_b2b_updated_at();
