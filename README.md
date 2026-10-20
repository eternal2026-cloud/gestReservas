# Salas ADR

Reserva de salas de reunión de Agrícola Don Ricardo. Una sola empresa (ADR):
sin sedes ni torres. Solo los administradores crean y gestionan salas; los
colaboradores reservan.

| Rol          | Qué hace                                                          |
|--------------|-------------------------------------------------------------------|
| Colaborador  | Se registra con área y cargo, ve la agenda y reserva salas         |
| Admin        | Crea/edita/deshabilita salas, califica reuniones, aplica sanciones |
| Super Admin  | Todo lo del admin + nombra admins y desactiva colaboradores        |

## Configuración (plan gratuito de Supabase)

1. **Base de datos** — Supabase → SQL Editor, en este orden:
   `supabase_schema.sql`, `supabase_storage_setup.sql`, `supabase_qr_validation.sql`
   y por último `supabase_empresa_unica.sql` (al final ajusta el correo del Super Admin).
2. **Registro sin correos** — Supabase → Authentication → Sign In / Providers → Email:
   desactiva **Confirm email** y guarda. Así las cuentas se crean al instante y no
   dependes del límite de correos del plan gratis ni de un SMTP propio.
3. **URL de la app** — Authentication → URL Configuration: en *Site URL* pon la URL
   donde publiques la app (o `http://localhost:3000` en local).
4. **Variables** — crea `.env.local` (y las mismas variables en tu hosting):
   ```
   VITE_SUPABASE_URL=https://<proyecto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<Project Settings → API Keys → publishable key>
   VITE_SITE_URL=https://tu-dominio   # opcional
   ```
5. `npm install` y `npm run dev` → http://localhost:3000

### Si aparece "Failed to fetch"

El navegador no llegó a Supabase. Revisa, en este orden:
- El proyecto no está **pausado** (los proyectos gratis se pausan tras ~7 días sin uso;
  se reactivan con *Restore* en el dashboard).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` correctos y **reinicia** `npm run dev`
  (Vite solo lee `.env.local` al arrancar). En un hosting, vuelve a hacer build tras
  cambiarlas.
- No abras `dist/index.html` con doble clic (`file://`); usa `npm run preview` o súbelo
  a un hosting.
- Red corporativa/antivirus bloqueando `*.supabase.co`.
