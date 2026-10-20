import { supabase } from './supabase';
import { peruTodayISO, bookingMaxDateISO, addDaysISO } from './structure';
import type {
    User, Community, Amenity, Reservation, Post, Comment,
    JoinRequest, PointLog, Sanction, Restriction, AuditLog, POINT_ACTIONS
} from '../types';

// ─── Errores legibles ───
// "Failed to fetch" significa que el navegador ni siquiera llegó a Supabase:
// URL/clave mal configuradas, proyecto pausado o sin internet.
export function friendlyError(e: any): string {
    const msg: string = e?.message || String(e || '');
    const low = msg.toLowerCase();
    if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('load failed')) {
        return 'No se pudo conectar con el servidor. Revisa tu internet o la configuración de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).';
    }
    if (msg.includes('Invalid login')) return 'Usuario o contraseña incorrectos';
    if (low.includes('banned')) return 'Este usuario está desactivado. Contacta al administrador.';
    if (low.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres';
    if (low.includes('same_password') || low.includes('should be different')) return 'La nueva contraseña debe ser distinta a la anterior';
    if (msg.includes('FUERA_DE_VENTANA:')) return msg.split('FUERA_DE_VENTANA:')[1].trim();
    if (msg.includes('LIMITE_DIARIO:')) return msg.split('LIMITE_DIARIO:')[1].trim();
    if (low.includes('reservations_no_collision') || low.includes('duplicate key')) return 'Ese horario acaba de ser reservado por otra persona. Elige otro.';
    return msg || 'Error inesperado';
}

// ─── Auth ───
// Mismo modelo que Integra Operaciones: el colaborador entra con usuario +
// contraseña y el correo de Auth es técnico (no recibe correos). Las cuentas
// las crea el admin con la Edge Function admin-usuarios.

const DOMINIO_INTERNO = '@salas-adr.interno';

/** Misma normalización que la Edge Function (sin tildes, espacios → punto).
 *  Si escriben un correo (cuentas antiguas) se usa tal cual. */
export function usuarioAEmail(usuario: string): string {
    const u = String(usuario || '').trim().toLowerCase();
    if (u.includes('@')) return u;
    return u.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.') + DOMINIO_INTERNO;
}

export async function signIn(usuario: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: usuarioAEmail(usuario), password });
    if (error) throw error;
    return data;
}

/** Cambia la contraseña del usuario logueado y quita la marca de clave temporal. */
export async function changeOwnPassword(userId: string, password: string): Promise<User> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return updateUserProfile(userId, { must_change_password: false });
}

export interface AdminUsuariosResult {
    ok: boolean;
    perfil?: User;
    usuario?: string;
    nombre?: string;
    password?: string;   // clave temporal generada (crear / reset)
}

/** Llama a la Edge Function admin-usuarios con la sesión del admin. */
export async function adminUsuarios(body: Record<string, unknown>): Promise<AdminUsuariosResult> {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', { body });
    if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context.json()).error || msg; } catch { /* respuesta sin JSON */ }
        throw new Error(msg);
    }
    if (data?.ok === false || data?.error) throw new Error(data.error || 'Error de servidor');
    return data as AdminUsuariosResult;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentAuthUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// ─── Users ───

export async function getUserByAuthId(authId: string): Promise<User | null> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(*)')
        .eq('auth_id', authId)
        .single();
    if (error) return null;
    return data;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(*)')
        .eq('email', email)
        .single();
    if (error) return null;
    return data;
}

export async function createUserProfile(user: Partial<User>): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .insert(user)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getCommunityUsers(communityId: string): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('community_id', communityId)
        .eq('status', 'ACTIVO')
        .order('points', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getTowerUsers(communityId: string, tower: string): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('community_id', communityId)
        .eq('tower', tower)
        .eq('status', 'ACTIVO');
    if (error) return [];
    return data || [];
}

