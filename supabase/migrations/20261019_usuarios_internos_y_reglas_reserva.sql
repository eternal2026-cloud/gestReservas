-- Aplicada en el proyecto salas-adr (gqyoprbczxzjtaxatkqk) el 2026-10-19.

-- 1) Usuarios estilo Integra: usuario + contraseña, sin correos
alter table public.users add column if not exists username text;
alter table public.users add column if not exists must_change_password boolean not null default false;
create unique index if not exists users_username_key on public.users (username) where username is not null;

-- 2) Galería de fotos por sala (la portada sigue en image_url)
alter table public.amenities add column if not exists gallery text[] not null default '{}';

-- 3) Nombre de la sede
update public.communities set name = 'Oficina Planta Don Carlos' where name = 'Oficina Central ADR';

-- 4) Un colaborador no puede cambiarse rol, estado, usuario, puntos ni sede.
--    Las funciones SECURITY DEFINER (award_points_to_user) y la Edge Function
--    (service_role) no corren como 'authenticated', así que pasan.
create or replace function public.users_protect_columns()
returns trigger language plpgsql set search_path = public as $$
declare r text;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  r := public.my_role();
  if r in ('ADMIN', 'SUPER_ADMIN') then
    if r <> 'SUPER_ADMIN' and (old.role = 'SUPER_ADMIN' or new.role = 'SUPER_ADMIN')
       and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'Solo un Super Admin puede modificar a otro Super Admin';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status
     or new.username is distinct from old.username or new.email is distinct from old.email
     or new.points is distinct from old.points or new.community_id is distinct from old.community_id
     or new.auth_id is distinct from old.auth_id
     or (new.must_change_password and not old.must_change_password) then
    raise exception 'No tienes permiso para cambiar estos datos';
  end if;
  return new;
end $$;
drop trigger if exists users_protect_columns on public.users;
create trigger users_protect_columns before update on public.users
  for each row execute function public.users_protect_columns();

-- Las cuentas las crea el admin (Edge Function admin-usuarios); nadie se auto-registra.
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert with check (public.is_super_admin());

-- 5) Reglas de reserva (también se validan en la app):
--    • Ventana: desde hoy hasta el domingo de la semana siguiente (hora Perú).
--    • Máximo 3 bloques (3 h) por colaborador por día, sumando todas las salas.
--    Los administradores quedan exentos (capacitaciones, eventos).
create or replace function public.reservations_check_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/Lima')::date;
  limite date := date_trunc('week', (now() at time zone 'America/Lima'))::date + 13;
  rol text;
  usados int;
begin
  if new.status <> 'ACTIVA' then return new; end if;
  select role into rol from users where id = new.user_id;
  if rol in ('ADMIN', 'SUPER_ADMIN') then return new; end if;
  if new.date < hoy or new.date > limite then
    raise exception 'FUERA_DE_VENTANA: solo puedes reservar desde hoy hasta el domingo %', to_char(limite, 'DD/MM');
  end if;
  select count(*) into usados from reservations
   where user_id = new.user_id and date = new.date and status = 'ACTIVA'
     and id is distinct from new.id;
  if usados >= 3 then
    raise exception 'LIMITE_DIARIO: máximo 3 horas de reserva por día por colaborador';
  end if;
  return new;
end $$;
drop trigger if exists reservations_check_rules on public.reservations;
create trigger reservations_check_rules before insert or update of date, time_slot, status on public.reservations
  for each row execute function public.reservations_check_rules();

-- 6) Los pases QR de invitado ya no se usan
do $$ declare f record; begin
  for f in select oid::regprocedure as sig from pg_proc where proname = 'validate_guest_pass' and pronamespace = 'public'::regnamespace loop
    execute 'drop function ' || f.sig;
  end loop;
end $$;
