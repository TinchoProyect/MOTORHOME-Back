-- Migration: 049_rediseño_ingesta_bancaria.sql
-- Description: Rediseño estructural de Ingesta Bancaria para asegurar idempotencia matemática.

-- 1. Agregamos las columnas faltantes (Saldo Resultante y Referencia) para lograr el tracking real
ALTER TABLE public.pagos_bancarios_raw ADD COLUMN IF NOT EXISTS saldo_resultante NUMERIC(15,2);
ALTER TABLE public.pagos_bancarios_raw ADD COLUMN IF NOT EXISTS referencia TEXT;

-- 2. Limpieza de Duplicados Existentes (Falla de Idempotencia Previa)
-- Eliminamos primero los impactos en la cuenta corriente (si existen) de los registros duplicados
DELETE FROM public.cuenta_corriente_proveedores
WHERE referencia_pago_id IN (
    SELECT hash_id
    FROM (
        SELECT hash_id,
               ROW_NUMBER() OVER (
                   PARTITION BY fecha_pago, monto_pago, COALESCE(saldo_resultante, 0.00), COALESCE(referencia, '')
                   ORDER BY created_at ASC
               ) as row_num
        FROM public.pagos_bancarios_raw
    ) t
    WHERE t.row_num > 1
);

-- Eliminamos los registros duplicados en la tabla cruda dejando solo el original más antiguo
DELETE FROM public.pagos_bancarios_raw
WHERE hash_id IN (
    SELECT hash_id
    FROM (
        SELECT hash_id,
               ROW_NUMBER() OVER (
                   PARTITION BY fecha_pago, monto_pago, COALESCE(saldo_resultante, 0.00), COALESCE(referencia, '')
                   ORDER BY created_at ASC
               ) as row_num
        FROM public.pagos_bancarios_raw
    ) t
    WHERE t.row_num > 1
);

-- 3. Restricción Granítica en Base de Datos (Unique Constraint)
-- Creamos un índice único compuesto que asegura nativamente que la combinación 
-- de Fecha, Monto, Saldo y Referencia sea irrepetible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_bancarios_unique_txn 
ON public.pagos_bancarios_raw (
    fecha_pago, 
    monto_pago, 
    COALESCE(saldo_resultante, 0.00), 
    COALESCE(referencia, '')
);

-- Si hubiese duplicados en la DB actualmente con este criterio, el index fallará en la creación, 
-- pero garantizamos que a futuro el motor (ON CONFLICT) rechace los dobles pagos.