// Devuelve el usuario activo que YA ocupa ese (torre, depto) en la comunidad,
// o null si está libre. Sirve para bloquear duplicados antes de crear solicitudes.
export async function getApartmentOccupant(
    communityId: string, tower: string, apartment: string,
): Promise<User | null> {
    const t = (tower || '').trim();
    const a = (apartment || '').trim();
    if (!communityId || !a) return null;
    let q = supabase
        .from('users')
        .select('id, email, name, tower, apartment, status')
        .eq('community_id', communityId)
        .eq('apartment', a)
        .eq('status', 'ACTIVO');
    if (t) q = q.eq('tower', t);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return null;
    return data[0] as unknown as User;
}

// Devuelve los pares (tower, apartment) tomados por solicitudes PENDIENTES
// para una comunidad. Útil para evitar que dos vecinos pidan el mismo depto
// antes de que el admin apruebe.
export async function getPendingApartmentClaims(
    communityId: string,
): Promise<{ tower: string | null; unit: string | null; user_email: string }[]> {
    const { data, error } = await supabase
        .from('join_requests')
        .select('tower, unit, user_email')
        .eq('community_id', communityId)
        .eq('status', 'PENDIENTE');
    if (error) return [];
    return data || [];
}


export async function getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(name)')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function toggleUserStatus(userId: string, status: 'ACTIVO' | 'INACTIVO'): Promise<void> {
    const { error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId);
    if (error) throw error;
}

// ─── Communities ───

