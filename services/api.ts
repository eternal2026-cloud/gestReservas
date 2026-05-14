import { supabase } from './supabase';
import type {
    User, Community, Amenity, Reservation, Post, Comment,
    JoinRequest, PointLog, Sanction, Restriction, AuditLog, POINT_ACTIONS
} from '../types';

// ─── Auth ───

export async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
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

export async function getAmenities(communityId?: string): Promise<Amenity[]> {
    let query = supabase.from('amenities').select('*');
    if (communityId) {
        query = query.eq('community_id', communityId);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return data || [];
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
        .select('*, user:users(name, email)')
        .eq('amenity_id', amenityId)
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
    const { error } = await supabase
        .from('reservations')
        .update({ grade, status: 'FINALIZADA', compliance_pct })
        .eq('id', reservationId);
    if (error) throw error;
}

export async function getAllReservationsForAudit(communityId?: string): Promise<Reservation[]> {
    let query = supabase
        .from('reservations')
        .select('*, amenity:amenities(*), user:users(name, email, community_id)')
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
): Promise<void> {
    // Log the points
    const { error: logError } = await supabase
        .from('point_logs')
        .insert({ user_id: userId, community_id: communityId, action, points, description });
    if (logError) throw logError;

    // Update user points
    const { data: user } = await supabase.from('users').select('points').eq('id', userId).single();
    if (user) {
        await supabase.from('users').update({ points: (user.points || 0) + points }).eq('id', userId);
    }

    // Update community total points
    const { data: community } = await supabase.from('communities').select('total_points').eq('id', communityId).single();
    if (community) {
        await supabase.from('communities').update({ total_points: (community.total_points || 0) + points }).eq('id', communityId);
    }
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
        { name: 'Piscina', type: 'PISCINA', capacity: 30, desc: 'Piscina comunitaria con área de descanso' },
        { name: 'Gimnasio', type: 'GIMNASIO', capacity: 15, desc: 'Equipamiento moderno y amplio espacio' },
        { name: 'Área de Parrillas', type: 'PARRILLA', capacity: 20, desc: 'Zona BBQ con mesas y bancas' },
        { name: 'Salón de Eventos', type: 'SALON', capacity: 50, desc: 'Salón equipado para eventos sociales' },
        { name: 'Coworking', type: 'COWORKING', capacity: 10, desc: 'Espacio de trabajo compartido con WiFi' },
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

// ─── Última reserva del dpto en una amenidad (para cooldown) ───
export async function getLastReservationByApartment(
    communityId: string, apartment: string, amenityId: string,
): Promise<Reservation | null> {
    // Trae todas las reservas de la amenidad y filtra por dpto del usuario dueño.
    const { data, error } = await supabase
        .from('reservations')
        .select('*, user:users(community_id, apartment)')
        .eq('amenity_id', amenityId)
        .eq('status', 'ACTIVA')
        .order('date', { ascending: false });
    if (error) return null;
    const match = (data || []).find((r: any) =>
        r.user?.community_id === communityId && r.user?.apartment === apartment,
    );
    return match || null;
}

// ─── Motor de elegibilidad ───
// Combina:
//   • horizonte de días (max fecha reservable)
//   • cooldown desde la última reserva del dpto
//   • sanciones activas del dpto sobre esta amenidad
// y devuelve restricciones para la UI del BookingPage.
export interface Eligibility {
    minDate: string;        // YYYY-MM-DD
    maxDate: string;        // YYYY-MM-DD (hoy + horizon)
    blockedDates: string[]; // fechas bloqueadas por sanción/cooldown
    reasons: string[];      // mensajes amistosos
    canReserve: boolean;
}

export async function getEligibility(
    user: User, amenityId: string,
): Promise<Eligibility> {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    const reasons: string[] = [];
    const blockedDates: string[] = [];
    let canReserve = true;

    if (!user.community_id || !user.apartment) {
        return { minDate: todayISO, maxDate: todayISO, blockedDates: [], reasons: ['Falta cartilla'], canReserve: false };
    }

    // 1) Restricción de la amenidad (horizonte + cooldown)
    const restriction = await getRestriction(user.community_id, amenityId);
    const horizonDays = restriction?.horizon_days ?? 30;
    const cooldownDays = restriction?.cooldown_days ?? 0;
    const cooldownHours = restriction?.cooldown_hours ?? 0;

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + horizonDays);
    const maxDateISO = maxDate.toISOString().split('T')[0];

    // 2) Cooldown desde la última reserva activa del dpto
    if (cooldownDays > 0 || cooldownHours > 0) {
        const last = await getLastReservationByApartment(user.community_id, user.apartment, amenityId);
        if (last) {
            const lastDate = new Date(last.date + 'T00:00:00');
            const cutoff = new Date(lastDate);
            cutoff.setDate(cutoff.getDate() + cooldownDays);
            cutoff.setHours(cutoff.getHours() + cooldownHours);

            // Bloquea desde lastDate hasta cutoff
            const d = new Date(lastDate);
            while (d <= cutoff) {
                blockedDates.push(d.toISOString().split('T')[0]);
                d.setDate(d.getDate() + 1);
            }
            reasons.push(
                `Tu dpto ${user.apartment} reservó esta amenidad recientemente. Próxima fecha disponible: ${cutoff.toISOString().split('T')[0]}.`
            );
        }
        // Si NO existe última reserva, el PDF dice "el sistema asume que la última fue ayer".
        // En la práctica esto no bloquea nada nuevo (cooldown desde ayer ya pasó),
        // así que no añadimos restricciones extra.
    }

    // 3) Sanciones activas (un solo SELECT para todo el rango)
    const { data: sanctions } = await supabase
        .from('sanctions')
        .select('*')
        .eq('community_id', user.community_id)
        .eq('apartment', user.apartment)
        .eq('amenity_id', amenityId)
        .gte('end_date', todayISO);

    (sanctions || []).forEach((s: Sanction) => {
        const start = new Date(s.start_date + 'T00:00:00');
        const end = new Date(s.end_date + 'T00:00:00');
        const d = new Date(start);
        while (d <= end) {
            blockedDates.push(d.toISOString().split('T')[0]);
            d.setDate(d.getDate() + 1);
        }
        reasons.push(`Sanción activa del ${s.start_date} al ${s.end_date}${s.reason ? ` — ${s.reason}` : ''}.`);
    });

    // Si todas las fechas del horizonte están bloqueadas, no puede reservar
    const total = horizonDays + 1;
    const uniqueBlocked = new Set(blockedDates);
    if (uniqueBlocked.size >= total) canReserve = false;

    return {
        minDate: todayISO,
        maxDate: maxDateISO,
        blockedDates: Array.from(uniqueBlocked),
        reasons,
        canReserve,
    };
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
