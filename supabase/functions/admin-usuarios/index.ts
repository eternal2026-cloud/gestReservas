/* ============================================================================
 * admin-usuarios — Alta, restablecimiento de clave y edición de colaboradores.
 * Mismo modelo que Integra Operaciones: el login es usuario + contraseña y el
 * correo de Auth es técnico (usuario@salas-adr.interno), así que Supabase no
 * envía correos de confirmación ni de recuperación.
 * Solo un ADMIN / SUPER_ADMIN activo puede llamarla (se valida su JWT).
 *
 * POST { accion: 'crear', usuario, nombre, area?, cargo?, rol?, password? }
 * POST { accion: 'reset', id }
 * POST { accion: 'actualizar', id, usuario?, nombre?, area?, cargo?, rol?, activo? }
 * ==========================================================================*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

function claveSecreta(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (k) return k;
  } catch (_) { /* sin claves nuevas: usar la legacy */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const DOMINIO = '@salas-adr.interno';
const ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'];

/** Misma normalización que usuarioAEmail en services/api.ts. */
function normalizarUsuario(s: unknown): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '.');
}

/** Clave temporal fácil de dictar: 4 letras + 4 dígitos sin caracteres ambiguos (ej. KMPT-4829). */
function claveTemporal(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ', digitos = '23456789';
  const r = crypto.getRandomValues(new Uint32Array(8));
  let s = '';
  for (let i = 0; i < 4; i++) s += letras[r[i] % letras.length];
  s += '-';
  for (let i = 4; i < 8; i++) s += digitos[r[i] % digitos.length];
  return s;
}

const USUARIO_OK = /^[a-z0-9._-]{3,40}$/;
const MSG_USUARIO = 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto o guion (sin espacios ni tildes).';

type Yo = { id: string; name: string; role: string; status: string; community_id: string | null };

const anotar = (sb: SupabaseClient, yo: Yo, action: string, entityId: string, metadata: Record<string, unknown>) =>
  sb.from('audit_logs').insert({ actor_id: yo.id, action, entity_type: 'user', entity_id: entityId, metadata });

/** Un ADMIN no puede crear ni tocar a un SUPER_ADMIN. */
const puedeAsignar = (yo: Yo, rol: string) => yo.role === 'SUPER_ADMIN' || rol !== 'SUPER_ADMIN';

