// Estructura de departamentos según el PDF Roomly_Plan_Implementacion (pág. 4.4)
// Ejemplo «Jardines de Sta Beatriz»: 20 pisos × 6 dptos = 120 unidades
//   Piso 1  → 101, 102, 103, 104, 105, 106
//   Piso 10 → 1001, 1002, ..., 1006
//   Piso 20 → 2001, 2002, ..., 2006

export interface FloorStructure {
    floor: number;
    apartments: string[];
}

/**
 * Genera la estructura completa de departamentos.
 * @param floors  Número total de pisos (1..99 razonable)
 * @param roomsPerFloor Departamentos por piso (1..9)
 * @returns Array por piso
 */
export function generateStructure(floors: number, roomsPerFloor: number): FloorStructure[] {
    const result: FloorStructure[] = [];
    for (let f = 1; f <= floors; f++) {
        const apartments: string[] = [];
        for (let r = 1; r <= roomsPerFloor; r++) {
            apartments.push(String(f * 100 + r));
        }
        result.push({ floor: f, apartments });
    }
    return result;
}

/** Devuelve todos los departamentos en orden, planos. */
export function flatApartments(floors: number, roomsPerFloor: number): string[] {
    return generateStructure(floors, roomsPerFloor).flatMap(f => f.apartments);
}

/** Etiqueta amistosa para mostrar el tipo de comunidad. */
export function communityTypeLabel(type?: string): string {
    switch (type) {
        case 'CONDOMINIO': return 'Condominio';
        case 'MULTIFAMILIAR': return 'Vivienda multifamiliar';
        case 'EDIFICIO':
        default: return 'Edificio';
    }
}

/** "Torre"/"Condominio"/"Edificio" en distintas vistas (idea Hoja1 UI). */
export function buildingNoun(type?: string): string {
    switch (type) {
        case 'CONDOMINIO': return 'condominio';
        case 'MULTIFAMILIAR': return 'vivienda';
        case 'EDIFICIO':
        default: return 'torre';
    }
}
