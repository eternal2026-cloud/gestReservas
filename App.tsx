import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { User, Amenity, Reservation, Post, Community } from './types';
import { Layout } from './components/Layout';

// --- Data ---
const AMENITIES: Amenity[] = [
    { 
        id: 1, 
        name: "Piscina Panorámica", 
        capacity: 12, 
        pointsReward: 50,
        description: "Borde infinito con vista a la ciudad. Horario exclusivo adultos: 20:00 - 23:00.",
        image: "https://images.unsplash.com/photo-1572331165267-854da2b00cc6?q=80&w=800&auto=format&fit=crop" 
    },
    { 
        id: 2, 
        name: "Gimnasio Tech", 
        capacity: 8, 
        pointsReward: 30,
        description: "Equipamiento cardiovascular y de fuerza. Acceso con huella.",
        image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop" 
    },
    { 
        id: 3, 
        name: "Zona Parrillas", 
        capacity: 25, 
        pointsReward: 100,
        description: "Quincho equipado para eventos sociales. Incluye limpieza.",
        image: "https://images.unsplash.com/photo-1555529733-0e670560f7e1?q=80&w=800&auto=format&fit=crop" 
    },
    { 
        id: 4, 
        name: "Coworking", 
        capacity: 10, 
        pointsReward: 20,
        description: "Espacio silencioso con WiFi de alta velocidad.",
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop" 
    }
];

const MOCK_REVIEWS = [
    { id: 1, user: "Ana Maria", rating: 5, text: "¡La vista es increíble al atardecer!", date: "Hace 2 días", avatar: "A" },
    { id: 2, user: "Carlos D.", rating: 4, text: "Muy limpio, pero el agua estaba un poco fría.", date: "Hace 1 semana", avatar: "C" },
];

const MOCK_LEADERBOARD: User[] = [
    { email: '1', name: 'Sofia Rodriguez', role: 'USER', tower: 'Torre A', apartment: 'PH', points: 2450, level: 'Vecino Destacado', avatar: 'https://i.pravatar.cc/150?u=1' },
    { email: '2', name: 'Diego Morales', role: 'USER', tower: 'Torre A', apartment: '402', points: 1890, level: 'Colaborador', avatar: 'https://i.pravatar.cc/150?u=2' },
    { email: '3', name: 'Valentina P.', role: 'USER', tower: 'Torre A', apartment: '805', points: 1200, level: 'Vecino Activo', avatar: 'https://i.pravatar.cc/150?u=3' },
];

// --- Components ---

const TowerAnimation = () => (
    <div className="flex items-end justify-center gap-2 h-32 mb-6">
        <div className="tower-building text-white/40">
            <div className="tower-window" style={{top: '20%', left: '20%', animationDelay: '0.2s'}}></div>
            <div className="tower-window" style={{top: '50%', right: '20%', animationDelay: '1.5s'}}></div>
        </div>
        <div className="tower-building text-white/60 h-48 w-20">
            <div className="tower-window" style={{top: '10%', left: '30%', animationDelay: '0.8s'}}></div>
            <div className="tower-window" style={{top: '70%', left: '30%', animationDelay: '2.2s'}}></div>
        </div>
        <div className="tower-building text-white/40">
             <div className="tower-window" style={{top: '30%', right: '30%', animationDelay: '0.5s'}}></div>
        </div>
    </div>
);

// --- Pages ---

