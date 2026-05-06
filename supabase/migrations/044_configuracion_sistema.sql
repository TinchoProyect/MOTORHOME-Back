-- 044_configuracion_sistema.sql
-- Creación de la tabla de Parámetros Globales (Key/Value)

CREATE TABLE IF NOT EXISTS configuracion_sistema (
    llave VARCHAR(255) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Opcional, en este punto el acceso es admin)
ALTER TABLE configuracion_sistema ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Public access para simplificar, en un entorno real sería autenticado)
CREATE POLICY "Permitir acceso público de lectura a configuración" 
ON configuracion_sistema FOR SELECT USING (true);

CREATE POLICY "Permitir acceso público de modificación a configuración" 
ON configuracion_sistema FOR ALL USING (true) WITH CHECK (true);

-- Insertar llave base
INSERT INTO configuracion_sistema (llave, valor, descripcion) 
VALUES ('drive_folder_bancos_id', '', 'ID de la carpeta unificada en Google Drive para la Ingesta Bancaria.')
ON CONFLICT (llave) DO NOTHING;
