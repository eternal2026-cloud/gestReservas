import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import * as api from './services/api';
import type { User, Community, Amenity, Reservation, Post, ThemeMode, AppView } from './types';
import { getUserLevel, POINT_ACTIONS } from './types';
import { supabase, SITE_URL } from './services/supabase';
import { Loader } from './components/Loader';
import { ViewTransition } from './components/ViewTransition';
import { Splash } from './components/Splash';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { LocationPicker, EMPTY_LOCATION } from './components/LocationPicker';
import { SanctionsPage } from './pages/SanctionsPage';
import { QrAccessPage } from './pages/QrAccessPage';
import { QrValidatePage } from './pages/QrValidatePage';
import { ADR_AREAS, ADR_CARGOS_SUGERIDOS, communityTypeLabel } from './services/structure';
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

    // El enlace de recuperación llega con `type=recovery` en el hash; lo
    // marcamos para no saltar al home antes de que el usuario cambie su clave.
    const recoveryMode = useRef(window.location.hash.includes('type=recovery'));

    // ── Captura la sesión al volver de los enlaces de email (confirmación o
    // recuperación) y al recargar la página con sesión activa. ──
    // IMPORTANTE: no usar await dentro del callback de onAuthStateChange:
    // supabase-js mantiene un lock mientras corre el callback y cualquier
    // consulta interna se bloquea (deadlock: la app se cuelga al iniciar
    // sesión). El trabajo asíncrono se difiere con setTimeout.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    recoveryMode.current = true;
                    setView('reset-password');
                    return;
                }
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
                            let profile = await api.getUserByAuthId(authUser.id);
                            if (!profile) profile = await api.getUserByEmail(authUser.email ?? '');
                            if (!profile) {
                                profile = await api.createUserProfile({
                                    auth_id: authUser.id,
                                    email: authUser.email ?? '',
                                    name: authUser.user_metadata?.name || (authUser.email ?? '').split('@')[0],
                                    cargo: authUser.user_metadata?.cargo || undefined,
                                    role: 'USER',
                                    points: 0,
                                    status: 'ACTIVO',
                                });
                            }
                            setUser(profile);
                            if (recoveryMode.current) setView('reset-password');
                            else setView(v => v === 'login' ? 'home' : v);
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
                {view === 'login' ? <LoginPage /> : view === 'reset-password' ? <ResetPasswordPage recoveryMode={recoveryMode} /> : (
                    <>
                        <TopBar />
                        <div className="main-content">
                            <ViewTransition viewKey={view} direction={view === 'home' ? 'scale' : 'up'}>
                                {view === 'home' && <HomePage />}
                                {view === 'amenities' && <AmenitiesPage />}
                                {view === 'amenity-detail' && <AmenityDetailPage />}
                                {view === 'booking' && <BookingPage />}
                                {view === 'my-reservations' && <MyReservationsPage />}
                                {view === 'community' && <CommunityPage />}
                                {view === 'leaderboard' && <LeaderboardPage />}
                                {view === 'profile' && <ProfilePage />}
                                {view === 'join-community' && <JoinCommunityPage />}
                                {view === 'admin' && <AdminPage />}
                                {view === 'super-admin' && user?.role === 'SUPER_ADMIN' && (
                                    <SuperAdminPage onBack={() => go('home')} onToast={toast} />
                                )}
                                {view === 'qr-access' && user && (
                                    <QrAccessPage user={user} onBack={() => go('home')} onToast={toast} />
                                )}
                                {view === 'qr-validate' && user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                                    <QrValidatePage user={user} onBack={() => go('admin')} onToast={toast} />
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
                {user?.role === 'ADMIN' && (
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
        { icon: 'calendar_month', label: 'Reservas', view: 'my-reservations', needsCommunity: true },
        { icon: 'forum', label: 'Muro', view: 'community' },
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
function LoginPage() {
    const { setUser, go, toast } = useApp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [cargo, setCargo] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [emailSent, setEmailSent] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');

    // Animación de entrada visible al cargar
    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!cardRef.current) return;
        const tl = anime.timeline({ easing: 'easeOutCubic' });
        tl.add({
            targets: cardRef.current.querySelectorAll('.tower-floor'),
            opacity: [0, 1],
            translateY: [40, 0],
            scaleX: [0.3, 1],
            delay: anime.stagger(60, { from: 'last' }),
            duration: 700,
        })
        .add({
            targets: cardRef.current.querySelector('.login-logo svg'),
            scale: [0, 1],
            rotate: [-180, 0],
            duration: 800,
            easing: 'spring(1, 80, 10, 0)',
        }, '-=600')
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
    }, [emailSent, showRecovery, isRegister]);

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            // Supabase finge éxito aunque el correo no exista (anti-enumeración);
            // verificamos antes para avisar al vecino con claridad.
            const { data: exists } = await supabase.rpc('email_has_account', { p_email: recoveryEmail });
            if (exists === false) {
                setError('No existe ninguna cuenta con ese correo. Verifica que esté bien escrito o regístrate.');
                setLoading(false);
                return;
            }
            const { error: err } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
                redirectTo: SITE_URL,
            });
            if (err) throw err;
            toast('✉️ Revisa tu correo para restablecer la clave');
            setShowRecovery(false);
        } catch (e: any) {
            const msg = e.message || '';
            if (msg.toLowerCase().includes('rate limit')) setError('Se alcanzó el límite de correos por hora del servidor. Espera unos 60 minutos e inténtalo de nuevo.');
            else setError(msg || 'Error al enviar correo');
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        manualAuthInProgress = true;
        try {
            if (isRegister) {
                // Aviso claro si el correo ya tiene cuenta (Supabase lo oculta
                // por defecto devolviendo un usuario "fantasma" sin identities).
                const { data: exists } = await supabase.rpc('email_has_account', { p_email: email });
                if (exists === true) {
                    setError('Ya existe una cuenta con ese correo. Inicia sesión o usa "¿Olvidaste tu clave?".');
                    setLoading(false);
                    return;
                }
                // Nombre y cargo viajan como metadata: si Supabase exige confirmar
                // el correo, el perfil se crea después (listener de auth) con ellos.
                const { data, error: signUpErr } = await supabase.auth.signUp({
                    email, password,
                    options: { emailRedirectTo: SITE_URL, data: { name: name.trim(), cargo: cargo.trim() } },
                });
                if (signUpErr) throw signUpErr;
                if (data?.user && data.user.identities?.length === 0) {
                    setError('Ya existe una cuenta con ese correo. Inicia sesión o usa "¿Olvidaste tu clave?".');
                    setLoading(false);
                    return;
                }
                if (data?.user && !data.user.email_confirmed_at) {
                    setEmailSent(true);
                    setLoading(false);
                    return;
                }
                if (data?.user) {
                    const profile = await api.createUserProfile({
                        auth_id: data.user.id, email, name: name || email.split('@')[0], cargo: cargo.trim() || undefined, role: 'USER', points: 0, status: 'ACTIVO'
                    });
                    setUser(profile);
                    go('home');
                }
            } else {
                const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
                if (authErr) throw authErr;
                if (data?.user) {
                    let profile = await api.getUserByAuthId(data.user.id);
                    if (!profile) profile = await api.getUserByEmail(email);
                    if (!profile) {
                        profile = await api.createUserProfile({
                            auth_id: data.user.id, email,
                            name: data.user.user_metadata?.name || email.split('@')[0],
                            cargo: data.user.user_metadata?.cargo || undefined,
                            role: 'USER', points: 0, status: 'ACTIVO'
                        });
                    }
                    setUser(profile);
                    go('home');
                }
            }
        } catch (err: any) {
            const msg = err.message || '';
            if (msg.includes('Email not confirmed')) setError('Revisa tu correo y confirma tu cuenta antes de iniciar sesión');
            else if (msg.includes('Invalid login')) setError('Correo o contraseña incorrectos');
            else if (msg.toLowerCase().includes('rate limit')) setError('Se alcanzó el límite de correos por hora del servidor. Espera unos 60 minutos e inténtalo de nuevo.');
            else setError(msg || 'Error de autenticación');
        } finally {
            manualAuthInProgress = false;
        }
        setLoading(false);
    };

    if (emailSent) return (
        <div className="login-container" ref={cardRef}>
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card" style={{ textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 64, color: 'var(--accent)' }}>mark_email_read</span>
                <h2 style={{ margin: '16px 0 8px' }}>¡Revisa tu correo!</h2>
                <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
                    Enviamos un enlace de confirmación a <strong>{email}</strong>.<br />
                    Haz clic en el enlace y luego vuelve a iniciar sesión.
                </p>
                <button className="btn btn-primary btn-full" style={{ marginTop: 20 }} onClick={() => { setEmailSent(false); setIsRegister(false); }}>
                    Ya confirmé, iniciar sesión
                </button>
            </div>
        </div>
    );

    if (showRecovery) return (
        <div className="login-container" ref={cardRef}>
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card">
                <div className="login-logo">
                    <AdrMark size={96} />
                    <h1>Recuperar clave</h1>
                    <p>Te enviaremos un enlace a tu correo</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
                <form className="login-form" onSubmit={handleRecovery}>
                    <div><label>Correo electrónico</label><input className="input" type="email" placeholder="tu.correo@empresa.com" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required /></div>
                    <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? 'Enviando…' : 'Enviar enlace'}
                    </button>
                </form>
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => { setShowRecovery(false); setError(''); }}>
                    ← Volver a iniciar sesión
                </button>
            </div>
        </div>
    );

    return (
        <div className="login-container" ref={cardRef}>
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card">
                <div className="login-logo">
                    <AdrMark size={96} />
                    <h1>Salas ADR</h1>
                    <p>Reserva de salas de reunión · Agrícola Don Ricardo</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
                <form className="login-form" onSubmit={handleSubmit}>
                    {isRegister && (
                        <div><label>Nombres y apellidos</label><input className="input" placeholder="Tu nombre completo" value={name} onChange={e => setName(e.target.value)} required /></div>
                    )}
                    {isRegister && (
                        <div>
                            <label>Cargo</label>
                            <input className="input" list="adr-cargos" placeholder="Ej: Supervisor de Calidad" value={cargo} onChange={e => setCargo(e.target.value)} maxLength={80} required />
                            <datalist id="adr-cargos">{ADR_CARGOS_SUGERIDOS.map(c => <option key={c} value={c} />)}</datalist>
                        </div>
                    )}
                    <div><label>Correo electrónico</label><input className="input" type="email" placeholder="tu.correo@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
                    <div>
                        <label>Contraseña</label>
                        <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                        {!isRegister && (
                            <div style={{ textAlign: 'right', marginTop: 6 }}>
                                <button type="button" onClick={() => { setShowRecovery(true); setRecoveryEmail(email); setError(''); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                                    ¿Olvidaste tu clave?
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                    </button>
                </form>
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => { setIsRegister(!isRegister); setError(''); }}>
                    {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                </button>
            </div>
        </div>
    );
}

// ─── ResetPasswordPage ───
// Pantalla a la que llega el usuario desde el enlace "recuperar clave" del
// correo (evento PASSWORD_RECOVERY de Supabase).
function ResetPasswordPage({ recoveryMode }: { recoveryMode: React.MutableRefObject<boolean> }) {
    const { user, go, toast } = useApp();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) { setError('La clave debe tener al menos 6 caracteres'); return; }
        if (password !== confirm) { setError('Las claves no coinciden'); return; }
        setLoading(true);
        setError('');
        try {
            const { error: err } = await supabase.auth.updateUser({ password });
            if (err) throw err;
            recoveryMode.current = false;
            // Limpia los tokens del enlace de recuperación de la URL
            window.history.replaceState(null, '', window.location.pathname);
            toast('🔒 Clave actualizada correctamente');
            go(user ? 'home' : 'login');
        } catch (e: any) {
            setError(e.message || 'No se pudo actualizar la clave');
        }
        setLoading(false);
    };

    return (
        <div className="login-container">
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-card">
                <div className="login-logo">
                    <AdrMark size={96} />
                    <h1>Nueva clave</h1>
                    <p>Escribe tu nueva contraseña</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
                <form className="login-form" onSubmit={handleReset}>
                    <div><label>Nueva contraseña</label><input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required /></div>
                    <div><label>Confirmar contraseña</label><input className="input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
                    <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? 'Guardando…' : 'Guardar nueva clave'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── HomePage ───
function HomePage() {
    const { user, go } = useApp();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const level = getUserLevel(user?.points || 0);
    const hasCommunity = !!user?.community_id;

    useEffect(() => {
        if (user && hasCommunity) {
            api.getUserReservations(user.id).then(r => setReservations(r.filter(x => x.status === 'ACTIVA').slice(0, 3)));
            api.getAmenities(user.community_id).then(setAmenities);
        }
    }, [user]);

    return (
        <div className="fade-in">
            <div style={{ marginBottom: 24 }}>
                <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Bienvenido,</p>
                <h2 style={{ fontSize: 26, fontWeight: 800 }}>{user?.name || 'Colaborador'}</h2>
                {(user?.cargo || user?.apartment) && (
                    <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
                        {[user?.cargo, user?.apartment, user?.community?.name].filter(Boolean).join(' · ')}
                    </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span className="badge badge-primary">{level.icon} {level.name}</span>
                    <span className="badge badge-accent">{user?.points || 0} pts</span>
                </div>
            </div>

            {!hasCommunity ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--primary-light)' }}>domain</span>
                    <h3 style={{ margin: '12px 0 8px' }}>Afíliate a tu sede</h3>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>
                        Para reservar salas de reunión primero debes afiliarte a tu sede ADR indicando tu área y cargo. El administrador aprobará tu solicitud.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => go('join-community')}>Afiliarme a una sede</button>
                        {/* Registrar sede: solo admins (que aún no administran una) y el super admin.
                            Estamos en la rama !hasCommunity, así que un ADMIN aquí no tiene sede todavía. */}
                        {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                            <button className="btn btn-ghost" onClick={() => go('join-community', { createMode: true })}>Registrar sede nueva</button>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    {/* Quick actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('amenities')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary-light)' }}>add_circle</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Reservar</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Salas</p>
                        </div>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('qr-access')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--accent)' }}>qr_code_2</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Mi QR</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Acceso</p>
                        </div>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('leaderboard')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--adr-naranja)' }}>leaderboard</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Ranking</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Top colaboradores</p>
                        </div>
                        {user?.role === 'ADMIN' && (
                            <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center', border: '1px solid var(--primary-light)', gridColumn: '1 / -1' }} onClick={() => go('admin')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--adr-naranja)' }}>admin_panel_settings</span>
                                <h4 style={{ fontSize: 14, marginTop: 8 }}>Panel Admin</h4>
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Salas, solicitudes, sanciones y más</p>
                            </div>
                        )}
                    </div>

                    {/* Active reservations */}
                    <div className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>event</span> Próximas reuniones</div>
                    {reservations.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
                            <p>No tienes reuniones programadas</p>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => go('amenities')}>Reservar ahora</button>
                        </div>
                    ) : reservations.map(r => (
                        <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => go('my-reservations')}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>calendar_today</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>{r.amenity?.name || 'Sala'}</h4>
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.date} • {r.time_slot}</p>
                                {r.motivo && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>📝 {r.motivo}</p>}
                            </div>
                            <span className="badge badge-accent">Activa</span>
                        </div>
                    ))}

                    {/* Spaces preview */}
                    <div className="section-title" style={{ marginTop: 24 }}><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>location_on</span> Salas disponibles</div>
                    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                        {amenities.slice(0, 4).map(a => (
                            <div key={a.id} style={{ minWidth: 160, cursor: 'pointer' }} onClick={() => go('amenity-detail', a)}>
                                <img src={a.image_url || 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=400'} alt={a.name}
                                    style={{ width: 160, height: 100, objectFit: 'cover', borderRadius: 12 }} />
                                <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{a.name}</h4>
                                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Cap: {a.capacity}</p>
                            </div>
                        ))}
                    </div>
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

    useEffect(() => {
        api.getAmenities(user?.community_id).then(a => { setAmenities(a); setLoading(false); });
    }, [user]);

    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>meeting_room</span> Salas de reunión</h2>
            {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 240, marginBottom: 16 }} />) :
                amenities.map(a => (
                    <div key={a.id} className="amenity-card stagger-item" onClick={() => go('amenity-detail', a)}>
                        <img className="amenity-card-img" src={a.image_url || 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800'} alt={a.name} />
                        <div className="amenity-card-body">
                            <h3>{a.name}</h3>
                            <p>{a.description}</p>
                            <div className="amenity-card-meta">
                                <span><span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span> {a.capacity} personas</span>
                                <span><span className="material-symbols-outlined" style={{ fontSize: 16 }}>stars</span> +{a.points_reward} pts</span>
                            </div>
                        </div>
                    </div>
                ))
            }
        </div>
    );
}

