# Magazyn telefonów

Prosta, mobilna aplikacja do zarządzania magazynem konkretnych iPhone’ów.

## Stack

- React 19 + TypeScript + Vite
- Persystencja: **Supabase** (główne źródło danych) przez `InventoryRepository`
- Fallback: `localStorage` gdy brak zmiennych środowiskowych (lokalne / e2e)
- Cennik wariantów pamięci w `src/domain/catalog.ts`

## Uruchomienie

```bash
cd phone-inventory
cp .env.example .env
# uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

Aplikacja: http://localhost:5173

### Supabase (wspólne dane komputer ↔ iPhone)

1. W projekcie Supabase otwórz **SQL Editor** i wklej zawartość:
   `supabase/migrations/20260815120000_phone_inventory.sql`
2. W ustawieniach projektu skopiuj Project URL oraz anon/publishable key.
3. Ustaw w `.env` (lokalnie) oraz w Vercel → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Po buildzie oba urządzenia korzystają z tej samej bazy — odśwież stronę, żeby zobaczyć zmiany z drugiego urządzenia.

Bez tych zmiennych aplikacja działa na `localStorage` (dane tylko na jednym urządzeniu).

## Wdrożenie na Vercel

1. W ustawieniach projektu Vercel ustaw **Root Directory** na `phone-inventory`.
2. Framework Preset: Vite (lub wykryje `vercel.json`).
3. Build: `npm run build` → output `dist` (ustawione w `vercel.json`).
4. Dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` w `installCommand` pomija zbędne pobieranie przeglądarek E2E przy deployu.

## Testy

```bash
npm test          # logika domenowa
npm run test:e2e  # pełny flow UI (Playwright, viewport iPhone)
npm run build
```

## Funkcje

- Lista modeli z liczbą sztuk
- Każdy telefon to osobny rekord (IMEI, pamięć, bateria, stan, ceny)
- Formularz „DODAJ TELEFON” z pamięcią zależną od modelu i domyślną wartością z cennika
- Widok modelu z listą egzemplarzy + edycja / sprzedaż
- Zakładka **Zysk**: miesięczny obrót i zysk
- Sprzedany telefon zostaje w bazie ze statusem `sold` (historia + zysk miesięczny)
- Dane wspólne przez Supabase (po odświeżeniu na drugim urządzeniu)
