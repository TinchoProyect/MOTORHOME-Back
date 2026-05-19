-- [NUEVO MÓDULO] 4. Gestión de Cheques
CREATE TABLE IF NOT EXISTS public.cheques_cartera (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_id VARCHAR UNIQUE NOT NULL, -- Clave de idempotencia
    numero_cheque VARCHAR,
    clausula VARCHAR,
    recibido_de VARCHAR,
    fecha_pago DATE,
    fecha_emision DATE,
    importe NUMERIC(15,2),
    estado_bancario VARCHAR,
    banco_emisor VARCHAR,
    id_cheque_bancario VARCHAR,
    cmc7 VARCHAR,
    motivo_descripcion TEXT,
    librador_razon_social VARCHAR,
    librador_cuit VARCHAR,
    beneficiario_actual_razon_social VARCHAR,
    beneficiario_actual_cuit VARCHAR,
    cant_endosos INT DEFAULT 0,
    cant_cesiones INT DEFAULT 0,
    cant_avales INT DEFAULT 0,
    historial_endosos JSONB DEFAULT '[]'::jsonb,
    historial_cesiones JSONB DEFAULT '[]'::jsonb,
    historial_avales JSONB DEFAULT '[]'::jsonb,
    estado_interno VARCHAR DEFAULT 'EN_CARTERA', -- EN_CARTERA, ENDOSADO, ACREDITADO, DEVUELTO
    proveedor_endosado_id UUID,
    fecha_endoso TIMESTAMP WITH TIME ZONE,
    fecha_deposito TIMESTAMP WITH TIME ZONE,
    fecha_vencimiento_calculada DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger / Index options
CREATE INDEX IF NOT EXISTS idx_cheques_hash ON public.cheques_cartera(hash_id);
CREATE INDEX IF NOT EXISTS idx_cheques_estado ON public.cheques_cartera(estado_interno);

