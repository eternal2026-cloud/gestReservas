// Catálogos de Salas ADR: áreas, sedes y tipos de sala.
// (Reemplaza la estructura de pisos × departamentos de Roomly.)

import type { SedeType } from '../types';

/** Áreas de Agrícola Don Ricardo. Se usan al afiliarse y para sanciones por área. */
export const ADR_AREAS: string[] = [
    'Gerencia General',
    'Administración y Finanzas',
    'Contabilidad',
    'Gestión Humana',
    'Producción',
    'Planta de Empaque',
    'Frío',
    'Calidad',
    'Sanidad',
    'Mantenimiento',
    'Logística',
    'Comercial',
    'Agronomía / Campo',
    'Ingeniería y Mejora Continua',
    'Tecnologías de la Información',
    'Seguridad y Salud en el Trabajo',
    'Seguridad Patrimonial',
    'Proyectos',
    'Otra área',
];

/** Cargos sugeridos (el colaborador puede escribir uno distinto). */
export const ADR_CARGOS_SUGERIDOS: string[] = [
    'Gerente', 'Jefe', 'Coordinador', 'Supervisor', 'Analista',
    'Especialista', 'Asistente', 'Practicante', 'Operario', 'Técnico',
];

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
