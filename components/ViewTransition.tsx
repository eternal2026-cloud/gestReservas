import React, { useEffect, useRef } from 'react';
import anime from 'animejs';

/**
 * Envuelve cada vista y dispara una animación de entrada al montar/cambiar `view`.
 * El usuario ve un slide+fade muy notorio cada vez que navega.
 */
interface ViewTransitionProps {
    viewKey: string;       // cambiar para retriggerear la animación
    children: React.ReactNode;
    direction?: 'up' | 'right' | 'left' | 'scale';
}

export function ViewTransition({ viewKey, children, direction = 'up' }: ViewTransitionProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        const fromMap = {
            up:    { translateY: [24, 0], opacity: [0, 1] },
            right: { translateX: [40, 0], opacity: [0, 1] },
            left:  { translateX: [-40, 0], opacity: [0, 1] },
            scale: { scale: [0.94, 1], opacity: [0, 1] },
        } as const;
        const instance = anime({
            targets: ref.current,
            ...fromMap[direction],
            duration: 520,
            easing: 'easeOutCubic',
        });
        // Stagger en hijos de primer nivel marcados con .stagger-item
        const items = ref.current.querySelectorAll('.stagger-item');
        if (items.length > 0) {
            anime({
                targets: items,
                opacity: [0, 1],
                translateY: [18, 0],
                delay: anime.stagger(70, { start: 120 }),
                duration: 500,
                easing: 'easeOutCubic',
            });
        }
        return () => { instance.pause(); };
    }, [viewKey, direction]);

    return <div ref={ref} style={{ willChange: 'transform, opacity' }}>{children}</div>;
}

export default ViewTransition;
