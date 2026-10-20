-- Aplicada en salas-adr el 2026-10-20: se quitan los bloques 07:00-08:00 y 18:00-19:00.
-- La lista de horarios debe coincidir con TIME_SLOTS en services/structure.ts.
create or replace function public.reservations_check_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/Lima')::date;
  limite date := date_trunc('week', (now() at time zone 'America/Lima'))::date + 13;
  rol text;
  usados int;
begin
  if new.status <> 'ACTIVA' then return new; end if;
  -- Misma lista que TIME_SLOTS en services/structure.ts
  if new.time_slot not in ('08:00-09:00','09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00',
                           '14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00','19:00-20:00') then
    raise exception 'HORARIO_NO_DISPONIBLE: ese horario no está habilitado para reservas';
  end if;
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
