import React, { useEffect, useRef } from 'react';
import anime from 'animejs';

interface LoaderProps {
    label?: string;
    fullscreen?: boolean;
}

export function Loader({ label = 'Cargando…', fullscreen = false }: LoaderProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const floors = containerRef.current.querySelectorAll('.loader-floor');
        const orb = containerRef.current.querySelector('.loader-orb');
        const dot = containerRef.current.querySelectorAll('.loader-dot');

        const tl = anime.timeline({ loop: true });

        tl.add({
            targets: floors,
            opacity: [0.15, 1],
            translateY: [12, 0],
            scaleX: [0.85, 1],
            easing: 'easeOutCubic',
            duration: 420,
            delay: anime.stagger(70),
        })
        .add({
            targets: floors,
            opacity: [1, 0.15],
            translateY: [0, -8],
            easing: 'easeInQuad',
            duration: 320,
            delay: anime.stagger(40),
        }, '+=380');

        const orbAnim = anime({
            targets: orb,
            rotate: 360,
            duration: 2400,
            easing: 'linear',
            loop: true,
        });

        const dotAnim = anime({
            targets: dot,
            opacity: [0.3, 1],
            scale: [0.7, 1.1],
            direction: 'alternate',
            duration: 600,
            easing: 'easeInOutSine',
            delay: anime.stagger(180),
            loop: true,
        });

        return () => {
            tl.pause();
            orbAnim.pause();
            dotAnim.pause();
        };
    }, []);

    const wrapStyle: React.CSSProperties = fullscreen
        ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 };

    return (
        <div ref={containerRef} style={wrapStyle} role="status" aria-live="polite" aria-busy="true">
            <div style={{ textAlign: 'center', position: 'relative', width: 160 }}>
                <div className="loader-orb" style={{
                    position: 'absolute', inset: -20, borderRadius: '50%',
                    background: 'conic-gradient(from 0deg, transparent, var(--primary-glow), transparent)',
                    filter: 'blur(20px)', pointerEvents: 'none',
                }} />
                <div style={{
                    display: 'flex', flexDirection: 'column-reverse', alignItems: 'center',
                    gap: 4, padding: '20px 0', position: 'relative',
                }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="loader-floor" style={{
                            width: `${40 + i * 6}px`, height: 8, borderRadius: 3,
                            background: 'linear-gradient(90deg, var(--primary), var(--primary-light))',
                            boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                            opacity: 0.15,
                        }} />
                    ))}
                </div>
                <div style={{
                    marginTop: 18, fontSize: 14, fontWeight: 600, color: 'var(--text-2)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
                }}>
                    <span>{label}</span>
                    <span className="loader-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary-light)' }} />
                    <span className="loader-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary-light)' }} />
                    <span className="loader-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary-light)' }} />
                </div>
            </div>
        </div>
    );
}

export default Loader;
