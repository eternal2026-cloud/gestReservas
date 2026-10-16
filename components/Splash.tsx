import React, { useEffect, useRef } from 'react';
import anime from 'animejs';
import { AdrMark } from './AdrLogo';

interface SplashProps {
    onDone: () => void;
    minDuration?: number;
}

/**
 * Splash inicial con el isotipo ADR + texto «Salas ADR» que se construye letra
 * a letra, una barra tricolor ADR que crece, y un fade-out al final.
 */
export function Splash({ onDone, minDuration = 1400 }: SplashProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const startedAt = useRef(Date.now());

    useEffect(() => {
        if (!rootRef.current) return;

        const tl = anime.timeline({ easing: 'easeOutCubic' });

        tl.add({
            targets: rootRef.current.querySelector('.splash-logo'),
            scale: [0.4, 1],
            rotate: [-12, 0],
            opacity: [0, 1],
            duration: 600,
        })
        .add({
            targets: rootRef.current.querySelectorAll('.splash-floor'),
            opacity: [0, 1],
            translateY: [20, 0],
            scaleX: [0.4, 1],
            delay: anime.stagger(55),
            duration: 360,
        }, '-=300')
        .add({
            targets: rootRef.current.querySelectorAll('.splash-letter'),
            opacity: [0, 1],
            translateY: [22, 0],
            delay: anime.stagger(45),
            duration: 420,
        }, '-=400')
        .add({
            targets: rootRef.current.querySelector('.splash-tag'),
            opacity: [0, 1],
            translateY: [10, 0],
            duration: 380,
        }, '-=200');

        const close = setTimeout(() => {
            const elapsed = Date.now() - startedAt.current;
            const remaining = Math.max(0, minDuration - elapsed);
            setTimeout(() => {
                if (!rootRef.current) { onDone(); return; }
                anime({
                    targets: rootRef.current,
                    opacity: [1, 0],
                    scale: [1, 1.04],
                    duration: 380,
                    easing: 'easeInQuad',
                    complete: onDone,
                });
            }, remaining);
        }, 1400);

        return () => clearTimeout(close);
    }, [onDone, minDuration]);

    return (
        <div ref={rootRef} style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'radial-gradient(circle at 50% 30%, #2F2821 0%, #15110E 70%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', overflow: 'hidden',
        }}>
            <div className="splash-logo" style={{
                width: 112, height: 112, borderRadius: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 20px 60px rgba(118,183,41,0.25)', opacity: 0, marginBottom: 18, overflow: 'hidden',
            }}>
                <AdrMark size={112} />
            </div>

            <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {'Salas ADR'.split('').map((c, i) => (
                    <span key={i} className="splash-letter" style={{
                        fontSize: 44, fontWeight: 800,
                        background: 'linear-gradient(135deg, #fff 0%, #76B729 100%)',
                        whiteSpace: 'pre', minWidth: c === ' ' ? 12 : undefined,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        opacity: 0, display: 'inline-block',
                    }}>{c}</span>
                ))}
            </div>

            <div className="splash-tag" style={{ opacity: 0, fontSize: 14, color: '#C9BFB4' }}>
                Reserva de salas de reunión · Agrícola Don Ricardo
            </div>

            <div style={{
                display: 'flex', flexDirection: 'column-reverse', gap: 4,
                marginTop: 28, alignItems: 'center',
            }}>
                {['#0097CE', '#EF7C3B', '#76B729'].map((color, i) => (
                    <div key={i} className="splash-floor" style={{
                        width: `${48 + i * 14}px`, height: 6, borderRadius: 3, opacity: 0,
                        background: color,
                    }} />
                ))}
            </div>
        </div>
    );
}

export default Splash;
