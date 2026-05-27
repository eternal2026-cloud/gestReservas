import React, { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import * as api from '../services/api';

interface QrValidatePageProps {
    user: User;
    onBack: () => void;
    onToast: (msg: string) => void;
}

interface ScannedPayload {
    kind?: 'OWNER' | 'GUEST';
    userId?: string;
    community_id?: string | null;
    apartment?: string | null;
    issued?: number;
    exp?: number;
    guestName?: string;
    jti?: string;
}

type Level = 'success' | 'warn' | 'error';
interface ScanResult {
    level: Level;
    title: string;
    detail?: string;
    info?: { label: string; value: string }[];
}

const LEVEL_STYLE: Record<Level, { bg: string; border: string; color: string; icon: string }> = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'var(--accent)', color: 'var(--accent)', icon: 'check_circle' },
    warn: { bg: 'rgba(245,158,11,0.12)', border: 'var(--warning)', color: 'var(--warning)', icon: 'warning' },
    error: { bg: 'rgba(239,68,68,0.12)', border: 'var(--danger)', color: 'var(--danger)', icon: 'cancel' },
};

export function QrValidatePage({ user, onBack, onToast }: QrValidatePageProps) {
    const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    const [phase, setPhase] = useState<'idle' | 'scanning' | 'result'>('idle');
    const [result, setResult] = useState<ScanResult | null>(null);
    const [camError, setCamError] = useState('');
    const [busy, setBusy] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<any>(null);
    const runningRef = useRef(false);
    const audioRef = useRef<AudioContext | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Limpieza al desmontar
    useEffect(() => {
        return () => {
            runningRef.current = false;
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioRef.current?.close().catch(() => {});
        };
    }, []);

    const ensureAudio = () => {
        if (!audioRef.current) {
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (Ctx) audioRef.current = new Ctx();
        }
        audioRef.current?.resume().catch(() => {});
    };

    const beep = (level: Level) => {
        const ctx = audioRef.current;
        if (!ctx) return;
        const now = ctx.currentTime;
        const tone = (freq: number, start: number, dur: number) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = freq;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.0001, now + start);
            g.gain.exponentialRampToValueAtTime(0.35, now + start + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
            o.start(now + start);
            o.stop(now + start + dur + 0.02);
        };
        if (level === 'success') {
            // Beep de confirmación (dos tonos ascendentes)
            tone(880, 0, 0.12);
            tone(1320, 0.13, 0.16);
        } else {
            // Tono grave de rechazo
            tone(200, 0, 0.35);
        }
    };

    const getDetector = () => {
        if (!detectorRef.current) {
            detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        }
        return detectorRef.current;
    };

    const startCamera = async () => {
        if (!supported) return;
        ensureAudio();
        setCamError('');
        setResult(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });
            streamRef.current = stream;
            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                await video.play();
            }
            setPhase('scanning');
            runningRef.current = true;
            loop();
        } catch (e: any) {
            setCamError(
                e?.name === 'NotAllowedError'
                    ? 'Permiso de cámara denegado. Habilítalo en los ajustes del navegador.'
                    : 'No se pudo acceder a la cámara. Puedes subir una foto del QR.'
            );
        }
    };

    const stopCamera = () => {
        runningRef.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    };

    const loop = async () => {
        if (!runningRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
            try {
                const codes = await getDetector().detect(video);
                if (codes && codes.length && runningRef.current) {
                    runningRef.current = false;
                    await handleRaw(codes[0].rawValue);
                    return;
                }
            } catch { /* frame sin código */ }
        }
        if (runningRef.current) setTimeout(loop, 220);
    };

    const handleFile = async (file: File) => {
        ensureAudio();
        setBusy(true);
        try {
            const bitmap = await createImageBitmap(file);
            const codes = await getDetector().detect(bitmap);
            if (codes && codes.length) {
                await handleRaw(codes[0].rawValue);
            } else {
                showResult({ level: 'error', title: 'No se detectó ningún QR', detail: 'Prueba con una foto más nítida.' });
            }
        } catch {
            showResult({ level: 'error', title: 'No se pudo leer la imagen' });
        }
        setBusy(false);
    };

    const showResult = (r: ScanResult) => {
        setResult(r);
        setPhase('result');
        beep(r.level === 'success' ? 'success' : (r.level === 'warn' ? 'success' : 'error'));
    };

    const fmtDate = (iso?: string) => {
        if (!iso) return '';
        try { return new Date(iso).toLocaleString('es-PE'); } catch { return iso; }
    };

    const fmtRemaining = (exp: number) => {
        const sec = Math.max(0, exp - Math.floor(Date.now() / 1000));
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}min` : `${m}min`;
    };

    const handleRaw = async (raw: string) => {
        setBusy(true);
        let p: ScannedPayload;
        try {
            p = JSON.parse(raw);
        } catch {
            setBusy(false);
            showResult({ level: 'error', title: 'QR no reconocido', detail: 'No es un acceso de Roomly.' });
            return;
        }

        if (!p || !p.kind || !p.community_id) {
            setBusy(false);
            showResult({ level: 'error', title: 'QR no válido', detail: 'No es un acceso de Roomly.' });
            return;
        }

        // 1) Misma comunidad que el admin
        if (p.community_id !== user.community_id) {
            setBusy(false);
            showResult({ level: 'error', title: 'Otra comunidad', detail: 'Este acceso no pertenece a tu comunidad.' });
            return;
        }

        // 2) No vencido
        const now = Math.floor(Date.now() / 1000);
        if (p.exp && p.exp <= now) {
            setBusy(false);
            showResult({
                level: 'error',
                title: 'Acceso vencido',
                detail: p.kind === 'GUEST' ? 'El pase de invitado ya caducó.' : 'El QR del propietario expiró, pídele que lo refresque.',
                info: [{ label: 'Depto', value: p.apartment || '—' }],
            });
            return;
        }

        // 3) Propietario → reutilizable mientras no venza
        if (p.kind === 'OWNER') {
            setBusy(false);
            showResult({
                level: 'success',
                title: 'Propietario válido',
                info: [
                    { label: 'Depto', value: p.apartment || '—' },
                    { label: 'Vence en', value: p.exp ? fmtRemaining(p.exp) : '—' },
                ],
            });
            return;
        }

        // 4) Invitado
        if (!p.jti) {
            // QR antiguo sin identificador → no se puede controlar uso único
            setBusy(false);
            showResult({
                level: 'warn',
                title: 'Invitado válido (sin uso único)',
                detail: 'Este QR fue generado por una versión anterior y no admite control de un solo uso.',
                info: [
                    { label: 'Invitado', value: p.guestName || '—' },
                    { label: 'Depto', value: p.apartment || '—' },
                ],
            });
            return;
        }

        try {
            const res = await api.validateGuestPass(
                p.jti,
                user.community_id!,
                p.apartment || null,
                p.guestName || null,
            );
            setBusy(false);
            if (res.status === 'OK') {
                showResult({
                    level: 'success',
                    title: 'Acceso permitido',
                    info: [
                        { label: 'Invitado', value: p.guestName || '—' },
                        { label: 'Depto', value: p.apartment || '—' },
                        { label: 'Vence en', value: p.exp ? fmtRemaining(p.exp) : '—' },
                    ],
                });
            } else if (res.status === 'ALREADY_USED') {
                showResult({
                    level: 'error',
                    title: 'Pase ya utilizado',
                    detail: `Este invitado ya ingresó el ${fmtDate(res.used_at)}.`,
                    info: [
                        { label: 'Invitado', value: res.guest_name || p.guestName || '—' },
                        { label: 'Depto', value: res.apartment || p.apartment || '—' },
                    ],
                });
            } else {
                showResult({ level: 'error', title: 'No autorizado', detail: 'No tienes permisos para validar en esta comunidad.' });
            }
        } catch (e: any) {
            setBusy(false);
            showResult({ level: 'error', title: 'Error de validación', detail: e?.message || 'Inténtalo de nuevo.' });
        }
    };

    const scanAnother = () => {
        setResult(null);
        if (streamRef.current) {
            setPhase('scanning');
            runningRef.current = true;
            loop();
        } else {
            startCamera();
        }
    };

    return (
        <div className="fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => { stopCamera(); onBack(); }} style={{ marginBottom: 12 }}>
                <span className="material-symbols-outlined">arrow_back</span> Volver
            </button>

            <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--primary-light)' }}>qr_code_scanner</span>
                Validar acceso QR
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                Escanea el QR de un vecino o invitado para verificar su acceso a <strong>{user.community?.name || 'tu comunidad'}</strong>.
            </p>

            {!supported && (
                <div className="card" style={{ padding: 16, borderColor: 'var(--warning)' }}>
                    <p style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600, marginBottom: 6 }}>
                        ⚠️ Tu navegador no soporta el lector de cámara
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        Usa Chrome en Android (o la app instalada). En iPhone/Safari el lector no está disponible.
                    </p>
                </div>
            )}

            {supported && (
                <>
                    {/* Visor de cámara */}
                    <div className="card" style={{ padding: 12 }}>
                        <div style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '1 / 1',
                            maxWidth: 320,
                            margin: '0 auto',
                            borderRadius: 14,
                            overflow: 'hidden',
                            background: '#000',
                        }}>
                            <video
                                ref={videoRef}
                                playsInline
                                muted
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: phase === 'scanning' ? 'block' : 'none',
                                }}
                            />
                            {phase === 'scanning' && (
                                <div style={{
                                    position: 'absolute',
                                    inset: '14%',
                                    border: '3px solid rgba(255,255,255,0.9)',
                                    borderRadius: 16,
                                    boxShadow: '0 0 0 100vmax rgba(0,0,0,0.25)',
                                }} />
                            )}
                            {phase !== 'scanning' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    color: 'rgba(255,255,255,0.6)', gap: 8,
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 56 }}>qr_code_scanner</span>
                                    <span style={{ fontSize: 12 }}>Cámara apagada</span>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                            {phase === 'idle' && (
                                <button className="btn btn-primary" onClick={startCamera}>
                                    <span className="material-symbols-outlined">photo_camera</span> Iniciar escaneo
                                </button>
                            )}
                            {phase === 'scanning' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => { stopCamera(); setPhase('idle'); }}>
                                    Detener
                                </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                                <span className="material-symbols-outlined">image</span> Subir foto
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                            />
                        </div>

                        {camError && (
                            <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', marginTop: 10 }}>{camError}</p>
                        )}
                        {busy && (
                            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 10 }}>Verificando…</p>
                        )}
                    </div>

                    {/* Resultado */}
                    {result && (
                        <div className="card" style={{
                            marginTop: 16,
                            padding: 18,
                            textAlign: 'center',
                            background: LEVEL_STYLE[result.level].bg,
                            border: `1px solid ${LEVEL_STYLE[result.level].border}`,
                        }}>
                            <span className="material-symbols-outlined"
                                style={{ fontSize: 56, color: LEVEL_STYLE[result.level].color }}>
                                {LEVEL_STYLE[result.level].icon}
                            </span>
                            <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 6, color: LEVEL_STYLE[result.level].color }}>
                                {result.title}
                            </h3>
                            {result.detail && (
                                <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>{result.detail}</p>
                            )}
                            {result.info && result.info.length > 0 && (
                                <div style={{ marginTop: 14, textAlign: 'left', display: 'grid', gap: 6 }}>
                                    {result.info.map((row, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-2)', paddingBottom: 6 }}>
                                            <span style={{ color: 'var(--text-3)' }}>{row.label}</span>
                                            <strong>{row.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={scanAnother}>
                                <span className="material-symbols-outlined">qr_code_scanner</span> Escanear otro
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default QrValidatePage;
