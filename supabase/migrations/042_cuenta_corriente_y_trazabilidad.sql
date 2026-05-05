-- Migration: 042_cuenta_corriente_y_trazabilidad.sql
-- Description: Etapa 4 - Creación del motor de cuenta corriente de proveedores y blindaje de trazabilidad post-conciliación.

-- 1. Trazabilidad en Recepciones Físicas
ALTER TABLE public.recepciones_fisicas_cabecera 
ADD COLUMN IF NOT EXISTS estado_conciliacion TEXT DEFAULT 'NO_CONCILIADA'; -- NO_CONCILIADA, CONCILIADA

CREATE INDEX IF NOT EXISTS idx_recepciones_cab_conciliacion ON public.recepciones_fisicas_cabecera(estado_conciliacion);

-- 2. Motor de Cuenta Corriente
CREATE TABLE IF NOT EXISTS public.cuenta_corriente_proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    fecha_movimiento TIMESTAMPTZ DEFAULT now(),
    tipo_movimiento TEXT NOT NULL, -- 'FACTURA', 'NOTA_CREDITO', 'PAGO', 'AJUSTE'
    monto_credito NUMERIC(15,2) DEFAULT 0.00, -- A favor del proveedor (Nos aumenta la deuda)
    monto_debito NUMERIC(15,2) DEFAULT 0.00,  -- En contra del proveedor (Pagos, NC que reducen la deuda)
    referencia_factura_id UUID REFERENCES public.facturas_raw(id) ON DELETE SET NULL,
    referencia_pago_id TEXT, -- Puede enlazarse a un módulo de pagos futuro
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_proveedor ON public.cuenta_corriente_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cc_fecha ON public.cuenta_corriente_proveedores(fecha_movimiento);

-- 3. Trazabilidad en Facturas Raw
ALTER TABLE public.facturas_raw
ADD COLUMN IF NOT EXISTS cuenta_corriente_id UUID REFERENCES public.cuenta_corriente_proveedores(id) ON DELETE SET NULL;