async function crear(sb: SupabaseClient, yo: Yo, b: Record<string, unknown>) {
  const usuario = normalizarUsuario(b.usuario);
  if (!USUARIO_OK.test(usuario)) return responder({ error: MSG_USUARIO }, 400);
  const nombre = String(b.nombre || '').trim();
  if (!nombre) return responder({ error: 'Escribe el nombre del colaborador.' }, 400);
  const rol = ROLES.includes(String(b.rol)) ? String(b.rol) : 'USER';
  if (!puedeAsignar(yo, rol)) return responder({ error: 'Solo un Super Admin puede crear otro Super Admin.' }, 403);
  const propia = String(b.password || '');
  if (propia && propia.length < 6) return responder({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
  const password = propia || claveTemporal();

  const { data: existe } = await sb.from('users').select('id').eq('username', usuario).maybeSingle();
  if (existe) return responder({ error: `El usuario "${usuario}" ya existe. Elige otro.` }, 409);

  const email = usuario + DOMINIO;
  const { data: nuevo, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { usuario, name: nombre },
  });
  if (error || !nuevo.user) {
    const msg = error ? error.message : 'No se pudo crear la cuenta.';
    return responder({ error: /already|registered|exists/i.test(msg) ? `El usuario "${usuario}" ya existe.` : msg }, 400);
  }

  const { data: perfil, error: insErr } = await sb.from('users').insert({
    auth_id: nuevo.user.id, email, username: usuario, name: nombre,
    apartment: String(b.area || '').trim() || null, cargo: String(b.cargo || '').trim() || null,
    role: rol, status: 'ACTIVO', points: 0, must_change_password: true,
    community_id: yo.community_id,
  }).select().single();
  if (insErr) {
    await sb.auth.admin.deleteUser(nuevo.user.id).catch(() => {});
    return responder({ error: insErr.message }, 400);
  }
  await anotar(sb, yo, 'USER_CREATED', perfil.id, { usuario, rol });
  return responder({ ok: true, perfil, usuario, password });
}

async function reset(sb: SupabaseClient, yo: Yo, b: Record<string, unknown>) {
  const { data: p } = await sb.from('users').select('id,auth_id,username,email,name,role').eq('id', String(b.id || '')).maybeSingle();
  if (!p || !p.auth_id) return responder({ error: 'Colaborador no encontrado.' }, 404);
  if (!puedeAsignar(yo, p.role)) return responder({ error: 'Solo un Super Admin puede restablecer la clave de otro Super Admin.' }, 403);
  const password = claveTemporal();
  const { error } = await sb.auth.admin.updateUserById(p.auth_id, { password });
  if (error) return responder({ error: error.message }, 400);
  await sb.from('users').update({ must_change_password: true }).eq('id', p.id);
  await anotar(sb, yo, 'USER_PASSWORD_RESET', p.id, { usuario: p.username || p.email });
  return responder({ ok: true, usuario: p.username || p.email, nombre: p.name, password });
}

async function actualizar(sb: SupabaseClient, yo: Yo, b: Record<string, unknown>) {
  const id = String(b.id || '');
  const { data: p } = await sb.from('users').select('*').eq('id', id).maybeSingle();
  if (!p) return responder({ error: 'Colaborador no encontrado.' }, 404);
  if (!puedeAsignar(yo, p.role)) return responder({ error: 'Solo un Super Admin puede modificar a otro Super Admin.' }, 403);

  const cambios: Record<string, unknown> = {};
  if (b.rol !== undefined) {
    const rol = String(b.rol);
    if (!ROLES.includes(rol)) return responder({ error: 'Rol no válido.' }, 400);
    if (!puedeAsignar(yo, rol)) return responder({ error: 'Solo un Super Admin puede nombrar Super Admins.' }, 403);
    cambios.role = rol;
  }
  if (b.activo !== undefined) cambios.status = b.activo ? 'ACTIVO' : 'INACTIVO';
  if (b.nombre !== undefined) cambios.name = String(b.nombre).trim() || p.name;
  if (b.area !== undefined) cambios.apartment = String(b.area).trim() || null;
  if (b.cargo !== undefined) cambios.cargo = String(b.cargo).trim() || null;
  if (id === yo.id && (cambios.status === 'INACTIVO' || (cambios.role && cambios.role !== yo.role))) {
    return responder({ error: 'No puedes quitarte a ti mismo el acceso de administrador.' }, 400);
  }

  // Cambiar el usuario también cambia el correo técnico de Auth (login = usuario + DOMINIO).
  let emailPrevio: string | null = null;
  if (b.usuario !== undefined) {
    const usuario = normalizarUsuario(b.usuario);
    if (!USUARIO_OK.test(usuario)) return responder({ error: MSG_USUARIO }, 400);
    if (usuario !== p.username) {
      const { data: existe } = await sb.from('users').select('id').eq('username', usuario).neq('id', id).maybeSingle();
      if (existe) return responder({ error: `El usuario "${usuario}" ya existe. Elige otro.` }, 409);
      const { error } = await sb.auth.admin.updateUserById(p.auth_id, { email: usuario + DOMINIO, email_confirm: true });
      if (error) return responder({ error: /already|registered|exists/i.test(error.message) ? `El usuario "${usuario}" ya existe.` : error.message }, 400);
      emailPrevio = p.email;
      cambios.username = usuario;
      cambios.email = usuario + DOMINIO;
    }
  }

  // Desactivar también bloquea el inicio de sesión (no solo la fila de perfil).
  if (cambios.status && cambios.status !== p.status) {
    const { error } = await sb.auth.admin.updateUserById(p.auth_id, { ban_duration: cambios.status === 'ACTIVO' ? 'none' : '876000h' });
    if (error) return responder({ error: error.message }, 400);
  }
  const { data, error } = await sb.from('users').update(cambios).eq('id', id).select().single();
  if (error) {
    if (emailPrevio) await sb.auth.admin.updateUserById(p.auth_id, { email: emailPrevio, email_confirm: true }).catch(() => {});
    return responder({ error: error.message }, 400);
  }
  await anotar(sb, yo, 'USER_UPDATED', id, cambios);
  return responder({ ok: true, perfil: data });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), { auth: { persistSession: false, autoRefreshToken: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return responder({ error: 'Falta la sesión. Vuelve a iniciar sesión.' }, 401);
    const { data: u, error: uErr } = await sb.auth.getUser(jwt);
    if (uErr || !u || !u.user) return responder({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);
    const { data: yo } = await sb.from('users').select('id,name,role,status,community_id').eq('auth_id', u.user.id).maybeSingle();
    if (!yo || yo.status !== 'ACTIVO' || !['ADMIN', 'SUPER_ADMIN'].includes(yo.role)) {
      return responder({ error: 'Solo un administrador puede gestionar colaboradores.' }, 403);
    }

    const b = await req.json().catch(() => ({}));
    if (b.accion === 'crear') return await crear(sb, yo as Yo, b);
    if (b.accion === 'reset') return await reset(sb, yo as Yo, b);
    if (b.accion === 'actualizar') return await actualizar(sb, yo as Yo, b);
    return responder({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return responder({ error: (e && (e as Error).message) || 'Error de servidor.' }, 500);
  }
});
