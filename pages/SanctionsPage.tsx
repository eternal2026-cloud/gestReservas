import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import type { Amenity, Sanction, Restriction, User } from '../types';
import { generateStructure, flatApartments } from '../services/structure';
import { useAnimeStagger } from '../components/useAnime';
import { Loader } from '../components/Loader';

interface SanctionsPageProps {
    user: User;
    communityFloors: number;
    communityRooms: number;
    onBack: () => void;
    onToast: (msg: string) => void;
}

type Tab = 'sanctions' | 'restrictions';

export function SanctionsPage({ user, communityFloors, communityRooms, onBack, onToast }: SanctionsPageProps) {
    const [tab, setTab] = useState<Tab>('sanctions');
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [sanctions, setSanctions] = useState<Sanction[]>([]);
    const [restrictions, setRestrictions] = useState<Restriction[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    // Crear sanción
    const [newApt, setNewApt] = useState('');
    const [newAmenity, setNewAmenity] = useState('');
    const [newStart, setNewStart] = useState('');
    const [newEnd, setNewEnd] = useState('');
    const [newReason, setNewReason] = useState('');

    const listRef = useAnimeStagger<HTMLDivElement>('.sx-row', {}, [tab, sanctions.length, restrictions.length]);

    const refresh = async () => {
        if (!user.community_id) return;
        setLoading(true);
        try {
            const [am, sa, re] = await Promise.all([
                api.getAmenities(user.community_id),
                api.getSanctions(user.community_id),
                api.getRestrictions(user.community_id),
            ]);
            setAmenities(am);
            setSanctions(sa);
            setRestrictions(re);
        } catch (e: any) {
            onToast('Error al cargar: ' + (e.message || ''));
        }
        setLoading(false);
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

    const apartments = flatApartments(communityFloors || 10, communityRooms || 4);
    const todayISO = new Date().toISOString().split('T')[0];

    const submitSanction = async () => {
        if (!user.community_id || !newApt || !newAmenity || !newStart || !newEnd) {
            onToast('Completa todos los campos');
            return;
        }
        if (newReason && newReason.length > 150) {
            onToast('Motivo máximo 150 caracteres');
            return;
        }
        if (newEnd < newStart) {
            onToast('Fecha fin no puede ser menor a fecha inicio');
            return;
        }
        setBusy('create');
        try {
            const created = await api.createSanction({
                community_id: user.community_id,
                apartment: newApt,
                amenity_id: newAmenity,
                start_date: newStart,
                end_date: newEnd,
                reason: newReason.trim() || undefined,
                created_by: user.id,
            });
            await api.logAudit('SANCTION_CREATED', 'sanction', created.id, { apartment: newApt, amenity_id: newAmenity });
            setSanctions(prev => [created, ...prev]);
            setNewApt(''); setNewAmenity(''); setNewStart(''); setNewEnd(''); setNewReason('');
            onToast('✅ Sanción aplicada — el dpto recibirá notificación');
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo crear'));
        }
        setBusy(null);
    };

    const removeSanction = async (id: string) => {
        if (!confirm('¿Eliminar esta sanción?')) return;
        setBusy(id);
        try {
            await api.deleteSanction(id);
            await api.logAudit('SANCTION_DELETED', 'sanction', id);
            setSanctions(prev => prev.filter(s => s.id !== id));
            onToast('Sanción eliminada');
        } catch (e: any) {
            onToast('Error: ' + (e.message || ''));
        }
        setBusy(null);
    };

    const saveRestriction = async (amenityId: string, patch: Partial<Restriction>) => {
        if (!user.community_id) return;
        setBusy(amenityId);
        try {
            const existing = restrictions.find(r => r.amenity_id === amenityId);
            const merged = {
                community_id: user.community_id,
                amenity_id: amenityId,
                horizon_days: existing?.horizon_days ?? 30,
                cooldown_days: existing?.cooldown_days ?? 0,
                cooldown_hours: existing?.cooldown_hours ?? 0,
                ...patch,
            };
            const saved = await api.upsertRestriction(merged);
            setRestrictions(prev => {
                const found = prev.find(r => r.amenity_id === amenityId);
                return found ? prev.map(r => r.amenity_id === amenityId ? saved : r) : [...prev, saved];
            });
        } catch (e: any) {
            onToast('Error: ' + (e.message || ''));
        }
        setBusy(null);
    };

    if (loading) return <Loader label="Cargando reglas" />;

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver al Panel
            </button>

            <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--danger)' }}>gavel</span>
                Reglas y Sanciones
            </h2>

            <div className="leaderboard-tabs" style={{ marginBottom: 16 }}>
                <button className={`leaderboard-tab ${tab === 'sanctions' ? 'active' : ''}`} onClick={() => setTab('sanctions')}>⛔ Sanciones</button>
                <button className={`leaderboard-tab ${tab === 'restrictions' ? 'active' : ''}`} onClick={() => setTab('restrictions')}>📐 Restricciones</button>
            </div>

            <div ref={listRef}>
                {tab === 'sanctions' && (
                    <>
                        <div className="card sx-row" style={{ marginBottom: 14, padding: 14 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>➕ Nueva sanción</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Departamento</label>
                                    <select className="input" value={newApt} onChange={e => setNewApt(e.target.value)}>
                                        <option value="">Selecciona…</option>
                                        {generateStructure(communityFloors || 10, communityRooms || 4).map(f => (
                                            <optgroup key={f.floor} label={`Piso ${f.floor}`}>
                                                {f.apartments.map(a => <option key={a} value={a}>{a}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Espacio</label>
                                    <select className="input" value={newAmenity} onChange={e => setNewAmenity(e.target.value)}>
                                        <option value="">Selecciona…</option>
                                        {amenities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Desde</label>
                                    <input type="date" className="input" min={todayISO} value={newStart} onChange={e => setNewStart(e.target.value)} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Hasta</label>
                                    <input type="date" className="input" min={newStart || todayISO} value={newEnd} onChange={e => setNewEnd(e.target.value)} />
                                </div>
                            </div>
                            <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Motivo (≤150)</label>
                            <textarea className="input" rows={2} maxLength={150}
                                placeholder="Ej: Falta de cumplimiento en última reserva (Compliance 30%)"
                                value={newReason} onChange={e => setNewReason(e.target.value)} />
                            <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>{newReason.length}/150</p>
                            <button className="btn btn-danger btn-full" disabled={busy === 'create'}
                                onClick={submitSanction}>
                                {busy === 'create' ? 'Aplicando…' : 'Aplicar sanción'}
                            </button>
                        </div>

                        {sanctions.length === 0 ? (
                            <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                                Sin sanciones registradas.
                            </p>
                        ) : sanctions.map(s => {
                            const isActive = todayISO >= s.start_date && todayISO <= s.end_date;
                            const isFuture = todayISO < s.start_date;
                            return (
                                <div key={s.id} className="card sx-row" style={{ marginBottom: 8, padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                        <div>
                                            <h4 style={{ fontSize: 14, fontWeight: 700 }}>
                                                Dpto {s.apartment} · {(s as any).amenity?.name || 'Espacio'}
                                            </h4>
                                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                                {s.start_date} → {s.end_date}
                                            </p>
                                        </div>
                                        <span className={`badge ${isActive ? 'badge-danger' : isFuture ? 'badge-warning' : 'badge-accent'}`}>
                                            {isActive ? 'ACTIVA' : isFuture ? 'PROGRAMADA' : 'CUMPLIDA'}
                                        </span>
                                    </div>
                                    {s.reason && <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>💬 {s.reason}</p>}
                                    <button className="btn btn-ghost btn-sm" disabled={busy === s.id} onClick={() => removeSanction(s.id)}>
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            );
                        })}
                    </>
                )}

                {tab === 'restrictions' && (
                    <>
                        <p className="sx-row" style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
                            Define cuántos días máximo se puede reservar a futuro (horizonte) y cuánto tiempo
                            debe esperar un dpto entre dos reservas (cooldown).
                        </p>
                        {amenities.length === 0 ? (
                            <p style={{ color: 'var(--text-3)' }}>Sin espacios creados aún.</p>
                        ) : amenities.map(a => {
                            const r = restrictions.find(x => x.amenity_id === a.id);
                            const horizon = r?.horizon_days ?? 30;
                            const days = r?.cooldown_days ?? 0;
                            const hours = r?.cooldown_hours ?? 0;
                            return (
                                <div key={a.id} className="card sx-row" style={{ marginBottom: 10, padding: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                        {a.image_url && <img src={a.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />}
                                        <div>
                                            <h4 style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</h4>
                                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.amenity_type}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        <RestrictionField label="Horizonte (días)" value={horizon} min={1} max={365}
                                            onCommit={v => saveRestriction(a.id, { horizon_days: v })} busy={busy === a.id} />
                                        <RestrictionField label="Cooldown (días)" value={days} min={0} max={365}
                                            onCommit={v => saveRestriction(a.id, { cooldown_days: v })} busy={busy === a.id} />
                                        <RestrictionField label="Cooldown (horas)" value={hours} min={0} max={720}
                                            onCommit={v => saveRestriction(a.id, { cooldown_hours: v })} busy={busy === a.id} />
                                    </div>
                                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                                        📅 Reservable hasta <strong>{horizon} días</strong> a futuro.
                                        ⏱️ Espera entre reservas: <strong>{days}d {hours}h</strong>.
                                    </p>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}

function RestrictionField({ label, value, min, max, onCommit, busy }: {
    label: string; value: number; min: number; max: number;
    onCommit: (v: number) => void; busy: boolean;
}) {
    const [local, setLocal] = useState(value);
    useEffect(() => { setLocal(value); }, [value]);
    return (
        <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{label}</label>
            <input type="number" className="input" min={min} max={max} value={local}
                disabled={busy}
                onChange={e => setLocal(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
                onBlur={() => { if (local !== value) onCommit(local); }}
                style={{ padding: '8px', textAlign: 'center' }} />
        </div>
    );
}

export default SanctionsPage;
