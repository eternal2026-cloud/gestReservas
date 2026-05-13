import { useEffect, useRef } from 'react';
import anime from 'animejs';

/**
 * Anima la entrada de un elemento al montarse.
 * Uso:
 *   const ref = useAnimeOnMount<HTMLDivElement>({ opacity: [0, 1], translateY: [12, 0] });
 *   return <div ref={ref}>…</div>
 */
export function useAnimeOnMount<T extends HTMLElement = HTMLDivElement>(
    params: anime.AnimeParams,
    deps: React.DependencyList = [],
) {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!ref.current) return;
        const instance = anime({
            targets: ref.current,
            duration: 480,
            easing: 'easeOutCubic',
            ...params,
        });
        return () => { instance.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return ref;
}

/**
 * Anima en stagger todos los hijos de un contenedor.
 * Útil para listas de cards / leaderboard / reservas.
 */
export function useAnimeStagger<T extends HTMLElement = HTMLDivElement>(
    childSelector: string,
    params: anime.AnimeParams = {},
    deps: React.DependencyList = [],
) {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!ref.current) return;
        const children = ref.current.querySelectorAll(childSelector);
        if (children.length === 0) return;
        const instance = anime({
            targets: children,
            opacity: [0, 1],
            translateY: [16, 0],
            delay: anime.stagger(60),
            duration: 500,
            easing: 'easeOutCubic',
            ...params,
        });
        return () => { instance.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return ref;
}

/**
 * Dispara una animación de "pulso" sobre un elemento (ej. recompensa de puntos).
 */
export function pulse(target: Element | string, color = 'var(--accent)') {
    return anime({
        targets: target,
        scale: [1, 1.12, 1],
        boxShadow: [
            '0 0 0 0 rgba(6,214,160,0.6)',
            `0 0 0 12px rgba(6,214,160,0)`,
            '0 0 0 0 rgba(6,214,160,0)',
        ],
        duration: 700,
        easing: 'easeOutQuad',
    });
}
