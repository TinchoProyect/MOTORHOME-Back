-- 1. Crear Tabla de Proveedores
create table if not exists public.proveedores (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  cuit text,
  categoria text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  direccion text,
  fecha_creacion timestamptz default now()
);

-- 2. Habilitar Seguridad a Nivel de Fila (RLS)
alter table public.proveedores enable row level security;

-- 3. Política de Seguridad: Acceso Total para Usuarios Autenticados
-- Esto permite que cualquier usuario logueado (rol 'authenticated') pueda:
-- SELECT (Ver), INSERT (Crear), UPDATE (Editar), DELETE (Borrar)
create policy "Usuarios autenticados pueden gestionar proveedores"
on public.proveedores
for all
to authenticated
using (true)
with check (true);

-- Comentario de confirmación
comment on table public.proveedores is 'Registro maestro de proveedores de la distribuidora';
