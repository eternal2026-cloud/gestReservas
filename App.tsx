import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import * as api from './services/api';
import type { User, Community, Amenity, Reservation, Post, ThemeMode, AppView } from './types';
import { getUserLevel, POINT_ACTIONS } from './types';
import { supabase } from './services/supabase';
import { Loader } from './components/Loader';
import { ViewTransition } from './components/ViewTransition';
import { Splash } from './components/Splash';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { SanctionsPage } from './pages/SanctionsPage';
import { UsersManager } from './components/UsersManager';
import { IconForum, IconHeart, IconComment, IconPhoto, IconBug, IconClose, IconSend, IconMegaphone } from './components/Icons';
import {
    ADR_AREAS, ADR_CARGOS_SUGERIDOS, ROOM_TYPES, ROOM_EQUIPMENT, TIME_SLOTS,
    roomTypeLabel, peruNow, peruTodayISO, MAX_SLOTS_PER_DAY, bookingMaxDateISO, addDaysISO, shortDayLabel,
} from './services/structure';
import { AdrMark, AdrLogo } from './components/AdrLogo';
import anime from 'animejs';


// ─── Context ───
interface AppCtx {
    user: User | null;
    setUser: (u: User | null) => void;
    refreshUser: () => Promise<void>;
    theme: ThemeMode;
    toggleTheme: () => void;
    view: AppView;
    go: (v: AppView, data?: any) => void;
    viewData: any;
    toast: (msg: string) => void;
}
const Ctx = createContext<AppCtx>({} as AppCtx);
const useApp = () => useContext(Ctx);

// En ADR el Super Admin también administra salas.
const isAdminRole = (u: User | null) => u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN';
const DEFAULT_ROOM_IMG = 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800';

// Chips de equipamiento de una sala
function EquipmentChips({ equipment, small }: { equipment?: string[]; small?: boolean }) {
    if (!equipment || equipment.length === 0) return null;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ROOM_EQUIPMENT.filter(e => equipment.includes(e.key)).map(e => (
                <span key={e.key} className="badge badge-primary" style={{ fontSize: small ? 10 : 11, gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: small ? 12 : 14 }}>{e.icon}</span>{e.label}
                </span>
            ))}
        </div>
    );
}

// Cuando LoginPage maneja el alta/inicio de sesión manualmente, el listener
// global de auth no debe duplicar la carga/creación del perfil.
let manualAuthInProgress = false;

// ─── Toast ───
function Toast({ msg, onClose, duration = 3000 }: { msg: string; onClose: () => void; duration?: number }) {
    useEffect(() => { const t = setTimeout(onClose, duration); return () => clearTimeout(t); }, []);
    return <div className="toast">{msg}</div>;
}


// ─── App Shell ───
export default function App() {
    const [splashDone, setSplashDone] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [theme, setTheme] = useState<ThemeMode>(() =>
        (localStorage.getItem('salas-adr-theme') as ThemeMode) || 'dark'
    );
    const [view, setView] = useState<AppView>('login');
    const [viewData, setViewData] = useState<any>(null);
    const [toastMsg, setToastMsg] = useState('');
    const [rejectionToast, setRejectionToast] = useState<{ msg: string; id: string } | null>(null);
    const checkedRejections = useRef(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('salas-adr-theme', theme);
    }, [theme]);

    // Check rejection messages when user logs in
    useEffect(() => {
        if (!user || checkedRejections.current) return;
        checkedRejections.current = true;
        api.getRejectionMessagesForEmail(user.email).then(msgs => {
            if (msgs.length > 0) {
                const latest = msgs[0];
                setRejectionToast({
                    msg: `❌ Tu solicitud fue rechazada.\n${latest.admin_name || 'El administrador'} dijo: "${latest.message}"`,
                    id: latest.id
                });
            }
        });
    }, [user]);

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
    const go = (v: AppView, data?: any) => { setView(v); setViewData(data); window.scrollTo(0, 0); };
    const toast = (msg: string) => setToastMsg(msg);

    // Refresca el user actual desde BD. Lo invocamos tras awardPoints para que
    // el badge de puntos del Home/Perfil refleje la nueva suma sin tener que
    // cerrar sesión.
    const refreshUser = async () => {
        if (!user?.id) return;
        const fresh = await api.refreshUserById(user.id);
        if (fresh) setUser(fresh);
    };

    // userRef evita el cierre obsoleto (stale closure) dentro del listener de
    // auth, que se suscribe una sola vez al montar.
    const userRef = useRef<User | null>(null);
    useEffect(() => { userRef.current = user; }, [user]);

    // ── Restaura la sesión al recargar la página. Las cuentas las crea el
    // admin (Edge Function admin-usuarios), así que aquí no se crean perfiles.
    // IMPORTANTE: no usar await dentro del callback de onAuthStateChange:
    // supabase-js mantiene un lock mientras corre el callback y cualquier
    // consulta interna se bloquea (deadlock: la app se cuelga al iniciar
    // sesión). El trabajo asíncrono se difiere con setTimeout.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === 'SIGNED_OUT') {
                    checkedRejections.current = false;
                    setUser(null);
                    setView('login');
                    return;
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
                    const authUser = session.user;
                    setTimeout(async () => {
                        if (userRef.current || manualAuthInProgress) return;
                        try {
                            const profile = await api.getUserByAuthId(authUser.id);
                            if (!profile || profile.status !== 'ACTIVO') { await supabase.auth.signOut(); return; }
                            setUser(profile);
                            setView(v => profile.must_change_password ? 'change-password' : v === 'login' ? 'home' : v);
                        } catch (e) {
                            console.error('No se pudo cargar el perfil:', e);
                        }
                    }, 0);
                }
            },
        );
        return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const ctx: AppCtx = { user, setUser, refreshUser, theme, toggleTheme, view, go, viewData, toast };

    return (
        <Ctx.Provider value={ctx}>
            {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
            <div className="app-container">
                {view === 'login' ? <LoginPage /> : view === 'change-password' && user?.must_change_password ? <ChangePasswordPage forced /> : (
                    <>
                        <TopBar />
                        <div className="main-content">
                            <ViewTransition viewKey={view} direction={view === 'home' ? 'scale' : 'up'}>
                                {view === 'home' && <HomePage />}
                                {view === 'amenities' && <AmenitiesPage />}
                                {view === 'availability' && <AvailabilityPage />}
                                {view === 'amenity-detail' && <AmenityDetailPage />}
                                {view === 'booking' && <BookingPage />}
                                {view === 'my-reservations' && <MyReservationsPage />}
                                {view === 'community' && <CommunityPage />}
                                {view === 'leaderboard' && <LeaderboardPage />}
                                {view === 'profile' && <ProfilePage />}
                                {view === 'admin' && <AdminPage />}
                                {view === 'change-password' && <ChangePasswordPage />}
                                {view === 'super-admin' && user?.role === 'SUPER_ADMIN' && (
                                    <SuperAdminPage me={user} onBack={() => go('home')} onToast={toast} />
                                )}
                            </ViewTransition>
                        </div>
                        <BottomNav />
                    </>
                )}
                {toastMsg && <Toast msg={toastMsg} onClose={() => setToastMsg('')} />}
                {rejectionToast && (
                    <div className="toast" style={{
                        background: 'var(--danger)',
                        whiteSpace: 'pre-line',
                        lineHeight: 1.5,
                        maxWidth: 320,
                        padding: '14px 18px'
                    }}>
                        {rejectionToast.msg}
                        <button onClick={() => {
                            api.deleteRejectionMessage(rejectionToast.id);
                            setRejectionToast(null);
                        }} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                    </div>
                )}
            </div>
        </Ctx.Provider>
    );
}


