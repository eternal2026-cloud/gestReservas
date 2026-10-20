import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import type { User } from '../types';
import { useAnimeStagger } from '../components/useAnime';
import { Loader } from '../components/Loader';
import { UsersManager } from '../components/UsersManager';

interface SuperAdminPageProps {
    me: User;
    onBack: () => void;
    onToast: (msg: string) => void;
}

type Tab = 'overview' | 'users';

export function SuperAdminPage({ me, onBack, onToast }: SuperAdminPageProps) {
    const [tab, setTab] = useState<Tab>('overview');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const listRef = useAnimeStagger<HTMLDivElement>('.sa-row', {}, [tab, users.length]);

    const refresh = async () => {
        setLoading(true);
        try {
            setUsers(await api.getAllUsersWithDetails());
        } catch (e: any) {
            onToast('Error cargando datos: ' + (e.message || ''));
        }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    // ─── Stats ───

    const stats = {
        usuarios: users.length,
        admins: users.filter(u => u.role === 'ADMIN').length,
        usuariosActivos: users.filter(u => u.status === 'ACTIVO').length,
        inactivos: users.filter(u => u.status !== 'ACTIVO').length,
    };

    if (loading) return <Loader label="Cargando panel Super Admin" />;

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>

            <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--adr-naranja)' }}>shield_person</span>
                Panel Super Admin
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                Roles y estado de los colaboradores de Salas ADR. Las salas se gestionan en el Panel Admin.
            </p>

            {/* Tabs */}
            <div className="leaderboard-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                <button className={`leaderboard-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Resumen</button>
                <button className={`leaderboard-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Usuarios</button>
            </div>

            <div ref={listRef}>
                {tab === 'overview' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            <Stat className="sa-row" icon="group" label="Usuarios" value={`${stats.usuariosActivos}/${stats.usuarios}`} hint="activos / totales" />
                            <Stat className="sa-row" icon="badge" label="Administradores" value={String(stats.admins)} hint="rol ADMIN" />
                            <Stat className="sa-row" icon="person_off" label="Inactivos" value={String(stats.inactivos)} hint="sin acceso" />
                        </div>
                        <div className="card sa-row" style={{ padding: 16 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Tareas del Super Admin</h4>
                            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)' }}>
                                <li>Crear colaboradores con usuario y clave temporal (pestaña Usuarios)</li>
                                <li>Restablecer claves olvidadas sin enviar correos</li>
                                <li>Nombrar administradores de salas (rol Administrador)</li>
                                <li>Desactivar a quien ya no trabaja en ADR (no podrá ingresar)</li>
                                <li>Crear y gestionar salas desde el Panel Admin</li>
                            </ul>
                        </div>
                    </>
                )}

                {tab === 'users' && <UsersManager me={me} onToast={onToast} />}

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
