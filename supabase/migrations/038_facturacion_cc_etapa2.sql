-- Etapa 2: Módulo de Facturación y Cuenta Corriente
-- Tabla para almacenar la cabecera e importes extraídos de los comprobantes fiscales.
-- Aislado de proveedor_listas_raw.

CREATE TABLE IF NOT EXISTS facturas_raw (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    archivo_id TEXT NOT NULL,
    archivo_nombre TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE, REVISADO_HITL, PROCESADO, RECHAZADO
    
    -- Metadata fiscal (Cabecera)
    cuit_emisor TEXT,
    punto_venta INTEGER,
    numero_comprobante INTEGER,
    tipo_comprobante TEXT,
    fecha_emision DATE,
    fecha_vto_cae DATE,
    cae TEXT,
    
    -- Totales (Monetarios)
    importe_neto_gravado NUMERIC(15,2),
    importe_iva_21 NUMERIC(15,2),
    importe_iva_105 NUMERIC(15,2),
    importe_iva_27 NUMERIC(15,2),
    percepciones_iibb NUMERIC(15,2),
    percepciones_iva NUMERIC(15,2),
    conceptos_no_gravados NUMERIC(15,2),
    importe_total NUMERIC(15,2),
    
    -- Trazabilidad
    datos_extraidos JSONB, -- Backup del JSON devuelto por Gemini
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_facturas_raw_proveedor ON facturas_raw(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_raw_status ON facturas_raw(status);