// ─── AmenityDetailPage ───
function AmenityDetailPage() {
    const { viewData: amenity, go } = useApp();
    if (!amenity) return <div className="empty-state"><p>Selecciona una sala</p></div>;
    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('amenities')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <img src={amenity.image_url || 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800'} alt={amenity.name} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 16, marginBottom: 16 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="badge badge-accent">Disponible</span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{amenity.name}</h2>
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{amenity.description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                {[{ icon: 'group', label: 'Capacidad', value: `${amenity.capacity} Pax` },
                { icon: 'stars', label: 'Puntos', value: `+${amenity.points_reward}` },
                { icon: 'category', label: 'Tipo', value: amenity.amenity_type }
                ].map(s => (
                    <div key={s.label} className="card" style={{ textAlign: 'center', padding: 12 }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)', fontSize: 24 }}>{s.icon}</span>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                    </div>
                ))}
            </div>
            <button className="btn btn-primary btn-full" onClick={() => go('booking', amenity)}>
                <span className="material-symbols-outlined">event_available</span> Reservar Ahora
            </button>
        </div>
    );
}

// ─── BookingPage ───
function BookingPage() {
    const { viewData: amenity, user, go, toast } = useApp();

    // Helper: current date/time in Peru (UTC-5, no DST)
    const getPeruNow = () => {
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        return new Date(utc + (-5 * 60) * 60000);
    };

    const peruNow = getPeruNow();
    const todayPeru = peruNow.toISOString().split('T')[0];

    const [date, setDate] = useState(todayPeru);
    const [slot, setSlot] = useState('');
    const [motivo, setMotivo] = useState('');
    const [attendees, setAttendees] = useState('');
    const [booked, setBooked] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState<api.Eligibility | null>(null);
    const allSlots = ['07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00'];

    // Slots whose start hour is already past (only relevant if date = today)
    const isPastSlot = (s: string) => {
        if (date !== todayPeru) return false;
        const startHour = parseInt(s.split(':')[0], 10);
        return peruNow.getHours() >= startHour;
    };

    // Motor de elegibilidad: sanciones + restricciones (Hoja1 #10, #11)
    useEffect(() => {
        if (amenity && user) {
            api.getEligibility(user, amenity.id).then(setEligibility);
        }
    }, [amenity, user]);

    useEffect(() => {
        if (amenity) api.getAmenityReservations(amenity.id, date).then(r => setBooked(r.map(x => x.time_slot)));
        setSlot('');
    }, [amenity, date]);

    const dateBlocked = eligibility?.blockedDates.includes(date) || false;

    const attendeesNum = parseInt(attendees, 10);
    const overCapacity = !!amenity && attendeesNum > (amenity.capacity || 0);

    const handleBook = async () => {
        if (!slot || !user || !amenity) return;
        if (!motivo.trim()) { toast('📝 Indica el motivo de la reunión'); return; }
        if (overCapacity) { toast(`⚠️ La sala admite máximo ${amenity.capacity} personas`); return; }
        setLoading(true);
        try {
            const created = await api.createReservation({
                user_id: user.id, amenity_id: amenity.id, date, time_slot: slot,
                motivo: motivo.trim(),
                attendees: attendeesNum > 0 ? attendeesNum : undefined,
            });
            // Los puntos se otorgan cuando el admin marca la reserva como CUMPLIDA en
            // Auditoría — antes los dábamos en este punto, lo que falseaba los rankings.
            toast(`✅ Reserva ${created.code || 'confirmada'} · ${amenity.name}`);
            go('my-reservations');
        } catch (e: any) { toast('❌ ' + (e.message || 'Error')); }
        setLoading(false);
    };

    if (!amenity) return <div className="empty-state"><p>Selecciona una sala primero</p></div>;
    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('amenity-detail', amenity)} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <h2 className="section-title">Reservar {amenity.name}</h2>

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
            <input className="input stagger-item" type="date" value={date}
                min={eligibility?.minDate || todayPeru}
                max={eligibility?.maxDate || undefined}
                onChange={e => setDate(e.target.value)} style={{ marginBottom: 8 }} />
            {dateBlocked && (
                <div className="badge badge-danger stagger-item" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>
                    🚫 Esta fecha está bloqueada por sanción o cooldown
                </div>
            )}
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Horario</label>
            {date === todayPeru && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                    🕐 Hora actual en Perú: {peruNow.getHours().toString().padStart(2, '0')}:{peruNow.getMinutes().toString().padStart(2, '0')}
                </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {allSlots.map(s => {
                    const past = isPastSlot(s);
                    const occupied = booked.includes(s);
                    const disabled = occupied || past;
                    return (
                        <div key={s}
                            className={`time-slot ${slot === s ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={() => !disabled && setSlot(s)}
                            title={past ? 'Horario ya pasado' : occupied ? 'Ocupado' : ''}>
                            {s} {occupied ? '🔒' : past ? '⏰' : ''}
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
            {slot && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Resumen</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📍 {amenity.name}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📅 {date}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>🕐 {slot}</p>
                    {motivo.trim() && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📝 {motivo.trim()}</p>}
                    {attendeesNum > 0 && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>👥 {attendeesNum} asistentes</p>}
                    <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4 }}>+{amenity.points_reward || 10} puntos al cumplir la reunión</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontFamily: 'monospace' }}>
                        Recibirás un código correlativo C1-Rxxxx al confirmar.
                    </p>
                </div>
            )}
            <button className="btn btn-primary btn-full" disabled={!slot || !motivo.trim() || overCapacity || loading || dateBlocked} onClick={handleBook}>
                {loading ? 'Reservando…' : dateBlocked ? 'Fecha bloqueada' : 'Confirmar Reserva'}
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

// ─── CommunityPage ───
function CommunityPage() {
    const { user, toast, go, refreshUser } = useApp();
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
            <h3>Aún no estás afiliado a una sede</h3>
            <p style={{ margin: '8px 0' }}>Afíliate a tu sede ADR para ver las salas, reservar y participar en el muro</p>
            <button className="btn btn-primary" onClick={() => go('join-community')}>Afiliarme a una sede</button>
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

    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>forum</span> Muro ADR</h2>
            <div className="card" style={{ marginBottom: 16 }}>
                <textarea className="input" placeholder="Comparte un aviso con tu sede (salas, equipos, novedades)…" value={text} onChange={e => setText(e.target.value)} rows={2} />
                {postImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8, fontSize: 12 }}>
                        📷 {postImage.name.slice(0, 20)}
                        <button style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-3)' }} onClick={() => setPostImage(null)}>✕</button>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => createPost()}>Publicar</button>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        📷 Foto
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) setPostImage(e.target.files[0]); }} />
                    </label>
                    <button className="btn btn-ghost btn-sm" onClick={() => createPost('BUG_REPORT')}>🐛 Reportar</button>
                </div>
            </div>
            {posts.map(p => (
                <div key={p.id} className="post-card stagger-item">
                    <div className="post-header">
                        <div className="avatar">{p.user?.avatar_url ? <img src={p.user.avatar_url} alt="" /> : (p.user?.name?.[0] || '?')}</div>
                        <div className="post-header-info">
                            <h4>{p.user?.name || 'Colaborador'}</h4>
                            <span>{timeAgo(p.created_at)} {p.post_type === 'BUG_REPORT' && '• 🐛 Bug Report'}</span>
                        </div>
                    </div>
                    <p className="post-text">{p.text}</p>
                    {p.image_url && <img className="post-image" src={p.image_url} alt="" />}
                    <div className="post-actions">
                        <button className={`post-action-btn ${likedIds.includes(p.id) ? 'liked' : ''}`} onClick={() => toggleLike(p.id)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{likedIds.includes(p.id) ? 'favorite' : 'favorite_border'}</span> {p.likes_count}
                        </button>
                        <button className="post-action-btn" onClick={() => setShowComments(showComments === p.id ? null : p.id)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat_bubble_outline</span> {p.comments?.length || 0}
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
                                <button className="btn btn-primary btn-sm" onClick={() => addComment(p.id)}>Enviar</button>
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
    const [tab, setTab] = useState<'towers' | 'users'>('towers');
    const [communities, setCommunities] = useState<Community[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        api.getCommunityLeaderboard().then(setCommunities);
        if (user?.community_id) api.getCommunityUsers(user.community_id).then(setUsers);
    }, [user]);

    const maxPts = tab === 'towers' ? Math.max(...communities.map(c => c.total_points), 1) : Math.max(...users.map(u => u.points), 1);
    return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>leaderboard</span> Clasificación</h2>
            <div className="leaderboard-tabs">
                <button className={`leaderboard-tab ${tab === 'towers' ? 'active' : ''}`} onClick={() => setTab('towers')}>🏢 Sedes</button>
                <button className={`leaderboard-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>👥 Mi sede</button>
            </div>
            {tab === 'towers' ? communities.map((c, i) => (
                <div key={c.id} className="leaderboard-item stagger-item">
                    <div className={`leaderboard-rank ${i < 3 ? `top-${i + 1}` : ''}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div>
                    <div className="leaderboard-info">
                        <h4>{c.name}</h4>
                        <div className="leaderboard-bar"><div className="leaderboard-bar-fill" style={{ width: `${(c.total_points / maxPts) * 100}%` }} /></div>
                    </div>
                    <div className="leaderboard-points">{c.total_points}</div>
                </div>
            )) : users.map((u, i) => (
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
            const updated = await api.updateUserProfile(user.id, { dni: dni || undefined, phone: phone || undefined, cargo: cargoEdit.trim() || undefined });
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
                <div className="profile-email">{user?.email}</div>
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
                            {cartillaComplete ? 'Datos del colaborador registrados' : 'Cargo, DNI y celular del colaborador'}
                        </p>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowCartilla(!showCartilla)}>
                        {showCartilla ? 'Cancelar' : cartillaComplete ? 'Editar' : 'Completar'}
                    </button>
                </div>
                {showCartilla && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                {!user?.community_id && <button className="btn btn-primary btn-full" onClick={() => go('join-community')}>Afiliarme a una sede</button>}
                <button className="btn btn-danger btn-full" onClick={logout}>Cerrar sesión</button>
            </div>
        </div>
    );
}

// ─── JoinCommunityPage (Afiliación a sede ADR) ───
function JoinCommunityPage() {
    const { user, setUser, go, toast, viewData } = useApp();
    const [communities, setCommunities] = useState<Community[]>([]);
    const [selected, setSelected] = useState('');
    // Área y cargo del colaborador: el área se elige de una lista para evitar
    // duplicidad por digitación (las sanciones se aplican por área).
    const [area, setArea] = useState(user?.apartment || '');
    const [cargo, setCargo] = useState(user?.cargo || '');
    const [loading, setLoading] = useState(false);
    // Quién puede registrar sedes:
    //  - SUPER_ADMIN: siempre (dueño de la plataforma y asigna admins).
    //  - ADMIN: solo si aún NO administra una sede. Al registrarla se vuelve su
    //    admin, y la regla es "un solo admin por sede".
    //  - USER: nunca; solo puede afiliarse. El Super Admin debe activarlo como
    //    ADMIN primero (panel Super Admin → cambiar rol).
    const isAdmin = user?.role === 'ADMIN';
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const alreadyRunsCommunity = isAdmin && !!user?.community_id;
    const canCreate = isSuperAdmin || (isAdmin && !alreadyRunsCommunity);
    const [createMode, setCreateMode] = useState(canCreate && (viewData?.createMode || false));
    const [newName, setNewName] = useState('');
    // Ubicación vía mapa + selects en cascada (LocationPicker): evita errores
    // de digitación en dirección/distrito/provincia y guarda lat/lng.
    const [newLoc, setNewLoc] = useState(EMPTY_LOCATION);
    const [newType, setNewType] = useState<'OFICINA' | 'PLANTA' | 'FUNDO'>('OFICINA');

    useEffect(() => { api.getCommunities().then(setCommunities); }, []);

    const submitJoin = async () => {
        if (!selected || !user) return;
        if (!area) { toast('Selecciona tu área'); return; }
        if (!cargo.trim()) { toast('Indica tu cargo'); return; }
        setLoading(true);
        try {
            await api.createJoinRequest({
                community_id: selected, user_email: user.email, user_name: user.name,
                unit: area, cargo: cargo.trim(),
            });
            // Guardamos el cargo en el perfil desde ya (el área se asigna al aprobar).
            if (cargo.trim() !== (user.cargo || '')) {
                const updated = await api.updateUserProfile(user.id, { cargo: cargo.trim() });
                setUser(updated);
            }
            toast('✅ Solicitud enviada. El administrador de la sede debe aprobarla.');
            go('home');
        } catch (e: any) {
            toast(e?.message || 'Error al enviar solicitud');
        }
        setLoading(false);
    };

    const locationComplete = !!newLoc.address.trim() && !!newLoc.district.trim() && !!newLoc.province.trim();

    const submitCreate = async () => {
        if (!newName.trim() || !user) return;
        // Defensa en cliente: aunque la UI ya oculta el modo crear, revalidamos
        // el rol y la regla de "un admin por sede" antes de pegarle a la API.
        if (!isAdmin && !isSuperAdmin) {
            toast('🔒 Solo un administrador puede registrar sedes. Pide al Super Admin que te active como administrador.');
            return;
        }
        if (alreadyRunsCommunity) {
            toast('🏢 Ya eres administrador de una sede. Solo puede haber un admin por sede.');
            return;
        }
        if (!locationComplete) {
            toast('📍 Completa la ubicación: busca la dirección en el mapa y confirma distrito y provincia.');
            return;
        }
        if (!area || !cargo.trim()) {
            toast('Indica tu área y cargo');
            return;
        }
        setLoading(true);
        try {
            const community = await api.createCommunity({
                name: newName.trim(),
                address: newLoc.address.trim(),
                district: newLoc.district.trim(),
                province: newLoc.province.trim(),
                map_lat: newLoc.lat,
                map_lng: newLoc.lng,
                community_type: newType,
                admin_email: user.email,
            });
            const updated = await api.updateUserProfile(user.id, {
                community_id: community.id, role: 'ADMIN', apartment: area, cargo: cargo.trim(),
            });
            setUser(updated);
            toast('✅ Sede registrada. ¡Eres el administrador!');
            go('home');
        } catch (e: any) { toast('Error: ' + (e.message || 'No se pudo registrar')); }
        setLoading(false);
    };

    const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' } as const;

    const areaCargoFields = (
        <>
            <label className="stagger-item" style={labelStyle}>Área</label>
            <select className="input stagger-item" value={area} onChange={e => setArea(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="">Selecciona tu área…</option>
                {ADR_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <label className="stagger-item" style={labelStyle}>Cargo</label>
            <input className="input stagger-item" list="adr-cargos-afiliacion" placeholder="Ej: Jefe de Mantenimiento"
                value={cargo} onChange={e => setCargo(e.target.value)} maxLength={80} style={{ marginBottom: 16 }} />
            <datalist id="adr-cargos-afiliacion">{ADR_CARGOS_SUGERIDOS.map(c => <option key={c} value={c} />)}</datalist>
        </>
    );

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('home')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            {canCreate && (
                <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <button className={`btn btn-full ${!createMode ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 0, flex: 1 }} onClick={() => setCreateMode(false)}>Afiliarme a sede</button>
                    <button className={`btn btn-full ${createMode ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 0, flex: 1 }} onClick={() => setCreateMode(true)}>Registrar sede</button>
                </div>
            )}
            {!createMode ? (
                <>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }} className="stagger-item">Afiliarme a una sede ADR</h3>
                    <label className="stagger-item" style={labelStyle}>Sede</label>
                    <select className="input stagger-item" value={selected} onChange={e => setSelected(e.target.value)} style={{ marginBottom: 12 }}>
                        <option value="">Selecciona una sede activa…</option>
                        {communities.filter(c => c.is_active !== false).map(c => (
                            <option key={c.id} value={c.id}>{c.name} — {communityTypeLabel(c.community_type)} · {c.district || c.address || ''}</option>
                        ))}
                    </select>

                    {areaCargoFields}

                    <button className="btn btn-primary btn-full stagger-item" onClick={submitJoin} disabled={!selected || !area || !cargo.trim() || loading}>
                        {loading ? 'Enviando…' : '📨 Enviar solicitud'}
                    </button>
                    <p className="stagger-item" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, textAlign: 'center' }}>
                        Recibirás un código <strong>C1-Sxxxx</strong> y el administrador de la sede gestionará tu solicitud.
                    </p>
                </>
            ) : (
                <>
                    <h3 className="stagger-item" style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Registrar sede nueva</h3>
                    <p className="stagger-item" style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Serás el <strong>administrador</strong> único de esta sede y de sus salas.</p>

                    <label className="stagger-item" style={labelStyle}>Tipo de sede</label>
                    <div className="stagger-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                        {[
                            { value: 'OFICINA' as const, label: '🏢 Oficina' },
                            { value: 'PLANTA' as const, label: '🏭 Planta' },
                            { value: 'FUNDO' as const, label: '🌱 Fundo' },
                        ].map(t => (
                            <button key={t.value} type="button"
                                className={`btn btn-sm ${newType === t.value ? 'btn-primary' : 'btn-ghost'}`}
                                style={{ fontSize: 12, padding: '8px 4px' }}
                                onClick={() => setNewType(t.value)}>{t.label}</button>
                        ))}
                    </div>

                    <label className="stagger-item" style={labelStyle}>Nombre</label>
                    <input className="input stagger-item" placeholder="Ej: Oficina Central ADR" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: 12 }} />

                    <div className="stagger-item">
                        <LocationPicker value={newLoc} onChange={setNewLoc} />
                    </div>

                    {areaCargoFields}

                    <button className="btn btn-primary btn-full" onClick={submitCreate} disabled={!newName.trim() || !locationComplete || !area || !cargo.trim() || loading}>
                        {loading ? 'Registrando...' : 'Registrar sede y ser admin'}
                    </button>
                    {!locationComplete && (
                        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
                            📍 Falta la ubicación: busca la dirección en el mapa y confirma distrito y provincia.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}


// ─── AdminPage ───
function AdminPage() {
    const { user, go, toast } = useApp();
    const [view, setView] = useState<'menu' | 'users' | 'audit' | 'requests' | 'analytics' | 'spaces' | 'rules'>('menu');
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [showCreateSpace, setShowCreateSpace] = useState(false);
    const [complianceMap, setComplianceMap] = useState<Record<string, number>>({}); // reservationId -> %
    const [rejectTarget, setRejectTarget] = useState<string | null>(null); // requestId being rejected
    const [rejectMsg, setRejectMsg] = useState('');
    const [areaUserCounts, setAreaUserCounts] = useState<Record<string, number>>({}); // área -> colaboradores

    // Create space form state
    const [spaceName, setSpaceName] = useState('');
    const [spaceType, setSpaceType] = useState('');
    const [spaceCapacity, setSpaceCapacity] = useState('8');
    const [spaceDesc, setSpaceDesc] = useState('');
    const [spacePoints, setSpacePoints] = useState('10');
    const [spaceImageFile, setSpaceImageFile] = useState<File | null>(null);
    const [spaceLoading, setSpaceLoading] = useState(false);

    // Imagen por defecto según el tipo de sala
    const DEFAULT_IMAGES: Record<string, string> = {
        'DIRECTORIO': 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=800',
        'REUNIONES': 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800',
        'CAPACITACION': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800',
        'VIDEOCONFERENCIA': 'https://images.unsplash.com/photo-1600508774634-4e11d34730e2?w=800',
        'AUDITORIO': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800',
        'FOCUS': 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800',
        'OTRO': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
    };

    const SPACE_PRESETS = [
        { type: 'DIRECTORIO', label: '👔 Sala de Directorio', desc: 'Mesa ejecutiva, pantalla y videoconferencia', cap: 14 },
        { type: 'REUNIONES', label: '🤝 Sala de Reuniones', desc: 'Sala estándar con TV y pizarra', cap: 8 },
        { type: 'CAPACITACION', label: '🎓 Sala de Capacitación', desc: 'Proyector, sonido y mesas modulares', cap: 30 },
        { type: 'VIDEOCONFERENCIA', label: '🎥 Videoconferencia', desc: 'Cámara, micrófono y pantalla para Teams', cap: 6 },
        { type: 'AUDITORIO', label: '🎤 Auditorio', desc: 'Escenario, sonido y butacas', cap: 80 },
        { type: 'FOCUS', label: '💬 Sala Focus', desc: 'Sala pequeña para 1 a 1 o llamadas', cap: 3 },
        { type: 'OTRO', label: '📦 Otra', desc: '', cap: 8 },
    ];

    if (user?.role !== 'ADMIN') return <div className="empty-state"><p>Acceso denegado</p></div>;

    const load = async (v: string) => {
        setView(v as any);
        if (v === 'users') api.getAllUsers().then(setAllUsers);
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
        if (v === 'spaces') api.getAmenities(user.community_id).then(setAmenities);
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

    const selectPreset = (preset: typeof SPACE_PRESETS[0]) => {
        setSpaceType(preset.type);
        setSpaceName(preset.label.replace(/^[^\s]+\s/, '')); // Remove emoji prefix
        setSpaceDesc(preset.desc);
        setSpaceCapacity(String(preset.cap));
    };

    const createSpace = async () => {
        if (!spaceName.trim() || !user?.community_id) return;
        setSpaceLoading(true);
        try {
            let imageUrl = DEFAULT_IMAGES[spaceType] || DEFAULT_IMAGES['OTRO'];

            // Create the amenity first
            const newAmenity = await api.createAmenity({
                community_id: user.community_id,
                name: spaceName.trim(),
                amenity_type: spaceType || 'OTRO',
                capacity: parseInt(spaceCapacity) || 8,
                description: spaceDesc.trim(),
                image_url: imageUrl,
                points_reward: parseInt(spacePoints) || 10,
            });

            // If a custom image was uploaded, update with real photo
            if (spaceImageFile) {
                const uploadedUrl = await api.uploadAmenityImage(newAmenity.id, spaceImageFile);
                await api.updateAmenity(newAmenity.id, { image_url: uploadedUrl });
                newAmenity.image_url = uploadedUrl;
            }

            setAmenities(prev => [...prev, newAmenity]);
            toast('✅ Sala creada correctamente');
            // Reset form
            setShowCreateSpace(false);
            setSpaceName(''); setSpaceType(''); setSpaceDesc('');
            setSpaceCapacity('8'); setSpacePoints('10'); setSpaceImageFile(null);
        } catch (e: any) { toast('Error: ' + (e.message || 'No se pudo crear')); }
        setSpaceLoading(false);
    };

    const deleteSpace = async (id: string) => {
        if (!confirm('¿Eliminar esta sala? Las reservas existentes se perderán.')) return;
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

    if (view === 'menu') return (
        <div className="fade-in">
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>admin_panel_settings</span> Panel Admin</h2>
            {[{ icon: 'meeting_room', title: 'Salas', desc: 'Crear y gestionar salas de reunión', v: 'spaces' },
            { icon: 'people', title: 'Colaboradores', desc: 'Usuarios, áreas y cargos', v: 'users' },
            { icon: 'qr_code_scanner', title: 'Validar QR', desc: 'Escanear acceso de colaboradores y visitantes', v: 'qr-validate' },
            { icon: 'fact_check', title: 'Auditoría', desc: 'Calificar uso de las salas', v: 'audit' },
            { icon: 'mail', title: 'Solicitudes', desc: 'Aprobar afiliaciones a la sede', v: 'requests' },
            { icon: 'gavel', title: 'Reglas', desc: 'Sanciones por área y restricciones', v: 'rules' },
            { icon: 'analytics', title: 'Analytics', desc: 'Dashboard', v: 'analytics' }
            ].map(item => (
                <div key={item.v} className="admin-card" onClick={() => item.v === 'qr-validate' ? go('qr-validate') : load(item.v)}>
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

            {/* ─── Spaces Management ─── */}
            {view === 'spaces' && (<>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>Salas ({amenities.length})</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreateSpace(!showCreateSpace)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showCreateSpace ? 'close' : 'add'}</span>
                        {showCreateSpace ? 'Cancelar' : 'Crear'}
                    </button>
                </div>

                {/* Create form */}
                {showCreateSpace && (
                    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Nueva sala</h3>

                        {/* Preset selector */}
                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8, display: 'block' }}>Tipo de sala</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
                            {SPACE_PRESETS.map(p => (
                                <button key={p.type}
                                    className={`btn btn-sm ${spaceType === p.type ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: 12, padding: '8px 4px', whiteSpace: 'nowrap' }}
                                    onClick={() => selectPreset(p)}>
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Preview image */}
                        {spaceType && (
                            <div style={{ marginBottom: 16, position: 'relative' }}>
                                <img src={spaceImageFile ? URL.createObjectURL(spaceImageFile) : (DEFAULT_IMAGES[spaceType] || DEFAULT_IMAGES['OTRO'])}
                                    alt="preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12 }} />
                                <label style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--primary)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>photo_camera</span>
                                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Cambiar foto</span>
                                    <input type="file" accept="image/*" onChange={e => setSpaceImageFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                </label>
                            </div>
                        )}

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Nombre</label>
                        <input className="input" placeholder="Ej: Sala Arándano — 2.º piso" value={spaceName} onChange={e => setSpaceName(e.target.value)} style={{ marginBottom: 12 }} />

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Descripción</label>
                        <textarea className="input" placeholder="Equipamiento, ubicación, indicaciones..." value={spaceDesc} onChange={e => setSpaceDesc(e.target.value)}
                            style={{ marginBottom: 12, minHeight: 60, resize: 'vertical' }} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Capacidad</label>
                                <input className="input" type="number" min="1" value={spaceCapacity} onChange={e => setSpaceCapacity(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Puntos por reunión cumplida</label>
                                <input className="input" type="number" min="0" value={spacePoints} onChange={e => setSpacePoints(e.target.value)} />
                            </div>
                        </div>

                        <button className="btn btn-primary btn-full" onClick={createSpace} disabled={!spaceName.trim() || !spaceType || spaceLoading}>
                            {spaceLoading ? 'Creando...' : 'Crear sala'}
                        </button>
                    </div>
                )}

                {/* Existing amenities list */}
                {amenities.length === 0 && !showCreateSpace ? (
                    <div className="empty-state" style={{ padding: 40 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>meeting_room</span>
                        <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No hay salas creadas</p>
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crea la primera sala de reunión de tu sede</p>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreateSpace(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Crear sala
                        </button>
                    </div>
                ) : (
                    amenities.map(a => (
                        <div key={a.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ position: 'relative', width: 100, minHeight: 80, flexShrink: 0 }}>
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
                                <div style={{ flex: 1, padding: '10px 10px 10px 0' }}>
                                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{a.name}</h4>
                                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{a.description}</p>
                                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-2)' }}>
                                        <span>👥 {a.capacity}</span>
                                        <span>⭐ +{a.points_reward} pts</span>
                                        <span>📦 {a.amenity_type}</span>
                                    </div>
                                </div>
                                <button onClick={() => deleteSpace(a.id)}
                                    style={{ padding: '0 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </>)}

            {view === 'users' && (<>
                <h2 className="section-title">Colaboradores ({allUsers.length})</h2>
                {allUsers.map(u => (
                    <div key={u.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar">{u.name[0]}</div>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: 14 }}>{u.name}</h4>
                            <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{[u.cargo, u.apartment].filter(Boolean).join(' · ') || 'Sin área / cargo'}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email} • {u.role}</p>
                        </div>
                        <span className={`badge ${u.status === 'ACTIVO' ? 'badge-accent' : 'badge-danger'}`}>{u.status}</span>
                    </div>
                ))}
            </>)}

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
                <h2 className="section-title">Dashboard</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[{ label: 'Reservas', value: analytics.totalReservations, icon: 'event' },
                    { label: 'Ocupación', value: `${analytics.occupancyRate}%`, icon: 'trending_up' },
                    { label: 'Colaboradores', value: analytics.totalUsers, icon: 'people' },
                    { label: 'Posts', value: analytics.totalPosts, icon: 'forum' }
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