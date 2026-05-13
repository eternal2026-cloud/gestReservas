import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import type { User, Community } from '../types';
import { useAnimeStagger, pulse } from '../components/useAnime';
import { Loader } from '../components/Loader';

interface SuperAdminPageProps {
    onBack: () => void;
    onToast: (msg: string) => void;
}

type Tab = 'admins' | 'communities' | 'overview';

export function SuperAdminPage({ onBack, onToast }: SuperAdminPageProps) {
    const [tab, setTab] = useState<Tab>('overview');
    const [admins, setAdmins] = useState<User[]>([]);
    const [communities, setCommunities] = useState<Community[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState<string | null>(null);

    const listRef = useAnimeStagger<HTMLDivElement>('.sa-row', {}, [tab, admins.length, communities.length]);

    const refresh = async () => {
        setLoading(true);
        try {
            const [a, c] = await Promise.all([
                api.getAllAdmins(),
                api.getAllCommunitiesForSuperAdmin(),
            ]);
            setAdmins(a);
            setCommunities(c);
        } catch (e: any) {
            onToast('Error cargando datos: ' + (e.message || ''));
        }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    const toggleAdmin = async (u: User) => {
        if (u.role === 'SUPER_ADMIN') {
            onToast('No puedes desactivar un Super Admin desde aquí');
            return;
        }
        setActionBusy(u.id);
        const next = u.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        try {
            const updated = await api.setAdminStatus(u.id, next);
            await api.logAudit(
                next === 'INACTIVO' ? 'ADMIN_DEACTIVATED' : 'ADMIN_ACTIVATED',
                'user',
                u.id,
                { email: u.email },
            );
            setAdmins(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
            onToast(`Admin ${updated.email} → ${next}`);
            pulse(`#sa-admin-${u.id}`);
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo actualizar'));
        }
        setActionBusy(null);
    };

    const toggleCommunity = async (c: Community) => {
        setActionBusy(c.id);
        const next = !(c.is_active ?? true);
        try {
            const updated = await api.setCommunityActive(c.id, next);
            await api.logAudit(
                next ? 'COMMUNITY_REACTIVATED' : 'COMMUNITY_DEACTIVATED',
                'community',
                c.id,
                { name: c.name },
            );
            setCommunities(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
            onToast(`${c.name} → ${next ? 'ACTIVA' : 'INACTIVA'}`);
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo actualizar'));
        }
        setActionBusy(null);
    };

    const stats = {
        admins: admins.filter(a => a.role === 'ADMIN').length,
        adminsActivos: admins.filter(a => a.role === 'ADMIN' && a.status === 'ACTIVO').length,
        comunidades: communities.length,
        comunidadesActivas: communities.filter(c => c.is_active ?? true).length,
    };

    if (loading) return <Loader label="Cargando panel Super Admin" />;

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>

            <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ color: '#f59e0b' }}>shield_person</span>
                Panel Super Admin
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                Gestión global de la plataforma — admins por torre y comunidades activas.
            </p>

            {/* Tabs */}
            <div className="leaderboard-tabs" style={{ marginBottom: 16 }}>
                <button className={`leaderboard-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>📊 Overview</button>
                <button className={`leaderboard-tab ${tab === 'admins' ? 'active' : ''}`} onClick={() => setTab('admins')}>👤 Admins</button>
                <button className={`leaderboard-tab ${tab === 'communities' ? 'active' : ''}`} onClick={() => setTab('communities')}>🏢 Comunidades</button>
            </div>

            <div ref={listRef}>
                {tab === 'overview' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            <Stat className="sa-row" icon="apartment" label="Comunidades" value={`${stats.comunidadesActivas}/${stats.comunidades}`} hint="activas / totales" />
                            <Stat className="sa-row" icon="badge" label="Admins" value={`${stats.adminsActivos}/${stats.admins}`} hint="activos / totales" />
                        </div>
                        <div className="card sa-row" style={{ padding: 16 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📌 Tareas del Super Admin</h4>
                            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)' }}>
                                <li>Activar / desactivar administradores por torre (cobro mensual)</li>
                                <li>Suspender comunidades en mora</li>
                                <li>Acceso a tabla de comunidades y de usuarios (visibilidad global)</li>
                                <li>Auditoría de acciones críticas</li>
                            </ul>
                        </div>
                    </>
                )}

                {tab === 'admins' && (
                    <>
                        {admins.length === 0 ? (
                            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin administradores registrados.</p>
                        ) : admins.map(u => (
                            <div key={u.id} id={`sa-admin-${u.id}`} className="card sa-row"
                                style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
                                <div className="avatar">{u.name?.[0] || '?'}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h4 style={{ fontSize: 14, fontWeight: 600 }}>
                                        {u.name}
                                        {u.role === 'SUPER_ADMIN' && <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: 10 }}>SUPER</span>}
                                    </h4>
                                    <p style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {u.email}{u.community && ` • ${(u.community as any).name || ''}`}
                                    </p>
                                </div>
                                <span className={`badge ${u.status === 'ACTIVO' ? 'badge-accent' : 'badge-danger'}`}>{u.status}</span>
                                {u.role === 'ADMIN' && (
                                    <button
                                        className={`btn btn-sm ${u.status === 'ACTIVO' ? 'btn-danger' : 'btn-accent'}`}
                                        disabled={actionBusy === u.id}
                                        onClick={() => toggleAdmin(u)}>
                                        {actionBusy === u.id ? '…' : u.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </>
                )}

                {tab === 'communities' && (
                    <>
                        {communities.length === 0 ? (
                            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin comunidades registradas.</p>
                        ) : communities.map(c => (
                            <div key={c.id} className="card sa-row" style={{ marginBottom: 8, padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>apartment</span>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</h4>
                                        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                            {c.address || 'Sin dirección'}{c.district ? ` • ${c.district}` : ''}
                                        </p>
                                    </div>
                                    <span className={`badge ${(c.is_active ?? true) ? 'badge-accent' : 'badge-danger'}`}>
                                        {(c.is_active ?? true) ? 'ACTIVA' : 'INACTIVA'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                                    <span>🏗️ {c.total_floors} pisos × {c.rooms_per_floor} dpto</span>
                                    <span>👥 {c.total_floors * c.rooms_per_floor} unidades</span>
                                    <span>⭐ {c.total_points} pts</span>
                                </div>
                                <button
                                    className={`btn btn-sm ${(c.is_active ?? true) ? 'btn-danger' : 'btn-accent'}`}
                                    disabled={actionBusy === c.id}
                                    onClick={() => toggleCommunity(c)}>
                                    {actionBusy === c.id ? '…' : (c.is_active ?? true) ? 'Suspender' : 'Reactivar'}
                                </button>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

function Stat({ icon, label, value, hint, className }: { icon: string; label: string; value: string; hint?: string; className?: string }) {
    return (
        <div className={`card ${className || ''}`} style={{ textAlign: 'center', padding: 14 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)', fontSize: 26 }}>{icon}</span>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
            {hint && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>}
        </div>
    );
}

export default SuperAdminPage;
