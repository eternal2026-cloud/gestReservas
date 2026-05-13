-- =====================================================
-- Roomly v2 — Supabase Schema (Hardened)
-- Run this in the SQL Editor of su Supabase Dashboard
-- =====================================================
-- Cambios vs versión previa:
--   • Roles: USER / ADMIN / SUPER_ADMIN
--   • Políticas RLS basadas en auth.uid() (no USING(true))
--   • Helpers SQL: is_super_admin(), is_admin_of(community_id), my_user_id()
--   • Tablas nuevas: sanctions, restrictions, audit_logs, rejection_messages
--   • Correlativos C1-Sxxxx / C1-Rxxxx para solicitudes y reservas
--   • UNIQUE(amenity_id, date, time_slot) para evitar reservas duplicadas
--   • UNIQUE(community_id, role='ADMIN') vía índice parcial (un admin por torre)
-- =====================================================

-- ─── Torres / Comunidades ───
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  district TEXT,
  province TEXT,
  community_type TEXT DEFAULT 'EDIFICIO' CHECK (community_type IN ('EDIFICIO','CONDOMINIO','MULTIFAMILIAR')),
  map_lat NUMERIC,
  map_lng NUMERIC,
  admin_email TEXT NOT NULL,
  total_floors INT DEFAULT 10,
  units_per_floor INT DEFAULT 4,
  num_buildings INT DEFAULT 1,
  rooms_per_floor INT DEFAULT 4,
  total_points INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Usuarios ───
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dni TEXT,
  phone TEXT,
  dni_photo_url TEXT,
  role TEXT DEFAULT 'USER' CHECK (role IN ('USER','ADMIN','SUPER_ADMIN')),
  community_id UUID REFERENCES communities(id),
  tower TEXT,
  apartment TEXT,
  avatar_url TEXT,
  points INT DEFAULT 0,
  status TEXT DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','INACTIVO')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Un admin único por comunidad (idea Hoja1: "Solo un admin por torre")
CREATE UNIQUE INDEX IF NOT EXISTS users_one_admin_per_community
  ON users(community_id)
  WHERE role = 'ADMIN' AND status = 'ACTIVO';

-- ─── Espacios comunes / Amenidades ───
CREATE TABLE IF NOT EXISTS amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT DEFAULT 10,
  description TEXT CHECK (char_length(description) <= 300),
  image_url TEXT,
  amenity_type TEXT DEFAULT 'GENERAL',
  points_reward INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Reservas (con correlativo C1-Rxxxx) ───
CREATE SEQUENCE IF NOT EXISTS reservation_seq START 1;

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE DEFAULT ('C1-R' || lpad(nextval('reservation_seq')::text, 4, '0')),
  user_id UUID REFERENCES users(id),
  amenity_id UUID REFERENCES amenities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA','CANCELADA','FINALIZADA')),
  grade TEXT DEFAULT 'PENDIENTE' CHECK (grade IN ('PENDIENTE','CUMPLIDA','INCUMPLIDA')),
  compliance_pct INT DEFAULT 100 CHECK (compliance_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anti-colisiones: nunca dos reservas activas en el mismo slot
CREATE UNIQUE INDEX IF NOT EXISTS reservations_no_collision
  ON reservations(amenity_id, date, time_slot)
  WHERE status = 'ACTIVA';

-- ─── Posts del muro comunitario ───
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image_url TEXT,
  post_type TEXT DEFAULT 'GENERAL' CHECK (post_type IN ('GENERAL','FOTO_AREA','BUG_REPORT')),
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- ─── Solicitudes de ingreso (con correlativo C1-Sxxxx) ───
CREATE SEQUENCE IF NOT EXISTS join_request_seq START 1;

CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code TEXT UNIQUE DEFAULT ('C1-S' || lpad(nextval('join_request_seq')::text, 4, '0')),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  unit TEXT,
  tower TEXT,
  status TEXT DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','APROBADA','RECHAZADA')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Una solicitud activa por email/comunidad (anti-spam)
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_one_pending
  ON join_requests(community_id, user_email)
  WHERE status = 'PENDIENTE';

-- ─── Mensajes de rechazo ───
CREATE TABLE IF NOT EXISTS rejection_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 150),
  admin_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Historial de puntos ───
