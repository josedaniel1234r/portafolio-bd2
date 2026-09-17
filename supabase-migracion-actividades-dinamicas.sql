-- ============================================================
-- MIGRACIÓN: actividades dinámicas por semana
-- Copia y pega TODO este archivo en: Supabase → SQL Editor → New query → Run
-- (Este es un paso adicional al supabase-setup.sql que ya corriste antes)
--
-- NOTA: esto reinicia la tabla portfolio_items (borra lo que hayas
-- subido de prueba, como el elemento "asd") porque cambia cómo se
-- relaciona cada elemento con su actividad. Tus archivos de prueba
-- en Storage puedes borrarlos luego a mano si quieres, no afecta nada
-- dejarlos ahí.
-- ============================================================

-- Tabla de "apartados" de actividad (Actividad 1, Actividad 2, Actividad 3...)
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  unit_id int not null,
  week_id int not null,
  name text not null,
  slot_order int not null default 1,
  created_at timestamptz default now()
);

alter table activities enable row level security;
create policy "activities: acceso público" on activities
  for all using (true) with check (true);

-- Siembra las 2 actividades por defecto (Actividad 1 y 2) en cada
-- semana (0-3) de cada unidad (0-3), para no partir de cero.
insert into activities (unit_id, week_id, name, slot_order)
select u.unit_id, w.week_id, a.name, a.slot_order
from generate_series(0, 3) as u(unit_id)
cross join generate_series(0, 3) as w(week_id)
cross join (values ('Actividad 1', 1), ('Actividad 2', 2)) as a(name, slot_order);

-- Vacía portfolio_items (los datos de prueba quedan obsoletos con el
-- nuevo tipo de columna) y cambia activity_id de número a uuid,
-- enlazado a la nueva tabla activities. Si se borra una actividad,
-- sus elementos se borran solos (on delete cascade).
truncate table portfolio_items;
alter table portfolio_items drop column activity_id;
alter table portfolio_items add column activity_id uuid references activities(id) on delete cascade;
