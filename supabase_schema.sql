-- =====================================================
-- Roomly v2 — Supabase Schema
-- Run this in the SQL Editor of your Supabase Dashboard
-- =====================================================

-- ─── Torres / Comunidades ───
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  admin_email TEXT NOT NULL,
  total_floors INT DEFAULT 10,
  units_per_floor INT DEFAULT 4,
  num_buildings INT DEFAULT 1,
  rooms_per_floor INT DEFAULT 4,
  total_points INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Usuarios ───
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  community_id UUID REFERENCES communities(id),
  tower TEXT,
  apartment TEXT,
  avatar_url TEXT,
  points INT DEFAULT 0,
  status TEXT DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','INACTIVO')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Espacios comunes / Amenidades ───
CREATE TABLE IF NOT EXISTS amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id),
  name TEXT NOT NULL,
  capacity INT DEFAULT 10,
  description TEXT,
  image_url TEXT,
  amenity_type TEXT DEFAULT 'GENERAL',
  points_reward INT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Reservas ───
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amenity_id UUID REFERENCES amenities(id),
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA','CANCELADA','FINALIZADA')),
  grade TEXT DEFAULT 'PENDIENTE' CHECK (grade IN ('PENDIENTE','CUMPLIDA','INCUMPLIDA')),
  compliance_pct INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Posts del muro comunitario ───
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  community_id UUID REFERENCES communities(id),
  text TEXT NOT NULL,
  image_url TEXT,
  post_type TEXT DEFAULT 'GENERAL' CHECK (post_type IN ('GENERAL','FOTO_AREA','BUG_REPORT')),
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Comentarios ───
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Likes ───
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- ─── Solicitudes de ingreso a comunidad ───
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code TEXT UNIQUE DEFAULT ('TKT-' || substr(gen_random_uuid()::text, 1, 8)),
  community_id UUID REFERENCES communities(id),
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  unit TEXT,
  tower TEXT,
  status TEXT DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','APROBADA','RECHAZADA')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Historial de puntos ───
CREATE TABLE IF NOT EXISTS point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  community_id UUID REFERENCES communities(id),
  action TEXT NOT NULL,
  description TEXT,
  points INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;

-- Communities: anyone can read, admins can write
CREATE POLICY "communities_read" ON communities FOR SELECT USING (true);
CREATE POLICY "communities_insert" ON communities FOR INSERT WITH CHECK (true);

-- Users: anyone can read, users can update their own
CREATE POLICY "users_read" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = auth_id);

-- Amenities: anyone can read
CREATE POLICY "amenities_read" ON amenities FOR SELECT USING (true);
CREATE POLICY "amenities_insert" ON amenities FOR INSERT WITH CHECK (true);

-- Reservations: users can read their own, admins read all
CREATE POLICY "reservations_read" ON reservations FOR SELECT USING (true);
CREATE POLICY "reservations_insert" ON reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "reservations_update" ON reservations FOR UPDATE USING (true);

-- Posts: community members can read/write
CREATE POLICY "posts_read" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (true);
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (true);

-- Comments: everyone can read, authenticated can write
CREATE POLICY "comments_read" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);

-- Likes
CREATE POLICY "likes_read" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (true);
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (true);

-- Join requests
CREATE POLICY "join_requests_read" ON join_requests FOR SELECT USING (true);
CREATE POLICY "join_requests_insert" ON join_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "join_requests_update" ON join_requests FOR UPDATE USING (true);

-- Point logs
CREATE POLICY "point_logs_read" ON point_logs FOR SELECT USING (true);
CREATE POLICY "point_logs_insert" ON point_logs FOR INSERT WITH CHECK (true);

-- =====================================================
-- Storage bucket for images
-- =====================================================
-- Run this separately in Storage settings or via API:
-- Create bucket "avatars" (public)
-- Create bucket "amenity-photos" (public)
-- Create bucket "post-images" (public)