CREATE TABLE IF NOT EXISTS point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id),
  action TEXT NOT NULL,
  description TEXT,
  points INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Sanciones (Hoja1 #10) ───
CREATE TABLE IF NOT EXISTS sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  apartment TEXT NOT NULL,
  amenity_id UUID REFERENCES amenities(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS sanctions_active_lookup
  ON sanctions(community_id, apartment, amenity_id, start_date, end_date);

-- ─── Restricciones por amenidad (Hoja1 #11) ───
CREATE TABLE IF NOT EXISTS restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  amenity_id UUID REFERENCES amenities(id) ON DELETE CASCADE,
  horizon_days INT DEFAULT 30 CHECK (horizon_days BETWEEN 1 AND 365),
  cooldown_days INT DEFAULT 0 CHECK (cooldown_days >= 0),
  cooldown_hours INT DEFAULT 0 CHECK (cooldown_hours >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, amenity_id)
);

-- ─── Auditoría ───
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_by_actor ON audit_logs(actor_id, created_at DESC);

-- =====================================================
-- Helpers SQL (SECURITY DEFINER para uso desde RLS)
-- =====================================================

CREATE OR REPLACE FUNCTION my_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_community_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT community_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role = 'SUPER_ADMIN'
      AND status = 'ACTIVO'
  );
$$;

CREATE OR REPLACE FUNCTION is_admin_of(target_community UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role = 'ADMIN'
      AND status = 'ACTIVO'
      AND community_id = target_community
  );
$$;

CREATE OR REPLACE FUNCTION is_member_of(target_community UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND community_id = target_community
      AND status = 'ACTIVO'
  );
$$;

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE communities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE restrictions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas antiguas (idempotente)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ─── communities ───
-- Cualquier autenticado puede LISTAR (necesario para "Asociarme a una comunidad")
CREATE POLICY communities_select ON communities FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Crear comunidad: cualquier autenticado (se vuelve admin de ella)
CREATE POLICY communities_insert ON communities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Editar: solo admin de esa comunidad o super-admin
CREATE POLICY communities_update ON communities FOR UPDATE
  USING (is_admin_of(id) OR is_super_admin());

CREATE POLICY communities_delete ON communities FOR DELETE
  USING (is_super_admin());

-- ─── users ───
-- Ver: yo mismo + miembros de mi comunidad (leaderboard) + admin/super-admin
CREATE POLICY users_select ON users FOR SELECT
  USING (
    auth_id = auth.uid()
    OR (community_id IS NOT NULL AND community_id = my_community_id())
    OR is_super_admin()
    OR (my_role() = 'ADMIN' AND community_id = my_community_id())
  );

-- Crear mi perfil (auth_id debe coincidir conmigo)
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (auth_id = auth.uid() OR is_super_admin());

-- Actualizar: yo mismo, o admin sobre miembros de su comunidad, o super-admin
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    auth_id = auth.uid()
    OR is_super_admin()
    OR (my_role() = 'ADMIN' AND community_id = my_community_id())
  );

-- ─── amenities ───
CREATE POLICY amenities_select ON amenities FOR SELECT
  USING (is_member_of(community_id) OR is_super_admin());

CREATE POLICY amenities_insert ON amenities FOR INSERT
  WITH CHECK (is_admin_of(community_id));

CREATE POLICY amenities_update ON amenities FOR UPDATE
  USING (is_admin_of(community_id));

CREATE POLICY amenities_delete ON amenities FOR DELETE
  USING (is_admin_of(community_id));

-- ─── reservations ───
CREATE POLICY reservations_select ON reservations FOR SELECT
  USING (
    user_id = my_user_id()
    OR EXISTS (
      SELECT 1 FROM amenities a
      WHERE a.id = reservations.amenity_id
        AND is_admin_of(a.community_id)
    )
    OR is_super_admin()
  );

CREATE POLICY reservations_insert ON reservations FOR INSERT
  WITH CHECK (user_id = my_user_id());

-- Actualizar: el dueño (cancelar) o el admin (calificar)
CREATE POLICY reservations_update ON reservations FOR UPDATE
  USING (
    user_id = my_user_id()
    OR EXISTS (
      SELECT 1 FROM amenities a
      WHERE a.id = reservations.amenity_id
        AND is_admin_of(a.community_id)
    )
  );

-- ─── posts / comments / likes ───
CREATE POLICY posts_select ON posts FOR SELECT
  USING (is_member_of(community_id) OR is_super_admin());