export async function getCommunities(): Promise<Community[]> {
    const { data, error } = await supabase
        .from('communities')
        .select('*')
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function createCommunity(community: Partial<Community>): Promise<Community> {
    const { data, error } = await supabase
        .from('communities')
        .insert(community)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getCommunityLeaderboard(): Promise<Community[]> {
    const { data, error } = await supabase
        .from('communities')
        .select('*')
        .order('total_points', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Amenities ───

// Por defecto solo salas habilitadas; el panel admin pide también las desactivadas.
export async function getAmenities(communityId?: string, includeInactive = false): Promise<Amenity[]> {
    let query = supabase.from('amenities').select('*');
    if (communityId) {
        query = query.eq('community_id', communityId);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return (data || []).filter((a: Amenity) => includeInactive || a.is_active !== false);
}

export async function getAmenityById(amenityId: string): Promise<Amenity | null> {
    const { data, error } = await supabase
        .from('amenities')
        .select('*')
        .eq('id', amenityId)
        .single();
    if (error) return null;
    return data;
}

export async function createAmenity(amenity: Partial<Amenity>): Promise<Amenity> {
    const { data, error } = await supabase
        .from('amenities')
        .insert(amenity)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateAmenity(amenityId: string, updates: Partial<Amenity>): Promise<Amenity> {
    const { data, error } = await supabase
        .from('amenities')
        .update(updates)
        .eq('id', amenityId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteAmenity(amenityId: string): Promise<void> {
    const { error } = await supabase.from('amenities').delete().eq('id', amenityId);
    if (error) throw error;
}

export async function uploadAmenityImage(amenityId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `amenities/${amenityId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
        .from('post-images')
        .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
}

// ─── Reservations ───

export async function getUserReservations(userId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
        .from('reservations')
        .select('*, amenity:amenities(*)')
        .eq('user_id', userId)
        .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getAmenityReservations(amenityId: string, date: string): Promise<Reservation[]> {
    const { data, error } = await supabase
        .from('reservations')
        .select('*, user:users(name, email, apartment)')
        .eq('amenity_id', amenityId)
        .eq('date', date)
        .neq('status', 'CANCELADA');
    if (error) throw error;
    return data || [];
}

// Ocupación de todas las salas en una fecha (tablero de disponibilidad).
export async function getReservationsByDate(date: string): Promise<Reservation[]> {
    const { data, error } = await supabase
        .from('reservations')
        .select('*, user:users(name, apartment)')
        .eq('date', date)
        .neq('status', 'CANCELADA');
    if (error) throw error;
    return data || [];
}

export async function createReservation(reservation: Partial<Reservation>): Promise<Reservation> {
    const { data, error } = await supabase
        .from('reservations')
        .insert(reservation)
        .select('*, amenity:amenities(*)')
        .single();
    if (error) throw error;
    return data;
}

export async function cancelReservation(reservationId: string): Promise<void> {
    const { error } = await supabase
        .from('reservations')
        .update({ status: 'CANCELADA' })
        .eq('id', reservationId);
    if (error) throw error;
}

export async function gradeReservation(reservationId: string, grade: 'CUMPLIDA' | 'INCUMPLIDA', compliance_pct: number = 100): Promise<void> {
    // Recuperamos antes del update para poder otorgar los puntos correctos.
    const { data: prev } = await supabase
        .from('reservations')
        .select('*, amenity:amenities(name, points_reward, community_id), user:users(id, community_id)')
        .eq('id', reservationId)
        .single();

    const { error } = await supabase
        .from('reservations')
        .update({ grade, status: 'FINALIZADA', compliance_pct })
        .eq('id', reservationId);
    if (error) throw error;

    // Sumar puntos al vecino SOLO si la reserva fue calificada como CUMPLIDA y aún
    // no había sido auditada. Los puntos se otorgan proporcionalmente al
    // % de cumplimiento (slider 0–100%) descrito en el plan.
    if (prev && grade === 'CUMPLIDA' && prev.grade === 'PENDIENTE') {
        const userId = prev.user?.id || prev.user_id;
        const communityId = prev.amenity?.community_id || prev.user?.community_id;
        const base = prev.amenity?.points_reward || 10;
        const earned = Math.max(0, Math.round((base * (compliance_pct ?? 100)) / 100));
        if (userId && communityId && earned > 0) {
            try {
                await awardPoints(
                    userId, communityId, 'RESERVATION_COMPLETED', earned,
                    `Reserva cumplida en ${prev.amenity?.name || 'amenidad'} (${compliance_pct ?? 100}%)`,
                );
            } catch { /* no rompemos el grading si falla el log */ }
        }
    }
}

export async function getAllReservationsForAudit(communityId?: string): Promise<Reservation[]> {
    let query = supabase
        .from('reservations')
        .select('*, amenity:amenities(*), user:users(name, email, community_id, apartment, cargo)')
        .order('date', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    if (communityId) {
        return (data || []).filter((r: any) => r.user?.community_id === communityId);
    }
    return data || [];
}

// ─── Posts ───

export async function getCommunityPosts(communityId: string): Promise<Post[]> {
    const { data, error } = await supabase
        .from('posts')
        .select('*, user:users(name, avatar_url, email), comments(*, user:users(name, avatar_url))')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function createPost(post: Partial<Post>): Promise<Post> {
    const { data, error } = await supabase
        .from('posts')
        .insert(post)
        .select('*, user:users(name, avatar_url)')
        .single();
    if (error) throw error;
    return data;
}

export async function likePost(postId: string, userId: string): Promise<void> {
    // Insert like
    const { error: likeError } = await supabase
        .from('likes')
        .insert({ post_id: postId, user_id: userId });
    if (likeError) throw likeError;
    // Increment counter
    const { error: updateError } = await supabase.rpc('increment_likes', { post_id_input: postId });
    if (updateError) {
        // Fallback: manual increment if RPC not set up
        const { data: post } = await supabase.from('posts').select('likes_count').eq('id', postId).single();
        if (post) {
            await supabase.from('posts').update({ likes_count: (post.likes_count || 0) + 1 }).eq('id', postId);
        }
    }

    // Premiar al autor del post con +2 pts (POINT_ACTIONS.LIKE_RECEIVED).
    // Antes esta acción estaba definida en el tipo pero nunca se otorgaba: por eso
    // varios usuarios "no sumaban puntos al interactuar" aunque la cuenta de likes
    // de su post sí crecía.
    const { data: post } = await supabase
        .from('posts')
        .select('user_id, community_id')
        .eq('id', postId)
        .single();
    if (post && post.user_id && post.user_id !== userId) {
        await supabase.rpc('award_points_to_user', {
            recipient_id: post.user_id,
            community: post.community_id,
            action_name: 'LIKE_RECEIVED',
            pts: 2,
            reason: 'Recibió un like en su publicación',
        });
    }
}

export async function unlikePost(postId: string, userId: string): Promise<void> {
    const { error: likeError } = await supabase
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
    if (likeError) throw likeError;
    const { data: post } = await supabase.from('posts').select('likes_count').eq('id', postId).single();
    if (post) {
        await supabase.from('posts').update({ likes_count: Math.max(0, (post.likes_count || 0) - 1) }).eq('id', postId);
    }
}

export async function getUserLikes(userId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', userId);
    if (error) return [];
    return (data || []).map(l => l.post_id);
}

// ─── Comments ───

export async function addComment(comment: Partial<Comment>): Promise<Comment> {
    const { data, error } = await supabase
        .from('comments')
        .insert(comment)
        .select('*, user:users(name, avatar_url)')
        .single();
    if (error) throw error;
    return data;
}

// ─── Join Requests ───

export async function createJoinRequest(request: Partial<JoinRequest>): Promise<JoinRequest> {
    // En Salas ADR varios colaboradores comparten la misma área, así que ya no
    // hay candado de "depto ocupado". La BD sigue limitando a una solicitud
    // PENDIENTE por correo y sede (join_requests_one_pending).
    const { data, error } = await supabase
        .from('join_requests')
        .insert(request)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getPendingRequests(communityId: string): Promise<JoinRequest[]> {
    const { data, error } = await supabase
        .from('join_requests')
        .select('*, community:communities(name)')
        .eq('community_id', communityId)
        .eq('status', 'PENDIENTE')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function approveJoinRequest(requestId: string): Promise<void> {
    const { data: request, error: fetchError } = await supabase
        .from('join_requests')
        .select('*')
        .eq('id', requestId)
        .single();
    if (fetchError) throw fetchError;

    // Update request status
    const { error: updateError } = await supabase
        .from('join_requests')
        .update({ status: 'APROBADA' })
        .eq('id', requestId);
    if (updateError) throw updateError;

    // Create or update user with community
    const existingUser = await getUserByEmail(request.user_email);
    if (existingUser) {
        await updateUserProfile(existingUser.id, {
            community_id: request.community_id,
            tower: request.tower,
            apartment: request.unit,
            ...(request.cargo ? { cargo: request.cargo } : {}),
        });
    }
}

export async function rejectJoinRequest(requestId: string, reason?: string, adminName?: string): Promise<void> {
    const { data: request, error: fetchError } = await supabase
        .from('join_requests')
        .select('user_email')
        .eq('id', requestId)
        .single();
    if (fetchError) throw fetchError;

    const { error } = await supabase
        .from('join_requests')
        .update({ status: 'RECHAZADA' })
        .eq('id', requestId);
    if (error) throw error;

    // Store rejection message for up to 1 day (auto-cleaned by DB trigger)
    if (reason && request?.user_email) {
        await supabase.from('rejection_messages').insert({
            user_email: request.user_email,
            message: reason,
            admin_name: adminName || 'El administrador',
        });
    }
}

export async function getRejectionMessagesForEmail(email: string) {
    const { data } = await supabase
        .from('rejection_messages')
        .select('*')
        .eq('user_email', email)
        .order('created_at', { ascending: false });
    return data || [];
}

export async function deleteRejectionMessage(id: string) {
    await supabase.from('rejection_messages').delete().eq('id', id);
}

// ─── Points ───

export async function awardPoints(
    userId: string,
    communityId: string,
    action: string,
    points: number,
    description?: string
): Promise<{ newPoints: number } | null> {
    // Los puntos se suman en el servidor (RPC SECURITY DEFINER): el colaborador
    // no puede editar su columna points directamente (trigger users_protect_columns).
    const { error } = await supabase.rpc('award_points_to_user', {
        recipient_id: userId, community: communityId, action_name: action, pts: points, reason: description ?? null,
    });
    if (error) return null;
    const { data: user } = await supabase.from('users').select('points').eq('id', userId).single();
    return user ? { newPoints: user.points || 0 } : null;
}

// Refresca el usuario completo desde la BD. Útil tras awardPoints para que la UI
// no quede con un user.points stale (causa de "no suman puntos al interactuar").
export async function refreshUserById(userId: string): Promise<User | null> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(*)')
        .eq('id', userId)
        .single();
    if (error) return null;
    return data;
}

export async function getUserPointLogs(userId: string): Promise<PointLog[]> {
    const { data, error } = await supabase
        .from('point_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Storage (Image Uploads) ───

export async function uploadAvatar(userId: string, file: File): Promise<string> {
    if (!file) throw new Error('No se recibió archivo');
    if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5 MB');

    // Usa el auth.uid() para que la política RLS de Storage sea trivial:
    //   WHERE (storage.foldername(name))[1] = auth.uid()::text
    const { data: authData } = await supabase.auth.getUser();
    const authUid = authData?.user?.id;
    if (!authUid) throw new Error('Sesión no válida; vuelve a iniciar sesión');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    // Path único por subida → evita que el navegador cachee la imagen anterior
    const path = `${authUid}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
            upsert: true,
            cacheControl: '3600',
            contentType: file.type,
        });

    if (upErr) {
        // Errores comunes de Storage: bucket inexistente o RLS.
        const msg = upErr.message || String(upErr);
        const low = msg.toLowerCase();
        if (low.includes('bucket') && low.includes('not found')) {
            throw new Error('Falta crear el bucket "avatars" en Supabase Storage (corre supabase_storage_setup.sql)');
        }
        if (low.includes('row-level security') || low.includes('unauthorized') || low.includes('new row violates')) {
            throw new Error('Permisos de Storage faltantes: corre supabase_storage_setup.sql en Supabase');
        }
        throw new Error(msg);
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
}

export async function uploadPostImage(userId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
        .from('post-images')
        .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
}

// ─── Analytics (Admin) ───

export async function getAnalytics(communityId?: string) {
    const [reservations, users, posts] = await Promise.all([
        supabase.from('reservations').select('*, amenity:amenities(name)'),
        supabase.from('users').select('*').eq('status', 'ACTIVO'),
        supabase.from('posts').select('*'),
    ]);

    const allReservations = reservations.data || [];
    const allUsers = users.data || [];
    const allPosts = posts.data || [];

    const filtered = communityId
        ? allReservations.filter((r: any) => r.amenity?.community_id === communityId)
        : allReservations;

    const total = filtered.length;
    const completed = filtered.filter((r: any) => r.grade === 'CUMPLIDA').length;
    const audited = filtered.filter((r: any) => r.grade !== 'PENDIENTE').length;

    // By amenity
    const byAmenity: Record<string, number> = {};
    filtered.forEach((r: any) => {
        const name = r.amenity?.name || 'Sin nombre';
        byAmenity[name] = (byAmenity[name] || 0) + 1;
    });

    return {
        totalReservations: total,
        completedReservations: completed,
        auditedReservations: audited,
        occupancyRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        totalUsers: allUsers.length,
        totalPosts: allPosts.length,
        byAmenity,
    };
}

// ─── Seed Data (Admin) ───

export async function seedTestData(communityId: string): Promise<string> {
    const amenityNames = [
        { name: 'Sala de Directorio', type: 'DIRECTORIO', capacity: 14, desc: 'Mesa ejecutiva, pantalla y videoconferencia' },
        { name: 'Sala de Reuniones 1', type: 'REUNIONES', capacity: 8, desc: 'Sala estándar con TV y pizarra' },
        { name: 'Sala de Capacitación', type: 'CAPACITACION', capacity: 30, desc: 'Proyector, sonido y carpetas' },
        { name: 'Sala de Videoconferencia', type: 'VIDEOCONFERENCIA', capacity: 6, desc: 'Cámara, micrófono y pantalla para Teams' },
    ];

    for (const a of amenityNames) {
        await supabase.from('amenities').insert({
            community_id: communityId,
            name: a.name,
            amenity_type: a.type,
            capacity: a.capacity,
            description: a.desc,
        });
    }

    return `Seed data created: ${amenityNames.length} amenities for community ${communityId}`;
}

// ─── Super Admin (Hoja1 #1 — Afiliación) ───
// El SUPER_ADMIN es el dueño del producto: da de alta/baja a los admins
// de cada torre (uno por torre). El primer SUPER_ADMIN se siembra manualmente
// en Supabase ejecutando:
//   UPDATE users SET role='SUPER_ADMIN' WHERE email = 'tu@correo.com';

export async function getAllAdmins(): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(name, address, is_active)')
        .in('role', ['ADMIN', 'SUPER_ADMIN'])
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── SUPER_ADMIN: usuarios + edición de rol/estado ───

export async function getAllUsersWithDetails(): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*, community:communities(id, name, community_type, admin_email)')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function updateUserRoleByAdmin(userId: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', userId)
        .select('*, community:communities(id, name, community_type, admin_email)')
        .single();
    if (error) throw error;
    return data;
}

export async function updateUserStatusByAdmin(userId: string, status: 'ACTIVO' | 'INACTIVO'): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId)
        .select('*, community:communities(id, name, community_type, admin_email)')
        .single();
    if (error) throw error;
    return data;
}

export async function getAllPendingRequests(): Promise<JoinRequest[]> {
    const { data, error } = await supabase
        .from('join_requests')
        .select('*, community:communities(name)')
        .eq('status', 'PENDIENTE')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getAllCommunitiesForSuperAdmin(): Promise<Community[]> {
    const { data, error } = await supabase
        .from('communities')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function setAdminStatus(userId: string, status: 'ACTIVO' | 'INACTIVO'): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function setCommunityActive(communityId: string, is_active: boolean): Promise<Community> {
    const { data, error } = await supabase
        .from('communities')
        .update({ is_active })
        .eq('id', communityId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function promoteUserToAdmin(userId: string, communityId: string): Promise<User> {
    const { data, error } = await supabase
        .from('users')
        .update({ role: 'ADMIN', community_id: communityId, status: 'ACTIVO' })
        .eq('id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Sanciones (Hoja1 #10) ───

export async function getSanctions(communityId: string): Promise<Sanction[]> {
    const { data, error } = await supabase
        .from('sanctions')
        .select('*, amenity:amenities(name, image_url)')
        .eq('community_id', communityId)
        .order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getActiveSanctionsForUser(
    communityId: string, apartment: string, amenityId: string, dateISO: string,
): Promise<Sanction[]> {
    const { data, error } = await supabase
        .from('sanctions')
        .select('*')
        .eq('community_id', communityId)
        .eq('apartment', apartment)
        .eq('amenity_id', amenityId)
        .lte('start_date', dateISO)
        .gte('end_date', dateISO);
    if (error) return [];
    return data || [];
}

export async function createSanction(s: Partial<Sanction>): Promise<Sanction> {
    const { data, error } = await supabase.from('sanctions').insert(s).select().single();
    if (error) throw error;
    return data;
}

export async function deleteSanction(id: string): Promise<void> {
    const { error } = await supabase.from('sanctions').delete().eq('id', id);
    if (error) throw error;
}

// ─── Restricciones (Hoja1 #11) ───

export async function getRestrictions(communityId: string): Promise<Restriction[]> {
    const { data, error } = await supabase
        .from('restrictions')
        .select('*')
        .eq('community_id', communityId);
    if (error) throw error;
    return data || [];
}

export async function getRestriction(communityId: string, amenityId: string): Promise<Restriction | null> {
    const { data, error } = await supabase
        .from('restrictions')
        .select('*')
        .eq('community_id', communityId)
        .eq('amenity_id', amenityId)
        .maybeSingle();
    if (error) return null;
    return data;
}

export async function upsertRestriction(r: Partial<Restriction>): Promise<Restriction> {
    const { data, error } = await supabase
        .from('restrictions')
        .upsert(r, { onConflict: 'community_id,amenity_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Última reserva del colaborador en una sala (para cooldown) ───
export async function getLastReservationByUser(
    userId: string, amenityId: string,
): Promise<Reservation | null> {
    const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('amenity_id', amenityId)
        .eq('user_id', userId)
        .eq('status', 'ACTIVA')
        .order('date', { ascending: false })
        .limit(1);
    if (error) return null;
    return (data && data[0]) || null;
}

// ─── Motor de elegibilidad ───
// Combina:
//   • horizonte de días (max fecha reservable)
//   • cooldown desde la última reserva del colaborador en la sala
//   • sanciones activas del área sobre esta sala
// y devuelve restricciones para la UI del BookingPage.
export interface Eligibility {
    minDate: string;        // YYYY-MM-DD
    maxDate: string;        // YYYY-MM-DD (hasta el domingo de la semana siguiente)
    blockedDates: string[]; // fechas bloqueadas por sanción/cooldown
    reasons: string[];      // mensajes amistosos
    canReserve: boolean;
}

export async function getEligibility(
    user: User, amenityId: string,
): Promise<Eligibility> {
    // Fechas en hora Perú: la ventana es de hoy al domingo de la semana siguiente.
    const todayISO = peruTodayISO();
    const windowMax = bookingMaxDateISO();
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    const reasons: string[] = [];
    const blockedDates: string[] = [];

    if (!user.community_id) {
        return { minDate: todayISO, maxDate: todayISO, blockedDates: [], reasons: ['Tu cuenta aún no está vinculada a ADR'], canReserve: false };
    }

    // 1) Restricción de la sala (horizonte + cooldown); el horizonte nunca pasa de la ventana
    const restriction = await getRestriction(user.community_id, amenityId);
    const horizonMax = addDaysISO(todayISO, restriction?.horizon_days ?? 30);
    const maxDateISO = isAdmin ? horizonMax : (horizonMax < windowMax ? horizonMax : windowMax);
    const cooldownDays = restriction?.cooldown_days ?? 0;
    const cooldownHours = restriction?.cooldown_hours ?? 0;

    // 2) Cooldown desde la última reserva activa del colaborador en esta sala
    if (cooldownDays > 0 || cooldownHours > 0) {
        const last = await getLastReservationByUser(user.id, amenityId);
        if (last) {
            const extra = cooldownDays + Math.ceil(cooldownHours / 24);
            for (let i = 0; i <= extra; i++) blockedDates.push(addDaysISO(last.date, i));
            reasons.push(`Ya reservaste esta sala recientemente. Próxima fecha disponible: ${addDaysISO(last.date, extra + 1)}.`);
        }
    }

    // 3) Sanciones activas del área (si el colaborador tiene área registrada)
    if (user.apartment) {
        const { data: sanctions } = await supabase
            .from('sanctions')
            .select('*')
            .eq('community_id', user.community_id)
            .eq('apartment', user.apartment)
            .eq('amenity_id', amenityId)
            .gte('end_date', todayISO);
        (sanctions || []).forEach((s: Sanction) => {
            for (let d = s.start_date; d <= s.end_date; d = addDaysISO(d, 1)) blockedDates.push(d);
            reasons.push(`Sanción activa para el área ${s.apartment} del ${s.start_date} al ${s.end_date}${s.reason ? ` — ${s.reason}` : ''}.`);
        });
    }

    const uniqueBlocked = new Set(blockedDates);
    let open = 0;
    for (let d = todayISO; d <= maxDateISO; d = addDaysISO(d, 1)) if (!uniqueBlocked.has(d)) open++;

    return {
        minDate: todayISO,
        maxDate: maxDateISO,
        blockedDates: Array.from(uniqueBlocked),
        reasons,
        canReserve: open > 0,
    };
}

/** Bloques activos que el colaborador ya tiene ese día (todas las salas). */
export async function countUserSlotsOnDate(userId: string, date: string): Promise<number> {
    const { count, error } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date', date)
        .eq('status', 'ACTIVA');
    if (error) return 0;
    return count || 0;
}

export async function logAudit(action: string, entityType: string, entityId: string, metadata?: Record<string, any>) {
    const user = await getCurrentAuthUser();
    if (!user) return;
    const me = await getUserByAuthId(user.id);
    if (!me) return;
    await supabase.from('audit_logs').insert({
        actor_id: me.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata: metadata || null,
    });
}
