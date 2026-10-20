// Catálogos de Salas ADR: áreas, sedes y tipos de sala.
// (Reemplaza la estructura de pisos × departamentos de Roomly.)

import type { SedeType } from '../types';

/** Áreas de Agrícola Don Ricardo. Se usan al afiliarse y para sanciones por área. */
export const ADR_AREAS: string[] = [
    'Ingeniería de Procesos',
    'Sanitización',
    'Manejo de la Información',
    'Despacho',
    'Producción',
    'Mantenimiento',
    'Servicios Generales',
    'Calidad',
    'Almacén',
];

/** Cargos sugeridos (el colaborador puede escribir uno distinto). */
export const ADR_CARGOS_SUGERIDOS: string[] = [
    'Gerente', 'Jefe', 'Coordinador', 'Supervisor', 'Analista',
    'Especialista', 'Asistente', 'Practicante', 'Operario', 'Técnico',
];

/** Tipos de sala de empresa (preset al crear una sala). */
export const ROOM_TYPES: { type: string; label: string; icon: string; desc: string; cap: number }[] = [
    { type: 'REUNIONES', label: 'Sala de reuniones', icon: 'groups', desc: 'Mesa de trabajo, TV y pizarra', cap: 8 },
    { type: 'DIRECTORIO', label: 'Directorio', icon: 'chair', desc: 'Mesa ejecutiva, pantalla y videoconferencia', cap: 14 },
    { type: 'CAPACITACION', label: 'Capacitación', icon: 'school', desc: 'Proyector, sonido y mesas modulares', cap: 30 },
    { type: 'VIDEOCONFERENCIA', label: 'Videoconferencia', icon: 'videocam', desc: 'Cámara, micrófono y pantalla para Teams', cap: 6 },
    { type: 'AUDITORIO', label: 'Auditorio', icon: 'mic', desc: 'Escenario, sonido y butacas', cap: 80 },
    { type: 'FOCUS', label: 'Sala focus', icon: 'call', desc: 'Sala pequeña para 1 a 1 o llamadas', cap: 3 },
    { type: 'OTRO', label: 'Otra', icon: 'meeting_room', desc: '', cap: 8 },
];

export function roomTypeLabel(type?: string): string {
    return ROOM_TYPES.find(t => t.type === type)?.label || 'Sala';
}

/** Equipamiento que el admin puede marcar en cada sala. */
export const ROOM_EQUIPMENT: { key: string; label: string; icon: string }[] = [
    { key: 'TV', label: 'TV / pantalla', icon: 'tv' },
    { key: 'PROYECTOR', label: 'Proyector', icon: 'videocam' },
    { key: 'VIDEOCONF', label: 'Videoconferencia', icon: 'video_call' },
    { key: 'PIZARRA', label: 'Pizarra', icon: 'draw' },
    { key: 'AIRE', label: 'Aire acondicionado', icon: 'ac_unit' },
    { key: 'WIFI', label: 'Wi-Fi', icon: 'wifi' },
    { key: 'TELEFONO', label: 'Teléfono', icon: 'call' },
];

/** Horarios reservables (bloques de 1 h, sin el refrigerio de 13:00 ni 07:00-08:00 / 18:00-19:00).
 *  El trigger reservations_check_rules acepta solo esta misma lista. */
export const TIME_SLOTS: string[] = [
    '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '19:00-20:00',
];

/** Fecha y hora actual en Perú (UTC-5, sin horario de verano). */
export function peruNow(): Date {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc - 5 * 3600000);
}

export function peruTodayISO(): string {
    const d = peruNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Reglas de reserva (las mismas valida el trigger reservations_check_rules) ───

/** Bloques de 1 h que un colaborador puede reservar por día (todas las salas). */
export const MAX_SLOTS_PER_DAY = 3;

/** Suma días a una fecha YYYY-MM-DD. */
export function addDaysISO(iso: string, n: number): string {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Última fecha reservable: el domingo de la semana siguiente (semana lun–dom, hora Perú). */
export function bookingMaxDateISO(): string {
    const today = peruTodayISO();
    const dow = (new Date(today + 'T12:00:00').getDay() + 6) % 7; // 0 = lunes
    return addDaysISO(today, 13 - dow);
}

/** "lun 20/10" para chips de fecha. */
export function shortDayLabel(iso: string): string {
    const d = new Date(iso + 'T12:00:00');
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Etiqueta amistosa del tipo de sede. */
export function communityTypeLabel(type?: string): string {
    switch (type as SedeType) {
        case 'PLANTA': return 'Planta';
        case 'FUNDO': return 'Fundo';
        case 'OFICINA':
        default: return 'Oficina';
    }
}

/** Sustantivo genérico para la sede en textos. */
export function buildingNoun(_type?: string): string {
    return 'sede';
}
