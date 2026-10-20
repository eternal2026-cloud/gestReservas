-- =====================================================
-- Salas ADR · Empresa única (sin sedes ni torres)
-- =====================================================
-- Ejecutar UNA vez en Supabase → SQL Editor (después de supabase_schema.sql).
-- Es idempotente: puedes volver a correrlo sin romper nada.
--   • Todo colaborador queda dentro de ADR automáticamente (sin solicitudes).
--   • Solo ADMIN / SUPER_ADMIN crean, editan o desactivan salas.
--   • Puede haber varios administradores.
--   • Todos ven la ocupación de las salas (quién reservó y a qué hora).
--   • Las salas tienen ubicación y equipamiento.
-- =====================================================

-- 0) Debe existir la empresa ADR (se crea si la tabla está vacía)
INSERT INTO communities (name, community_type, admin_email)
SELECT 'Agrícola Don Ricardo', 'OFICINA', 'admin@adr.pe'
WHERE NOT EXISTS (SELECT 1 FROM communities);

-- 1) Empresa única: todo usuario queda dentro de ADR
CREATE OR REPLACE FUNCTION public.adr_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM communities ORDER BY created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.users_set_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.community_id IS NULL THEN
    NEW.community_id := adr_company_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_set_company ON users;
CREATE TRIGGER users_set_company BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION users_set_company();

UPDATE users SET community_id = adr_company_id() WHERE community_id IS NULL;

-- 2) Pueden existir varios administradores
DROP INDEX IF EXISTS users_one_admin_per_community;

-- 3) El super admin también administra salas
CREATE OR REPLACE FUNCTION public.is_admin_of(target_community uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role IN ('ADMIN','SUPER_ADMIN')
      AND status = 'ACTIVO'
      AND community_id = target_community
  );
$$;

-- 4) Nadie crea "sedes" desde la app (solo super admin, por si acaso)
DROP POLICY IF EXISTS communities_insert ON communities;
CREATE POLICY communities_insert ON communities FOR INSERT
  WITH CHECK (is_super_admin());

-- 5) Todos los colaboradores ven la ocupación de las salas
DROP POLICY IF EXISTS reservations_select_members ON reservations;
CREATE POLICY reservations_select_members ON reservations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM amenities a
    WHERE a.id = reservations.amenity_id AND is_member_of(a.community_id)
  ));

-- 6) Ubicación y equipamiento de cada sala
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS equipment TEXT[] DEFAULT '{}';
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 7) Permisos de las funciones nuevas
REVOKE EXECUTE ON FUNCTION public.adr_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adr_company_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.users_set_company() FROM PUBLIC, anon, authenticated;

-- =====================================================
-- 8) Tu cuenta como Super Admin (cambia el correo si hace falta)
-- =====================================================
UPDATE users SET role = 'SUPER_ADMIN', status = 'ACTIVO'
WHERE email = 'lopezhayaronald@gmail.com';
