-- ETL Mapping Engine V4
-- Dependencias: proveedor_formatos_guia, diccionario_campos_maestros

-- 1. PUENTE UNO-A-MUCHOS: Mapeo de Columnas
CREATE TABLE IF NOT EXISTS public.mapeo_columnas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    formato_id UUID NOT NULL REFERENCES public.proveedor_formatos_guia(id) ON DELETE CASCADE,
    campo_maestro_id UUID NOT NULL REFERENCES public.diccionario_campos_maestros(id) ON DELETE CASCADE,
    columna_origen_index INTEGER NOT NULL,
    columna_origen_nombre TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    actualizado_en TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    
    -- Una columna específica de un formato solo puede mapearse UNA VEZ al MISMO campo maestro.
    CONSTRAINT unique_formato_maestro_columna UNIQUE (formato_id, campo_maestro_id, columna_origen_index)
);

-- 2. CATÁLOGO DE REGLAS DE LIMPIEZA
CREATE TABLE IF NOT EXISTS public.reglas_limpieza (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_regla TEXT NOT NULL,
    tipo_regex TEXT NOT NULL, -- Ej: 'SANITIZER_NUMERIC' o regex puro '/[0-9]/g'
    descripcion TEXT,
    es_global BOOLEAN DEFAULT false,
    formato_id UUID REFERENCES public.proveedor_formatos_guia(id) ON DELETE CASCADE, -- Nullable si es global
    creado_en TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- REGLAS GLOBALES POR DEFECTO
INSERT INTO public.reglas_limpieza (nombre_regla, tipo_regex, descripcion, es_global)
VALUES 
    ('Extraer Solo Números', 'SANITIZER_NUMERIC', 'Elimina cualquier carácter que no sea un dígito, punto o coma.', true),
    ('Eliminar Celdas Vacías', 'FILTER_EMPTY', 'Descarta la fila si el valor de esta celda está vacío.', true),
    ('Normalizar Texto (Mayúsculas)', 'TRANSFORM_UPPERCASE', 'Convierte todo el texto a MAYÚSCULAS.', true)
ON CONFLICT DO NOTHING; -- Asumiendo que pudiese haber conflicto manual

-- 3. TUBERÍA DE EJECUCIÓN (PIPELINE)
CREATE TABLE IF NOT EXISTS public.mapeo_reglas_aplicadas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mapeo_id UUID NOT NULL REFERENCES public.mapeo_columnas(id) ON DELETE CASCADE,
    regla_id UUID NOT NULL REFERENCES public.reglas_limpieza(id) ON DELETE CASCADE,
    orden_ejecucion INTEGER NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    
    -- El orden debe ser único por mapeo
    CONSTRAINT unique_mapeo_orden UNIQUE (mapeo_id, orden_ejecucion)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mapeo_columnas_updated_at ON public.mapeo_columnas;
CREATE TRIGGER trg_mapeo_columnas_updated_at
BEFORE UPDATE ON public.mapeo_columnas
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();
