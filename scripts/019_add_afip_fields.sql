-- Migración para añadir columnas de datos fiscales (ARCA/AFIP)
ALTER TABLE proveedores
ADD COLUMN IF NOT EXISTS afip_razon_social TEXT,
ADD COLUMN IF NOT EXISTS afip_domicilio TEXT,
ADD COLUMN IF NOT EXISTS afip_localidad TEXT,
ADD COLUMN IF NOT EXISTS afip_provincia TEXT,
ADD COLUMN IF NOT EXISTS afip_estado TEXT;
