-- Etapa 1: Módulo de Facturación y Cuenta Corriente
-- Se añade la columna para almacenar el ID de la carpeta de Drive de las facturas del proveedor.

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS drive_folder_facturas_id text;