// ─── TopBar ───
function TopBar() {
    const { toggleTheme, theme, go, user } = useApp();
    return (
        <div className="top-bar">
            <div className="logo" style={{ cursor: 'pointer' }} onClick={() => go('home')}>
                <AdrLogo size={38} />
            </div>
            <div className="top-bar-actions">
                <button className="icon-btn" onClick={toggleTheme}>
                    <span className="material-symbols-outlined">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
                </button>
                {isAdminRole(user) && (
                    <button className="icon-btn" onClick={() => go('admin')} title="Panel Admin">
                        <span className="material-symbols-outlined">admin_panel_settings</span>
                    </button>
                )}
                {user?.role === 'SUPER_ADMIN' && (
                    <button className="icon-btn" onClick={() => go('super-admin')} title="Panel Super Admin"
                        style={{ color: 'var(--adr-naranja)' }}>
                        <span className="material-symbols-outlined">shield_person</span>
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── BottomNav ───
function BottomNav() {
    const { view, go, user } = useApp();
    const hasCommunity = !!user?.community_id;
    const items: { icon: string; label: string; view: AppView; needsCommunity?: boolean }[] = [
        { icon: 'home', label: 'Inicio', view: 'home' },
        { icon: 'meeting_room', label: 'Salas', view: 'amenities', needsCommunity: true },
        { icon: 'view_timeline', label: 'Agenda', view: 'availability', needsCommunity: true },
        { icon: 'calendar_month', label: 'Reservas', view: 'my-reservations', needsCommunity: true },
        { icon: 'person', label: 'Perfil', view: 'profile' },
    ];
    return (
        <div className="bottom-nav">
            {items.map(i => (
                <button key={i.view} className={`nav-item ${view === i.view ? 'active' : ''} ${i.needsCommunity && !hasCommunity ? 'disabled' : ''}`}
                    onClick={() => { if (i.needsCommunity && !hasCommunity) return; go(i.view); }}
                    style={i.needsCommunity && !hasCommunity ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
                    <span className="material-symbols-outlined">{i.icon}</span>
                    {i.label}
                </button>
            ))}
        </div>
    );
}

// ─── LoginPage ───
// Usuario + contraseña (estilo Integra Operaciones). Sin registro ni correos:
// el admin crea la cuenta y restablece la clave cuando alguien la olvida.
function LoginPage() {
    const { setUser, go } = useApp();
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showHelp, setShowHelp] = useState(false);

    // Animación de entrada visible al cargar
    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!cardRef.current) return;
        const tl = anime.timeline({ easing: 'easeOutCubic' });
        tl.add({
            targets: cardRef.current.querySelector('.login-logo svg'),
            scale: [0, 1],
            rotate: [-180, 0],
            duration: 800,
            easing: 'spring(1, 80, 10, 0)',
        })
        .add({
            targets: cardRef.current.querySelector('.login-logo h1'),
            opacity: [0, 1],
            translateY: [16, 0],
            duration: 500,
        }, '-=500')
        .add({
            targets: cardRef.current.querySelector('.login-logo p'),
            opacity: [0, 1],
            translateY: [10, 0],
            duration: 400,
        }, '-=300')
        .add({
            targets: cardRef.current.querySelectorAll('.login-form > div, .login-form button'),
            opacity: [0, 1],
            translateX: [-20, 0],
            delay: anime.stagger(80),
            duration: 420,
        }, '-=200')
        .add({
            targets: cardRef.current.querySelectorAll('.login-bg-orb'),
            scale: [0.5, 1],
            opacity: [0, 0.7],
            duration: 800,
        }, '-=600');
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        manualAuthInProgress = true;
        try {
            const { user: authUser } = await api.signIn(usuario, password);
            const profile = authUser ? await api.getUserByAuthId(authUser.id) : null;
            if (!profile) {
                await supabase.auth.signOut();
                throw new Error('Tu cuenta no tiene perfil en Salas ADR. Contacta al administrador.');
            }
            if (profile.status !== 'ACTIVO') {
                await supabase.auth.signOut();
                throw new Error('Este usuario está desactivado. Contacta al administrador.');
            }
            setUser(profile);
            go(profile.must_change_password ? 'change-password' : 'home');
        } catch (err: any) {
            setError(api.friendlyError(err));
        } finally {
            manualAuthInProgress = false;
        }
        setLoading(false);
    };

    return (
        <div className="login-container" ref={cardRef}>
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card">
                <div className="login-logo">
                    <AdrMark size={96} />
                    <h1>Salas ADR</h1>
                    <p>Salas de reunión de Agrícola Don Ricardo</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px', whiteSpace: 'normal', textAlign: 'center' }}>{error}</div>}
                <form className="login-form" onSubmit={handleSubmit}>
                    <div>
                        <label>Usuario</label>
                        <input className="input" placeholder="ej. juan.perez" autoComplete="username" autoCapitalize="none" spellCheck={false}
                            value={usuario} onChange={e => setUsuario(e.target.value)} required />
                    </div>
                    <div>
                        <label>Contraseña</label>
                        <input className="input" type="password" placeholder="••••••••" autoComplete="current-password"
                            value={password} onChange={e => setPassword(e.target.value)} required />
                        <div style={{ textAlign: 'right', marginTop: 6 }}>
                            <button type="button" onClick={() => setShowHelp(h => !h)}
                                style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                                ¿Olvidaste tu clave o no tienes cuenta?
                            </button>
                        </div>
                    </div>
                    {showHelp && (
                        <div className="card" style={{ padding: 12, fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>
                            Las cuentas las crea el <strong>administrador de salas</strong>. Pídele tu usuario o que
                            restablezca tu clave: te dará una temporal y al entrar crearás la tuya.
                        </div>
                    )}
                    <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? 'Ingresando…' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── ChangePasswordPage ───
// forced: primer ingreso o clave restablecida por el admin (no puede saltarlo).
// Sin forced: el colaborador cambia su clave desde Perfil.
function ChangePasswordPage({ forced }: { forced?: boolean }) {
    const { user, setUser, go, toast } = useApp();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (password.length < 6) { setError('La clave debe tener al menos 6 caracteres'); return; }
        if (password !== confirm) { setError('Las claves no coinciden'); return; }
        setLoading(true);
        setError('');
        try {
            const updated = await api.changeOwnPassword(user.id, password);
            setUser({ ...user, ...updated });
            toast('Contraseña actualizada');
            go('home');
        } catch (e: any) {
            setError(api.friendlyError(e));
        }
        setLoading(false);
    };

    const form = (
        <>
            {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
            <form className="login-form" onSubmit={handleSave}>
                <div><label>Nueva contraseña</label><input className="input" type="password" autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required /></div>
                <div><label>Repite la contraseña</label><input className="input" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
                <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                    {loading ? 'Guardando…' : forced ? 'Guardar y continuar' : 'Guardar nueva clave'}
                </button>
            </form>
        </>
    );

    if (!forced) return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('profile')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Perfil
            </button>
            <h2 className="section-title">Cambiar contraseña</h2>
            <div className="card" style={{ padding: 16 }}>{form}</div>
        </div>
    );

    return (
        <div className="login-container">
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card">
                <div className="login-logo">
                    <AdrMark size={96} />
                    <h1>¡Bienvenido{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</h1>
                    <p>Por seguridad, crea tu propia contraseña antes de continuar</p>
                </div>
                {form}
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>
                    Salir
                </button>
            </div>
        </div>
    );
}

// ─── HomePage ───
function HomePage() {
    const { user, go } = useApp();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [todayBusy, setTodayBusy] = useState<Reservation[]>([]);
    const level = getUserLevel(user?.points || 0);
    const hasCommunity = !!user?.community_id;
    const today = peruTodayISO();
    const nowHour = peruNow().getHours();

    useEffect(() => {
        if (user && hasCommunity) {
            api.getUserReservations(user.id).then(r => setReservations(
                r.filter(x => x.status === 'ACTIVA' && x.date >= today)
                    .sort((a, b) => (a.date + a.time_slot).localeCompare(b.date + b.time_slot))
                    .slice(0, 3)));
            api.getAmenities(user.community_id).then(setAmenities);
            api.getReservationsByDate(today).then(setTodayBusy).catch(() => setTodayBusy([]));
        }
    }, [user]);

    // Sala libre "ahora mismo" = sin reserva en el bloque horario actual
    const currentSlot = TIME_SLOTS.find(s => parseInt(s, 10) === nowHour);
    const freeNow = currentSlot
        ? amenities.filter(a => !todayBusy.some(r => r.amenity_id === a.id && r.time_slot === currentSlot)).length
        : null;

    return (
        <div className="fade-in">
            <div style={{ marginBottom: 24 }}>
                <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Hola,</p>
                <h2 style={{ fontSize: 26, fontWeight: 800 }}>{user?.name || 'Colaborador'}</h2>
                {(user?.cargo || user?.apartment) && (
                    <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
                        {[user?.cargo, user?.apartment].filter(Boolean).join(' · ')}
                    </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span className="badge badge-primary">{level.icon} {level.name}</span>
                    <span className="badge badge-accent">{user?.points || 0} pts</span>
                </div>
            </div>

            {!hasCommunity ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--warning)' }}>hourglass_top</span>
                    <h3 style={{ margin: '12px 0 8px' }}>Cuenta en configuración</h3>
                    <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
                        Tu cuenta aún no está vinculada a ADR. Pide al administrador de salas que la habilite.
                    </p>
                </div>
            ) : (
                <>
                    {/* Estado de las salas ahora */}
                    {freeNow !== null && amenities.length > 0 && (
                        <div className="card stagger-item" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }} onClick={() => go('availability')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 30, color: freeNow > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {freeNow > 0 ? 'event_available' : 'event_busy'}
                            </span>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: 14 }}>{freeNow} de {amenities.length} salas libres ahora</h4>
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Bloque {currentSlot} · ver agenda del día</p>
                            </div>
                            <span className="material-symbols-outlined" style={{ color: 'var(--text-3)' }}>chevron_right</span>
                        </div>
                    )}

                    {/* Accesos rápidos */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                            { icon: 'add_circle', color: 'var(--primary-light)', title: 'Reservar sala', sub: 'Elige sala y horario', v: 'amenities' as AppView },
                            { icon: 'view_timeline', color: 'var(--accent)', title: 'Agenda', sub: 'Ocupación por día', v: 'availability' as AppView },
                            { icon: 'forum', color: 'var(--adr-naranja)', title: 'Muro', sub: 'Avisos internos', v: 'community' as AppView },
                            { icon: 'leaderboard', color: 'var(--primary-light)', title: 'Ranking', sub: 'Buen uso de salas', v: 'leaderboard' as AppView },
                        ].map(q => (
                            <div key={q.v} className="card stagger-item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => go(q.v)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: q.color }}>{q.icon}</span>
                                <div>
                                    <h4 style={{ fontSize: 14 }}>{q.title}</h4>
                                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{q.sub}</p>
                                </div>
                            </div>
                        ))}
                        {isAdminRole(user) && (
                            <div className="card stagger-item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--primary-light)', gridColumn: '1 / -1' }} onClick={() => go('admin')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--adr-naranja)' }}>admin_panel_settings</span>
                                <div>
                                    <h4 style={{ fontSize: 14 }}>Panel de administración</h4>
                                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Crear salas, auditoría, reglas y colaboradores</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Próximas reuniones */}
                    <div className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>event</span> Mis próximas reuniones</div>
                    {reservations.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
                            <p>No tienes reuniones programadas</p>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => go('amenities')}>Reservar ahora</button>
                        </div>
                    ) : reservations.map(r => (
                        <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => go('my-reservations')}>
                            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--primary-glow)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-light)' }}>{r.time_slot.slice(0, 5)}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.date === today ? 'Hoy' : r.date.slice(5).split('-').reverse().join('/')}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>{r.amenity?.name || 'Sala'}</h4>
                                {r.motivo && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{r.motivo}</p>}
                                {r.amenity?.location && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>📍 {r.amenity.location}</p>}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

// ─── AmenitiesPage ───
function AmenitiesPage() {
    const { user, go } = useApp();
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [loading, setLoading] = useState(true);
    const [minCap, setMinCap] = useState(0);
    const [needs, setNeeds] = useState<string[]>([]);

    useEffect(() => {
        api.getAmenities(user?.community_id).then(a => { setAmenities(a); setLoading(false); });
    }, [user]);

    const toggleNeed = (k: string) => setNeeds(n => n.includes(k) ? n.filter(x => x !== k) : [...n, k]);
    const filtered = amenities.filter(a =>
        (a.capacity || 0) >= minCap && needs.every(k => (a.equipment || []).includes(k)));

    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>meeting_room</span> Salas de reunión</h2>

            {/* Filtros: asistentes y equipamiento */}
            <div className="card" style={{ marginBottom: 16, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[0, 4, 8, 15, 30].map(c => (
                        <button key={c} className={`btn btn-sm ${minCap === c ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '6px 10px' }}
                            onClick={() => setMinCap(c)}>{c === 0 ? 'Todas' : `${c}+ pers.`}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ROOM_EQUIPMENT.slice(0, 4).map(e => (
                        <button key={e.key} className={`btn btn-sm ${needs.includes(e.key) ? 'btn-accent' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '6px 10px' }}
                            onClick={() => toggleNeed(e.key)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{e.icon}</span>{e.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 240, marginBottom: 16 }} />) :
                filtered.length === 0 ? (
                    <div className="empty-state">
                        <span className="material-symbols-outlined">search_off</span>
                        <p>{amenities.length === 0 ? 'Aún no hay salas. El administrador debe crearlas.' : 'Ninguna sala cumple esos filtros'}</p>
                    </div>
                ) : filtered.map(a => (
                    <div key={a.id} className="amenity-card stagger-item" onClick={() => go('amenity-detail', a)}>
                        <img className="amenity-card-img" src={a.image_url || DEFAULT_ROOM_IMG} alt={a.name} />
                        <div className="amenity-card-body">
                            <h3>{a.name}</h3>
                            {a.location && <p style={{ marginBottom: 2 }}>📍 {a.location}</p>}
                            <p>{a.description}</p>
                            <div className="amenity-card-meta">
                                <span><span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span> {a.capacity} personas</span>
                                <span><span className="material-symbols-outlined" style={{ fontSize: 16 }}>category</span> {roomTypeLabel(a.amenity_type)}</span>
                            </div>
                            <div style={{ marginTop: 8 }}><EquipmentChips equipment={a.equipment} small /></div>
                        </div>
                    </div>
                ))
            }
        </div>
    );
}

// ─── AvailabilityPage (agenda: salas × horarios del día) ───
function AvailabilityPage() {
    const { user, go } = useApp();
    const today = peruTodayISO();
    const [date, setDate] = useState(today);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [busy, setBusy] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { api.getAmenities(user?.community_id).then(setAmenities); }, [user]);
    useEffect(() => {
        setLoading(true);
        api.getReservationsByDate(date).then(setBusy).catch(() => setBusy([])).finally(() => setLoading(false));
    }, [date]);

    const nowHour = peruNow().getHours();
    // Se reserva de hoy al domingo de la semana siguiente; el admin puede mirar más allá.
    const maxDate = isAdminRole(user) ? addDaysISO(today, 60) : bookingMaxDateISO();
    const windowDays: string[] = [];
    for (let d = today; d <= bookingMaxDateISO(); d = addDaysISO(d, 1)) windowDays.push(d);
    const isPast = (s: string) => date < today || (date === today && nowHour >= parseInt(s, 10));
    const shiftDay = (n: number) => {
        const iso = addDaysISO(date, n);
        if (iso >= today && iso <= maxDate) setDate(iso);
    };

    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>view_timeline</span> Agenda de salas</h2>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
                {windowDays.map(d => (
                    <button key={d} className={`btn btn-sm ${d === date ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setDate(d)}>
                        {d === today ? 'Hoy' : shortDayLabel(d)}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <button className="icon-btn" onClick={() => shiftDay(-1)} disabled={date <= today}><span className="material-symbols-outlined">chevron_left</span></button>
                <input className="input" type="date" value={date} min={today} max={maxDate} onChange={e => e.target.value && setDate(e.target.value)} style={{ flex: 1 }} />
                <button className="icon-btn" onClick={() => shiftDay(1)} disabled={date >= maxDate}><span className="material-symbols-outlined">chevron_right</span></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Toca un bloque <strong style={{ color: 'var(--success)' }}>libre</strong> para reservarlo. Puedes reservar desde hoy
                hasta el {shortDayLabel(bookingMaxDateISO())}, máximo {MAX_SLOTS_PER_DAY} h por día.
            </p>
            {amenities.length === 0 ? (
                <div className="empty-state"><span className="material-symbols-outlined">meeting_room</span><p>Aún no hay salas creadas</p></div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, opacity: loading ? 0.5 : 1 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 120 + amenities.length * 120 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-2)' }}>
                                <th style={{ padding: 8, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-2)', width: 90 }}>Hora</th>
                                {amenities.map(a => (
                                    <th key={a.id} style={{ padding: 8, textAlign: 'left', fontWeight: 700 }}>
                                        {a.name}<div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)' }}>👥 {a.capacity}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TIME_SLOTS.map(s => (
                                <tr key={s} style={{ borderTop: '1px solid var(--border-2)' }}>
                                    <td style={{ padding: 8, whiteSpace: 'nowrap', color: 'var(--text-2)', position: 'sticky', left: 0, background: 'var(--surface)' }}>{s}</td>
                                    {amenities.map(a => {
                                        const r = busy.find(x => x.amenity_id === a.id && x.time_slot === s);
                                        const past = isPast(s);
                                        const mine = r && r.user_id === user?.id;
                                        return (
                                            <td key={a.id} style={{ padding: 4 }}>
                                                {r ? (
                                                    <div title={r.motivo || ''} style={{ padding: '6px 8px', borderRadius: 8, background: mine ? 'var(--primary-glow)' : 'rgba(229,72,77,0.12)', color: mine ? 'var(--primary-light)' : 'var(--danger)', fontSize: 11, lineHeight: 1.3 }}>
                                                        {mine ? 'Tu reunión' : ((r as any).user?.name || 'Ocupada')}
                                                        {(r as any).user?.apartment && !mine && <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{(r as any).user.apartment}</div>}
                                                    </div>
                                                ) : past ? (
                                                    <div style={{ padding: '6px 8px', color: 'var(--text-3)', fontSize: 11 }}>—</div>
                                                ) : (
                                                    <button onClick={() => go('booking', { ...a, preset: { date, slot: s } })}
                                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px dashed var(--success)', background: 'transparent', color: 'var(--success)', cursor: 'pointer', fontSize: 11 }}>
                                                        Libre
                                                    </button>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── AmenityDetailPage ───
function AmenityDetailPage() {
    const { viewData: amenity, go } = useApp();
    const [shown, setShown] = useState<string | null>(null);
    if (!amenity) return <div className="empty-state"><p>Selecciona una sala</p></div>;
    const photos: string[] = [amenity.image_url || DEFAULT_ROOM_IMG, ...(amenity.gallery || [])];
    const main = shown && photos.includes(shown) ? shown : photos[0];
    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('amenities')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <img src={main} alt={amenity.name} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 16, marginBottom: photos.length > 1 ? 8 : 16 }} />
            {photos.length > 1 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16 }}>
                    {photos.map(url => (
                        <img key={url} src={url} alt="" onClick={() => setShown(url)}
                            style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0, outline: url === main ? '2px solid var(--primary-light)' : 'none' }} />
                    ))}
                </div>
            )}
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{amenity.name}</h2>
            {amenity.location && <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 8 }}>📍 {amenity.location}</p>}
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{amenity.description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[{ icon: 'group', label: 'Capacidad', value: `${amenity.capacity} personas` },
                { icon: 'category', label: 'Tipo', value: roomTypeLabel(amenity.amenity_type) },
                ].map(s => (
                    <div key={s.label} className="card" style={{ textAlign: 'center', padding: 12 }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)', fontSize: 24 }}>{s.icon}</span>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                    </div>
                ))}
            </div>
            {amenity.equipment?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Equipamiento</p>
                    <EquipmentChips equipment={amenity.equipment} />
                </div>
            )}
            <button className="btn btn-primary btn-full" onClick={() => go('booking', amenity)}>
                <span className="material-symbols-outlined">event_available</span> Reservar esta sala
            </button>
        </div>
    );
}

// ─── BookingPage ───
// Ventana: hoy → domingo de la semana siguiente. Se pueden marcar varios bloques
// seguidos o sueltos, hasta MAX_SLOTS_PER_DAY por día sumando todas las salas,
// para que nadie acapare un día entero (el trigger reservations_check_rules lo
// vuelve a validar en la base). Los administradores quedan exentos.
function BookingPage() {
    const { viewData: amenity, user, go, toast } = useApp();

    const now = peruNow();
    const todayPeru = peruTodayISO();
    const isAdmin = isAdminRole(user);

    const [date, setDate] = useState<string>(amenity?.preset?.date || todayPeru);
    const [slots, setSlots] = useState<string[]>(amenity?.preset?.slot ? [amenity.preset.slot] : []);
    const [motivo, setMotivo] = useState('');
    const [attendees, setAttendees] = useState('');
    const [booked, setBooked] = useState<Reservation[]>([]);
    const [usedToday, setUsedToday] = useState(0); // bloques que ya tiene ese día
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState<api.Eligibility | null>(null);
    const firstLoad = useRef(true);

    // Bloques cuya hora de inicio ya pasó (solo si la fecha es hoy)
    const isPastSlot = (s: string) => date === todayPeru && now.getHours() >= parseInt(s, 10);

    // Motor de elegibilidad: ventana, sanciones y restricciones
    useEffect(() => {
        if (amenity && user) api.getEligibility(user, amenity.id).then(setEligibility);
    }, [amenity, user]);

    useEffect(() => {
        if (!amenity || !user) return;
        api.getAmenityReservations(amenity.id, date).then(setBooked).catch(() => setBooked([]));
        api.countUserSlotsOnDate(user.id, date).then(setUsedToday);
        // Conserva el bloque preseleccionado desde la agenda solo en la primera carga
        if (firstLoad.current) firstLoad.current = false; else setSlots([]);
    }, [amenity, date]);

    const maxDate = eligibility?.maxDate || bookingMaxDateISO();
    const days: string[] = [];
    for (let d = todayPeru; d <= maxDate && days.length < 62; d = addDaysISO(d, 1)) days.push(d);

    const dateBlocked = eligibility?.blockedDates.includes(date) || false;
    const remaining = isAdmin ? TIME_SLOTS.length : Math.max(0, MAX_SLOTS_PER_DAY - usedToday);

    const attendeesNum = parseInt(attendees, 10);
    const overCapacity = !!amenity && attendeesNum > (amenity.capacity || 0);

    const toggleSlot = (s: string) => {
        if (slots.includes(s)) { setSlots(slots.filter(x => x !== s)); return; }
        if (slots.length >= remaining) {
            toast(remaining === 0
                ? `Ya tienes ${MAX_SLOTS_PER_DAY} h reservadas ese día`
                : `Máximo ${MAX_SLOTS_PER_DAY} h por día (te quedan ${remaining})`);
            return;
        }
        setSlots([...slots, s].sort());
    };

    const handleBook = async () => {
        if (slots.length === 0 || !user || !amenity) return;
        if (!motivo.trim()) { toast('Indica el motivo de la reunión'); return; }
        if (overCapacity) { toast(`La sala admite máximo ${amenity.capacity} personas`); return; }
        setLoading(true);
        const ok: string[] = [];
        try {
            for (const s of slots) {
                await api.createReservation({
                    user_id: user.id, amenity_id: amenity.id, date, time_slot: s,
                    motivo: motivo.trim(),
                    attendees: attendeesNum > 0 ? attendeesNum : undefined,
                });
                ok.push(s);
            }
            // Los puntos se otorgan cuando el admin marca la reserva como CUMPLIDA en Auditoría.
            toast(`Reserva confirmada · ${amenity.name} · ${slots.length} h`);
            go('my-reservations');
        } catch (e: any) {
            toast((ok.length ? `Se reservaron ${ok.length} bloque(s). ` : '') + api.friendlyError(e));
            if (ok.length) go('my-reservations');
        }
        setLoading(false);
    };

    if (!amenity) return <div className="empty-state"><p>Selecciona una sala primero</p></div>;
    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('amenity-detail', amenity)} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <h2 className="section-title">Reservar {amenity.name}</h2>
            {amenity.location && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>📍 {amenity.location} · 👥 hasta {amenity.capacity}</p>}

            <div className="card stagger-item" style={{ marginBottom: 14, padding: 12, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                <strong>Reglas:</strong> reserva desde hoy hasta el <strong>{shortDayLabel(bookingMaxDateISO())}</strong> (semana actual y la siguiente),
                máximo <strong>{MAX_SLOTS_PER_DAY} h por día</strong> sumando todas las salas.
                {isAdmin && <span style={{ color: 'var(--accent)' }}> Como administrador no tienes estos límites.</span>}
            </div>

            {eligibility && eligibility.reasons.length > 0 && (
                <div className="card stagger-item" style={{
                    marginBottom: 14, padding: 12,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)',
                }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>⚠️ Reglas vigentes</p>
                    {eligibility.reasons.map((r, i) => (
                        <p key={i} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>• {r}</p>
                    ))}
                </div>
            )}

            <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Fecha</label>
            <div className="stagger-item" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
                {days.map(d => {
                    const blocked = eligibility?.blockedDates.includes(d);
                    return (
                        <button key={d} className={`btn btn-sm ${d === date ? 'btn-primary' : 'btn-ghost'}`} disabled={blocked}
                            style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap', flexShrink: 0, opacity: blocked ? 0.4 : 1 }}
                            onClick={() => setDate(d)}>
                            {d === todayPeru ? 'Hoy' : shortDayLabel(d)}
                        </button>
                    );
                })}
            </div>
            {dateBlocked && (
                <div className="badge badge-danger stagger-item" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>
                    🚫 Esta fecha está bloqueada por sanción o cooldown
                </div>
            )}
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                Horario {!isAdmin && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· te quedan {Math.max(0, remaining - slots.length)} h este día</span>}
            </label>
            {date === todayPeru && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                    🕐 Hora actual en Perú: {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')}
                </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {TIME_SLOTS.map(s => {
                    const past = isPastSlot(s);
                    const taken = booked.find(r => r.time_slot === s);
                    const disabled = !!taken || past;
                    return (
                        <div key={s}
                            className={`time-slot ${slots.includes(s) ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={() => !disabled && toggleSlot(s)}
                            title={past ? 'Horario ya pasado' : taken ? `Reservado por ${(taken as any).user?.name || 'otro colaborador'}` : ''}>
                            {s} {taken ? '🔒' : past ? '⏰' : ''}
                            {taken && <div style={{ fontSize: 10, opacity: 0.8 }}>{(taken as any).user?.name || 'Ocupada'}</div>}
                        </div>
                    );
                })}
            </div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Motivo de la reunión *</label>
            <textarea className="input" rows={2} maxLength={200}
                placeholder="Ej: Revisión semanal de indicadores de Calidad"
                value={motivo} onChange={e => setMotivo(e.target.value)} style={{ marginBottom: 4 }} />
            <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', marginBottom: 12 }}>{motivo.length}/200</p>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>N.º de asistentes (opcional)</label>
            <input className="input" type="number" min={1} max={amenity.capacity || undefined} inputMode="numeric"
                placeholder={`Máximo ${amenity.capacity}`} value={attendees}
                onChange={e => setAttendees(e.target.value)} style={{ marginBottom: overCapacity ? 6 : 20 }} />
            {overCapacity && (
                <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 20 }}>La sala admite máximo {amenity.capacity} personas.</p>
            )}
            {slots.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Resumen</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📍 {amenity.name}{amenity.location ? ` · ${amenity.location}` : ''}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📅 {shortDayLabel(date)} · 🕐 {slots.join(', ')} ({slots.length} h)</p>
                    {motivo.trim() && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📝 {motivo.trim()}</p>}
                    {attendeesNum > 0 && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>👥 {attendeesNum} asistentes</p>}
                </div>
            )}
            <button className="btn btn-primary btn-full" disabled={slots.length === 0 || !motivo.trim() || overCapacity || loading || dateBlocked} onClick={handleBook}>
                {loading ? 'Reservando…' : dateBlocked ? 'Fecha bloqueada' : slots.length > 1 ? `Confirmar ${slots.length} bloques` : 'Confirmar reserva'}
            </button>
        </div>
    );
}

// ─── MyReservationsPage ───
function MyReservationsPage() {
    const { user, toast } = useApp();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [tab, setTab] = useState<'active' | 'past'>('active');

    useEffect(() => { if (user) api.getUserReservations(user.id).then(setReservations); }, [user]);

    const cancel = async (id: string) => {
        try { await api.cancelReservation(id); setReservations(r => r.map(x => x.id === id ? { ...x, status: 'CANCELADA' } : x)); toast('Reserva cancelada'); } catch { toast('Error'); }
    };

    const filtered = reservations.filter(r => tab === 'active' ? r.status === 'ACTIVA' : r.status !== 'ACTIVA');
    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>calendar_month</span> Mis Reservas</h2>
            <div className="tabs">
                <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Próximas</button>
                <button className={`tab ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>Pasadas</button>
            </div>
            {filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">event_busy</span><p>No hay reservas</p></div> :
                filtered.map(r => (
                    <div key={r.id} className="card stagger-item" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img src={r.amenity?.image_url || 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=200'} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>{r.amenity?.name}</h4>
                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.date} • {r.time_slot}{r.attendees ? ` • 👥 ${r.attendees}` : ''}</p>
                            {r.motivo && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>📝 {r.motivo}</p>}
                            {r.code && (
                                <p style={{ fontSize: 10, color: 'var(--primary-light)', fontFamily: 'monospace', marginTop: 2 }}>
                                    {r.code}
                                </p>
                            )}
                        </div>
                        {r.status === 'ACTIVA' ? (
                            <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>Cancelar</button>
                        ) : (
                            <span className={`badge ${r.status === 'CANCELADA' ? 'badge-danger' : r.grade === 'CUMPLIDA' ? 'badge-accent' : 'badge-warning'}`}>
                                {r.status === 'CANCELADA' ? 'Cancelada' : r.grade}
                            </span>
                        )}
                    </div>
                ))
            }
        </div>
    );
}

// ─── CommunityPage (Muro) ───
// Íconos SVG (components/Icons) en lugar de emojis.
function CommunityPage() {
    const { user, toast, refreshUser } = useApp();
    const [posts, setPosts] = useState<Post[]>([]);
    const [text, setText] = useState('');
    const [likedIds, setLikedIds] = useState<string[]>([]);
    const [showComments, setShowComments] = useState<string | null>(null);
    const [commentText, setCommentText] = useState('');
    const [postImage, setPostImage] = useState<File | null>(null);

    useEffect(() => {
        if (user?.community_id) {
            api.getCommunityPosts(user.community_id).then(setPosts);
            api.getUserLikes(user.id).then(setLikedIds);
        }
    }, [user]);

    if (!user?.community_id) return (
        <div className="empty-state fade-in">
            <span className="material-symbols-outlined">domain</span>
            <h3>Cuenta en configuración</h3>
            <p style={{ margin: '8px 0' }}>Pide al administrador de salas que habilite tu cuenta.</p>
        </div>
    );

    const createPost = async (type: 'GENERAL' | 'FOTO_AREA' | 'BUG_REPORT' = 'GENERAL') => {
        if (!text.trim()) return;
        try {
            let imageUrl: string | undefined;
            if (postImage) {
                imageUrl = await api.uploadPostImage(user.id, postImage);
                type = 'FOTO_AREA';
            }
            const post = await api.createPost({ user_id: user.id, community_id: user.community_id, text, post_type: type, image_url: imageUrl });
            setPosts([post, ...posts]);
            const pts = type === 'FOTO_AREA' ? 15 : type === 'BUG_REPORT' ? 25 : 5;
            await api.awardPoints(user.id, user.community_id!, type === 'BUG_REPORT' ? 'BUG_REPORT' : type === 'FOTO_AREA' ? 'UPLOAD_AREA_PHOTO' : 'COMMENT', pts, type === 'FOTO_AREA' ? 'Foto de sala subida' : undefined);
            await refreshUser();
            setText('');
            setPostImage(null);
            toast(`+${pts} puntos`);
        } catch { toast('Error al publicar'); }
    };

    const toggleLike = async (postId: string) => {
        const liked = likedIds.includes(postId);
        try {
            if (liked) { await api.unlikePost(postId, user.id); setLikedIds(l => l.filter(x => x !== postId)); }
            else { await api.likePost(postId, user.id); setLikedIds([...likedIds, postId]); }
            setPosts(p => p.map(x => x.id === postId ? { ...x, likes_count: x.likes_count + (liked ? -1 : 1) } : x));
        } catch { }
    };

    const addComment = async (postId: string) => {
        if (!commentText.trim()) return;
        try {
            const c = await api.addComment({ post_id: postId, user_id: user.id, text: commentText });
            setPosts(p => p.map(x => x.id === postId ? { ...x, comments: [...(x.comments || []), c] } : x));
            await api.awardPoints(user.id, user.community_id!, 'COMMENT', 5, 'Comentario en comunidad');
            await refreshUser();
            setCommentText('');
            toast('+5 puntos');
        } catch { }
    };

    const timeAgo = (d: string) => {
        const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
        if (m < 60) return `${m}m`;
        if (m < 1440) return `${Math.floor(m / 60)}h`;
        return `${Math.floor(m / 1440)}d`;
    };

    const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 };

    return (
        <div className="fade-in">
            <h2 className="section-title"><IconForum size={22} style={{ color: 'var(--accent)' }} /> Muro ADR</h2>
            <div className="card" style={{ marginBottom: 16 }}>
                <textarea className="input" placeholder="Comparte un aviso (salas, equipos, novedades)…" value={text} onChange={e => setText(e.target.value)} rows={2} />
                {postImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8, fontSize: 12 }}>
                        <IconPhoto size={16} /> {postImage.name.slice(0, 24)}
                        <button style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-3)', display: 'flex' }}
                            onClick={() => setPostImage(null)} title="Quitar foto"><IconClose size={16} /></button>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" style={iconBtn} onClick={() => createPost()}><IconMegaphone size={16} /> Publicar</button>
                    <label className="btn btn-ghost btn-sm" style={{ ...iconBtn, cursor: 'pointer' }}>
                        <IconPhoto size={16} /> Foto
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) setPostImage(e.target.files[0]); }} />
                    </label>
                    <button className="btn btn-ghost btn-sm" style={iconBtn} onClick={() => createPost('BUG_REPORT')}><IconBug size={16} /> Reportar</button>
                </div>
            </div>
            {posts.map(p => (
                <div key={p.id} className="post-card stagger-item">
                    <div className="post-header">
                        <div className="avatar">{p.user?.avatar_url ? <img src={p.user.avatar_url} alt="" /> : (p.user?.name?.[0] || '?')}</div>
                        <div className="post-header-info">
                            <h4>{p.user?.name || 'Colaborador'}</h4>
                            <span style={iconBtn}>
                                {timeAgo(p.created_at)}
                                {p.post_type === 'BUG_REPORT' && <> · <IconBug size={13} /> Reporte</>}
                            </span>
                        </div>
                    </div>
                    <p className="post-text">{p.text}</p>
                    {p.image_url && <img className="post-image" src={p.image_url} alt="" />}
                    <div className="post-actions">
                        <button className={`post-action-btn ${likedIds.includes(p.id) ? 'liked' : ''}`} onClick={() => toggleLike(p.id)}>
                            <IconHeart size={18} filled={likedIds.includes(p.id)} /> {p.likes_count}
                        </button>
                        <button className="post-action-btn" onClick={() => setShowComments(showComments === p.id ? null : p.id)}>
                            <IconComment size={18} /> {p.comments?.length || 0}
                        </button>
                    </div>
                    {showComments === p.id && (
                        <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border-2)' }}>
                            {(p.comments || []).map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{c.user?.name?.[0] || '?'}</div>
                                    <div><span style={{ fontSize: 12, fontWeight: 600 }}>{c.user?.name}</span><p style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.text}</p></div>
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <input className="input" placeholder="Comentar..." value={commentText} onChange={e => setCommentText(e.target.value)} style={{ fontSize: 13 }} />
                                <button className="btn btn-primary btn-sm" style={iconBtn} onClick={() => addComment(p.id)} title="Enviar"><IconSend size={16} /></button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── LeaderboardPage ───
function LeaderboardPage() {
    const { user } = useApp();
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        if (user?.community_id) api.getCommunityUsers(user.community_id).then(setUsers);
    }, [user]);
    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>leaderboard</span> Clasificación</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Se suman puntos cuando el administrador califica tus reuniones como cumplidas (sala usada y dejada en orden).</p>
            {users.map((u, i) => (
                <div key={u.id} className="leaderboard-item stagger-item">
                    <div className={`leaderboard-rank ${i < 3 ? `top-${i + 1}` : ''}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div>
                    <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{u.avatar_url ? <img src={u.avatar_url} alt="" /> : u.name[0]}</div>
                    <div className="leaderboard-info" style={{ flex: 1 }}>
                        <h4>{u.name} {u.id === user?.id && <span style={{ color: 'var(--accent)', fontSize: 11 }}>(tú)</span>}</h4>
                        <span>{getUserLevel(u.points).icon} {getUserLevel(u.points).name}</span>
                    </div>
                    <div className="leaderboard-points">{u.points}</div>
                </div>
            ))}
        </div>
    );
}