CREATE POLICY posts_insert ON posts FOR INSERT
  WITH CHECK (user_id = my_user_id() AND is_member_of(community_id));

CREATE POLICY posts_update ON posts FOR UPDATE
  USING (user_id = my_user_id() OR is_admin_of(community_id));

CREATE POLICY posts_delete ON posts FOR DELETE
  USING (user_id = my_user_id() OR is_admin_of(community_id));

CREATE POLICY comments_select ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = comments.post_id
        AND (is_member_of(p.community_id) OR is_super_admin())
    )
  );

CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (user_id = my_user_id());

CREATE POLICY likes_select ON likes FOR SELECT USING (true);
CREATE POLICY likes_insert ON likes FOR INSERT
  WITH CHECK (user_id = my_user_id());
CREATE POLICY likes_delete ON likes FOR DELETE
  USING (user_id = my_user_id());

-- ─── join_requests ───
-- Crear: cualquier autenticado puede solicitar
CREATE POLICY join_requests_insert ON join_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_email = (SELECT email FROM users WHERE auth_id = auth.uid())
  );

-- Ver: el solicitante (por su email) o el admin de la comunidad
CREATE POLICY join_requests_select ON join_requests FOR SELECT
  USING (
    user_email = (SELECT email FROM users WHERE auth_id = auth.uid())
    OR is_admin_of(community_id)
    OR is_super_admin()
  );

-- Actualizar (aprobar/rechazar): solo admin de la comunidad
CREATE POLICY join_requests_update ON join_requests FOR UPDATE
  USING (is_admin_of(community_id) OR is_super_admin());

-- ─── point_logs ───
CREATE POLICY point_logs_select ON point_logs FOR SELECT
  USING (
    user_id = my_user_id()
    OR is_admin_of(community_id)
    OR is_super_admin()
  );

CREATE POLICY point_logs_insert ON point_logs FOR INSERT
  WITH CHECK (
    user_id = my_user_id()
    OR is_admin_of(community_id)
    OR is_super_admin()
  );

-- ─── rejection_messages ───
CREATE POLICY rejection_messages_select ON rejection_messages FOR SELECT
  USING (
    user_email = (SELECT email FROM users WHERE auth_id = auth.uid())
    OR my_role() IN ('ADMIN','SUPER_ADMIN')
  );

CREATE POLICY rejection_messages_insert ON rejection_messages FOR INSERT
  WITH CHECK (my_role() IN ('ADMIN','SUPER_ADMIN'));

CREATE POLICY rejection_messages_delete ON rejection_messages FOR DELETE
  USING (user_email = (SELECT email FROM users WHERE auth_id = auth.uid()));

-- ─── sanctions ───
CREATE POLICY sanctions_select ON sanctions FOR SELECT
  USING (is_member_of(community_id) OR is_super_admin());

CREATE POLICY sanctions_admin_write ON sanctions FOR ALL
  USING (is_admin_of(community_id) OR is_super_admin())
  WITH CHECK (is_admin_of(community_id) OR is_super_admin());

-- ─── restrictions ───
CREATE POLICY restrictions_select ON restrictions FOR SELECT
  USING (is_member_of(community_id) OR is_super_admin());

CREATE POLICY restrictions_admin_write ON restrictions FOR ALL
  USING (is_admin_of(community_id) OR is_super_admin())
  WITH CHECK (is_admin_of(community_id) OR is_super_admin());

-- ─── audit_logs ───
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (is_super_admin() OR actor_id = my_user_id());

CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- Storage buckets (ejecutar manualmente en Storage)
-- =====================================================
-- Crear los siguientes buckets PRIVADOS y aplicar policies por bucket:
--   • avatars         → cada usuario sube/lee solo su propio path: {user_id}/...
--   • amenity-photos  → admin de la comunidad escribe; cualquier miembro lee
--   • post-images     → autor escribe; miembros de la comunidad leen
--   • dni-photos      → SOLO el usuario y el admin de su comunidad
-- Recomendación: NUNCA configurar buckets como público; usar signed URLs.

-- =====================================================
-- Seed del primer SUPER_ADMIN (ejecutar manualmente)
-- =====================================================
-- 1) Registrar normalmente vía Supabase Auth (email + password).
-- 2) Tras confirmar el correo, en SQL Editor:
--    UPDATE users SET role='SUPER_ADMIN' WHERE email = 'tu@correo.com';
-- 3) Salir y volver a entrar a la app — verás el botón Super Admin.
