-- ============================================================
-- MIGRACIÓN: nombres de semana editables desde el portafolio
-- Copia y pega TODO este archivo en: Supabase → SQL Editor → New query → Run
-- (Es un paso adicional a los que ya corriste antes)
-- ============================================================

create table if not exists week_titles (
  unit_id int not null,
  week_id int not null,
  title text,
  subtitle text,
  updated_at timestamptz default now(),
  primary key (unit_id, week_id)
);

alter table week_titles enable row level security;

create policy "week_titles: acceso público" on week_titles
  for all using (true) with check (true);
