-- Refinamiento Etapa 2: Módulo de Facturación y Cuenta Corriente
-- Añadir matriz de artículos extraídos a las facturas

ALTER TABLE facturas_raw ADD COLUMN IF NOT EXISTS articulos JSONB DEFAULT '[]'::jsonb;
