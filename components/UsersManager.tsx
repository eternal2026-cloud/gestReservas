import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import type { User, UserRole } from '../types';
import { ADR_AREAS, ADR_CARGOS_SUGERIDOS } from '../services/structure';

// Gestión de colaboradores estilo Integra Operaciones: el admin crea la cuenta
// (usuario + clave temporal), la restablece y la activa/desactiva. Sin correos.

const ROLE_LABEL: Record<UserRole, string> = {
    USER: 'Colaborador',
    ADMIN: 'Administrador',
    SUPER_ADMIN: 'Super Admin',
};

type Form = { usuario: string; nombre: string; area: string; cargo: string; rol: UserRole; password: string };
const EMPTY: Form = { usuario: '', nombre: '', area: '', cargo: '', rol: 'USER', password: '' };

/** Sugerencia de usuario a partir del nombre: "Juan Pérez Soto" → "juan.perez". */
function sugerirUsuario(nombre: string): string {
    const partes = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);
    return partes.length ? partes.slice(0, 2).join('.') : '';
}

const loginOf = (u: User) => u.username || u.email;

export function UsersManager({ me, onToast }: { me: User; onToast: (m: string) => void }) {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<Form>(EMPTY);
    const [busy, setBusy] = useState<string | null>(null);
    const [credenciales, setCredenciales] = useState<{ nombre: string; usuario: string; password: string } | null>(null);

    const isSuper = me.role === 'SUPER_ADMIN';
    const canTouch = (u: User) => isSuper || u.role !== 'SUPER_ADMIN';

    const refresh = async () => {
        setLoading(true);
        try { setUsers(await api.getAllUsersWithDetails()); } catch (e: any) { onToast('Error: ' + api.friendlyError(e)); }
        setLoading(false);
    };
    useEffect(() => { refresh(); }, []);

    const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }));

    const openNew = () => { setEditId(null); setForm(EMPTY); setShowForm(true); setCredenciales(null); };
    const openEdit = (u: User) => {
        setEditId(u.id);
        setForm({ usuario: u.username || '', nombre: u.name, area: u.apartment || '', cargo: u.cargo || '', rol: u.role, password: '' });
        setShowForm(true);
        window.scrollTo(0, 0);
    };
    const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); };

    const save = async () => {
        if (!form.nombre.trim()) { onToast('Escribe el nombre del colaborador'); return; }
        if (!editId && !form.usuario.trim()) { onToast('Escribe el usuario de ingreso'); return; }
        setBusy('form');
        try {
            if (editId) {
                const body: Record<string, unknown> = { accion: 'actualizar', id: editId, nombre: form.nombre, area: form.area, cargo: form.cargo };
                if (form.usuario.trim()) body.usuario = form.usuario;
                const r = await api.adminUsuarios(body);
                if (r.perfil) setUsers(prev => prev.map(x => x.id === editId ? { ...x, ...r.perfil } : x));
                onToast('Colaborador actualizado');
            } else {
                const r = await api.adminUsuarios({ accion: 'crear', ...form, password: form.password || undefined });
                if (r.perfil) setUsers(prev => [r.perfil!, ...prev]);
                setCredenciales({ nombre: form.nombre.trim(), usuario: r.usuario || form.usuario, password: r.password || '' });
            }
            closeForm();
        } catch (e: any) { onToast('Error: ' + api.friendlyError(e)); }
        setBusy(null);
    };

    const resetPassword = async (u: User) => {
        if (!confirm(`¿Generar una clave temporal nueva para ${u.name}? La actual dejará de funcionar.`)) return;
        setBusy(u.id);
        try {
            const r = await api.adminUsuarios({ accion: 'reset', id: u.id });
            setCredenciales({ nombre: u.name, usuario: r.usuario || loginOf(u), password: r.password || '' });
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, must_change_password: true } : x));
            window.scrollTo(0, 0);
        } catch (e: any) { onToast('Error: ' + api.friendlyError(e)); }
        setBusy(null);
    };

    const update = async (u: User, cambios: Record<string, unknown>, okMsg: string) => {
        setBusy(u.id);
        try {
            const r = await api.adminUsuarios({ accion: 'actualizar', id: u.id, ...cambios });
            if (r.perfil) setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...r.perfil } : x));
            onToast(okMsg);
        } catch (e: any) { onToast('Error: ' + api.friendlyError(e)); }
        setBusy(null);
    };

    const copy = (text: string) => {
        navigator.clipboard?.writeText(text).then(() => onToast('Copiado'), () => {});
    };

    const q = search.trim().toLowerCase();
    const filtered = users.filter(u => !q || [u.name, u.username, u.email, u.apartment, u.cargo]
        .some(v => v?.toLowerCase().includes(q)));

    const label = (t: string) => <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>{t}</label>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Colaboradores ({users.length})</h2>
                <button className="btn btn-primary btn-sm" onClick={() => showForm ? closeForm() : openNew()}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showForm ? 'close' : 'person_add'}</span>
                    {showForm ? 'Cancelar' : 'Nuevo'}
                </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Cada colaborador entra con su <strong>usuario</strong> y una clave temporal que cambia al primer ingreso.
                Si olvida su clave, restablécela aquí: no se envían correos.
            </p>

            {credenciales && (
                <div className="card" style={{ marginBottom: 16, padding: 16, border: '1px solid var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Credenciales de {credenciales.nombre}</h4>
                        <button className="icon-btn" onClick={() => setCredenciales(null)} title="Cerrar">
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 10px', alignItems: 'center', fontSize: 14 }}>
                        <span style={{ color: 'var(--text-3)' }}>Usuario</span>
                        <code style={{ fontWeight: 700 }}>{credenciales.usuario}</code>
                        <button className="btn btn-ghost btn-sm" onClick={() => copy(credenciales.usuario)}>Copiar</button>
                        <span style={{ color: 'var(--text-3)' }}>Clave temporal</span>
                        <code style={{ fontWeight: 700, color: 'var(--accent)' }}>{credenciales.password}</code>
                        <button className="btn btn-ghost btn-sm" onClick={() => copy(credenciales.password)}>Copiar</button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
                        Entrégaselas en persona o por mensaje. Al ingresar se le pedirá crear su propia contraseña.
                        Esta clave no se vuelve a mostrar.
                    </p>
                </div>
            )}

            {showForm && (
                <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{editId ? 'Editar colaborador' : 'Nuevo colaborador'}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            {label('Nombres y apellidos')}
                            <input className="input" value={form.nombre} maxLength={80}
                                onChange={e => {
                                    const nombre = e.target.value;
                                    setForm(f => ({ ...f, nombre, usuario: !editId && (!f.usuario || f.usuario === sugerirUsuario(f.nombre)) ? sugerirUsuario(nombre) : f.usuario }));
                                }} />
                        </div>
                        <div>
                            {label(editId ? 'Usuario (vacío = no cambiar)' : 'Usuario de ingreso')}
                            <input className="input" value={form.usuario} placeholder="ej. juan.perez" autoCapitalize="none" spellCheck={false}
                                onChange={e => set('usuario', e.target.value.toLowerCase())} />
                        </div>
                        {!editId && (
                            <div>
                                {label('Rol')}
                                <select className="input" value={form.rol} onChange={e => set('rol', e.target.value)}>
                                    <option value="USER">{ROLE_LABEL.USER}</option>
                                    <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                                    {isSuper && <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>}
                                </select>
                            </div>
                        )}
                        <div>
                            {label('Área')}
                            <select className="input" value={form.area} onChange={e => set('area', e.target.value)}>
                                <option value="">Sin área</option>
                                {ADR_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div>
                            {label('Cargo')}
                            <input className="input" list="um-cargos" value={form.cargo} maxLength={80} onChange={e => set('cargo', e.target.value)} />
                            <datalist id="um-cargos">{ADR_CARGOS_SUGERIDOS.map(c => <option key={c} value={c} />)}</datalist>
                        </div>
                        {!editId && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                {label('Clave inicial (opcional — vacío genera una temporal)')}
                                <input className="input" type="text" value={form.password} autoComplete="off" placeholder="Mínimo 6 caracteres"
                                    onChange={e => set('password', e.target.value)} />
                            </div>
                        )}
                    </div>
                    <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} onClick={save} disabled={busy === 'form'}>
                        {busy === 'form' ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear colaborador'}
                    </button>
                </div>
            )}

            <input className="input" placeholder="Buscar por nombre, usuario, área o cargo…" value={search}
                onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

            {loading ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando…</p> :
                filtered.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin colaboradores</p> :
                    filtered.map(u => {
                        const touch = canTouch(u);
                        const self = u.id === me.id;
                        return (
                            <div key={u.id} className="card" style={{ marginBottom: 8, padding: 12, opacity: u.status === 'ACTIVO' ? 1 : 0.6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="avatar">{u.avatar_url ? <img src={u.avatar_url} alt="" /> : (u.name?.[0] || '?')}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h4 style={{ fontSize: 14 }}>{u.name} {self && <span style={{ color: 'var(--accent)', fontSize: 11 }}>(tú)</span>}</h4>
                                        <p style={{ fontSize: 12, color: 'var(--primary-light)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loginOf(u)}</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{[u.apartment, u.cargo].filter(Boolean).join(' · ') || 'Sin área / cargo'}</p>
                                    </div>
                                    {u.must_change_password && <span className="badge badge-warning" style={{ fontSize: 10 }}>Clave temporal</span>}
                                </div>
                                {touch && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <select className="input" value={u.role} disabled={busy === u.id || self}
                                            onChange={e => update(u, { rol: e.target.value }, `Rol → ${ROLE_LABEL[e.target.value as UserRole]}`)}
                                            style={{ padding: '4px 6px', fontSize: 12, width: 'auto' }}>
                                            <option value="USER">{ROLE_LABEL.USER}</option>
                                            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                                            {(isSuper || u.role === 'SUPER_ADMIN') && <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>}
                                        </select>
                                        <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => openEdit(u)}>Editar</button>
                                        <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => resetPassword(u)}>Restablecer clave</button>
                                        {!self && (
                                            <button className={`btn btn-sm ${u.status === 'ACTIVO' ? 'btn-danger' : 'btn-accent'}`} disabled={busy === u.id}
                                                onClick={() => update(u, { activo: u.status !== 'ACTIVO' }, u.status === 'ACTIVO' ? 'Colaborador desactivado' : 'Colaborador activado')}>
                                                {u.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
            }
        </div>
    );
}

export default UsersManager;
