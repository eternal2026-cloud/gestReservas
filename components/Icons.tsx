import React from 'react';

// Íconos SVG en línea (trazo 1.8, heredan color con currentColor).
// El Muro los usa en lugar de emojis para que se vean igual en todos los equipos.

type IconProps = { size?: number; style?: React.CSSProperties; className?: string };

function Svg({ size = 18, style, className, children, fill = 'none' }: IconProps & { children: React.ReactNode; fill?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
            style={{ flexShrink: 0, verticalAlign: 'middle', ...style }}>
            {children}
        </svg>
    );
}

export const IconForum = (p: IconProps) => (
    <Svg {...p}><path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><path d="M17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3" /></Svg>
);

export const IconHeart = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
        <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3C21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20z" />
    </Svg>
);

export const IconComment = (p: IconProps) => (
    <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>
);

export const IconPhoto = (p: IconProps) => (
    <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></Svg>
);

export const IconBug = (p: IconProps) => (
    <Svg {...p}>
        <rect x="7" y="8" width="10" height="12" rx="5" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
        <path d="M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2M12 12v8" />
    </Svg>
);

export const IconClose = (p: IconProps) => (
    <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export const IconSend = (p: IconProps) => (
    <Svg {...p}><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4 18-7z" /></Svg>
);

export const IconMegaphone = (p: IconProps) => (
    <Svg {...p}><path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z" /><path d="M17 8a5 5 0 0 1 0 8" /></Svg>
);
