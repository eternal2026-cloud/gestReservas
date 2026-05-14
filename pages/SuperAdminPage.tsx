import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import type { User, Community, JoinRequest, UserRole } from '../types';
import { useAnimeStagger, pulse } from '../components/useAnime';
import { Loader } from '../components/Loader';

interface SuperAdminPageProps {
    onBack: () => void;
    onToast: (msg: string) => void;
}

type Tab = 'overview' | 'users' | 'communities' | 'requests';

const ROLE_LABEL: Record<UserRole, string> = {
    USER: 'Usuario',
    ADMIN: 'Administrador',
    SUPER_ADMIN: 'Super Admin',
};

function formatDate(iso?: string) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return iso.split('T')[0];
    }
}

export function SuperAdminPage({ onBack, onToast }: SuperAdminPageProps) {
    const [tab, setTab] = useState<Tab>('overview');
    const [users, setUsers] = useState<User[]>([]);
    const [communities, setCommunities] = useState<Community[]>([]);
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const listRef = useAnimeStagger<HTMLDivElement>('.sa-row', {}, [tab, users.length, communities.length, requests.length]);

    const refresh = async () => {
        setLoading(true);
        try {
            const [u, c, r] = await Promise.all([
                api.getAllUsersWithDetails(),
                api.getAllCommunitiesForSuperAdmin(),
                api.getAllPendingRequests(),
            ]);
            setUsers(u);
            setCommunities(c);
            setRequests(r);
        } catch (e: any) {
            onToast('Error cargando datos: ' + (e.message || ''));
        }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    // ─── Acciones sobre usuario ───

    const changeRole = async (u: User, role: UserRole) => {
        if (u.role === role) return;
        setActionBusy(u.id);
        try {
            const updated = await api.updateUserRoleByAdmin(u.id, role);
            await api.logAudit('USER_ROLE_CHANGED', 'user', u.id, { from: u.role, to: role, email: u.email });
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
            onToast(`Rol de ${u.email} → ${ROLE_LABEL[role]}`);
            pulse(`#sa-user-${u.id}`);
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo actualizar'));
        }
        setActionBusy(null);
    };

    const changeStatus = async (u: User, status: 'ACTIVO' | 'INACTIVO') => {
        if (u.status === status) return;
        setActionBusy(u.id);
        try {
            const updated = await api.updateUserStatusByAdmin(u.id, status);
            await api.logAudit(
                status === 'INACTIVO' ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
                'user', u.id, { email: u.email },
            );
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
            onToast(`${u.email} → ${status}`);
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
                'community', c.id, { name: c.name },
            );
            setCommunities(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
            onToast(`${c.name} → ${next ? 'ACTIVA' : 'INACTIVA'}`);
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo actualizar'));
        }
        setActionBusy(null);
    };

    const approveReq = async (r: JoinRequest) => {
        setActionBusy(r.id);
        try {
            await api.approveJoinRequest(r.id);
            await api.logAudit('JOIN_REQUEST_APPROVED', 'join_request', r.id, { email: r.user_email });
            setRequests(prev => prev.filter(x => x.id !== r.id));
            onToast(`✅ Solicitud de ${r.user_name} aprobada`);
            // Recargar usuarios para que aparezca el recién aprobado
            api.getAllUsersWithDetails().then(setUsers);
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo aprobar'));
        }
        setActionBusy(null);
    };

    const rejectReq = async (r: JoinRequest) => {
        const reason = window.prompt(`Razón del rechazo para ${r.user_name} (opcional):`, '') || undefined;
        setActionBusy(r.id);
        try {
            await api.rejectJoinRequest(r.id, reason, 'Super Admin');
            await api.logAudit('JOIN_REQUEST_REJECTED', 'join_request', r.id, { email: r.user_email });
            setRequests(prev => prev.filter(x => x.id !== r.id));
            onToast('Solicitud rechazada');
        } catch (e: any) {
            onToast('Error: ' + (e.message || 'No se pudo rechazar'));
        }
        setActionBusy(null);
    };

    // ─── Stats ───

    const stats = {
        usuarios: users.length,
        admins: users.filter(u => u.role === 'ADMIN').length,
        usuariosActivos: users.filter(u => u.status === 'ACTIVO').length,
        comunidades: communities.length,
        comunidadesActivas: communities.filter(c => c.is_active ?? true).length,
        solicitudes: requests.length,
    };

    const filteredUsers = users.filter(u => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            u.name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.apartment?.toLowerCase().includes(q) ||
            u.tower?.toLowerCase().includes(q) ||
            (u.community?.name || '').toLowerCase().includes(q)
        );
    });

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
                Gestión global: usuarios, comunidades y solicitudes de la plataforma.
            </p>

            {/* Tabs */}
            <div className="leaderboard-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                <button className={`leaderboard-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>📊 Resumen</button>
                <button className={`leaderboard-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>👥 Usuarios</button>
                <button className={`leaderboard-tab ${tab === 'communities' ? 'active' : ''}`} onClick={() => setTab('communities')}>🏢 Comunidades</button>
                <button className={`leaderboard-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
                    📨 Solicitudes{stats.solicitudes > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, fontSize: 10 }}>{stats.solicitudes}</span>}
                </button>
            </div>

            <div ref={listRef}>
                {tab === 'overview' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            <Stat className="sa-row" icon="apartment" label="Comunidades" value={`${stats.comunidadesActivas}/${stats.comunidades}`} hint="activas / totales" />
                            <Stat className="sa-row" icon="group" label="Usuarios" value={`${stats.usuariosActivos}/${stats.usuarios}`} hint="activos / totales" />
                            <Stat className="sa-row" icon="badge" label="Administradores" value={String(stats.admins)} hint="rol ADMIN" />
                            <Stat className="sa-row" icon="mail" label="Solicitudes" value={String(stats.solicitudes)} hint="pendientes" />
                        </div>
                        <div className="card sa-row" style={{ padding: 16 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📌 Tareas del Super Admin</h4>
                            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)' }}>
                                <li>Editar rol y estado de cualquier usuario (pestaña Usuarios)</li>
                                <li>Aprobar o rechazar solicitudes pendientes de cualquier comunidad</li>
                                <li>Suspender o reactivar comunidades en mora</li>
                                <li>Acceso global a todos los datos de la plataforma</li>
                            </ul>
                        </div>
                    </>
                )}

                {tab === 'users' && (
                    <>
                        <input
                            className="input sa-row"
                            placeholder="🔎 Buscar por nombre, correo, depto, torre o comunidad…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ marginBottom: 12 }}
                        />
                        <p className="sa-row" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                            Mostrando {filteredUsers.length} de {users.length} usuarios
                        </p>
                        <div className="sa-row" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1000 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-2)', textAlign: 'left' }}>
                                        <Th>Nombre</Th>
                                        <Th>Correo</Th>
                                        <Th>Rol</Th>
                                        <Th>Comunidad</Th>
                                        <Th>Depto</Th>
                                        <Th>Tipo</Th>
                                        <Th>Administrador</Th>
                                        <Th>Fecha unión</Th>
                                        <Th>Estado</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.length === 0 ? (
                                        <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>Sin usuarios</td></tr>
                                    ) : filteredUsers.map(u => {
                                        const comm = u.community as any;
                                        const tipo = comm?.community_type
                                            ? (comm.community_type === 'EDIFICIO' ? 'Edificio'
                                                : comm.community_type === 'CONDOMINIO' ? 'Condominio'
                                                : 'Multifamiliar')
                                            : '—';
                                        const adminEmail = comm?.admin_email || '—';
                                        return (
                                            <tr key={u.id} id={`sa-user-${u.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                                                <Td>{u.name || '—'}</Td>
                                                <Td title={u.email}>{u.email}</Td>
                                                <Td>
                                                    <select
                                                        className="input"
                                                        value={u.role}
                                                        disabled={actionBusy === u.id}
                                                        onChange={e => changeRole(u, e.target.value as UserRole)}
                                                        style={{ padding: '4px 6px', fontSize: 12, minWidth: 110 }}>
                                                        <option value="USER">{ROLE_LABEL.USER}</option>
                                                        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                                                        <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
                                                    </select>
                                                </Td>
                                                <Td>{comm?.name || '—'}</Td>
                                                <Td>{u.tower ? `${u.tower} · ${u.apartment || '—'}` : (u.apartment || '—')}</Td>
                                                <Td>{tipo}</Td>
                                                <Td title={adminEmail} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminEmail}</Td>
                                                <Td>{formatDate(u.created_at)}</Td>
                                                <Td>
                                                    <select
                                                        className="input"
                                                        value={u.status}
                                                        disabled={actionBusy === u.id}
                                                        onChange={e => changeStatus(u, e.target.value as 'ACTIVO' | 'INACTIVO')}
                                                        style={{ padding: '4px 6px', fontSize: 12, minWidth: 100, color: u.status === 'ACTIVO' ? 'var(--accent)' : 'var(--danger)' }}>
                                                        <option value="ACTIVO">ACTIVO</option>
                                                        <option value="INACTIVO">INACTIVO</option>
                                                    </select>
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="sa-row" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                            Tip: el cambio de rol y estado es inmediato. Para promover a Administrador, asegúrate de que el usuario ya tenga comunidad asignada.
                        </p>
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

                {tab === 'requests' && (
                    <>
                        {requests.length === 0 ? (
                            <div className="card sa-row" style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>inbox</span>
                                <p style={{ marginTop: 8, fontSize: 13 }}>No hay solicitudes pendientes</p>
                            </div>
                        ) : requests.map(r => {
                            const commName = (r.community as any)?.name || '—';
                            return (
                                <div key={r.id} className="card sa-row" style={{ marginBottom: 8, padding: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <h4 style={{ fontSize: 14, fontWeight: 700 }}>{r.user_name}</h4>
                                        {r.ticket_code && (
                                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--primary-light)' }}>
                                                {r.ticket_code}
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.user_email}</p>
                                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                                        🏢 {commName} {r.tower ? `· ${r.tower}` : ''} {r.unit ? `· Dpto ${r.unit}` : ''}
                                    </p>
                                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                        Solicitada el {formatDate(r.created_at)}
                                    </p>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button className="btn btn-accent btn-sm" disabled={actionBusy === r.id} onClick={() => approveReq(r)}>
                                            {actionBusy === r.id ? '…' : 'Aprobar'}
                                        </button>
                                        <button className="btn btn-danger btn-sm" disabled={actionBusy === r.id} onClick={() => rejectReq(r)}>
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
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

function Th({ children }: { children: React.ReactNode }) {
    return <th style={{ padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{children}</th>;
}

function Td({ children, title, style }: { children: React.ReactNode; title?: string; style?: React.CSSProperties }) {
    return <td title={title} style={{ padding: '8px', fontSize: 12, color: 'var(--text-1)', verticalAlign: 'middle', ...(style || {}) }}>{children}</td>;
}

export default SuperAdminPage;
