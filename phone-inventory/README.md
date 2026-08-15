# Magazyn telefonów

Prosta, mobilna aplikacja do zarządzania magazynem iPhone’ów i finansami firmy.

## Stack

- React 19 + TypeScript + Vite
- Persystencja: `localStorage` przez abstrakcję `InventoryRepository`
- Gotowy port `RemoteInventoryRepository` pod przyszłe API / sync w chmurze

## Uruchomienie

```bash
cd phone-inventory
npm install
npm run dev
```

Aplikacja: http://localhost:5173

## Testy

```bash
npm test          # logika domenowa
npm run test:e2e  # pełny flow UI (Playwright, viewport iPhone)
npm run build
```

## Funkcje

- Lista modeli z ilością, średnią ceną zakupu i wartością magazynową
- Przyciski `−` / `+` oraz formularz „Dodaj telefon” (pamięć, IMEI, stan)
- Sprzedaż z datą, pamięcią i IMEI — zysk = sprzedaż − zakup
- Zakładka **Zysk**: miesięczny obrót i zysk z nawigacją miesięcy
- Panel finansów: gotówka, konto, wartość telefonów, majątek, łączny zysk
- Historia operacji (od najnowszych)
- Wyszukiwanie modeli
- Dane przeżywają odświeżenie strony
