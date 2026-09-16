-- ============================================================
-- PORTAFOLIO BASE DE DATOS II — configuración inicial de Supabase
-- Copia y pega TODO este archivo en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Tabla de perfil (una sola fila con id = 1)
create table if not exists profile (
  id int primary key default 1,
  name text,
  photo_path text,
  updated_at timestamptz default now(),
  constraint profile_single_row check (id = 1)
);

insert into profile (id, name)
values (1, 'Jose Daniel Perez Villalva')
on conflict (id) do nothing;

-- Tabla de elementos subidos en cada actividad
create table if not exists portfolio_items (
  id uuid primary key default gen_random_uuid(),
  unit_id int not null,
  week_id int not null,
  activity_id int not null,
  item_order int not null default 1,
  title text not null,
  description text,
  link text,
  file_path text,
  file_name text,
  file_type text,
  created_at timestamptz default now()
);

-- Seguridad a nivel de fila (RLS)
-- NOTA: se deja lectura y escritura públicas porque este portafolio
-- no tiene un sistema de autenticación real (el login actual es solo
-- una pantalla decorativa). Cualquiera con el link puede ver el
-- contenido, y técnicamente también podría modificarlo si conociera
-- bien la consola del navegador. Para un portafolio de clase es un
-- riesgo aceptable; si más adelante quieres cerrarlo del todo,
-- se puede añadir Supabase Auth y restringir estas políticas.
alter table profile enable row level security;
alter table portfolio_items enable row level security;

create policy "profile: acceso público" on profile
  for all using (true) with check (true);

create policy "portfolio_items: acceso público" on portfolio_items
  for all using (true) with check (true);

-- Bucket de almacenamiento para los archivos subidos
insert into storage.buckets (id, name, public)
values ('portfolio-files', 'portfolio-files', true)
on conflict (id) do nothing;

create policy "portfolio-files: lectura pública"
  on storage.objects for select
  using (bucket_id = 'portfolio-files');

create policy "portfolio-files: escritura pública"
  on storage.objects for insert
  with check (bucket_id = 'portfolio-files');

create policy "portfolio-files: borrado público"
  on storage.objects for delete
  using (bucket_id = 'portfolio-files');
