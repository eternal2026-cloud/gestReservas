import React, { useEffect, useRef } from 'react';
import anime from 'animejs';

interface SplashProps {
    onDone: () => void;
    minDuration?: number;
}

/**
 * Splash inicial con logo + texto Roomly que se construye letra a letra,
 * una torre que crece piso a piso, y un fade-out al final.
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
            background: 'radial-gradient(circle at 50% 30%, #2a1656 0%, #0a0a1a 70%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', overflow: 'hidden',
        }}>
            <div className="splash-logo" style={{
                width: 96, height: 96, borderRadius: 24, background: 'linear-gradient(135deg, #7C3AED, #a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 20px 60px rgba(124,58,237,0.5)', opacity: 0, marginBottom: 18,
            }}>
                <svg width="56" height="56" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 28V16L20 10L28 16V28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 28V22" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="20" cy="16" r="2" fill="white" />
                </svg>
            </div>

            <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {'Roomly'.split('').map((c, i) => (
                    <span key={i} className="splash-letter" style={{
                        fontSize: 44, fontWeight: 800,
                        background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        opacity: 0, display: 'inline-block',
                    }}>{c}</span>
                ))}
            </div>

            <div className="splash-tag" style={{ opacity: 0, fontSize: 14, color: '#a0a0c0' }}>
                Tu comunidad, conectada
            </div>

            <div style={{
                display: 'flex', flexDirection: 'column-reverse', gap: 4,
                marginTop: 28, alignItems: 'center',
            }}>
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="splash-floor" style={{
                        width: `${36 + i * 6}px`, height: 6, borderRadius: 3, opacity: 0,
                        background: 'linear-gradient(90deg, #7C3AED, #a78bfa)',
                        boxShadow: '0 2px 6px rgba(124,58,237,0.4)',
                    }} />
                ))}
            </div>
        </div>
    );
}

export default Splash;
