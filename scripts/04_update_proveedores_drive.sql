-- Script: 04_update_proveedores_drive.sql
-- Objetivo: Añadir vinculación con Google Drive y estado de actividad
-- Fecha: 29_ENE_2026

-- 1. Añadir columna para ID de carpeta de Drive
ALTER TABLE proveedores 
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

-- 2. Añadir columna activo (soft delete / estado)
ALTER TABLE proveedores 
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

-- 3. Comentario explicativo
COMMENT ON COLUMN proveedores.drive_folder_id IS 'ID de la carpeta en Google Drive asociada a este proveedor';
COMMENT ON COLUMN proveedores.activo IS 'Indica si el proveedor está operativo en el sistema';

-- 4. Actualizar políticas RLS (opcional, por si acaso se requiere lógica específica)
-- Por ahora la política pública existente cubre el acceso, pero aseguramos que el update permita estos campos.
