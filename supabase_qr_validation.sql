-- =====================================================
-- Roomly · Validación de accesos QR de invitado (uso único)
-- =====================================================
-- Requisito: ejecutar PRIMERO supabase_schema.sql (define los helpers
-- is_admin_of(), is_super_admin() y my_user_id()).
--
-- Cada QR de invitado lleva un identificador único (jti). La primera vez que
-- un admin lo escanea queda registrado aquí; un segundo escaneo del mismo QR
-- devuelve ALREADY_USED. Es atómico y a prueba de escaneos simultáneos.
-- =====================================================

CREATE TABLE IF NOT EXISTS guest_pass_uses (
  jti          UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  apartment    TEXT,
  guest_name   TEXT,
  validated_by UUID REFERENCES users(id),
  used_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_pass_uses_by_community
  ON guest_pass_uses(community_id, used_at DESC);

ALTER TABLE guest_pass_uses ENABLE ROW LEVEL SECURITY;

-- Solo el admin de la comunidad (o super-admin) puede consultar el historial.
DROP POLICY IF EXISTS guest_pass_uses_select ON guest_pass_uses;
CREATE POLICY guest_pass_uses_select ON guest_pass_uses FOR SELECT
  USING (is_admin_of(community_id) OR is_super_admin());

-- La inserción se hace EXCLUSIVAMENTE vía validate_guest_pass() (SECURITY
-- DEFINER); por eso no se crea política de INSERT: queda bloqueada para el
-- cliente directo y no se puede falsificar un "uso" sin pasar por la función.

-- ─── RPC: valida y marca un pase de invitado como usado (atómico) ───
CREATE OR REPLACE FUNCTION validate_guest_pass(
  p_jti        UUID,
  p_community  UUID,
  p_apartment  TEXT,
  p_guest_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing guest_pass_uses%ROWTYPE;
BEGIN
  -- Solo un admin de esa comunidad (o super-admin) puede validar.
  IF NOT (is_admin_of(p_community) OR is_super_admin()) THEN
    RETURN jsonb_build_object('status', 'FORBIDDEN');
  END IF;

  -- Intenta registrar el uso. Si el jti ya existe, la PK lanza unique_violation
  -- y devolvemos ALREADY_USED con los datos del primer uso.
  BEGIN
    INSERT INTO guest_pass_uses(jti, community_id, apartment, guest_name, validated_by)
      VALUES (p_jti, p_community, p_apartment, p_guest_name, my_user_id());
    RETURN jsonb_build_object('status', 'OK', 'used_at', now());
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO existing FROM guest_pass_uses WHERE jti = p_jti;
    RETURN jsonb_build_object(
      'status',     'ALREADY_USED',
      'used_at',    existing.used_at,
      'guest_name', existing.guest_name,
      'apartment',  existing.apartment,
      'validated_by', existing.validated_by
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_guest_pass(UUID, UUID, TEXT, TEXT) TO authenticated;
