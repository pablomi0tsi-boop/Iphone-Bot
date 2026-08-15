# Magazyn telefonów

Prosta, mobilna aplikacja do zarządzania magazynem konkretnych iPhone’ów.

## Stack

- React 19 + TypeScript + Vite
- Persystencja: `localStorage` przez `InventoryRepository`
- Cennik wariantów pamięci w `src/domain/catalog.ts`

## Uruchomienie

```bash
cd phone-inventory
npm install
npm run dev
```

Aplikacja: http://localhost:5173

## Wdrożenie na Vercel

1. W ustawieniach projektu Vercel ustaw **Root Directory** na `phone-inventory`.
2. Framework Preset: Vite (lub wykryje `vercel.json`).
3. Build: `npm run build` → output `dist` (ustawione w `vercel.json`).
4. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` w `installCommand` pomija zbędne pobieranie przeglądarek E2E przy deployu.

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
- Dane przeżywają odświeżenie strony
