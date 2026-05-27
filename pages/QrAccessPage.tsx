import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { User } from '../types';
import { useAnimeOnMount, pulse } from '../components/useAnime';

interface QrAccessPageProps {
    user: User;
    onBack: () => void;
    onToast: (msg: string) => void;
}

interface QrPayload {
    kind: 'OWNER' | 'GUEST';
    userId: string;
    community_id?: string | null;
    apartment?: string | null;
    issued: number;
    exp: number;
    guestName?: string;
    jti?: string; // Identificador único del pase de invitado (para uso único)
}

const OWNER_VALID_HOURS = 24;
const GUEST_VALID_HOURS = 4;

function payloadToString(p: QrPayload): string {
    return JSON.stringify(p);
}

async function generateQrDataUrl(payload: QrPayload, dark: string, light: string): Promise<string> {
    return QRCode.toDataURL(payloadToString(payload), {
        width: 256,
        margin: 2,
        color: { dark, light },
        errorCorrectionLevel: 'M',
    });
}

export function QrAccessPage({ user, onBack, onToast }: QrAccessPageProps) {
    const [now, setNow] = useState(Date.now());
    const [ownerPayload, setOwnerPayload] = useState<QrPayload | null>(null);
    const [guestPayload, setGuestPayload] = useState<QrPayload | null>(null);
    const [ownerDataUrl, setOwnerDataUrl] = useState<string>('');
    const [guestDataUrl, setGuestDataUrl] = useState<string>('');
    const [guestName, setGuestName] = useState('');
    const [loadingOwner, setLoadingOwner] = useState(true);

    const cardRef = useAnimeOnMount<HTMLDivElement>({
        opacity: [0, 1],
        translateY: [20, 0],
        scale: [0.96, 1],
        duration: 600,
    });

    // Genera el payload del propietario al cargar
    useEffect(() => {
        const issued = Math.floor(Date.now() / 1000);
        setOwnerPayload({
            kind: 'OWNER',
            userId: user.id,
            community_id: user.community_id,
            apartment: user.apartment,
            issued,
            exp: issued + OWNER_VALID_HOURS * 3600,
        });
    }, [user.id]);

    // Renderiza QR del propietario como Data URL
    useEffect(() => {
        if (!ownerPayload) return;
        setLoadingOwner(true);
        generateQrDataUrl(ownerPayload, '#0a0a1a', '#ffffff')
            .then(url => { setOwnerDataUrl(url); setLoadingOwner(false); })
            .catch(() => setLoadingOwner(false));
    }, [ownerPayload]);

    // Renderiza QR del invitado como Data URL
    useEffect(() => {
        if (!guestPayload) return;
        generateQrDataUrl(guestPayload, '#1e1b4b', '#fef3c7')
            .then(url => {
                setGuestDataUrl(url);
                pulse('#guest-qr-wrap');
            })
            .catch(() => {});
    }, [guestPayload]);

    // Ticker cada segundo para el countdown
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const generateGuest = () => {
        if (!guestName.trim()) {
            onToast('Indica el nombre del invitado');
            return;
        }
        const issued = Math.floor(Date.now() / 1000);
        const jti = (crypto as any).randomUUID
            ? crypto.randomUUID()
            : `${issued}-${Math.random().toString(36).slice(2)}`;
        setGuestPayload({
            kind: 'GUEST',
            userId: user.id,
            community_id: user.community_id,
            apartment: user.apartment,
            guestName: guestName.trim().slice(0, 60),
            issued,
            exp: issued + GUEST_VALID_HOURS * 3600,
            jti,
        });
        onToast(`✅ Acceso invitado generado · vence en ${GUEST_VALID_HOURS}h`);
    };

    const fmtRemaining = (exp: number) => {
        const sec = Math.max(0, exp - Math.floor(now / 1000));
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const ownerExpired = ownerPayload ? ownerPayload.exp <= Math.floor(now / 1000) : false;
    const guestExpired = guestPayload ? guestPayload.exp <= Math.floor(now / 1000) : false;

    const refreshOwner = () => {
        const issued = Math.floor(Date.now() / 1000);
        setOwnerPayload({
            kind: 'OWNER',
            userId: user.id,
            community_id: user.community_id,
            apartment: user.apartment,
            issued,
            exp: issued + OWNER_VALID_HOURS * 3600,
        });
        onToast('🔁 QR refrescado');
    };

    const downloadQr = (dataUrl: string, filename: string) => {
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
    };

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>

            <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>qr_code_2</span>
                Mi acceso
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                Muestra este QR en conserjería al entrar al edificio.
            </p>

            {/* QR del propietario */}
            <div ref={cardRef} className="card" style={{ padding: 18, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)' }}>Acceso del propietario</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{user.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                    Dpto {user.apartment || '?'} {user.tower ? `· ${user.tower}` : ''}
                </p>

                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 10,
                    background: '#fff',
                    borderRadius: 14,
                    boxShadow: '0 8px 30px rgba(124,58,237,0.25)',
                    minWidth: 236,
                    minHeight: 236,
                }}>
                    {loadingOwner ? (
                        <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined"
                                style={{ fontSize: 48, color: '#7C3AED', animation: 'spin 1s linear infinite' }}>
                                refresh
                            </span>
                        </div>
                    ) : ownerDataUrl ? (
                        <img src={ownerDataUrl} alt="QR de acceso propietario"
                            style={{ width: 220, height: 220, borderRadius: 8, display: 'block' }} />
                    ) : (
                        <p style={{ color: 'var(--danger)', fontSize: 12 }}>Error generando QR</p>
                    )}
                </div>

                <p style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace',
                    color: ownerExpired ? 'var(--danger)' : 'var(--accent)' }}>
                    {ownerExpired ? '⏰ Expirado' : `Vence en ${ownerPayload ? fmtRemaining(ownerPayload.exp) : '—'}`}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={refreshOwner}>
                        🔁 Refrescar
                    </button>
                    {ownerDataUrl && (
                        <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadQr(ownerDataUrl, `roomly-acceso-${user.apartment || 'owner'}.png`)}>
                            ⬇️ Guardar
                        </button>
                    )}
                </div>
            </div>

            {/* QR de invitado */}
            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>👤 Invitado de un solo uso</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Genera un acceso temporal (válido {GUEST_VALID_HOURS} horas) para una visita o familiar.
            </p>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Nombre del invitado</label>
                <input
                    className="input"
                    placeholder="Ej: María Lopez"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    maxLength={60}
                />
                <button className="btn btn-primary btn-full" style={{ marginTop: 10 }} onClick={generateGuest}>
                    Generar acceso invitado
                </button>
            </div>

            {guestPayload && (
                <div id="guest-qr-wrap" className="card" style={{
                    padding: 16, textAlign: 'center',
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(124,58,237,0.05))',
                    border: '1px solid var(--warning)',
                }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Invitado: {guestPayload.guestName}</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                        Asociado al Dpto {guestPayload.apartment || '?'}
                    </p>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 10,
                        background: '#fef3c7',
                        borderRadius: 14,
                        minWidth: 236,
                        minHeight: 236,
                    }}>
                        {guestDataUrl ? (
                            <img src={guestDataUrl} alt="QR acceso invitado"
                                style={{ width: 220, height: 220, borderRadius: 8, display: 'block' }} />
                        ) : (
                            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#d97706' }}>
                                hourglass_empty
                            </span>
                        )}
                    </div>
                    <p style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace',
                        color: guestExpired ? 'var(--danger)' : 'var(--warning)' }}>
                        {guestExpired ? '⏰ Caducado' : `Vence en ${fmtRemaining(guestPayload.exp)}`}
                    </p>
                    {guestDataUrl && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                            onClick={() => downloadQr(
                                guestDataUrl,
                                `roomly-invitado-${(guestPayload.guestName || 'guest').replace(/\s+/g, '-')}.png`
                            )}>
                            ⬇️ Guardar QR invitado
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default QrAccessPage;
