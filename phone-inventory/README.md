# Magazyn telefonów + sklep SmartFix

Aplikacja Vite/React z dwoma częściami:

1. **Sklep publiczny** (`/`, `/sklep`, `/koszyk`, `/skup`, `/serwis`, …) — UI
   sprzedażowy bez płatności.
2. **Magazyn** (`/magazyn`) — istniejący panel magazynowy za GitHub OAuth.

## Stack

- React 19 + TypeScript + Vite + React Router
- Persystencja magazynu: **Supabase** przez `InventoryRepository`
- Auth: **GitHub OAuth** (Supabase Auth) — tylko `VITE_SUPABASE_ANON_KEY` na froncie
- Fallback: `localStorage` gdy brak zmiennych środowiskowych (lokalne / e2e)
- Katalog sklepu: warstwa `src/store/` z demo produktami (łatwa podmiana na
  `phones` z Supabase przez `mapPhoneToProduct` — **bez IMEI**)

## Uruchomienie

```bash
cd phone-inventory
cp .env.example .env
# uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

- Sklep: http://localhost:5173
- Magazyn: http://localhost:5173/magazyn

### Supabase + GitHub OAuth

1. SQL: `supabase/migrations/20260815120000_phone_inventory.sql`
2. Provider GitHub włączony w Supabase (Client ID/Secret tylko w dashboardzie).
3. GitHub OAuth App callback:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
4. Redirect URLs w Supabase:
   - `http://localhost:5173`
   - `http://localhost:5173/magazyn`
   - `https://phone-inventory-swart.vercel.app`
   - `https://phone-inventory-swart.vercel.app/magazyn`
5. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Logowanie magazynu:

```ts
supabase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: `${window.location.origin}/magazyn` },
})
```

Sesja PKCE jest zapamiętywana; po powrocie z GitHuba użytkownik trafia do magazynu.

## Wdrożenie na Vercel

1. Root Directory: `phone-inventory`
2. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3. Po zmianach kodu auth — **nowy deploy** (Vite wbudowuje env w build)

## Testy

```bash
npm test
npm run test:e2e
npm run build
```
