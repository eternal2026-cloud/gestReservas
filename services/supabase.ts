/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// URL pública de la app desplegada. Los enlaces de los correos de Supabase
// (confirmación y recuperación de clave) deben volver aquí, nunca a localhost.
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://gest-reservas.vercel.app';
