# SmartFix — sklep iPhone + magazyn

Aplikacja Vite/React:

1. **Sklep publiczny** (`/`) — premium sklep wyłącznie z używanymi iPhone'ami
2. **Magazyn** (`/magazyn`) — istniejący panel za GitHub OAuth / Supabase

## Stack

- React 19 + TypeScript + Vite + React Router
- Magazyn: Supabase + GitHub OAuth (`VITE_SUPABASE_ANON_KEY`)
- Fallback: `localStorage` bez env (lokalnie / e2e)
- Katalog sklepu: `src/store/` — seed iPhone + mapowanie z `phones` (bez IMEI)

## Uruchomienie

```bash
cd phone-inventory
cp .env.example .env
npm install
npm run dev
```

- Sklep: http://localhost:5173
- Magazyn: http://localhost:5173/magazyn

## Routing sklepu

| Ścieżka | Opis |
|---------|------|
| `/` | Strona główna |
| `/sklep` | Lista iPhone'ów + filtry |
| `/sklep/:id` | Karta produktu |
| `/iphone` | Modele |
| `/koszyk` | Koszyk |
| `/zamowienie` | Checkout (UI, bez płatności) |
| `/konto` | Konto / historia zamówień |
| `/o-nas`, `/kontakt` | Treści |
| `/magazyn` | Panel magazynu |

## Widoczność w sklepie

W formularzu telefonu w magazynie: kolor + widoczność (dostępny / zarezerwowany /
niewidoczny). Meta jest kodowana w `note` jako `[sf:{...}]` — **bez migracji
Supabase**. Sprzedany telefon (`status=sold`) nie trafia do oferty.

## Testy

```bash
npm test
npm run build
```
