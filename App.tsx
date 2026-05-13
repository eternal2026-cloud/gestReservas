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
import { QrAccessPage } from './pages/QrAccessPage';
import { generateStructure, flatApartments, communityTypeLabel } from './services/structure';
import anime from 'animejs';


// ─── Context ───
interface AppCtx {
    user: User | null;
    setUser: (u: User | null) => void;
    theme: ThemeMode;
    toggleTheme: () => void;
    view: AppView;
    go: (v: AppView, data?: any) => void;
    viewData: any;
    toast: (msg: string) => void;
}
const Ctx = createContext<AppCtx>({} as AppCtx);
const useApp = () => useContext(Ctx);

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
        (localStorage.getItem('roomly-theme') as ThemeMode) || 'dark'
    );
    const [view, setView] = useState<AppView>('login');
    const [viewData, setViewData] = useState<any>(null);
    const [toastMsg, setToastMsg] = useState('');
    const [rejectionToast, setRejectionToast] = useState<{ msg: string; id: string } | null>(null);
    const checkedRejections = useRef(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('roomly-theme', theme);
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

    const ctx: AppCtx = { user, setUser, theme, toggleTheme, view, go, viewData, toast };

    return (
        <Ctx.Provider value={ctx}>
            {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
            <div className="app-container">
                {view === 'login' ? <LoginPage /> : (
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
                <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="40" height="40" rx="12" fill="#7C3AED" />
                    <path d="M12 28V16L20 10L28 16V28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 28V22" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="20" cy="16" r="2" fill="white" />
                </svg>
                <span className="logo-text">Roomly</span>
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
                        style={{ color: '#f59e0b' }}>
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
        { icon: 'search', label: 'Espacios', view: 'amenities', needsCommunity: true },
        { icon: 'calendar_month', label: 'Reservas', view: 'my-reservations', needsCommunity: true },
        { icon: 'groups', label: 'Comunidad', view: 'community' },
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
            const { error: err } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
                redirectTo: window.location.origin,
            });
            if (err) throw err;
            toast('✉️ Revisa tu correo para restablecer la clave');
            setShowRecovery(false);
        } catch (e: any) {
            setError(e.message || 'Error al enviar correo');
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isRegister) {
                const { data } = await supabase.auth.signUp({ email, password });
                if (data?.user && !data.user.email_confirmed_at) {
                    setEmailSent(true);
                    setLoading(false);
                    return;
                }
                if (data?.user) {
                    const profile = await api.createUserProfile({
                        auth_id: data.user.id, email, name: name || email.split('@')[0], role: 'USER', points: 0, status: 'ACTIVO'
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
                            auth_id: data.user.id, email, name: email.split('@')[0],
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
            else setError(msg || 'Error de autenticación');
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
                    <svg width="80" height="80" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="12" fill="#7C3AED" />
                        <path d="M12 28V16L20 10L28 16V28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="20" cy="16" r="2" fill="white" />
                    </svg>
                    <h1>Recuperar clave</h1>
                    <p>Te enviaremos un enlace a tu correo</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
                <form className="login-form" onSubmit={handleRecovery}>
                    <div><label>Correo electrónico</label><input className="input" type="email" placeholder="tu@email.com" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required /></div>
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
            <div className="tower-animation" style={{ pointerEvents: 'none' }}>
                {Array.from({ length: 18 }).map((_, i) => (
                    <div key={i} className="tower-floor" style={{
                        width: `${60 + ((i * 37) % 40)}%`, margin: '0 auto',
                        opacity: 0,
                        animation: 'none',
                    }} />
                ))}
            </div>
            <div className="login-card">
                <div className="login-logo">
                    <svg width="80" height="80" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto', filter: 'drop-shadow(0 4px 12px rgba(124,58,237,0.4))' }}>
                        <rect width="40" height="40" rx="12" fill="#7C3AED" />
                        <path d="M12 28V16L20 10L28 16V28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M20 28V22" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="20" cy="16" r="2" fill="white" />
                    </svg>
                    <h1>Roomly</h1>
                    <p>Tu comunidad, conectada</p>
                </div>
                {error && <div className="badge badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '8px 12px' }}>{error}</div>}
                <form className="login-form" onSubmit={handleSubmit}>
                    {isRegister && (
                        <div><label>Nombre</label><input className="input" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} required /></div>
                    )}
                    <div><label>Correo electrónico</label><input className="input" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
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
                <h2 style={{ fontSize: 26, fontWeight: 800 }}>{user?.name || 'Vecino'}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span className="badge badge-primary">{level.icon} {level.name}</span>
                    <span className="badge badge-accent">{user?.points || 0} pts</span>
                </div>
            </div>

            {!hasCommunity ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--primary-light)' }}>apartment</span>
                    <h3 style={{ margin: '12px 0 8px' }}>Únete a tu torre</h3>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>
                        Para reservar espacios, ver la comunidad y ganar puntos, primero debes unirte o crear una torre.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => go('join-community')}>Unirme a una torre</button>
                        <button className="btn btn-ghost" onClick={() => go('join-community', { createMode: true })}>Crear torre nueva</button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Quick actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('amenities')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary-light)' }}>add_circle</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Reservar</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Espacios</p>
                        </div>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('qr-access')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--accent)' }}>qr_code_2</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Mi QR</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Acceso</p>
                        </div>
                        <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => go('leaderboard')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#f59e0b' }}>leaderboard</span>
                            <h4 style={{ fontSize: 14, marginTop: 8 }}>Ranking</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Top vecinos</p>
                        </div>
                        {user?.role === 'ADMIN' && (
                            <div className="card stagger-item" style={{ cursor: 'pointer', textAlign: 'center', border: '1px solid var(--primary-light)', gridColumn: '1 / -1' }} onClick={() => go('admin')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#f59e0b' }}>admin_panel_settings</span>
                                <h4 style={{ fontSize: 14, marginTop: 8 }}>Panel Admin</h4>
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Sanciones, reglas, solicitudes y más</p>
                            </div>
                        )}
                    </div>

                    {/* Active reservations */}
                    <div className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>event</span> Próximas Reservas</div>
                    {reservations.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
                            <p>No tienes reservas activas</p>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => go('amenities')}>Reservar ahora</button>
                        </div>
                    ) : reservations.map(r => (
                        <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => go('my-reservations')}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>calendar_today</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>{r.amenity?.name || 'Espacio'}</h4>
                                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.date} • {r.time_slot}</p>
                            </div>
                            <span className="badge badge-accent">Activa</span>
                        </div>
                    ))}

                    {/* Spaces preview */}
                    <div className="section-title" style={{ marginTop: 24 }}><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>location_on</span> Espacios Disponibles</div>
                    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                        {amenities.slice(0, 4).map(a => (
                            <div key={a.id} style={{ minWidth: 160, cursor: 'pointer' }} onClick={() => go('amenity-detail', a)}>
                                <img src={a.image_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400'} alt={a.name}
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
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>search</span> Espacios Comunes</h2>
            {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 240, marginBottom: 16 }} />) :
                amenities.map(a => (
                    <div key={a.id} className="amenity-card stagger-item" onClick={() => go('amenity-detail', a)}>
                        <img className="amenity-card-img" src={a.image_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800'} alt={a.name} />
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
    if (!amenity) return <div className="empty-state"><p>Selecciona un espacio</p></div>;
    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('amenities')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <img src={amenity.image_url || ''} alt={amenity.name} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 16, marginBottom: 16 }} />
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
    const [booked, setBooked] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState<api.Eligibility | null>(null);
    const allSlots = ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00'];

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

    const handleBook = async () => {
        if (!slot || !user || !amenity) return;
        setLoading(true);
        try {
            // Pool restriction: max 1 reservation every 15 days
            if (amenity.name.toLowerCase().includes('piscina')) {
                const userRes = await api.getUserReservations(user.id);
                const poolRes = userRes.filter(r => r.amenity?.name?.toLowerCase().includes('piscina') && r.status === 'ACTIVA');
                const now = new Date();
                const recentPool = poolRes.find(r => {
                    const diff = (now.getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
                    return diff < 15;
                });
                if (recentPool) {
                    toast('⚠️ Solo puedes reservar la piscina 1 vez cada 15 días');
                    setLoading(false);
                    return;
                }
            }
            const created = await api.createReservation({ user_id: user.id, amenity_id: amenity.id, date, time_slot: slot });
            if (user.community_id) await api.awardPoints(user.id, user.community_id, 'RESERVATION_COMPLETED', amenity.points_reward || 10, `Reserva en ${amenity.name}`);
            toast(`✅ Reserva ${created.code || 'confirmada'} · ${amenity.name}`);
            go('my-reservations');
        } catch (e: any) { toast('❌ ' + (e.message || 'Error')); }
        setLoading(false);
    };

    if (!amenity) return <div className="empty-state"><p>Selecciona un espacio primero</p></div>;
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
            {slot && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Resumen</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📍 {amenity.name}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>📅 {date}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>🕐 {slot}</p>
                    <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4 }}>+{amenity.points_reward || 10} puntos</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontFamily: 'monospace' }}>
                        Recibirás un código correlativo C1-Rxxxx al confirmar.
                    </p>
                </div>
            )}
            <button className="btn btn-primary btn-full" disabled={!slot || loading || dateBlocked} onClick={handleBook}>
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
                        <img src={r.amenity?.image_url || ''} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>{r.amenity?.name}</h4>
                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.date} • {r.time_slot}</p>
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
    const { user, toast, go } = useApp();
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
            <span className="material-symbols-outlined">groups</span>
            <h3>No perteneces a una comunidad</h3>
            <p style={{ margin: '8px 0' }}>Únete a una torre para ver espacios, reservar y participar</p>
            <button className="btn btn-primary" onClick={() => go('join-community')}>Unirme a una torre</button>
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
            await api.awardPoints(user.id, user.community_id!, type === 'BUG_REPORT' ? 'BUG_REPORT' : type === 'FOTO_AREA' ? 'UPLOAD_AREA_PHOTO' : 'COMMENT', pts, type === 'FOTO_AREA' ? 'Foto de área común subida' : undefined);
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
            <h2 className="section-title"><span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>groups</span> Comunidad</h2>
            <div className="card" style={{ marginBottom: 16 }}>
                <textarea className="input" placeholder="¿Qué hay de nuevo en la torre?" value={text} onChange={e => setText(e.target.value)} rows={2} />
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
                            <h4>{p.user?.name || 'Vecino'}</h4>
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
                <button className={`leaderboard-tab ${tab === 'towers' ? 'active' : ''}`} onClick={() => setTab('towers')}>🏢 Torres</button>
                <button className={`leaderboard-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>👥 Mi Torre</button>
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
    const cartillaComplete = !!(user?.dni && user?.phone);

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
            const updated = await api.updateUserProfile(user.id, { dni: dni || undefined, phone: phone || undefined });
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
            setUser(updated);
            if (user.community_id) {
                await api.awardPoints(user.id, user.community_id, 'PROFILE_PHOTO', 20, 'Foto de perfil subida');
            }
            toast('✅ Foto actualizada (+20 pts)');
        } catch { toast('Error al subir foto'); }
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
                    <div className="profile-stat"><div className="profile-stat-value">{user?.tower || '-'}</div><div className="profile-stat-label">Torre</div></div>
                    <div className="profile-stat"><div className="profile-stat-value">{user?.apartment || '-'}</div><div className="profile-stat-label">Depto</div></div>
                </div>
            </div>

            {/* Cartilla completa (Hoja1 #3) */}
            <div className="card" style={{ marginBottom: 16, padding: 14, border: cartillaComplete ? '1px solid var(--accent)' : '1px dashed var(--warning)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCartilla ? 12 : 0 }}>
                    <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700 }}>
                            {cartillaComplete ? '✅ Cartilla completa' : '📝 Completa tu cartilla'}
                        </h4>
                        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {cartillaComplete ? 'Datos verificados para reservar' : 'DNI y celular para verificación'}
                        </p>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowCartilla(!showCartilla)}>
                        {showCartilla ? 'Cancelar' : cartillaComplete ? 'Editar' : 'Completar'}
                    </button>
                </div>
                {showCartilla && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>DNI</label>
                            <input className="input" placeholder="12345678" value={dni} onChange={e => setDni(e.target.value)} inputMode="numeric" maxLength={12} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>Celular</label>
                            <input className="input" placeholder="+51 999 999 999" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ gridColumn: '1 / -1' }} onClick={saveCartilla}>Guardar cartilla</button>
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
                {!user?.community_id && <button className="btn btn-primary btn-full" onClick={() => go('join-community')}>Unirme a una torre</button>}
                <button className="btn btn-danger btn-full" onClick={logout}>Cerrar sesión</button>
            </div>
        </div>
    );
}

// ─── JoinCommunityPage ───
function JoinCommunityPage() {
    const { user, setUser, go, toast, viewData } = useApp();
    const [communities, setCommunities] = useState<Community[]>([]);
    const [selected, setSelected] = useState('');
    const [tower, setTower] = useState('');
    const [unit, setUnit] = useState('');
    const [occupiedUnits, setOccupiedUnits] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [createMode, setCreateMode] = useState(viewData?.createMode || false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newDistrict, setNewDistrict] = useState('');
    const [newProvince, setNewProvince] = useState('');
    const [newType, setNewType] = useState<'EDIFICIO' | 'CONDOMINIO' | 'MULTIFAMILIAR'>('EDIFICIO');
    // Tower config fields (create mode)
    const [numBuildings, setNumBuildings] = useState(1);
    const [numFloors, setNumFloors] = useState(10);
    const [roomsPerFloor, setRoomsPerFloor] = useState(4);
    const [adminFloor, setAdminFloor] = useState(1);
    const [adminRoom, setAdminRoom] = useState(1);

    // Auto-generate apartment number: floor*100 + room
    const adminApartment = String(adminFloor * 100 + adminRoom);

    // Comunidad seleccionada (para mostrar estructura)
    const selectedCommunity = communities.find(c => c.id === selected);

    useEffect(() => { api.getCommunities().then(setCommunities); }, []);

    // Al seleccionar comunidad, carga dptos ocupados (anti-duplicado)
    useEffect(() => {
        if (!selected) { setOccupiedUnits([]); return; }
        api.getCommunityUsers(selected).then(users => {
            setOccupiedUnits(users.map(u => u.apartment).filter(Boolean) as string[]);
        });
        setUnit('');
    }, [selected]);

    const submitJoin = async () => {
        if (!selected || !user) return;
        setLoading(true);
        try {
            await api.createJoinRequest({ community_id: selected, user_email: user.email, user_name: user.name, tower, unit });
            toast('✅ Solicitud enviada. El admin debe aprobarla.');
            go('home');
        } catch { toast('Error al enviar solicitud'); }
        setLoading(false);
    };

    const submitCreate = async () => {
        if (!newName.trim() || !user) return;
        setLoading(true);
        try {
            const community = await api.createCommunity({
                name: newName.trim(),
                address: newAddress.trim(),
                district: newDistrict.trim() || undefined,
                province: newProvince.trim() || undefined,
                community_type: newType,
                admin_email: user.email,
                num_buildings: numBuildings,
                total_floors: numFloors,
                rooms_per_floor: roomsPerFloor,
                units_per_floor: roomsPerFloor,
            });
            const updated = await api.updateUserProfile(user.id, {
                community_id: community.id, role: 'ADMIN', tower: tower || 'Torre A', apartment: adminApartment
            });
            setUser(updated);
            toast(`✅ Torre creada. Tu depto: ${adminApartment}. ¡Eres el administrador!`);
            go('home');
        } catch (e: any) { toast('Error: ' + (e.message || 'No se pudo crear')); }
        setLoading(false);
    };

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => go('home')} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <button className={`btn btn-full ${!createMode ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 0, flex: 1 }} onClick={() => setCreateMode(false)}>Unirme a torre</button>
                <button className={`btn btn-full ${createMode ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 0, flex: 1 }} onClick={() => setCreateMode(true)}>Crear torre nueva</button>
            </div>
            {!createMode ? (
                <>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }} className="stagger-item">Unirme a torre existente</h3>
                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Comunidad</label>
                    <select className="input stagger-item" value={selected} onChange={e => setSelected(e.target.value)} style={{ marginBottom: 12 }}>
                        <option value="">Selecciona una comunidad activa…</option>
                        {communities.filter(c => c.is_active !== false).map(c => (
                            <option key={c.id} value={c.id}>{c.name} — {communityTypeLabel(c.community_type)} · {c.district || c.address || ''}</option>
                        ))}
                    </select>

                    {selectedCommunity && (
                        <div className="card stagger-item" style={{ marginBottom: 12, padding: 12, background: 'var(--bg-2)' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
                                🏢 {selectedCommunity.total_floors} pisos × {selectedCommunity.rooms_per_floor} dptos =
                                {' '}<strong>{selectedCommunity.total_floors * selectedCommunity.rooms_per_floor} unidades</strong>
                            </p>
                            {occupiedUnits.length > 0 && (
                                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                    {occupiedUnits.length} departamentos ya tienen vecino registrado.
                                </p>
                            )}
                        </div>
                    )}

                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Bloque / Torre (si aplica)</label>
                    <input className="input stagger-item" placeholder="Ej: Torre A" value={tower} onChange={e => setTower(e.target.value)} style={{ marginBottom: 12 }} />

                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Departamento (selecciona uno)</label>
                    <select
                        className="input stagger-item"
                        value={unit}
                        disabled={!selectedCommunity}
                        onChange={e => setUnit(e.target.value)}
                        style={{ marginBottom: 16 }}>
                        <option value="">{selectedCommunity ? 'Selecciona departamento…' : 'Primero selecciona la comunidad'}</option>
                        {selectedCommunity && generateStructure(selectedCommunity.total_floors, selectedCommunity.rooms_per_floor).map(f => (
                            <optgroup key={f.floor} label={`Piso ${f.floor}`}>
                                {f.apartments.map(a => {
                                    const occupied = occupiedUnits.includes(a);
                                    return (
                                        <option key={a} value={a} disabled={occupied}>
                                            {a}{occupied ? ' · 🔒 ocupado' : ' · libre'}
                                        </option>
                                    );
                                })}
                            </optgroup>
                        ))}
                    </select>

                    <button className="btn btn-primary btn-full stagger-item" onClick={submitJoin} disabled={!selected || !unit || loading}>
                        {loading ? 'Enviando…' : '📨 Enviar solicitud'}
                    </button>
                    <p className="stagger-item" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, textAlign: 'center' }}>
                        Recibirás un código <strong>C1-Sxxxx</strong> y el admin gestionará tu solicitud.
                    </p>
                </>
            ) : (
                <>
                    <h3 className="stagger-item" style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Crear comunidad nueva</h3>
                    <p className="stagger-item" style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Serás el <strong>administrador</strong> único de esta comunidad.</p>

                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Tipo</label>
                    <div className="stagger-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                        {[
                            { value: 'EDIFICIO' as const, label: '🏢 Edificio' },
                            { value: 'CONDOMINIO' as const, label: '🏘️ Condominio' },
                            { value: 'MULTIFAMILIAR' as const, label: '🏠 Multifamiliar' },
                        ].map(t => (
                            <button key={t.value} type="button"
                                className={`btn btn-sm ${newType === t.value ? 'btn-primary' : 'btn-ghost'}`}
                                style={{ fontSize: 12, padding: '8px 4px' }}
                                onClick={() => setNewType(t.value)}>{t.label}</button>
                        ))}
                    </div>

                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Nombre</label>
                    <input className="input stagger-item" placeholder="Ej: Jardines de Sta Beatriz" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: 12 }} />

                    <label className="stagger-item" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Dirección</label>
                    <input className="input stagger-item" placeholder="Ej: Av. Principal #123" value={newAddress} onChange={e => setNewAddress(e.target.value)} style={{ marginBottom: 12 }} />

                    <div className="stagger-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Distrito</label>
                            <input className="input" placeholder="Ej: Cercado de Lima" value={newDistrict} onChange={e => setNewDistrict(e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Provincia</label>
                            <input className="input" placeholder="Ej: Lima" value={newProvince} onChange={e => setNewProvince(e.target.value)} />
                        </div>
                    </div>

                    {/* Tower structure config */}
                    <div style={{ background: 'var(--bg-3)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🏗️ Configuración de la torre</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Edificios</label>
                                <input className="input" type="number" min={1} max={20} value={numBuildings}
                                    onChange={e => setNumBuildings(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '8px', textAlign: 'center' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Pisos</label>
                                <input className="input" type="number" min={1} max={50} value={numFloors}
                                    onChange={e => setNumFloors(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '8px', textAlign: 'center' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Deptos/piso</label>
                                <input className="input" type="number" min={1} max={20} value={roomsPerFloor}
                                    onChange={e => setRoomsPerFloor(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '8px', textAlign: 'center' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            Total: {numFloors * roomsPerFloor * numBuildings} departamentos · Numeración: piso{numFloors > 0 ? ' ' + numFloors : ''}, depto {numFloors * 100 + 1} – {numFloors * 100 + roomsPerFloor}
                        </p>
                    </div>

                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Tu bloque / torre</label>
                    <input className="input" placeholder="Ej: Torre A" value={tower} onChange={e => setTower(e.target.value)} style={{ marginBottom: 12 }} />
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Tu piso y depto (auto-generado)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                        <div>
                            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Piso</label>
                            <input className="input" type="number" min={1} max={numFloors} value={adminFloor}
                                onChange={e => setAdminFloor(Math.min(numFloors, Math.max(1, parseInt(e.target.value) || 1)))}
                                style={{ padding: '8px', textAlign: 'center' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Depto en piso</label>
                            <input className="input" type="number" min={1} max={roomsPerFloor} value={adminRoom}
                                onChange={e => setAdminRoom(Math.min(roomsPerFloor, Math.max(1, parseInt(e.target.value) || 1)))}
                                style={{ padding: '8px', textAlign: 'center' }} />
                        </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 16 }}>Número de depto asignado: <strong>{adminApartment}</strong></p>

                    <button className="btn btn-primary btn-full" onClick={submitCreate} disabled={!newName.trim() || loading}>
                        {loading ? 'Creando...' : 'Crear torre y ser admin'}
                    </button>
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
    const [towerUserCounts, setTowerUserCounts] = useState<Record<string, number>>({}); // tower -> count

    // Create space form state
    const [spaceName, setSpaceName] = useState('');
    const [spaceType, setSpaceType] = useState('');
    const [spaceCapacity, setSpaceCapacity] = useState('20');
    const [spaceDesc, setSpaceDesc] = useState('');
    const [spacePoints, setSpacePoints] = useState('10');
    const [spaceImageFile, setSpaceImageFile] = useState<File | null>(null);
    const [spaceLoading, setSpaceLoading] = useState(false);

    // Default images per amenity type
    const DEFAULT_IMAGES: Record<string, string> = {
        'PISCINA': 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=800',
        'GIMNASIO': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
        'PARRILLA': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
        'SALON': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800',
        'COWORKING': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
        'CANCHA': 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800',
        'JARDIN': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800',
        'ESTACIONAMIENTO': 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800',
        'OTRO': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
    };

    const SPACE_PRESETS = [
        { type: 'PISCINA', label: '🏊 Piscina', desc: 'Piscina comunitaria con área de descanso', cap: 30 },
        { type: 'GIMNASIO', label: '🏋️ Gimnasio', desc: 'Equipamiento moderno y amplio espacio', cap: 15 },
        { type: 'PARRILLA', label: '🔥 Área de Parrillas', desc: 'Zona BBQ con mesas y bancas', cap: 20 },
        { type: 'SALON', label: '🎉 Salón de Eventos', desc: 'Salón equipado para eventos sociales', cap: 50 },
        { type: 'COWORKING', label: '💻 Coworking', desc: 'Espacio de trabajo compartido con WiFi', cap: 10 },
        { type: 'CANCHA', label: '⚽ Cancha', desc: 'Cancha deportiva multiuso', cap: 20 },
        { type: 'JARDIN', label: '🌿 Jardín', desc: 'Área verde comunitaria', cap: 40 },
        { type: 'ESTACIONAMIENTO', label: '🅿️ Estacionamiento', desc: 'Espacios de estacionamiento para visitas', cap: 10 },
        { type: 'OTRO', label: '📦 Otro', desc: '', cap: 20 },
    ];

    if (user?.role !== 'ADMIN') return <div className="empty-state"><p>Acceso denegado</p></div>;

    const load = async (v: string) => {
        setView(v as any);
        if (v === 'users') api.getAllUsers().then(setAllUsers);
        if (v === 'audit') api.getAllReservationsForAudit(user.community_id).then(setReservations);
        if (v === 'requests' && user.community_id) {
            const reqs = await api.getPendingRequests(user.community_id);
            setRequests(reqs);
            // Count existing users per tower
            if (user.community_id) {
                const communityUsers = await api.getCommunityUsers(user.community_id);
                const counts: Record<string, number> = {};
                communityUsers.forEach(u => { if (u.tower) counts[u.tower] = (counts[u.tower] || 0) + 1; });
                setTowerUserCounts(counts);
            }
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
        await api.approveJoinRequest(id);
        setRequests(r => r.filter(x => x.id !== id));
        toast('Solicitud aprobada');
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
                capacity: parseInt(spaceCapacity) || 20,
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
            toast('✅ Espacio creado correctamente');
            // Reset form
            setShowCreateSpace(false);
            setSpaceName(''); setSpaceType(''); setSpaceDesc('');
            setSpaceCapacity('20'); setSpacePoints('10'); setSpaceImageFile(null);
        } catch (e: any) { toast('Error: ' + (e.message || 'No se pudo crear')); }
        setSpaceLoading(false);
    };

    const deleteSpace = async (id: string) => {
        if (!confirm('¿Eliminar este espacio? Las reservas existentes se perderán.')) return;
        try {
            await api.deleteAmenity(id);
            setAmenities(prev => prev.filter(a => a.id !== id));
            toast('Espacio eliminado');
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
            {[{ icon: 'meeting_room', title: 'Espacios', desc: 'Crear y gestionar áreas', v: 'spaces' },
            { icon: 'people', title: 'Usuarios', desc: 'Gestionar vecinos', v: 'users' },
            { icon: 'fact_check', title: 'Auditoría', desc: 'Calificar reservas', v: 'audit' },
            { icon: 'mail', title: 'Solicitudes', desc: 'Aprobar ingresos', v: 'requests' },
            { icon: 'gavel', title: 'Reglas', desc: 'Sanciones y restricciones', v: 'rules' },
            { icon: 'analytics', title: 'Analytics', desc: 'Dashboard', v: 'analytics' }
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
                communityFloors={user.community?.total_floors || 10}
                communityRooms={user.community?.rooms_per_floor || 4}
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
                    <h2 className="section-title" style={{ marginBottom: 0 }}>Espacios ({amenities.length})</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreateSpace(!showCreateSpace)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showCreateSpace ? 'close' : 'add'}</span>
                        {showCreateSpace ? 'Cancelar' : 'Crear'}
                    </button>
                </div>

                {/* Create form */}
                {showCreateSpace && (
                    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Nuevo Espacio</h3>

                        {/* Preset selector */}
                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8, display: 'block' }}>Tipo de espacio</label>
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
                        <input className="input" placeholder="Ej: Piscina Rooftop" value={spaceName} onChange={e => setSpaceName(e.target.value)} style={{ marginBottom: 12 }} />

                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Descripción</label>
                        <textarea className="input" placeholder="Descripción del espacio..." value={spaceDesc} onChange={e => setSpaceDesc(e.target.value)}
                            style={{ marginBottom: 12, minHeight: 60, resize: 'vertical' }} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Capacidad</label>
                                <input className="input" type="number" min="1" value={spaceCapacity} onChange={e => setSpaceCapacity(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Puntos por reserva</label>
                                <input className="input" type="number" min="0" value={spacePoints} onChange={e => setSpacePoints(e.target.value)} />
                            </div>
                        </div>

                        <button className="btn btn-primary btn-full" onClick={createSpace} disabled={!spaceName.trim() || !spaceType || spaceLoading}>
                            {spaceLoading ? 'Creando...' : 'Crear Espacio'}
                        </button>
                    </div>
                )}

                {/* Existing amenities list */}
                {amenities.length === 0 && !showCreateSpace ? (
                    <div className="empty-state" style={{ padding: 40 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>meeting_room</span>
                        <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No hay espacios creados</p>
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crea el primer espacio para tus vecinos</p>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreateSpace(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Crear Espacio
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
                <h2 className="section-title">Usuarios ({allUsers.length})</h2>
                {allUsers.map(u => (
                    <div key={u.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar">{u.name[0]}</div>
                        <div style={{ flex: 1 }}><h4 style={{ fontSize: 14 }}>{u.name}</h4><p style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email} • {u.role}</p></div>
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
                            <div><h4 style={{ fontSize: 14 }}>{(r as any).user?.name}</h4><p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.amenity?.name} • {r.date} • {r.time_slot}</p></div>
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
                            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.user_email} • {r.tower || ''} {r.unit ? `Dpto ${r.unit}` : ''}</p>
                            {r.tower && towerUserCounts[r.tower] !== undefined && (
                                <p style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>
                                    🏢 {towerUserCounts[r.tower]} vecino{towerUserCounts[r.tower] !== 1 ? 's' : ''} ya en {r.tower}
                                </p>
                            )}
                            {rejectTarget === r.id ? (
                                <div style={{ marginTop: 10, padding: '10px', background: 'var(--bg-3)', borderRadius: 10 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón del rechazo (opcional):</p>
                                    <textarea className="input" rows={2} style={{ fontSize: 13, width: '100%', marginBottom: 8 }}
                                        placeholder="Ej: El departamento indicado no existe..."
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
                    { label: 'Usuarios', value: analytics.totalUsers, icon: 'people' },
                    { label: 'Posts', value: analytics.totalPosts, icon: 'forum' }
                    ].map(s => (
                        <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>{s.icon}</span>
                            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Por Espacio</h3>
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