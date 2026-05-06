-- Migration: 045_bancos_hitl.sql
-- Description: Creación de tablas para la Mesa HITL de Ingesta Bancaria (Bandeja, Staging, Memoria)

-- 1. Tabla de Archivos Procesados (Para estado visual en la bandeja de Drive)
CREATE TABLE IF NOT EXISTS public.bancos_archivos_raw (
    archivo_id TEXT PRIMARY KEY,
    nombre_archivo TEXT,
    fecha_ingesta TIMESTAMPTZ DEFAULT now(),
    estado_global VARCHAR(20) DEFAULT 'PROCESADO'
);

-- Habilitar RLS (Permisivo para desarrollo)
ALTER TABLE public.bancos_archivos_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso público a bancos_archivos_raw" 
ON public.bancos_archivos_raw FOR ALL USING (true) WITH CHECK (true);

-- 2. Modificación de la Tabla de Ingesta Bancaria Raw (Bodega de Tránsito)
-- Hacemos que el proveedor_id pueda ser NULO (para los huérfanos)
ALTER TABLE public.pagos_bancarios_raw ALTER COLUMN proveedor_id DROP NOT NULL;

-- Agregamos la columna estado para el flujo HITL
ALTER TABLE public.pagos_bancarios_raw ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'PENDIENTE';
ALTER TABLE public.pagos_bancarios_raw ADD COLUMN IF NOT EXISTS cuit_detectado VARCHAR(20);

-- 3. Tabla de Memoria de Mapeo (Diccionario CBU/Alias -> Proveedor)
CREATE TABLE IF NOT EXISTS public.bancos_memoria_mapeo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patron_busqueda TEXT NOT NULL UNIQUE, -- Ej: Alias o CBU extraído
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.bancos_memoria_mapeo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso público a bancos_memoria_mapeo" 
ON public.bancos_memoria_mapeo FOR ALL USING (true) WITH CHECK (true);


-- 4. Actualización del Trigger de Asiento en Cuenta Corriente
-- En la Etapa 4 previa, el trigger reaccionaba a AFTER INSERT.
-- Ahora, como insertaremos en estado PENDIENTE, solo debe asentar deuda cuando pase a VINCULADO o si entra como AUTO_VINCULADO.

DROP TRIGGER IF EXISTS trg_pago_bancario_to_cc ON public.pagos_bancarios_raw;

CREATE OR REPLACE FUNCTION public.trg_after_pago_bancario_hitl()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Caso 1: Insert y ya viene AUTO_VINCULADO
    IF TG_OP = 'INSERT' AND (NEW.estado = 'VINCULADO' OR NEW.estado = 'AUTO_VINCULADO') THEN
        INSERT INTO public.cuenta_corriente_proveedores (
            proveedor_id, fecha_movimiento, tipo_movimiento, monto_credito, monto_debito, referencia_pago_id, observaciones
        ) VALUES (
            NEW.proveedor_id, NEW.fecha_pago::timestamptz, 'PAGO', 0.00, NEW.monto_pago, NEW.hash_id,
            'Ingesta Automática Bancaria. Ref: ' || COALESCE(NEW.descripcion_original, 'S/D')
        );
    
    -- Caso 2: Update manual de PENDIENTE a VINCULADO
    ELSIF TG_OP = 'UPDATE' AND (OLD.estado = 'PENDIENTE' OR OLD.estado = 'IGNORADO') AND (NEW.estado = 'VINCULADO' OR NEW.estado = 'AUTO_VINCULADO') THEN
        -- Evitar duplicados si ya existía por algún error (poco probable pero seguro)
        IF NOT EXISTS (SELECT 1 FROM public.cuenta_corriente_proveedores WHERE referencia_pago_id = NEW.hash_id) THEN
            INSERT INTO public.cuenta_corriente_proveedores (
                proveedor_id, fecha_movimiento, tipo_movimiento, monto_credito, monto_debito, referencia_pago_id, observaciones
            ) VALUES (
                NEW.proveedor_id, NEW.fecha_pago::timestamptz, 'PAGO', 0.00, NEW.monto_pago, NEW.hash_id,
                'Conciliación HITL Bancaria. Ref: ' || COALESCE(NEW.descripcion_original, 'S/D')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Vincular Trigger para INSERT y UPDATE
CREATE TRIGGER trg_pago_bancario_to_cc
AFTER INSERT OR UPDATE ON public.pagos_bancarios_raw
FOR EACH ROW
EXECUTE FUNCTION public.trg_after_pago_bancario_hitl();
