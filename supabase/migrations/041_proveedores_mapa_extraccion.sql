-- Migration: 041_proveedores_mapa_extraccion.sql
-- Description: Añade la columna mapa_extraccion_ia a la tabla de proveedores para inyectar directivas específicas en el LLM.

ALTER TABLE proveedores
ADD COLUMN mapa_extraccion_ia TEXT DEFAULT NULL;
