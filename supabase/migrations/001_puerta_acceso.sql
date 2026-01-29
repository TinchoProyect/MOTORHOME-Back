-- Misión: Instalación del Mecanismo (Puerta de Acceso)

-- 1. Crear Tabla de Perfiles de Acceso (Invitados Permitidos)
CREATE TABLE IF NOT EXISTS public.perfiles_acceso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS (Row Level Security) - El cerrojo de seguridad
ALTER TABLE public.perfiles_acceso ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Seguridad
-- Política: Solo lectura para el usuario autenticado si su email coincide (o lógica de servicio)
-- Por ahora, permitimos lectura pública para validar el email en el login, 
-- o mejor: restringimos a Service Role (Backend) para consultar si existe.

-- Política "Backend Service Role": Acceso total (implícito en Supabase, no requiere SQL policy explícita si se usa service_role key).

-- Política "Lectura Pública Restringida": ¿Queremos que cualquiera consulte si un email existe? 
-- No. Solo el Backend debe verificar esto.
-- Por lo tanto, NO agrego Policies "FOR SELECT TO anon". 
-- El acceso será exclusivo via Backend (Service Role).

-- 4. Seed Data (Tu email de "Dueño del Country")
-- Reemplaza con tu email real si es necesario, o usa el Dashboard.
INSERT INTO public.perfiles_acceso (email) 
VALUES ('tu_email_admin@ejemplo.com')
ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE public.perfiles_acceso IS 'Tabla de Allowlist para controlar acceso al Country.';