// ─── ProfilePage ───
function ProfilePage() {
    const { user, setUser, go, toast } = useApp();
    const level = getUserLevel(user?.points || 0);
    const [logs, setLogs] = useState<any[]>([]);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(user?.name || '');
    const [uploading, setUploading] = useState(false);
    // Cartilla completa (PDF: DNI, celular, foto DNI)
    const [showCartilla, setShowCartilla] = useState(false);
    const [dni, setDni] = useState(user?.dni || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [cargoEdit, setCargoEdit] = useState(user?.cargo || '');
    const [areaEdit, setAreaEdit] = useState(user?.apartment || '');
    const cartillaComplete = !!(user?.dni && user?.phone && user?.cargo);

    const saveCartilla = async () => {
        if (!user) return;
        // Validaciones simples cliente (defensa en profundidad)
        if (dni && !/^[0-9]{8,12}$/.test(dni)) {
            toast('❌ DNI debe tener 8 a 12 dígitos');
            return;
        }
        if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
            toast('❌ Celular inválido');
            return;
        }
        try {
            const updated = await api.updateUserProfile(user.id, { dni: dni || undefined, phone: phone || undefined, cargo: cargoEdit.trim() || undefined, apartment: areaEdit || undefined });
            setUser(updated);
            setShowCartilla(false);
            toast('✅ Datos actualizados');
        } catch (e: any) {
            toast('Error: ' + (e.message || 'No se pudo guardar'));
        }
    };

    useEffect(() => { if (user) api.getUserPointLogs(user.id).then(l => setLogs(l.slice(0, 10))); }, [user]);

    const logout = async () => { await supabase.auth.signOut(); setUser(null); go('login'); };

    const saveName = async () => {
        if (!user || !editName.trim()) return;
        try {
            const updated = await api.updateUserProfile(user.id, { name: editName.trim() });
            setUser(updated);
            setEditing(false);
            toast('✅ Nombre actualizado');
        } catch { toast('Error al guardar'); }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploading(true);
        try {
            const url = await api.uploadAvatar(user.id, file);
            const updated = await api.updateUserProfile(user.id, { avatar_url: url });
            // Solo damos puntos la primera vez que sube foto (si no tenía avatar previo)
            const firstUpload = !user.avatar_url;
            if (firstUpload && user.community_id) {
                await api.awardPoints(user.id, user.community_id, 'PROFILE_PHOTO', 20, 'Foto de perfil subida');
                // Re-leemos el user (incluye points y avatar_url) para reflejar
                // tanto la foto como la nueva suma de puntos.
                const fresh = await api.refreshUserById(user.id);
                setUser(fresh || updated);
                toast('✅ Foto actualizada (+20 pts)');
            } else {
                setUser(updated);
                toast('✅ Foto actualizada');
            }
            // Refresca historial de puntos al volver a render
            api.getUserPointLogs(user.id).then(l => setLogs(l.slice(0, 10)));
        } catch (err: any) {
            toast('Error al subir foto: ' + (err?.message || 'desconocido'));
        }
        // Limpia el input para permitir re-subir el mismo archivo
        e.target.value = '';
        setUploading(false);
    };

    return (
        <div className="fade-in">
            <div className="profile-header">
                <div className="profile-avatar" style={{ position: 'relative', cursor: 'pointer' }}>
                    {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : (user?.name?.[0] || '?')}
                    <label style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--primary)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid var(--bg-1)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>{uploading ? 'hourglass_top' : 'photo_camera'}</span>
                        <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                {editing ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', maxWidth: 200 }} />
                        <button className="btn btn-primary btn-sm" onClick={saveName}>✓</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setEditName(user?.name || ''); }}>✕</button>
                    </div>
                ) : (
                    <div className="profile-name" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditing(true)}>
                        {user?.name} <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>edit</span>
                    </div>
                )}
                <div className="profile-email">{user?.username || user?.email}</div>
                <div style={{ marginTop: 8 }}><span className="badge badge-primary">{level.icon} {level.name}</span></div>
                <div className="profile-stats">
                    <div className="profile-stat"><div className="profile-stat-value">{user?.points || 0}</div><div className="profile-stat-label">Puntos</div></div>
                    <div className="profile-stat"><div className="profile-stat-value" style={{ fontSize: 14 }}>{user?.apartment || '-'}</div><div className="profile-stat-label">Área</div></div>
                    <div className="profile-stat"><div className="profile-stat-value" style={{ fontSize: 14 }}>{user?.cargo || '-'}</div><div className="profile-stat-label">Cargo</div></div>
                </div>
            </div>

            {/* Cartilla completa (Hoja1 #3) */}
            <div className="card" style={{ marginBottom: 16, padding: 14, border: cartillaComplete ? '1px solid var(--accent)' : '1px dashed var(--warning)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCartilla ? 12 : 0 }}>
                    <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700 }}>
                            {cartillaComplete ? '✅ Ficha completa' : '📝 Completa tu ficha'}
                        </h4>
                        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {cartillaComplete ? 'Datos del colaborador registrados' : 'Área, cargo, DNI y celular'}
                        </p>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowCartilla(!showCartilla)}>
                        {showCartilla ? 'Cancelar' : cartillaComplete ? 'Editar' : 'Completar'}
                    </button>
                </div>
                {showCartilla && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>Área</label>
                            <select className="input" value={areaEdit} onChange={e => setAreaEdit(e.target.value)}>
                                <option value="">Selecciona tu área…</option>
                                {ADR_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>Cargo</label>
                            <input className="input" list="adr-cargos-perfil" placeholder="Ej: Analista de Mejora Continua" value={cargoEdit} onChange={e => setCargoEdit(e.target.value)} maxLength={80} />
                            <datalist id="adr-cargos-perfil">{ADR_CARGOS_SUGERIDOS.map(c => <option key={c} value={c} />)}</datalist>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>DNI</label>
                            <input className="input" placeholder="12345678" value={dni} onChange={e => setDni(e.target.value)} inputMode="numeric" maxLength={12} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>Celular</label>
                            <input className="input" placeholder="+51 999 999 999" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ gridColumn: '1 / -1' }} onClick={saveCartilla}>Guardar ficha</button>
                    </div>
                )}
            </div>

            <div className="section-title" style={{ fontSize: 16 }}>Historial de Puntos</div>
            {logs.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin actividad aún</p> :
                logs.map(l => (
                    <div key={l.id} className="card" style={{ marginBottom: 6, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><span style={{ fontSize: 13, fontWeight: 600 }}>{l.action}</span><p style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.description || ''}</p></div>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>+{l.points}</span>
                    </div>
                ))
            }
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-ghost btn-full" onClick={() => go('change-password')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock_reset</span> Cambiar contraseña
                </button>
                <button className="btn btn-danger btn-full" onClick={logout}>Cerrar sesión</button>
            </div>
        </div>
    );
}

