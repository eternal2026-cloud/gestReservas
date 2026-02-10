import React from 'react';
import { User } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    activeTab: string;
    onNavigate: (tab: string) => void;
    user: User;
    toggleTheme: () => void;
    isDarkMode: boolean;
}

// Minimal Roomly Logo
const RoomlyLogo = () => (
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="8" fill="#7C3AED"/>
        <path d="M12 28V16L20 10L28 16V28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20 28V22" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onNavigate, user, toggleTheme, isDarkMode }) => {
    const navItems = [
        { id: 'home', icon: 'apartment', label: 'Mi Torre' },
        { id: 'community', icon: 'forum', label: 'Comunidad' },
        { id: 'amenities', icon: 'calendar_month', label: 'Reservas' },
        { id: 'leaderboard', icon: 'leaderboard', label: 'Top' },
        { id: 'profile', icon: 'person', label: 'Perfil' }
    ];

    return (
        <div className="min-h-screen bg-bg-light dark:bg-bg-dark pb-24 md:pb-0 md:pl-64 transition-all duration-300">
            {/* Desktop Side Nav */}
            <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-white/5 py-6 px-4 z-50 shadow-sm">
                <div className="flex items-center gap-3 mb-10 px-2 cursor-pointer" onClick={() => onNavigate('home')}>
                    <RoomlyLogo />
                    <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Roomly</span>
                </div>
                
                <div className="space-y-1 flex-1">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id)}
                            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium
                                ${activeTab === item.id 
                                    ? 'bg-primary/10 text-primary dark:bg-primary dark:text-white' 
                                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5'}`}
                        >
                            <span className={`material-symbols-outlined text-xl ${activeTab === item.id ? 'filled' : ''}`}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Theme Toggle & User Mini Profile */}
                <div className="border-t border-gray-200 dark:border-white/10 pt-4 mt-4">
                    <button 
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400 mb-2 transition-colors"
                    >
                         <span className="material-symbols-outlined">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
                         <span className="text-sm">{isDarkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="max-w-md mx-auto md:max-w-6xl md:pt-6 min-h-screen px-4 md:px-8">
                {children}
            </main>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md border-t border-gray-200 dark:border-white/5 flex justify-around py-2 pb-safe z-50 shadow-lg">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 ${activeTab === item.id ? 'text-primary' : 'text-gray-400 dark:text-gray-500'}`}
                    >
                        <span className={`material-symbols-outlined text-2xl mb-1 ${activeTab === item.id ? 'filled' : ''}`}>
                            {item.icon}
                        </span>
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
};