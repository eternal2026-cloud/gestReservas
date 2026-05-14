-- =====================================================
-- Roomly — Setup de Storage (avatars, post-images, amenity-photos)
-- Cópialo y pégalo en: Supabase Dashboard → SQL Editor → RUN
-- =====================================================
-- Crea los buckets que la app usa y aplica políticas RLS mínimas.
-- Buckets PÚBLICOS en lectura (porque la app usa getPublicUrl).
-- Escritura solo por usuarios autenticados sobre su propio folder.
-- =====================================================

-- ─── 1) Crear buckets ───
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars',       'avatars',       true),
  ('post-images',   'post-images',   true),
  ('amenity-photos','amenity-photos',true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ─── 2) Limpieza de políticas previas (idempotente) ───
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'avatars_public_read','avatars_auth_insert','avatars_auth_update','avatars_auth_delete',
        'post_images_public_read','post_images_auth_insert','post_images_auth_update','post_images_auth_delete',
        'amenity_photos_public_read','amenity_photos_auth_write'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- ─── 3) Políticas para AVATARS ───
-- Lectura pública (la app usa URLs públicas)
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Solo el dueño puede subir/editar/borrar su propio folder: <auth.uid>/*
CREATE POLICY avatars_auth_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_auth_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_auth_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 4) Políticas para POST-IMAGES ───
CREATE POLICY post_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

CREATE POLICY post_images_auth_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY post_images_auth_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY post_images_auth_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

-- ─── 5) Políticas para AMENITY-PHOTOS ───
-- Las fotos de amenidades las suben los admins desde el panel; lectura pública.
CREATE POLICY amenity_photos_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'amenity-photos');

CREATE POLICY amenity_photos_auth_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'amenity-photos'
    AND auth.uid() IS NOT NULL
  ) WITH CHECK (
    bucket_id = 'amenity-photos'
    AND auth.uid() IS NOT NULL
  );

-- =====================================================
-- ✅ Listo. Ahora tu app puede subir avatares.
-- =====================================================