// ─── AdminPage ───
function AdminPage() {
    const { user, go, toast } = useApp();
    const [view, setView] = useState<'menu' | 'users' | 'audit' | 'requests' | 'analytics' | 'spaces' | 'rules'>('spaces');
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [showCreateSpace, setShowCreateSpace] = useState(false);
    const [complianceMap, setComplianceMap] = useState<Record<string, number>>({}); // reservationId -> %
    const [rejectTarget, setRejectTarget] = useState<string | null>(null); // requestId being rejected
    const [rejectMsg, setRejectMsg] = useState('');
    const [areaUserCounts, setAreaUserCounts] = useState<Record<string, number>>({}); // área -> colaboradores

    // Formulario de sala (crear o editar)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [spaceName, setSpaceName] = useState('');
    const [spaceType, setSpaceType] = useState('');
    const [spaceCapacity, setSpaceCapacity] = useState('8');
    const [spaceDesc, setSpaceDesc] = useState('');
    const [spaceLocation, setSpaceLocation] = useState('');
    const [spaceEquipment, setSpaceEquipment] = useState<string[]>([]);
    const [spacePoints, setSpacePoints] = useState('10');
    const [spaceImageFile, setSpaceImageFile] = useState<File | null>(null);
    const [spaceGallery, setSpaceGallery] = useState<string[]>([]);       // fotos ya guardadas
    const [spaceGalleryFiles, setSpaceGalleryFiles] = useState<File[]>([]); // fotos por subir
    const [spaceLoading, setSpaceLoading] = useState(false);

    // Imagen por defecto según el tipo de sala
    const DEFAULT_IMAGES: Record<string, string> = {
        'DIRECTORIO': 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=800',
        'REUNIONES': DEFAULT_ROOM_IMG,
        'CAPACITACION': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800',
        'VIDEOCONFERENCIA': 'https://images.unsplash.com/photo-1600508774634-4e11d34730e2?w=800',
        'AUDITORIO': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800',
        'FOCUS': 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800',
        'OTRO': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
    };

    // Carga inicial: el panel abre directo en "Salas"
    useEffect(() => { if (isAdminRole(user)) api.getAmenities(user!.community_id, true).then(setAmenities); }, []);

    if (!isAdminRole(user) || !user) return <div className="empty-state"><p>Acceso denegado</p></div>;

    const load = async (v: string) => {
        setView(v as any);
        if (v === 'audit') api.getAllReservationsForAudit(user.community_id).then(setReservations);
        if (v === 'requests' && user.community_id) {
            const reqs = await api.getPendingRequests(user.community_id);
            setRequests(reqs);
            // Colaboradores ya afiliados por área
            const communityUsers = await api.getCommunityUsers(user.community_id);
            const counts: Record<string, number> = {};
            communityUsers.forEach(u => { if (u.apartment) counts[u.apartment] = (counts[u.apartment] || 0) + 1; });
            setAreaUserCounts(counts);
        }
        if (v === 'analytics') api.getAnalytics(user.community_id).then(setAnalytics);
        if (v === 'spaces') api.getAmenities(user.community_id, true).then(setAmenities);
    };

    const grade = async (id: string, g: 'CUMPLIDA' | 'INCUMPLIDA') => {
        const pct = complianceMap[id] !== undefined ? complianceMap[id] : (g === 'CUMPLIDA' ? 100 : 0);
        await api.gradeReservation(id, g, pct);
        setReservations(r => r.map(x => x.id === id ? { ...x, grade: g, status: 'FINALIZADA', compliance_pct: pct } : x));
        toast(`Reserva marcada como ${g} (${pct}%)`);
    };

    const approveReq = async (id: string) => {
        try {
            await api.approveJoinRequest(id);
            setRequests(r => r.filter(x => x.id !== id));
            toast('Solicitud aprobada');
        } catch (e: any) { toast('Error: ' + (e.message || 'No se pudo aprobar')); }
    };

    const doReject = async (id: string) => {
        await api.rejectJoinRequest(id, rejectMsg.trim() || undefined, user?.name);
        setRequests(rs => rs.filter(x => x.id !== id));
        setRejectTarget(null);
        setRejectMsg('');
        toast('Solicitud rechazada');
    };

    const resetForm = () => {
        setShowCreateSpace(false); setEditingId(null);
        setSpaceName(''); setSpaceType(''); setSpaceDesc(''); setSpaceLocation(''); setSpaceEquipment([]);
        setSpaceCapacity('8'); setSpacePoints('10'); setSpaceImageFile(null);
        setSpaceGallery([]); setSpaceGalleryFiles([]);
    };

    const selectPreset = (preset: typeof ROOM_TYPES[0]) => {
        setSpaceType(preset.type);
        if (!editingId) {
            if (!spaceName.trim()) setSpaceName(preset.label);
            setSpaceDesc(preset.desc);
            setSpaceCapacity(String(preset.cap));
        }
    };

    const startEdit = (a: Amenity) => {
        setEditingId(a.id);
        setSpaceName(a.name); setSpaceType(a.amenity_type || 'OTRO'); setSpaceDesc(a.description || '');
        setSpaceLocation(a.location || ''); setSpaceEquipment(a.equipment || []);
        setSpaceCapacity(String(a.capacity || 8)); setSpacePoints(String(a.points_reward ?? 10));
        setSpaceImageFile(null);
        setSpaceGallery(a.gallery || []); setSpaceGalleryFiles([]);
        setShowCreateSpace(true);
        window.scrollTo(0, 0);
    };

    const toggleEquipment = (k: string) =>
        setSpaceEquipment(eq => eq.includes(k) ? eq.filter(x => x !== k) : [...eq, k]);

    const saveSpace = async () => {
        if (!spaceName.trim() || !user?.community_id) return;
        setSpaceLoading(true);
        try {
            const fields: Partial<Amenity> = {
                name: spaceName.trim(),
                amenity_type: spaceType || 'OTRO',
                capacity: parseInt(spaceCapacity) || 8,
                description: spaceDesc.trim(),
                location: spaceLocation.trim() || undefined,
                equipment: spaceEquipment,
                points_reward: parseInt(spacePoints) || 0,
                gallery: spaceGallery,
            };
            let saved: Amenity;
            if (editingId) {
                saved = await api.updateAmenity(editingId, fields);
            } else {
                saved = await api.createAmenity({
                    ...fields, community_id: user.community_id,
                    image_url: DEFAULT_IMAGES[spaceType] || DEFAULT_IMAGES['OTRO'],
                });
            }
            if (spaceImageFile) {
                const uploadedUrl = await api.uploadAmenityImage(saved.id, spaceImageFile);
                saved = await api.updateAmenity(saved.id, { image_url: uploadedUrl });
            }
            if (spaceGalleryFiles.length) {
                const urls: string[] = [];
                for (const f of spaceGalleryFiles) urls.push(await api.uploadAmenityImage(saved.id, f));
                saved = await api.updateAmenity(saved.id, { gallery: [...(saved.gallery || []), ...urls] });
            }
            setAmenities(prev => editingId ? prev.map(a => a.id === saved.id ? saved : a) : [...prev, saved]);
            toast(editingId ? '✅ Sala actualizada' : '✅ Sala creada');
            resetForm();
        } catch (e: any) { toast('Error: ' + api.friendlyError(e)); }
        setSpaceLoading(false);
    };

    const toggleSpaceActive = async (a: Amenity) => {
        const next = a.is_active === false;
        try {
            const saved = await api.updateAmenity(a.id, { is_active: next });
            setAmenities(prev => prev.map(x => x.id === a.id ? saved : x));
            toast(next ? 'Sala habilitada' : 'Sala deshabilitada (no se podrá reservar)');
        } catch (e: any) { toast('Error: ' + api.friendlyError(e)); }
    };

    const deleteSpace = async (id: string) => {
        if (!confirm('¿Eliminar esta sala y todo su historial de reservas? Si solo quieres que no se reserve, usa "Deshabilitar".')) return;
        try {
            await api.deleteAmenity(id);
            setAmenities(prev => prev.filter(a => a.id !== id));
            toast('Sala eliminada');
        } catch { toast('Error al eliminar'); }
    };

    const updateSpaceImage = async (amenityId: string, file: File) => {
        try {
            const url = await api.uploadAmenityImage(amenityId, file);
            await api.updateAmenity(amenityId, { image_url: url });
            setAmenities(prev => prev.map(a => a.id === amenityId ? { ...a, image_url: url } : a));
            toast('✅ Imagen actualizada');
        } catch { toast('Error al subir imagen'); }
    };

    // Galería en el formulario: se guarda al pulsar "Guardar cambios"
    const addGalleryFiles = (files: FileList | null) => {
        const imgs = Array.from(files || []).filter(f => f.type.startsWith('image/'));
        const total = spaceGallery.length + spaceGalleryFiles.length + imgs.length;
        if (total > 12) { toast('Máximo 12 fotos por sala'); return; }
        setSpaceGalleryFiles(prev => [...prev, ...imgs]);
    };
    const makeCover = async (url: string) => {
        if (!editingId) return;
        const current = amenities.find(a => a.id === editingId);
        const rest = spaceGallery.filter(u => u !== url);
        const gallery = current?.image_url ? [current.image_url, ...rest] : rest;
        try {
            const saved = await api.updateAmenity(editingId, { image_url: url, gallery });
            setAmenities(prev => prev.map(a => a.id === saved.id ? saved : a));
            setSpaceGallery(gallery);
            toast('Portada actualizada');
        } catch (e: any) { toast('Error: ' + api.friendlyError(e)); }
    };

    if (view === 'menu') return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>admin_panel_settings</span> Panel Admin</h2>
            {[{ icon: 'meeting_room', title: 'Salas', desc: 'Agregar, editar o quitar salas y sus fotos', v: 'spaces' },
            { icon: 'fact_check', title: 'Auditoría', desc: 'Calificar el uso de las salas', v: 'audit' },
            { icon: 'gavel', title: 'Reglas', desc: 'Sanciones por área y restricciones por sala', v: 'rules' },
            { icon: 'people', title: 'Colaboradores', desc: 'Crear usuarios, restablecer claves, activar/desactivar', v: 'users' },
            { icon: 'analytics', title: 'Indicadores', desc: 'Uso y cumplimiento por sala', v: 'analytics' }
            ].map(item => (
                <div key={item.v} className="admin-card" onClick={() => load(item.v)}>
                    <div className="admin-card-icon"><span className="material-symbols-outlined">{item.icon}</span></div>
                    <div className="admin-card-info"><h4>{item.title}</h4><p>{item.desc}</p></div>
                    <span className="material-symbols-outlined" style={{ color: 'var(--text-3)' }}>chevron_right</span>
                </div>
            ))}
            <button className="btn btn-ghost btn-full" style={{ marginTop: 16 }} onClick={() => go('home')}>Volver al inicio</button>
        </div>
    );

    // Reglas (sanciones + restricciones) — componente externo
    if (view === 'rules' && user?.community_id) {
        return (
            <SanctionsPage
                user={user}
                onBack={() => setView('menu')}
                onToast={toast}
            />
        );
    }

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => setView('menu')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Panel Admin
            </button>

            {/* ─── Gestión de salas ─── */}
            {view === 'spaces' && (<>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>Salas ({amenities.length})</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => showCreateSpace ? resetForm() : setShowCreateSpace(true)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showCreateSpace ? 'close' : 'add'}</span>
                        {showCreateSpace ? 'Cancelar' : 'Nueva sala'}
                    </button>
                </div>

                {showCreateSpace && (
                    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{editingId ? 'Editar sala' : 'Nueva sala'}</h3>

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8, display: 'block' }}>Tipo de sala</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, marginBottom: 16 }}>
                            {ROOM_TYPES.map(p => (
                                <button key={p.type}
                                    className={`btn btn-sm ${spaceType === p.type ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: 12, padding: '8px 6px', justifyContent: 'flex-start' }}
                                    onClick={() => selectPreset(p)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{p.icon}</span>{p.label}
                                </button>
                            ))}
                        </div>

                        {spaceType && (
                            <div style={{ marginBottom: 16, position: 'relative' }}>
                                <img src={spaceImageFile ? URL.createObjectURL(spaceImageFile) : (editingId ? (amenities.find(a => a.id === editingId)?.image_url || DEFAULT_IMAGES['OTRO']) : (DEFAULT_IMAGES[spaceType] || DEFAULT_IMAGES['OTRO']))}
                                    alt="preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12 }} />
                                <label style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--primary)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>photo_camera</span>
                                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Cambiar foto</span>
                                    <input type="file" accept="image/*" onChange={e => setSpaceImageFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                </label>
                            </div>
                        )}

                        {spaceType && (
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>
                                    Más fotos ({spaceGallery.length + spaceGalleryFiles.length}/12)
                                </label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {spaceGallery.map(url => (
                                        <div key={url} style={{ position: 'relative', width: 84, height: 64 }}>
                                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                                            <button type="button" title="Quitar foto" onClick={() => setSpaceGallery(g => g.filter(u => u !== url))}
                                                style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                                            </button>
                                            {editingId && (
                                                <button type="button" title="Usar como portada" onClick={() => makeCover(url)}
                                                    style={{ position: 'absolute', bottom: 2, left: 2, padding: '1px 6px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: 10 }}>
                                                    Portada
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {spaceGalleryFiles.map((f, i) => (
                                        <div key={i} style={{ position: 'relative', width: 84, height: 64 }}>
                                            <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, opacity: 0.8 }} />
                                            <button type="button" title="Quitar foto" onClick={() => setSpaceGalleryFiles(fs => fs.filter((_, j) => j !== i))}
                                                style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                                            </button>
                                        </div>
                                    ))}
                                    <label style={{ width: 84, height: 64, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_photo_alternate</span>
                                        Agregar
                                        <input type="file" accept="image/*" multiple onChange={e => { addGalleryFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
                                    </label>
                                </div>
                            </div>
                        )}

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Nombre</label>
                        <input className="input" placeholder="Ej: Sala Arándano" value={spaceName} onChange={e => setSpaceName(e.target.value)} style={{ marginBottom: 12 }} />

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Ubicación</label>
                        <input className="input" placeholder="Ej: Oficina Planta Don Carlos · 2.º piso" maxLength={80} value={spaceLocation} onChange={e => setSpaceLocation(e.target.value)} style={{ marginBottom: 12 }} />

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Descripción / indicaciones</label>
                        <textarea className="input" placeholder="Ej: Pedir llave en recepción. Dejar la sala ordenada." maxLength={300} value={spaceDesc} onChange={e => setSpaceDesc(e.target.value)}
                            style={{ marginBottom: 12, minHeight: 60, resize: 'vertical' }} />

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8, display: 'block' }}>Equipamiento</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                            {ROOM_EQUIPMENT.map(e => (
                                <button key={e.key} type="button"
                                    className={`btn btn-sm ${spaceEquipment.includes(e.key) ? 'btn-accent' : 'btn-ghost'}`}
                                    style={{ fontSize: 12, padding: '6px 10px' }}
                                    onClick={() => toggleEquipment(e.key)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{e.icon}</span>{e.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Capacidad (personas)</label>
                                <input className="input" type="number" min="1" value={spaceCapacity} onChange={e => setSpaceCapacity(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Puntos por reunión cumplida</label>
                                <input className="input" type="number" min="0" value={spacePoints} onChange={e => setSpacePoints(e.target.value)} />
                            </div>
                        </div>

                        <button className="btn btn-primary btn-full" onClick={saveSpace} disabled={!spaceName.trim() || !spaceType || spaceLoading}>
                            {spaceLoading ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear sala'}
                        </button>
                    </div>
                )}

                {amenities.length === 0 && !showCreateSpace ? (
                    <div className="empty-state" style={{ padding: 40 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>meeting_room</span>
                        <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No hay salas creadas</p>
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crea la primera sala de reunión de ADR</p>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreateSpace(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Crear sala
                        </button>
                    </div>
                ) : (
                    amenities.map(a => (
                        <div key={a.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden', opacity: a.is_active === false ? 0.55 : 1 }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ position: 'relative', width: 100, minHeight: 90, flexShrink: 0 }}>
                                    <img src={a.image_url || DEFAULT_IMAGES['OTRO']} alt={a.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <label style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: 4, cursor: 'pointer' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>photo_camera</span>
                                        <input type="file" accept="image/*" onChange={e => {
                                            const f = e.target.files?.[0];
                                            if (f) updateSpaceImage(a.id, f);
                                        }} style={{ display: 'none' }} />
                                    </label>
                                </div>
                                <div style={{ flex: 1, padding: '10px 0', minWidth: 0 }}>
                                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                                        {a.name} {a.is_active === false && <span className="badge badge-danger" style={{ fontSize: 10 }}>Deshabilitada</span>}
                                    </h4>
                                    {a.location && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>📍 {a.location}</p>}
                                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-2)', margin: '4px 0' }}>
                                        <span>👥 {a.capacity}</span>
                                        <span>{roomTypeLabel(a.amenity_type)}</span>
                                        <span>{1 + (a.gallery?.length || 0)} foto{(a.gallery?.length || 0) ? 's' : ''}</span>
                                    </div>
                                    <EquipmentChips equipment={a.equipment} small />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 6 }}>
                                    <button className="icon-btn" title="Editar" onClick={() => startEdit(a)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>edit</span>
                                    </button>
                                    <button className="icon-btn" title={a.is_active === false ? 'Habilitar' : 'Deshabilitar'} onClick={() => toggleSpaceActive(a)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{a.is_active === false ? 'visibility' : 'visibility_off'}</span>
                                    </button>
                                    <button className="icon-btn" title="Eliminar" onClick={() => deleteSpace(a.id)} style={{ color: 'var(--danger)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </>)}

            {view === 'users' && <UsersManager me={user} onToast={toast} />}

            {view === 'audit' && (<>
                <h2 className="section-title">Auditoría</h2>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Ajusta el % de cumplimiento antes de calificar.</p>
                {reservations.filter(r => r.grade === 'PENDIENTE').map(r => (
                    <div key={r.id} className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div>
                                <h4 style={{ fontSize: 14 }}>{(r as any).user?.name}</h4>
                                {((r as any).user?.cargo || (r as any).user?.apartment) && (
                                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{[(r as any).user?.cargo, (r as any).user?.apartment].filter(Boolean).join(' · ')}</p>
                                )}
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.amenity?.name} • {r.date} • {r.time_slot}{r.attendees ? ` • 👥 ${r.attendees}` : ''}</p>
                                {r.motivo && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>📝 {r.motivo}</p>}
                            </div>
                        </div>
                        {/* Compliance slider */}
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                                <span>% Cumplimiento</span>
                                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{complianceMap[r.id] !== undefined ? complianceMap[r.id] : 100}%</span>
                            </div>
                            <input type="range" min="0" max="100" step="5"
                                value={complianceMap[r.id] !== undefined ? complianceMap[r.id] : 100}
                                onChange={e => setComplianceMap(m => ({ ...m, [r.id]: Number(e.target.value) }))}
                                style={{ width: '100%', accentColor: 'var(--accent)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-accent btn-sm" onClick={() => grade(r.id, 'CUMPLIDA')}>✅ Cumplida</button>
                            <button className="btn btn-danger btn-sm" onClick={() => grade(r.id, 'INCUMPLIDA')}>❌ Incumplida</button>
                        </div>
                    </div>
                ))}
            </>)}

            {view === 'requests' && (<>
                <h2 className="section-title">Solicitudes Pendientes</h2>
                {requests.length === 0 ? <p style={{ color: 'var(--text-3)' }}>No hay solicitudes</p> :
                    requests.map(r => (
                        <div key={r.id} className="card stagger-item" style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h4 style={{ fontSize: 14 }}>{r.user_name}</h4>
                                {r.ticket_code && (
                                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--primary-light)' }}>
                                        {r.ticket_code}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{[r.cargo, r.unit].filter(Boolean).join(' · ') || 'Sin área / cargo'}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.user_email}</p>
                            {r.unit && areaUserCounts[r.unit] !== undefined && (
                                <p style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>
                                    👥 {areaUserCounts[r.unit]} colaborador{areaUserCounts[r.unit] !== 1 ? 'es' : ''} ya en {r.unit}
                                </p>
                            )}
                            {rejectTarget === r.id ? (
                                <div style={{ marginTop: 10, padding: '10px', background: 'var(--bg-3)', borderRadius: 10 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón del rechazo (opcional):</p>
                                    <textarea className="input" rows={2} style={{ fontSize: 13, width: '100%', marginBottom: 8 }}
                                        placeholder="Ej: No perteneces a esta sede / el área indicada no corresponde..."
                                        value={rejectMsg} onChange={e => setRejectMsg(e.target.value)} />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-danger btn-sm" onClick={() => doReject(r.id)}>Confirmar rechazo</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(null); setRejectMsg(''); }}>Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button className="btn btn-accent btn-sm" onClick={() => approveReq(r.id)}>Aprobar</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => { setRejectTarget(r.id); setRejectMsg(''); }}>Rechazar</button>
                                </div>
                            )}
                        </div>
                    ))
                }
            </>)}

            {view === 'analytics' && analytics && (<>
                <h2 className="section-title">Indicadores</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[{ label: 'Reservas', value: analytics.totalReservations, icon: 'event' },
                    { label: 'Ocupación', value: `${analytics.occupancyRate}%`, icon: 'trending_up' },
                    { label: 'Colaboradores', value: analytics.totalUsers, icon: 'people' },
                    { label: 'Auditadas', value: analytics.auditedReservations, icon: 'fact_check' }
                    ].map(s => (
                        <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>{s.icon}</span>
                            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Por sala</h3>
                {Object.entries(analytics.byAmenity).map(([name, count]) => (
                    <div key={name} className="card" style={{ marginBottom: 6, padding: 12, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14 }}>{name}</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{count as number}</span>
                    </div>
                ))}
            </>)}
        </div>
    );
}