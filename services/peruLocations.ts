// ─── Ubigeo Perú (provincias urbanas principales y sus distritos) ───
// Fuente de verdad para los selects en cascada Provincia → Distrito al crear
// una torre. Evita duplicados por digitación ("San Borja" vs "san borja " vs
// "S. Borja"). Las provincias no listadas se cubren con el geocoder del mapa
// o con el modo manual del LocationPicker.

export interface ProvinceData {
    province: string;
    department: string;
    districts: string[];
}

export const PERU_PROVINCES: ProvinceData[] = [
    {
        province: 'Lima', department: 'Lima', districts: [
            'Cercado de Lima', 'Ancón', 'Ate', 'Barranco', 'Breña', 'Carabayllo',
            'Chaclacayo', 'Chorrillos', 'Cieneguilla', 'Comas', 'El Agustino',
            'Independencia', 'Jesús María', 'La Molina', 'La Victoria', 'Lince',
            'Los Olivos', 'Lurigancho-Chosica', 'Lurín', 'Magdalena del Mar',
            'Miraflores', 'Pachacámac', 'Pucusana', 'Pueblo Libre', 'Puente Piedra',
            'Punta Hermosa', 'Punta Negra', 'Rímac', 'San Bartolo', 'San Borja',
            'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores',
            'San Luis', 'San Martín de Porres', 'San Miguel', 'Santa Anita',
            'Santa María del Mar', 'Santa Rosa', 'Santiago de Surco', 'Surquillo',
            'Villa El Salvador', 'Villa María del Triunfo',
        ],
    },
    {
        province: 'Callao', department: 'Callao', districts: [
            'Bellavista', 'Callao', 'Carmen de la Legua-Reynoso', 'La Perla',
            'La Punta', 'Mi Perú', 'Ventanilla',
        ],
    },
    {
        province: 'Arequipa', department: 'Arequipa', districts: [
            'Arequipa', 'Alto Selva Alegre', 'Cayma', 'Cerro Colorado', 'Characato',
            'Chiguata', 'Jacobo Hunter', 'José Luis Bustamante y Rivero', 'La Joya',
            'Mariano Melgar', 'Miraflores', 'Mollebaya', 'Paucarpata', 'Quequeña',
            'Sabandía', 'Sachaca', 'Socabaya', 'Tiabaya', 'Uchumayo', 'Yanahuara',
            'Yarabamba', 'Yura',
        ],
    },
    {
        province: 'Trujillo', department: 'La Libertad', districts: [
            'Trujillo', 'El Porvenir', 'Florencia de Mora', 'Huanchaco',
            'La Esperanza', 'Laredo', 'Moche', 'Poroto', 'Salaverry', 'Simbal',
            'Víctor Larco Herrera',
        ],
    },
    {
        province: 'Chiclayo', department: 'Lambayeque', districts: [
            'Chiclayo', 'Cayaltí', 'Chongoyape', 'Eten', 'Puerto Eten',
            'José Leonardo Ortiz', 'La Victoria', 'Monsefú', 'Pátapo', 'Picsi',
            'Pimentel', 'Pomalca', 'Pucalá', 'Reque', 'Santa Rosa', 'Tumán', 'Zaña',
        ],
    },
    {
        province: 'Cusco', department: 'Cusco', districts: [
            'Cusco', 'Ccorca', 'Poroy', 'San Jerónimo', 'San Sebastián',
            'Santiago', 'Saylla', 'Wanchaq',
        ],
    },
    {
        province: 'Piura', department: 'Piura', districts: [
            'Piura', 'Castilla', 'Catacaos', 'Cura Mori', 'El Tallán', 'La Arena',
            'La Unión', 'Las Lomas', 'Tambogrande', 'Veintiséis de Octubre',
        ],
    },
    {
        province: 'Huancayo', department: 'Junín', districts: [
            'Huancayo', 'Chilca', 'El Tambo', 'Huancán', 'Hualhuas', 'Huayucachi',
            'Pilcomayo', 'Quilcas', 'San Agustín de Cajas', 'San Jerónimo de Tunán',
            'Sapallanga', 'Sicaya',
        ],
    },
    {
        province: 'Maynas', department: 'Loreto', districts: [
            'Iquitos', 'Belén', 'Punchana', 'San Juan Bautista', 'Indiana', 'Mazán',
        ],
    },
    {
        province: 'Santa', department: 'Áncash', districts: [
            'Chimbote', 'Nuevo Chimbote', 'Coishco', 'Santa', 'Nepeña', 'Samanco', 'Moro',
        ],
    },
    {
        province: 'Tacna', department: 'Tacna', districts: [
            'Tacna', 'Alto de la Alianza', 'Calana', 'Ciudad Nueva',
            'Coronel Gregorio Albarracín Lanchipa', 'Pocollay', 'Pachía',
        ],
    },
    {
        province: 'Ica', department: 'Ica', districts: [
            'Ica', 'La Tinguiña', 'Los Aquijes', 'Parcona', 'Pueblo Nuevo',
            'Salas', 'San Juan Bautista', 'Subtanjalla', 'Tate',
        ],
    },
];

// Normaliza para comparar: minúsculas, sin tildes, espacios colapsados.
export function normalizeLoc(s: string): string {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Devuelve el nombre canónico del dataset si hay match (p.ej. el geocoder
// devuelve "miraflores" → "Miraflores"); si no, el valor original tal cual.
export function canonicalProvince(name: string): string {
    const n = normalizeLoc(name);
    if (!n) return '';
    const hit = PERU_PROVINCES.find(p => normalizeLoc(p.province) === n);
    return hit ? hit.province : name.trim();
}

export function canonicalDistrict(province: string, name: string): string {
    const n = normalizeLoc(name);
    if (!n) return '';
    const prov = PERU_PROVINCES.find(p => normalizeLoc(p.province) === normalizeLoc(province));
    const pools = prov ? [prov.districts] : PERU_PROVINCES.map(p => p.districts);
    for (const pool of pools) {
        const hit = pool.find(d => normalizeLoc(d) === n);
        if (hit) return hit;
    }
    return name.trim();
}

export function districtsOf(province: string): string[] {
    const prov = PERU_PROVINCES.find(p => normalizeLoc(p.province) === normalizeLoc(province));
    return prov ? prov.districts : [];
}