const LoginPage = ({ onLogin, onRegisterTower, onJoinCommunity }: { onLogin: (u: User) => void, onRegisterTower: () => void, onJoinCommunity: () => void }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        if(!email) {
            onLogin({
                email: 'demo@roomly.app',
                name: 'Vecino Demo',
                role: 'USER',
                tower: 'Torre A',
                apartment: '101',
                points: 500,
                level: 'Nuevo'
            });
            return;
        }
        const res = await api.login(email, password);
        setLoading(false);
        if (res.success && res.user) onLogin(res.user);
        else alert(res.error || "Credenciales incorrectas");
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden">
            {/* Video Background */}
            <video 
                autoPlay 
                muted 
                loop 
                className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-50"
            >
                <source src="https://videos.pexels.com/video-files/1739010/1739010-hd_1920_1080_30fps.mp4" type="video/mp4" />
            </video>

            <div className="relative z-10 w-full max-w-md p-6">
                <div className="bg-black/30 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <TowerAnimation />
                        <h1 className="text-5xl font-light text-white mb-2 tracking-tighter">Roomly</h1>
                        <p className="text-white/70 font-light">Tu comunidad, conectada.</p>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-white/80 uppercase tracking-wide ml-1">Email</label>
                            <input 
                                className="w-full p-4 bg-white/10 text-white placeholder-white/40 rounded-xl border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none backdrop-blur-sm" 
                                placeholder="tu@email.com" 
                                value={email} 
                                onChange={e => setEmail(e.target.value)} 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-white/80 uppercase tracking-wide ml-1">Contraseña</label>
                            <input 
                                className="w-full p-4 bg-white/10 text-white placeholder-white/40 rounded-xl border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none backdrop-blur-sm" 
                                type="password" 
                                placeholder="••••••••" 
                                value={password} 
                                onChange={e => setPassword(e.target.value)} 
                            />
                        </div>
                        <button 
                            disabled={loading} 
                            className="bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl mt-4 transition-all shadow-lg shadow-primary/30 active:scale-[0.98] border border-white/10"
                        >
                            {loading ? 'Verificando...' : 'Entrar a mi Torre'}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 gap-3">
                         <button 
                            onClick={onJoinCommunity}
                            className="text-white font-bold text-xs bg-white/10 hover:bg-white/20 px-2 py-3 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 text-center"
                        >
                            <span className="material-symbols-outlined text-xl">group_add</span>
                            Asociarme a una<br/>comunidad
                        </button>
                        <button 
                            onClick={onRegisterTower}
                            className="text-white font-bold text-xs bg-white/10 hover:bg-white/20 px-2 py-3 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 text-center"
                        >
                            <span className="material-symbols-outlined text-xl">add_location_alt</span>
                            Registrar nueva<br/>Torre
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const JoinCommunityPage = ({ onBack }: { onBack: () => void }) => {
    const [step, setStep] = useState(1);
    const [communities, setCommunities] = useState<Community[]>([]);
    const [loading, setLoading] = useState(false);
    
    const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
    const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
    const [userData, setUserData] = useState({ name: '', email: '' });

    useEffect(() => {
        loadCommunities();
    }, []);

    const loadCommunities = async () => {
        setLoading(true);
        const res = await api.getCommunities();
        setLoading(false);
        if (res.success && res.communities) setCommunities(res.communities);
    };

    const handleSendRequest = async () => {
        if (!selectedCommunity || !selectedFloor || !selectedUnit || !userData.name || !userData.email) return;

        setLoading(true);
        const fullUnit = `${selectedFloor}${selectedUnit}`; // e.g. "4C" or "403" depending on logic
        
        const res = await api.requestJoin({
            communityId: selectedCommunity.id,
            communityName: selectedCommunity.name,
            userEmail: userData.email,
            userName: userData.name,
            unit: fullUnit
        });
        
        setLoading(false);
        if (res.success) {
            alert(`Se envió su solicitud a la comunidad "${selectedCommunity.name}", en breve el administrador gestionará la solicitud.`);
            onBack();
        } else {
            alert("Error al enviar solicitud: " + res.error);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-bg-dark">
            {/* Background reuse */}
            <video autoPlay muted loop className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-50">
                <source src="https://videos.pexels.com/video-files/1739010/1739010-hd_1920_1080_30fps.mp4" type="video/mp4" />
            </video>

            <div className="relative z-10 w-full max-w-lg p-4 h-full md:h-auto">
                <div className="bg-surface-dark/95 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
                    
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <button onClick={() => step === 1 ? onBack() : setStep(step - 1)} className="p-2 rounded-full hover:bg-white/10 text-white">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-white">Unirse a Comunidad</h2>
                            <p className="text-xs text-white/60">Paso {step} de 3</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1">
                        {step === 1 && (
                            <div className="space-y-4 animate-fade-in">
                                <p className="text-white font-medium">Selecciona tu comunidad:</p>
                                {loading ? <div className="text-white/50 text-center py-4">Cargando comunidades...</div> : (
                                    <div className="grid gap-3">
                                        {communities.map(com => (
                                            <button 
                                                key={com.id}
                                                onClick={() => { setSelectedCommunity(com); setStep(2); }}
                                                className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold group-hover:scale-110 transition-transform">
                                                    {com.name[0]}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white">{com.name}</h3>
                                                    <p className="text-xs text-white/60">{com.address}</p>
                                                </div>
                                                <span className="material-symbols-outlined text-white/40 ml-auto">chevron_right</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {communities.length === 0 && !loading && (
                                    <div className="text-center text-white/50 py-8">No hay comunidades activas.</div>
                                )}
                            </div>
                        )}

                        {step === 2 && selectedCommunity && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-white">{selectedCommunity.name}</h3>
                                    <p className="text-sm text-white/60">Selecciona tu departamento</p>
                                </div>

                                {/* Apartment Selector Logic */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-white/80 uppercase mb-2 block">1. Selecciona Piso</label>
                                        <div className="grid grid-cols-5 gap-2 max-h-32 overflow-y-auto no-scrollbar">
                                            {[...Array(selectedCommunity.totalFloors || 20)].map((_, i) => {
                                                const floor = i + 1;
                                                return (
                                                    <button
                                                        key={floor}
                                                        onClick={() => { setSelectedFloor(floor); setSelectedUnit(null); }}
                                                        className={`py-2 rounded-lg text-sm font-bold border ${
                                                            selectedFloor === floor 
                                                            ? 'bg-primary border-primary text-white' 
                                                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {floor}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {selectedFloor && (
                                        <div className="animate-fade-in">
                                            <label className="text-xs font-bold text-white/80 uppercase mb-2 block">2. Selecciona Unidad</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {['A', 'B', 'C', 'D', 'E', 'F'].slice(0, selectedCommunity.unitsPerFloor || 4).map(unit => (
                                                     <button
                                                        key={unit}
                                                        onClick={() => setSelectedUnit(unit)}
                                                        className={`py-3 rounded-lg text-sm font-bold border transition-all ${
                                                            selectedUnit === unit
                                                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' 
                                                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {selectedFloor}{unit}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button 
                                    onClick={() => setStep(3)}
                                    disabled={!selectedFloor || !selectedUnit}
                                    className="w-full bg-white text-black font-bold py-3 rounded-xl mt-4 disabled:opacity-50"
                                >
                                    Confirmar Unidad: {selectedFloor}{selectedUnit}
                                </button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-5 animate-fade-in">
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-white">Completa tus datos</h3>
                                    <p className="text-sm text-white/60">Para que el administrador te identifique</p>
                                </div>
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-white/80 uppercase ml-1">Nombre Completo</label>
                                        <input 
                                            value={userData.name}
                                            onChange={e => setUserData({...userData, name: e.target.value})}
                                            className="w-full p-3 bg-white/10 border border-white/10 rounded-xl text-white outline-none focus:border-primary"
                                            placeholder="Ej. Juan Pérez"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/80 uppercase ml-1">Correo Electrónico</label>
                                        <input 
                                            value={userData.email}
                                            onChange={e => setUserData({...userData, email: e.target.value})}
                                            className="w-full p-3 bg-white/10 border border-white/10 rounded-xl text-white outline-none focus:border-primary"
                                            placeholder="juan@ejemplo.com"
                                        />
                                    </div>
                                </div>

                                <div className="bg-primary/20 p-4 rounded-xl border border-primary/50 text-center mt-2">
                                    <p className="text-xs text-primary-light uppercase font-bold">Resumen de Solicitud</p>
                                    <p className="text-white font-bold text-lg mt-1">{selectedCommunity?.name}</p>
                                    <p className="text-white/80">Depto {selectedFloor}{selectedUnit}</p>
                                </div>

                                <button 
                                    onClick={handleSendRequest}
                                    disabled={loading || !userData.name || !userData.email}
                                    className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/30 transition-all disabled:opacity-50"
                                >
                                    {loading ? 'Enviando...' : 'Enviar Solicitud'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const NewTowerPage = ({ onBack, onComplete }: { onBack: () => void, onComplete: () => void }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ name: '', address: '', adminEmail: '' });
    
    // Mock Map Interaction
    const handleMapClick = (e: React.MouseEvent) => {
        // Visual feedback simulated
        alert("Ubicación fijada en el mapa (Simulación)");
    };

    const handleCreate = async () => {
        // Call API
        await api.createTower({ ...formData, lat: -33.4, lng: -70.6 }); // Mock coords
        alert("¡Torre creada! Ahora eres el administrador.");
        onComplete();
    };

    return (
        <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col">
            {/* Header */}
            <div className="p-4 bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-white/5 flex items-center gap-4 sticky top-0 z-50">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                    <span className="material-symbols-outlined text-slate-800 dark:text-white">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold text-slate-800 dark:text-white">Nueva Comunidad</h1>
            </div>

            <div className="flex-1 p-6 max-w-lg mx-auto w-full">
                {step === 1 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-4">
                                <span className="material-symbols-outlined text-3xl">domain_add</span>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Registra tu Edificio</h2>
                            <p className="text-slate-500">Comienza a gestionar tus áreas comunes hoy.</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Nombre de la Torre / Condominio</label>
                                <input 
                                    className="w-full p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10"
                                    placeholder="Ej. Edificio Los Andes"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tu Email de Administrador</label>
                                <input 
                                    className="w-full p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10"
                                    placeholder="admin@ejemplo.com"
                                    value={formData.adminEmail}
                                    onChange={e => setFormData({...formData, adminEmail: e.target.value})}
                                />
                            </div>
                        </div>

                        <button 
                            onClick={() => setStep(2)}
                            disabled={!formData.name || !formData.adminEmail}
                            className="w-full bg-primary text-white font-bold py-4 rounded-xl mt-6 disabled:opacity-50"
                        >
                            Siguiente: Ubicación
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Confirma la Ubicación</h2>
                            <p className="text-sm text-slate-500">Arrastra el pin a la entrada principal.</p>
                        </div>

                        {/* Visual Mock Map */}
                        <div 
                            className="flex-1 bg-gray-200 rounded-2xl relative overflow-hidden border-2 border-primary cursor-crosshair shadow-inner"
                            onClick={handleMapClick}
                        >
                            {/* Static map background image */}
                            <img 
                                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=800&auto=format&fit=crop" 
                                className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-500" 
                                alt="Map Background"
                            />
                            
                            {/* Draggable Pin Mock */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary animate-bounce">
                                <span className="material-symbols-outlined text-5xl filled drop-shadow-lg">location_on</span>
                            </div>
                            
                            <div className="absolute bottom-4 left-4 right-4 bg-white/90 dark:bg-black/80 backdrop-blur p-3 rounded-xl text-xs text-center border border-gray-200 dark:border-white/10">
                                <span className="font-bold">Ubicación detectada:</span> Av. Providencia 1234, Santiago
                            </div>
                        </div>

                        <button 
                            onClick={handleCreate}
                            className="w-full bg-primary text-white font-bold py-4 rounded-xl mt-6 shadow-lg shadow-primary/20"
                        >
                            Crear Comunidad
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ... HomePage, CommunityPage, etc. remain the same ...
// Keep existing components (HomePage, CommunityPage, LeaderboardPage, AmenitiesPage, AmenityDetailPage)
// Just ensure the App component routing is updated.

const HomePage = ({ user, navigate }: { user: User, navigate: (p: string) => void }) => {
    // ... same code as before ...
    return (
        <div className="animate-fade-in space-y-8 pb-20">
            {/* Tower Header Card */}
            <div className="relative overflow-hidden rounded-3xl bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-white/5 shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-primary">
                    <span className="material-symbols-outlined text-9xl">apartment</span>
                </div>
                
                <div className="relative z-10 p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/10 p-1">
                            <img 
                                src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=7c3aed&color=fff`} 
                                className="w-full h-full rounded-full object-cover"
                            />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{user.name}</h2>
                            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">location_city</span>
                                {user.tower} • Depto {user.apartment}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-black/20 rounded-xl p-4 flex justify-between items-center border border-gray-100 dark:border-white/5">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Estatus en Comunidad</p>
                            <p className="text-primary font-bold text-lg">{user.level}</p>
                        </div>
                        <div className="text-right">
                             <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Puntos de Aporte</p>
                             <p className="text-slate-800 dark:text-white font-bold text-lg">{user.points} pts</p>
                        </div>
                    </div>
                </div>
                
                {/* Decorative bottom bar */}
                <div className="h-2 w-full bg-gradient-to-r from-primary to-primary-light"></div>
            </div>

            {/* Actions Grid */}
            <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 px-2">Gestión Rápida</h3>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => navigate('amenities')} className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 hover:border-primary/50 transition-all group text-left">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
                             <span className="material-symbols-outlined">calendar_add_on</span>
                        </div>
                        <p className="font-bold text-slate-800 dark:text-white">Reservar Espacio</p>
                        <p className="text-xs text-slate-500 mt-1">Gym, Piscina, Quincho</p>
                    </button>

                    <button onClick={() => navigate('community')} className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 hover:border-primary/50 transition-all group text-left">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3 group-hover:scale-110 transition-transform">
                             <span className="material-symbols-outlined">add_a_photo</span>
                        </div>
                        <p className="font-bold text-slate-800 dark:text-white">Muro General</p>
                        <p className="text-xs text-slate-500 mt-1">Noticias de la torre</p>
                    </button>
                </div>
            </div>
        </div>
    );
};
const CommunityPage = ({ user }: { user: User }) => {
    // ... same code ...
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPostText, setNewPostText] = useState('');

    const loadPosts = useCallback(async () => {
        setLoading(true);
        const res = await api.getPosts(user.tower);
        setLoading(false);
        if (res.success && res.posts) setPosts(res.posts);
    }, [user.tower]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    const handlePost = async () => {
        if(!newPostText) return;
        const res = await api.createPost(user.email, newPostText, null); 
        if(res.success) {
            setNewPostText('');
            loadPosts();
        }
    };

    return (
        <div className="pb-20 flex flex-col h-[calc(100vh-100px)]">
             <div className="mb-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Comunidad {user.tower}</h2>
                <p className="text-sm text-slate-500">Espacio para anuncios y convivencia</p>
            </div>

            <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 mb-6">
                <textarea 
                    value={newPostText}
                    onChange={e => setNewPostText(e.target.value)}
                    className="w-full bg-transparent border-none resize-none focus:ring-0 text-slate-800 dark:text-white placeholder-slate-400"
                    placeholder={`¿Qué quieres compartir con tus vecinos, ${user.name}?`}
                    rows={2}
                />
                <div className="flex justify-between items-center mt-2 border-t border-gray-100 dark:border-white/5 pt-2">
                    <button className="text-slate-400 hover:text-primary transition-colors">
                        <span className="material-symbols-outlined">image</span>
                    </button>
                    <button 
                        onClick={handlePost}
                        className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
                    >
                        Publicar
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {loading ? <div className="text-center text-slate-400 mt-10">Cargando actividad...</div> : posts.map(post => (
                    <div key={post.id} className="bg-surface-light dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-white">
                                {post.userName?.[0]}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800 dark:text-white">{post.userName}</p>
                                <p className="text-[10px] text-slate-400">{post.timestamp}</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{post.text}</p>
                        {post.image && (
                            <div className="rounded-xl overflow-hidden mb-3">
                                <img src={post.image} className="w-full h-48 object-cover" />
                            </div>
                        )}
                        <div className="flex gap-4 text-slate-400 text-xs">
                             <button className="flex items-center gap-1 hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-base">thumb_up</span> Me gusta
                             </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const LeaderboardPage = ({ user }: { user: User }) => {
    // ... same code ...
    return (
        <div className="pb-20 animate-fade-in">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Vecinos Colaboradores</h2>
                <p className="text-slate-500 text-sm mt-1">Reconocimiento por reportes útiles y buena convivencia</p>
            </div>

            <div className="bg-surface-light dark:bg-surface-dark rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
                <div className="p-4 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Posición</span>
                    <span>Puntos</span>
                </div>
                {MOCK_LEADERBOARD.map((u, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                            ${index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                              index === 1 ? 'bg-gray-100 text-gray-700' : 
                              index === 2 ? 'bg-orange-100 text-orange-700' : 'text-slate-500'}`}>
                            {index + 1}
                        </div>
                        <img src={u.avatar} className="w-10 h-10 rounded-full object-cover" />
                        <div className="flex-1">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white">{u.name}</h3>
                            <p className="text-xs text-slate-500">{u.level}</p>
                        </div>
                        <div className="text-primary font-bold text-sm">
                            {u.points}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const AmenityDetailPage = ({ amenity, user, navigate, onBack }: { amenity: Amenity | null, user: User, navigate: (p: string) => void, onBack: () => void }) => {
    // ... same code ...
    const [view, setView] = useState<'info' | 'book'>('info');

    if (!amenity) return null;

    return (
        <div className="bg-bg-light dark:bg-bg-dark min-h-screen flex flex-col pb-24">
            <div className="relative h-64 w-full">
                <div className="absolute top-4 left-4 z-20">
                    <button onClick={onBack} className="bg-black/40 backdrop-blur text-white p-2 rounded-full hover:bg-black/60 transition-colors">
                         <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                </div>
                <img src={amenity.image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-light dark:from-bg-dark via-transparent to-black/30"></div>
                <div className="absolute bottom-6 left-6 right-6">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1 drop-shadow-sm">{amenity.name}</h1>
                    <div className="flex items-center gap-2">
                        <div className="flex text-yellow-400 text-sm">
                            <span className="material-symbols-outlined filled text-lg">star</span>
                            <span className="material-symbols-outlined filled text-lg">star</span>
                            <span className="material-symbols-outlined filled text-lg">star</span>
                            <span className="material-symbols-outlined filled text-lg">star</span>
                            <span className="material-symbols-outlined text-lg">star_half</span>
                        </div>
                        <span className="text-white/90 text-sm font-medium">4.5 (12 opiniones)</span>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-gray-200 dark:border-white/10 px-6 sticky top-0 bg-bg-light dark:bg-bg-dark z-10 pt-2">
                <button 
                    onClick={() => setView('info')}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${view === 'info' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
                >
                    Información y Opiniones
                </button>
                <button 
                    onClick={() => setView('book')}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${view === 'book' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
                >
                    Reservar
                </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
                {view === 'info' ? (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white mb-2">Sobre este espacio</h3>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                                {amenity.description}
                                <br/><br/>
                                <span className="font-semibold text-primary">Capacidad:</span> {amenity.capacity} personas.<br/>
                                <span className="font-semibold text-primary">Recompensa:</span> +{amenity.pointsReward} pts por uso correcto.
                            </p>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800 dark:text-white">Fotos y Opiniones</h3>
                                <button className="text-primary text-xs font-bold hover:underline">Escribir opinión</button>
                            </div>
                            
                            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                                <img src={amenity.image} className="w-32 h-32 rounded-lg object-cover flex-shrink-0" />
                                <img src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=200" className="w-32 h-32 rounded-lg object-cover flex-shrink-0" />
                                <div className="w-32 h-32 rounded-lg bg-gray-100 dark:bg-white/5 flex flex-col items-center justify-center flex-shrink-0 text-slate-400 border border-gray-200 dark:border-white/10">
                                    <span className="material-symbols-outlined mb-1">add_a_photo</span>
                                    <span className="text-xs">Agregar</span>
                                </div>
                            </div>

                            <div className="space-y-4 mt-2">
                                {MOCK_REVIEWS.map(review => (
                                    <div key={review.id} className="border-b border-gray-100 dark:border-white/5 pb-4 last:border-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">
                                                {review.avatar}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800 dark:text-white">{review.user}</p>
                                                <div className="flex text-yellow-400 text-[10px]">
                                                    {[...Array(5)].map((_, i) => (
                                                        <span key={i} className={`material-symbols-outlined filled text-xs ${i < review.rating ? '' : 'text-gray-300'}`}>star</span>
                                                    ))}
                                                    <span className="text-slate-400 ml-2">{review.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-300">{review.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <BookingFlowInner amenity={amenity} user={user} navigate={navigate} />
                )}
            </div>
        </div>
    );
};
const BookingFlowInner = ({ amenity, user, navigate }: { amenity: Amenity, user: User, navigate: (p: string) => void }) => {
    // ... same code ...
    const [date, setDate] = useState('');
    const [slots, setSlots] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleBook = async () => {
        if (!date || slots.length === 0) return alert("Selecciona fecha y hora");
        setLoading(true);
        const res = await api.book({ room: amenity.name, date, slots, user: user.email });
        setLoading(false);
        if (res.success) {
            alert("Reserva confirmada exitosamente.");
            navigate('home');
        } else {
            alert(res.error);
        }
    };

    const toggleSlot = (s: string) => {
        if (slots.includes(s)) setSlots(slots.filter(x => x !== s));
        else setSlots([...slots, s]);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-3">Fecha de Reserva</label>
                <input 
                    type="date" 
                    onChange={e => { setDate(e.target.value); setSlots([]); }} 
                    className="w-full p-4 rounded-xl bg-surface-light dark:bg-surface-dark text-slate-800 dark:text-white border border-gray-200 dark:border-white/10 focus:border-primary focus:ring-1 outline-none" 
                />
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-3">Bloques Disponibles</label>
                <div className="grid grid-cols-3 gap-3">
                    {['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'].map(time => {
                            const isSelected = slots.includes(time);
                            return (
                            <button
                                key={time}
                                onClick={() => toggleSlot(time)}
                                className={`py-3 rounded-lg text-sm font-medium transition-all ${
                                    isSelected 
                                    ? 'bg-primary text-white shadow-md shadow-primary/30' 
                                    : 'bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 border border-gray-200 dark:border-white/10 hover:border-primary/50'
                                }`}
                            >
                                {time}
                            </button>
                            );
                    })}
                </div>
            </div>

            <button 
                onClick={handleBook} 
                disabled={loading || slots.length === 0 || !date}
                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all mt-4 ${
                    loading || slots.length === 0 || !date 
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-primary hover:bg-primary-dark text-white'
                }`}
            >
                {loading ? 'Procesando...' : 'Confirmar Reserva'}
            </button>
        </div>
    );
};
const AmenitiesPage = ({ navigate, setTargetAmenity }: { navigate: (p: string) => void, setTargetAmenity: (a: Amenity) => void }) => {
    // ... same code ...
    return (
        <div className="pb-24 animate-fade-in">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Espacios Comunes</h2>
                <p className="text-slate-500 text-sm">Reserva tu espacio en {AMENITIES.length} áreas disponibles</p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
                {AMENITIES.map(amenity => (
                    <div 
                        key={amenity.id} 
                        onClick={() => { setTargetAmenity(amenity); navigate('amenity_detail'); }}
                        className="group bg-surface-light dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 hover:shadow-md transition-all duration-300 cursor-pointer"
                    >
                        <div className="h-48 relative overflow-hidden">
                            <img src={amenity.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={amenity.name} />
                            <div className="absolute top-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-800 dark:text-white shadow-sm">
                                Capacidad: {amenity.capacity}
                            </div>
                        </div>

                        <div className="p-5">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{amenity.name}</h3>
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <span className="material-symbols-outlined text-sm text-yellow-500 filled">star</span>
                                    4.5 (12)
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">{amenity.description}</p>
                            <span className="text-primary text-sm font-bold hover:underline">Ver detalles y reservar &rarr;</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Main App ---

export default function App() {
    const [user, setUser] = useState<User | null>(null);
    const [route, setRoute] = useState('home');
    const [targetAmenity, setTargetAmenity] = useState<Amenity | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isRegisteringTower, setIsRegisteringTower] = useState(false);
    const [isJoiningCommunity, setIsJoiningCommunity] = useState(false);

    // Initial Theme Check
    useEffect(() => {
        if (isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const handleLogin = (u: User) => {
        setUser(u);
        setRoute('home');
    };

    if (isRegisteringTower) {
        return <NewTowerPage onBack={() => setIsRegisteringTower(false)} onComplete={() => setIsRegisteringTower(false)} />;
    }

    if (isJoiningCommunity) {
        return <JoinCommunityPage onBack={() => setIsJoiningCommunity(false)} />;
    }

    if (!user) return <LoginPage onLogin={handleLogin} onRegisterTower={() => setIsRegisteringTower(true)} onJoinCommunity={() => setIsJoiningCommunity(true)} />;

    const renderPage = () => {
        switch (route) {
            case 'home': return <HomePage user={user} navigate={setRoute} />;
            case 'community': return <CommunityPage user={user} />;
            case 'leaderboard': return <LeaderboardPage user={user} />;
            case 'amenities': return <AmenitiesPage navigate={setRoute} setTargetAmenity={setTargetAmenity} />;
            case 'amenity_detail': return <AmenityDetailPage amenity={targetAmenity} user={user} navigate={setRoute} onBack={() => setRoute('amenities')} />;
            case 'profile': return (
                <div className="p-10 flex flex-col items-center justify-center h-[80vh] animate-fade-in">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
                        <span className="material-symbols-outlined text-4xl">person</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{user.name}</h2>
                    <p className="text-slate-500 mb-8">{user.email}</p>
                    <button onClick={() => setUser(null)} className="text-red-500 hover:text-red-600 font-medium px-6 py-2 rounded-lg hover:bg-red-50 transition-colors">
                        Cerrar Sesión
                    </button>
                </div>
            );
            default: return <HomePage user={user} navigate={setRoute} />;
        }
    };

    const isFullScreen = route === 'amenity_detail';

    return (
        <>
            {isFullScreen ? (
                renderPage()
            ) : (
                <Layout activeTab={route} onNavigate={setRoute} user={user} toggleTheme={toggleTheme} isDarkMode={isDarkMode}>
                    {renderPage()}
                </Layout>
            )}
        </>
    );
}