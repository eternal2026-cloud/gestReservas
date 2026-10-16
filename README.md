# Salas ADR

Reserva de salas de reunión de Agrícola Don Ricardo. Usa la misma lógica que
Roomly (gestReservas) con la identidad visual de ADR.

| Roomly              | Salas ADR                          |
|---------------------|------------------------------------|
| Torre / comunidad   | Sede (oficina, planta o fundo)     |
| Espacio común       | Sala de reunión                    |
| Departamento        | Área del colaborador               |
| —                   | Cargo del colaborador (nuevo)      |
| —                   | Motivo de la reunión y asistentes (nuevo) |
| Sanción por depto   | Sanción por área                   |
| Cooldown por depto  | Cooldown por colaborador           |

## Ejecutar en local

1. `npm install`
2. Crear `.env.local` con:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   VITE_SITE_URL=https://tu-dominio   # opcional, por defecto el origen actual
   ```
3. `npm run dev`

## Base de datos (Supabase)

- Proyecto nuevo: ejecutar `supabase_schema.sql`, `supabase_qr_validation.sql`
  y `supabase_storage_setup.sql`.
- Proyecto que ya tenía el esquema de Roomly: ejecutar además
  `supabase_salas_adr_migracion.sql`.
