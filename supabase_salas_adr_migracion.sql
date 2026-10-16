-- =====================================================
-- Salas ADR · Migración sobre una BD que ya tiene el esquema de Roomly
-- =====================================================
-- Úsalo SOLO si reutilizas un proyecto Supabase creado con el
-- supabase_schema.sql original de Roomly. En un proyecto nuevo basta con
-- ejecutar supabase_schema.sql (ya incluye estos cambios). Es idempotente.
-- =====================================================

-- 1) Cargo del colaborador (perfil y solicitud de afiliación)
ALTER TABLE users          ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE join_requests  ADD COLUMN IF NOT EXISTS cargo TEXT;

-- 2) Motivo de la reunión y número de asistentes
ALTER TABLE reservations   ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE reservations   ADD COLUMN IF NOT EXISTS attendees INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_cargo_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_cargo_len CHECK (char_length(cargo) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'join_requests_cargo_len') THEN
    ALTER TABLE join_requests ADD CONSTRAINT join_requests_cargo_len CHECK (char_length(cargo) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_motivo_len') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_motivo_len CHECK (char_length(motivo) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_attendees_pos') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_attendees_pos CHECK (attendees IS NULL OR attendees > 0);
  END IF;
END $$;

-- 3) Varios colaboradores comparten un área (antes: un vecino por depto)
DROP INDEX IF EXISTS users_one_per_apartment;

-- 4) Tipos de sede ADR en lugar de edificio/condominio/multifamiliar
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_community_type_check;
UPDATE communities SET community_type = 'OFICINA'
  WHERE community_type IS NULL OR community_type NOT IN ('OFICINA','PLANTA','FUNDO');
ALTER TABLE communities ALTER COLUMN community_type SET DEFAULT 'OFICINA';
ALTER TABLE communities ADD CONSTRAINT communities_community_type_check
  CHECK (community_type IN ('OFICINA','PLANTA','FUNDO'));
