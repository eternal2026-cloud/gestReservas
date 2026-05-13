import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { User } from '../types';
import { useAnimeOnMount, pulse } from '../components/useAnime';
import anime from 'animejs';

interface QrAccessPageProps {
    user: User;
    onBack: () => void;
    onToast: (msg: string) => void;
}

interface QrPayload {
    kind: 'OWNER' | 'GUEST';
    userId: string;
    community_id?: string;
    apartment?: string;
    issued: number;  // epoch seconds
    exp: number;     // epoch seconds
    guestName?: string;
}

const OWNER_VALID_HOURS = 24;
const GUEST_VALID_HOURS = 4;

function payloadToString(p: QrPayload): string {
    return JSON.stringify(p);
}

export function QrAccessPage({ user, onBack, onToast }: QrAccessPageProps) {
    const ownerCanvasRef = useRef<HTMLCanvasElement>(null);
    const guestCanvasRef = useRef<HTMLCanvasElement>(null);
    const [now, setNow] = useState(Date.now());
    const [ownerPayload, setOwnerPayload] = useState<QrPayload | null>(null);
    const [guestPayload, setGuestPayload] = useState<QrPayload | null>(null);
    const [guestName, setGuestName] = useState('');

    const cardRef = useAnimeOnMount<HTMLDivElement>({
        opacity: [0, 1],
        translateY: [20, 0],
        scale: [0.96, 1],
        duration: 600,
    });

    // Genera el QR del propietario al cargar
    useEffect(() => {
        const issued = Math.floor(Date.now() / 1000);
        const p: QrPayload = {
            kind: 'OWNER',
            userId: user.id,
            community_id: user.community_id,
            apartment: user.apartment,
            issued,
            exp: issued + OWNER_VALID_HOURS * 3600,
        };
        setOwnerPayload(p);
    }, [user.id]);

    // Renderiza QR del propietario en el canvas
    useEffect(() => {
        if (!ownerCanvasRef.current || !ownerPayload) return;
        QRCode.toCanvas(ownerCanvasRef.current, payloadToString(ownerPayload), {
            width: 220,
            margin: 1,
            color: { dark: '#0a0a1a', light: '#ffffff' },
        }).catch(() => {});
    }, [ownerPayload]);

    // Renderiza QR del invitado
    useEffect(() => {
        if (!guestCanvasRef.current || !guestPayload) return;
        QRCode.toCanvas(guestCanvasRef.current, payloadToString(guestPayload), {
            width: 220,
            margin: 1,
            color: { dark: '#1e1b4b', light: '#fef3c7' },
        }).catch(() => {});
    }, [guestPayload]);

    // Ticker para refrescar el contador cada segundo
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
        const p: QrPayload = {
            kind: 'GUEST',
            userId: user.id,
            community_id: user.community_id,
            apartment: user.apartment,
            guestName: guestName.trim().slice(0, 60),
            issued,
            exp: issued + GUEST_VALID_HOURS * 3600,
        };
        setGuestPayload(p);
        pulse('#guest-qr-wrap');
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
        // re-disparar animación al refrescar
        if (ownerCanvasRef.current) {
            anime({ targets: ownerCanvasRef.current, scale: [0.9, 1], duration: 400, easing: 'easeOutBack' });
        }
        onToast('🔁 QR refrescado');
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

            <div ref={cardRef} className="card" style={{ padding: 18, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)' }}>Acceso del propietario</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{user.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                    Dpto {user.apartment || '?'} {user.tower ? `· ${user.tower}` : ''}
                </p>
                <div style={{
                    display: 'inline-block', padding: 10, background: '#fff', borderRadius: 14,
                    boxShadow: '0 8px 30px rgba(124,58,237,0.25)',
                }}>
                    <canvas ref={ownerCanvasRef} />
                </div>
                <p style={{ marginTop: 10, fontSize: 12, color: ownerExpired ? 'var(--danger)' : 'var(--accent)', fontFamily: 'monospace' }}>
                    {ownerExpired ? '⏰ Expirado' : `Vence en ${ownerPayload ? fmtRemaining(ownerPayload.exp) : '—'}`}
                </p>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={refreshOwner}>
                    🔁 Refrescar QR
                </button>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>👤 Invitado de un solo uso</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Genera un acceso temporal (válido {GUEST_VALID_HOURS} horas) para una visita o familiar.
            </p>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Nombre del invitado</label>
                <input className="input" placeholder="Ej: María Lopez" value={guestName}
                    onChange={e => setGuestName(e.target.value)} maxLength={60} />
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
                        display: 'inline-block', padding: 10, background: '#fef3c7', borderRadius: 14,
                    }}>
                        <canvas ref={guestCanvasRef} />
                    </div>
                    <p style={{ marginTop: 10, fontSize: 12, color: guestExpired ? 'var(--danger)' : 'var(--warning)', fontFamily: 'monospace' }}>
                        {guestExpired ? '⏰ Caducado' : `Vence en ${fmtRemaining(guestPayload.exp)}`}
                    </p>
                </div>
            )}
        </div>
    );
}

export default QrAccessPage;
