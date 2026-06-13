import React, { useEffect, useRef, useState } from 'react';
import { PERU_PROVINCES, districtsOf, canonicalProvince, canonicalDistrict, normalizeLoc } from '../services/peruLocations';

// ─── LocationPicker ───
// Selector de ubicación para crear torres SIN errores de digitación:
//  1. Buscador de direcciones (Nominatim/OpenStreetMap, limitado a Perú) con
//     sugerencias seleccionables — el admin elige, no tipea.
//  2. Mapa Leaflet con pin arrastrable: mover el pin re-geocodifica y
//     actualiza dirección/distrito/provincia automáticamente.
//  3. Selects en cascada Provincia → Distrito contra el dataset de ubigeo,
//     para que el dato guardado siempre sea canónico.
// Leaflet se carga desde CDN bajo demanda (sin API key ni dependencia npm).

export interface LocationValue {
    address: string;
    district: string;
    province: string;
    lat?: number;
    lng?: number;
}

export const EMPTY_LOCATION: LocationValue = { address: '', district: '', province: '' };

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const LIMA_CENTER: [number, number] = [-12.0464, -77.0428];

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
    const w = window as any;
    if (w.L) return Promise.resolve(w.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = LEAFLET_CSS;
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = LEAFLET_JS;
        s.onload = () => resolve(w.L);
        s.onerror = () => { leafletPromise = null; reject(new Error('map-load-failed')); };
        document.head.appendChild(s);
    });
    return leafletPromise;
}

// Extrae dirección/distrito/provincia de una respuesta de Nominatim.
function parseNominatim(item: any): { address: string; district: string; province: string } {
    const a = item?.address || {};
    const road = a.road || a.pedestrian || a.residential || a.neighbourhood || '';
    const num = a.house_number || '';
    const address = road
        ? `${road}${num ? ' ' + num : ''}`
        : String(item?.display_name || '').split(',')[0].trim();
    const rawDistrict = a.suburb || a.city_district || a.district || a.town || a.village || a.municipality || '';
    const rawProvince = a.city || a.county || a.state || a.region || '';
    const province = canonicalProvince(rawProvince);
    return { address, district: canonicalDistrict(province, rawDistrict), province };
}

