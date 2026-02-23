-- ==========================================
-- SCRIPT DE MIGRACIÓN: DESHABILITAR RLS
-- Objetivo: Permitir Inserciones V4 (Pipeline ETL)
-- ==========================================

-- 1. Deshabilitar RLS explícitamente en las tablas de mapeo V4
ALTER TABLE public.mapeo_columnas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapeo_reglas_aplicadas DISABLE ROW LEVEL SECURITY;

-- 2. (Opcional) Si decides mantener RLS activado pero permitir el acceso a nivel de aplicación interna, 
-- puedes crear políticas "allow all" (solo descomentar si necesitas RLS = true y políticas libres).
/*
ALTER TABLE public.mapeo_columnas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir Todo en Mapeo Columnas" ON public.mapeo_columnas FOR ALL USING (true);

ALTER TABLE public.mapeo_reglas_aplicadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir Todo en Reglas Aplicadas" ON public.mapeo_reglas_aplicadas FOR ALL USING (true);
*/

-- Mensaje de validación
DO $$ 
BEGIN 
  RAISE NOTICE 'RLS deshabilitado para mapeo_columnas y mapeo_reglas_aplicadas.'; 
END $$;
