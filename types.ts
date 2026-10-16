// ─── Salas ADR · Tipos ───
// Mapeo con el modelo heredado de Roomly (mismas tablas en Supabase):
//   communities → Sedes ADR (oficina, planta o fundo)
//   amenities   → Salas de reunión
//   users.apartment / join_requests.unit → Área del colaborador
//   users.cargo / join_requests.cargo    → Cargo del colaborador
//   reservations.motivo                  → Motivo de la reunión

export type SedeType = 'OFICINA' | 'PLANTA' | 'FUNDO';

export interface Community {
    id: string;
    name: string;
    address?: string;
    district?: string;
    province?: string;
    community_type?: SedeType;
    map_lat?: number;
    map_lng?: number;
    admin_email: string;
    total_floors: number;
    units_per_floor: number;
    num_buildings: number;
    rooms_per_floor: number;
    total_points: number;
    is_active?: boolean;
    created_at: string;
}

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
    id: string;
    auth_id?: string;
    email: string;
    name: string;
    dni?: string;
    phone?: string;
    dni_photo_url?: string;
    role: UserRole;
    community_id?: string;
    tower?: string;
    apartment?: string;       // Área del colaborador
    cargo?: string;           // Cargo del colaborador
    avatar_url?: string;
    points: number;
    status: 'ACTIVO' | 'INACTIVO';
    created_at: string;
    // Joined fields
    community?: Community;
}

export interface Amenity {
    id: string;
    community_id?: string;
    name: string;
    capacity: number;
    description?: string;
    image_url?: string;
    amenity_type: string;
    points_reward: number;
    created_at: string;
}

export interface Reservation {
    id: string;
    code?: string;            // Correlativo C1-Rxxxx (Hoja1 #7)
    user_id: string;
    amenity_id: string;
    date: string;
    time_slot: string;
    motivo?: string;          // Motivo de la reunión
    attendees?: number;       // N.º de asistentes estimado
    status: 'ACTIVA' | 'CANCELADA' | 'FINALIZADA';
    grade: 'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA';
    compliance_pct: number;
    created_at: string;
    // Joined fields
    amenity?: Amenity;
    user?: User;
}

export interface Sanction {
    id: string;
    community_id: string;
    apartment: string;        // Área sancionada
    amenity_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
    created_by?: string;
    created_at: string;
    amenity?: Amenity;
}

export interface Restriction {
    id: string;
    community_id: string;
    amenity_id: string;
    horizon_days: number;
    cooldown_days: number;
    cooldown_hours: number;
    created_at: string;
}

export interface AuditLog {
    id: string;
    actor_id?: string;
    action: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, any>;
    created_at: string;
}

export interface RejectionMessage {
    id: string;
    user_email: string;
    message: string;
    admin_name?: string;
    created_at: string;
}

export interface Post {
    id: string;
    user_id: string;
    community_id: string;
    text: string;
    image_url?: string;
    post_type: 'GENERAL' | 'FOTO_AREA' | 'BUG_REPORT';
    likes_count: number;
    created_at: string;
    // Joined
    user?: User;
    comments?: Comment[];
    user_liked?: boolean;
}

export interface Comment {
    id: string;
    post_id: string;
    user_id: string;
    text: string;
    created_at: string;
    user?: User;
}

export interface JoinRequest {
    id: string;
    ticket_code: string;
    community_id: string;
    user_email: string;
    user_name: string;
    unit?: string;            // Área
    tower?: string;
    cargo?: string;
    status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
    created_at: string;
    community?: Community;
}

export interface PointLog {
    id: string;
    user_id: string;
    community_id?: string;
    action: string;
    description?: string;
    points: number;
    created_at: string;
}

// ─── UI Types ───

export type ThemeMode = 'dark' | 'light';

export type AppView =
    | 'login'
    | 'reset-password'
    | 'home'
    | 'amenities'
    | 'amenity-detail'
    | 'booking'
    | 'my-reservations'
    | 'community'
    | 'leaderboard'
    | 'profile'
    | 'join-community'
    | 'new-tower'
    | 'admin'
    | 'admin-users'
    | 'admin-audit'
    | 'admin-requests'
    | 'admin-analytics'
    | 'super-admin'
    | 'qr-access'
    | 'qr-validate';

export interface PointAction {
    action: string;
    description: string;
    points: number;
}

export const POINT_ACTIONS: PointAction[] = [
    { action: 'PROFILE_PHOTO', description: 'Subir foto de perfil', points: 20 },
    { action: 'UPLOAD_AREA_PHOTO', description: 'Subir foto de una sala', points: 15 },
    { action: 'COMMENT', description: 'Escribir comentario', points: 5 },
    { action: 'BUG_REPORT', description: 'Reportar bug', points: 25 },
    { action: 'RESERVATION_COMPLETED', description: 'Reunión cumplida (sala bien usada)', points: 10 },
    { action: 'LIKE_RECEIVED', description: 'Recibir like', points: 2 },
];

export function getUserLevel(points: number): { name: string; color: string; min: number; icon: string } {
    if (points >= 500) return { name: 'Referente ADR', color: '#EF7C3B', min: 500, icon: '🏆' };
    if (points >= 200) return { name: 'Colaborador Destacado', color: '#0097CE', min: 200, icon: '⭐' };
    if (points >= 50) return { name: 'Colaborador Activo', color: '#76B729', min: 50, icon: '🤝' };
    return { name: 'Nuevo Colaborador', color: '#8FC844', min: 0, icon: '🌱' };
}
