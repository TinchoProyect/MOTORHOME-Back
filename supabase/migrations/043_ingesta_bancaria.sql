-- Migration: 043_ingesta_bancaria.sql
-- Description: Etapa 4 - Cierre de Ciclo. Creación de tabla para ingesta de extractos bancarios y trigger de conciliación.

-- 1. Tabla de Ingesta Bancaria Raw (Escudo Anti-Duplicados)
CREATE TABLE IF NOT EXISTS public.pagos_bancarios_raw (
    hash_id TEXT PRIMARY KEY, -- Hash determinista md5(fecha_pago + monto_pago + descripcion_original)
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    fecha_pago DATE NOT NULL,
    monto_pago NUMERIC(15,2) NOT NULL,
    descripcion_original TEXT,
    archivo_origen_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_bancarios_proveedor ON public.pagos_bancarios_raw(proveedor_id);

-- 2. Función Trigger para impactar en Cuenta Corriente
CREATE OR REPLACE FUNCTION public.trg_after_insert_pago_bancario()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Inyectar el pago en la cuenta corriente del proveedor
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
        'PAGO',
        0.00,
        NEW.monto_pago,
        NEW.hash_id,
        'Ingesta Automática Bancaria. Ref: ' || COALESCE(NEW.descripcion_original, 'S/D')
    );

    RETURN NEW;
END;
$$;

-- 3. Vincular el Trigger a la tabla
DROP TRIGGER IF EXISTS trg_pago_bancario_to_cc ON public.pagos_bancarios_raw;
CREATE TRIGGER trg_pago_bancario_to_cc
AFTER INSERT ON public.pagos_bancarios_raw
FOR EACH ROW
EXECUTE FUNCTION public.trg_after_insert_pago_bancario();
