-- Migration: 047_proveedores_mapa_ocr_listas
-- Description: Agrega la columna mapa_ocr_listas para permitir directivas IA per-proveedor en las listas de precios.

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS mapa_ocr_listas TEXT;
