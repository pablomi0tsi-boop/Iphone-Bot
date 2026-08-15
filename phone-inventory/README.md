# Magazyn telefonów

Prosta, mobilna aplikacja do zarządzania magazynem konkretnych iPhone’ów.

## Stack

- React 19 + TypeScript + Vite
- Persystencja: **Supabase** (główne źródło danych) przez `InventoryRepository`
- Auth: **GitHub OAuth** (Supabase Auth) — bez `service_role` na froncie
- Fallback: `localStorage` gdy brak zmiennych środowiskowych (lokalne / e2e)
- Cennik wariantów pamięci w `src/domain/catalog.ts`

## Uruchomienie

```bash
cd phone-inventory
cp .env.example .env
# uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Aplikacja: http://localhost:5173

### Supabase + GitHub OAuth

1. SQL Editor → wklej `supabase/migrations/20260815120000_phone_inventory.sql`
   (`phones`, `sales`, `finance`, `history` + RLS tylko dla `authenticated`).
2. **Authentication → Providers → GitHub**: włącz, wklej Client ID + Secret z GitHub OAuth App.
3. W GitHub OAuth App ustaw **Authorization callback URL** dokładnie na:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`  
   (to musi być URL Supabase, **nie** Vercel — zły callback kończy się na
   `github.com/sessions/verified-device`).
4. **Authentication → URL Configuration**:
   - Site URL: `https://phone-inventory-swart.vercel.app`
   - Redirect URLs:
     - `http://localhost:5173/`
     - `https://phone-inventory-swart.vercel.app/`
5. Env (lokalnie + Vercel):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  
     (alias: `VITE_SUPABASE_PUBLISHABLE_KEY` też działa)

Aplikacja woła `signInWithOAuth({ provider: 'github', redirectTo: origin + '/' })`,
potem `detectSessionInUrl` + PKCE zapisuje sesję po powrocie.

Bez env → `localStorage` (bez ekranu logowania).

## Wdrożenie na Vercel

1. Root Directory: `phone-inventory`.
2. Build: `npm run build` → `dist`.
3. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Po deployu dodaj produkcyjny URL do Supabase Redirect URLs.

## Testy

```bash
npm test
npm run test:e2e
npm run build
```

## Funkcje

- Logowanie GitHub (gdy Supabase skonfigurowany)
- Lista modeli z liczbą sztuk
- Każdy telefon to osobny rekord (IMEI, pamięć, bateria, stan, ceny)
- Formularz „DODAJ TELEFON” / sprzedaż bez zmian
- Zakładka **Zysk**: miesięczny obrót i zysk
- Sprzedany telefon zostaje w bazie ze statusem `sold`
- Dane wspólne przez Supabase
