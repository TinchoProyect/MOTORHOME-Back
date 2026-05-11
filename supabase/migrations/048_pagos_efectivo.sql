-- Migration: 048_pagos_efectivo.sql
-- Description: Creación de la tabla de Pagos en Efectivo y trigger hacia Cuenta Corriente (Fase 1 de Módulo de Caja)

-- 1. Tabla cruda de Pagos en Efectivo
CREATE TABLE IF NOT EXISTS public.pagos_efectivo_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    fecha_pago DATE NOT NULL,
    monto_pago NUMERIC(15,2) NOT NULL,
    observaciones TEXT,
    caja_id UUID, -- Nulo en Fase 1, se enlazará al Módulo de Caja en Fase 2
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Permisivo para desarrollo/Fase 1)
ALTER TABLE public.pagos_efectivo_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso público a pagos_efectivo_raw" 
ON public.pagos_efectivo_raw FOR ALL USING (true) WITH CHECK (true);

-- 2. Trigger hacia Cuenta Corriente
CREATE OR REPLACE FUNCTION public.trg_after_insert_pago_efectivo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.cuenta_corriente_proveedores (
        proveedor_id,
        fecha_movimiento,
        tipo_movimiento,
        monto_credito,
        monto_debito,
        referencia_pago_id,
        observaciones
    ) VALUES (
        NEW.proveedor_id,
        NEW.fecha_pago::timestamptz,
        'PAGO_EFECTIVO',
        0.00,
        NEW.monto_pago,
        'EFECTIVO-' || NEW.id::text,
        'Pago en Efectivo. Ref: ' || COALESCE(NEW.observaciones, 'S/D')
    );
    
    RETURN NEW;
END;
$$;

-- 3. Vincular Trigger
DROP TRIGGER IF EXISTS trg_pago_efectivo_to_cc ON public.pagos_efectivo_raw;
CREATE TRIGGER trg_pago_efectivo_to_cc
AFTER INSERT ON public.pagos_efectivo_raw
FOR EACH ROW
EXECUTE FUNCTION public.trg_after_insert_pago_efectivo();
