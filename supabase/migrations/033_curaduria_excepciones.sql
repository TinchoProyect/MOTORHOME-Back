-- Migración 033: Arquitectura Relacional Anti-Update para Curaduría Manual
-- Resolviendo la inmutabilidad de UI ante Rollbacks y Cargas Cíclicas

CREATE TABLE IF NOT EXISTS curaduria_excepciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    producto_codigo TEXT NOT NULL,
    unidad_fijada TEXT,
    rubro_fijado UUID REFERENCES maestro_rubros(id) ON DELETE SET NULL,
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (proveedor_id, producto_codigo)
);

-- Indices de Performance para el Memory Map Factor O(n)
CREATE INDEX IF NOT EXISTS idx_curaduria_excepciones_prov_cod ON curaduria_excepciones (proveedor_id, producto_codigo);

-- Trigger de auto update (Standard LAMDA Timekeeping)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_el = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_curaduria_excepciones
BEFORE UPDATE ON curaduria_excepciones
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();
