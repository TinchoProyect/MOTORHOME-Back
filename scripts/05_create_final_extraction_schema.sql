-- =============================================================================
-- SCRIPT: 05_create_final_extraction_schema.sql
-- DESCRIPCION: Infraestructura de Datos para el Sistema de Extracción Inteligente (Fase 6)
-- FECHA: 30 Enero 2026
-- =============================================================================

-- 1. TABLA: proveedor_formatos_guia ("Memoria Operativa")
-- Almacena la inteligencia aprendida de cómo leer los archivos de cada proveedor.
CREATE TABLE IF NOT EXISTS proveedor_formatos_guia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    
    -- Metadatos de Gestión
    nombre_formato VARCHAR(100) NOT NULL, -- Ej: "Lista Excel Standard 2025"
    estado VARCHAR(20) DEFAULT 'PENDIENTE_VALIDACION', -- 'ACTIVA', 'OBSOLETA', 'PENDIENTE_VALIDACION'
    
    -- [RESILIENCIA] Huella Digital Flexible
    -- Contiene el hash de los encabezados y reglas de tolerancia para identificar el archivo.
    fingerprint JSONB NOT NULL, 
    /* Estructura esperada:
       {
         "header_hash": "md5_string...", 
         "file_extension": "xlsx", 
         "required_keywords": ["CODIGO", "PRECIO"],
         "tolerance_mode": "loose"
       }
    */

    -- [TRAZABILIDAD] Fuente de Verdad
    archivo_origen_id TEXT, -- ID de Google Drive del archivo con el que se entrenó esta regla.

    -- [INSTRUCCIONES] Reglas de Mapeo
    reglas_mapeo JSONB NOT NULL,
    /* Estructura esperada:
       {
         "data_start_row": 5,
         "columns": { "sku": "A", "descripcion": "B", "precio": "F" },
         "ignored_columns": ["C", "D"]
       }
    */
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_formatos_proveedor ON proveedor_formatos_guia(proveedor_id);
CREATE INDEX idx_formatos_fingerprint ON proveedor_formatos_guia USING gin (fingerprint);


-- 2. TABLA: proveedor_listas_raw ("Evento de Carga")
-- Registra cada archivo procesado, su estado y qué memoria se utilizó.
CREATE TABLE IF NOT EXISTS proveedor_listas_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    
    -- Vínculo con la Memoria (NULL si fue Modo Arqueólogo puro sin guardar)
    formato_guia_id UUID REFERENCES proveedor_formatos_guia(id),
    
    -- Datos del Archivo
    archivo_id TEXT NOT NULL, -- ID de Google Drive
    nombre_archivo TEXT NOT NULL,
    link_drive TEXT, -- WebViewLink
    
    -- Auditoría del Proceso
    modo_procesamiento VARCHAR(20), -- 'DISCOVERY' (IA pura) vs 'MAPPED' (Template)
    status_global VARCHAR(30) DEFAULT 'ANALYZING', -- 'ANALYZING', 'READY_TO_REVIEW', 'CONFIRMED', 'ERROR_ILEGIBLE'
    
    -- Metadatos Globales Extraídos
    fecha_vigencia DATE DEFAULT CURRENT_DATE,
    moneda_detectada VARCHAR(3) DEFAULT 'ARS',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listas_raw_proveedor ON proveedor_listas_raw(proveedor_id);


-- 3. TABLA: proveedor_items_extraidos ("Detalle Granular")
-- Contiene las filas extraídas, normalizadas y auditadas.
CREATE TABLE IF NOT EXISTS proveedor_items_extraidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lista_raw_id UUID NOT NULL REFERENCES proveedor_listas_raw(id) ON DELETE CASCADE,
    
    -- Datos Normalizados (Lo que el sistema "entendió")
    sku_detectado VARCHAR(100),
    descripcion_detectada TEXT,
    precio_detectado NUMERIC(12,2),
    unidad_medida_detectada VARCHAR(50),
    
    -- [TRAZABILIDAD ABSOLUTA] La fuente original
    raw_data JSONB NOT NULL, -- La fila cruda completa { "A": "...", "B": "..." }
    
    -- [INCERTIDUMBRE] Semáforo de Confianza
    nivel_confianza VARCHAR(20) DEFAULT 'UNKNOWN', -- 'CONFIRMED', 'AMBIGUOUS', 'UNKNOWN'
    
    -- Auditoría de Inteligencia
    identificacion_ia JSONB, 
    /* Estructura esperada:
       {
         "confidence_score": 0.85,
         "flags": ["POSSIBLE_CURRENCY_MISMATCH", "MISSING_SKU"],
         "reasoning": "Se eligió col F por tener símbolo $"
       }
    */
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_lista_raw ON proveedor_items_extraidos(lista_raw_id);
CREATE INDEX idx_items_confianza ON proveedor_items_extraidos(nivel_confianza);