export function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const debounceRef = useRef<any>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const [mapError, setMapError] = useState(false);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [manual, setManual] = useState(false);

    const apply = (patch: Partial<LocationValue>) => onChange({ ...valueRef.current, ...patch });

    const placeMarker = (lat: number, lng: number, pan = true) => {
        const L = (window as any).L;
        const map = mapRef.current;
        if (!L || !map) return;
        if (!markerRef.current) {
            markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            markerRef.current.on('dragend', () => {
                const p = markerRef.current.getLatLng();
                reverseGeocode(p.lat, p.lng);
            });
        } else {
            markerRef.current.setLatLng([lat, lng]);
        }
        if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 16));
    };

    const reverseGeocode = async (lat: number, lng: number) => {
        // Pase lo que pase con la red, las coordenadas elegidas no se pierden.
        apply({ lat, lng });
        try {
            const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
                { headers: { 'Accept-Language': 'es' } });
            const item = await r.json();
            const p = parseNominatim(item);
            apply({ lat, lng, address: p.address || valueRef.current.address, district: p.district || valueRef.current.district, province: p.province || valueRef.current.province });
        } catch { /* sin red: el admin completa con los selects */ }
    };

    // Inicializa el mapa una sola vez
    useEffect(() => {
        let cancelled = false;
        loadLeaflet().then(L => {
            if (cancelled || !mapDivRef.current || mapRef.current) return;
            const center = value.lat != null && value.lng != null ? [value.lat, value.lng] : LIMA_CENTER;
            const map = L.map(mapDivRef.current).setView(center, value.lat != null ? 16 : 12);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19,
            }).addTo(map);
            map.on('click', (e: any) => {
                placeMarker(e.latlng.lat, e.latlng.lng, false);
                reverseGeocode(e.latlng.lat, e.latlng.lng);
            });
            mapRef.current = map;
            if (value.lat != null && value.lng != null) placeMarker(value.lat, value.lng);
            // El contenedor aparece con animación: recalcular tamaño al estar visible
            setTimeout(() => map.invalidateSize(), 350);
        }).catch(() => setMapError(true));
        return () => {
            cancelled = true;
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
        };
    }, []);

    // Búsqueda con debounce contra Nominatim (solo Perú)
    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length < 3) { setSuggestions([]); setSearching(false); return; }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const r = await fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=pe&limit=6&q=${encodeURIComponent(query)}`,
                    { headers: { 'Accept-Language': 'es' } });
                setSuggestions(await r.json());
            } catch { setSuggestions([]); }
            setSearching(false);
        }, 450);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const pickSuggestion = (item: any) => {
        const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
        const p = parseNominatim(item);
        apply({ lat, lng, address: p.address, district: p.district || valueRef.current.district, province: p.province || valueRef.current.province });
        placeMarker(lat, lng);
        setQuery('');
        setSuggestions([]);
    };

    const provinceList = PERU_PROVINCES.map(p => p.province);
    const provinceKnown = !value.province || provinceList.some(p => normalizeLoc(p) === normalizeLoc(value.province));
    const districts = districtsOf(value.province);
    const districtKnown = !value.district || districts.some(d => normalizeLoc(d) === normalizeLoc(value.district));

    const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' };
    const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 12 };

    return (
        <div>
            <label style={labelStyle}>Dirección</label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
                <input className="input" placeholder="🔍 Busca: Av. Arequipa 1234, Lince…"
                    value={query} onChange={e => setQuery(e.target.value)} />
                {(suggestions.length > 0 || searching) && (
                    <div className="card" style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                        marginTop: 4, padding: 4, maxHeight: 220, overflowY: 'auto',
                        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12,
                    }}>
                        {searching && <p style={{ fontSize: 12, color: 'var(--text-3)', padding: 8 }}>Buscando…</p>}
                        {!searching && suggestions.map((s: any, i: number) => (
                            <button key={i} type="button" onClick={() => pickSuggestion(s)}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-1)', fontSize: 13, borderRadius: 8,
                                }}>
                                📍 {s.display_name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!mapError ? (
                <div ref={mapDivRef} style={{
                    height: 220, borderRadius: 12, marginBottom: 8, zIndex: 0,
                    border: '1px solid var(--border)', overflow: 'hidden',
                }} />
            ) : (
                <p style={{ ...hintStyle, padding: 10, background: 'var(--bg-3)', borderRadius: 12 }}>
                    ⚠️ No se pudo cargar el mapa (¿sin conexión?). Usa el modo manual de abajo.
                </p>
            )}

            <p style={hintStyle}>
                {value.lat != null
                    ? <>📍 Ubicación fijada · <strong>{value.address || 'sin dirección'}</strong> ({value.lat.toFixed(5)}, {value.lng!.toFixed(5)}). Arrastra el pin para ajustar.</>
                    : 'Busca la dirección o toca el mapa para fijar el pin. Distrito y provincia se completan solos.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                    <label style={labelStyle}>Provincia</label>
                    <select className="input" value={value.province}
                        onChange={e => apply({ province: e.target.value, district: '' })}>
                        <option value="">Selecciona…</option>
                        {!provinceKnown && <option value={value.province}>{value.province} (del mapa)</option>}
                        {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Distrito</label>
                    <select className="input" value={value.district} disabled={!value.province}
                        onChange={e => apply({ district: e.target.value })}>
                        <option value="">{value.province ? 'Selecciona…' : 'Primero la provincia'}</option>
                        {!districtKnown && <option value={value.district}>{value.district} (del mapa)</option>}
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>

            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 12, fontSize: 12 }}
                onClick={() => setManual(m => !m)}>
                {manual ? '▲ Ocultar edición manual' : '✏️ Editar dirección manualmente'}
            </button>
            {manual && (
                <div style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Dirección exacta (calle y número)"
                        value={value.address} onChange={e => apply({ address: e.target.value })} style={{ marginBottom: 8 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input className="input" placeholder="Distrito" value={value.district}
                            onChange={e => apply({ district: e.target.value })} />
                        <input className="input" placeholder="Provincia" value={value.province}
                            onChange={e => apply({ province: e.target.value })} />
                    </div>
                </div>
            )}
        </div>
    );
}
