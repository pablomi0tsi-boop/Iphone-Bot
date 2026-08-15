import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFeaturedProducts } from '../catalog';
import type { StoreBrand, StoreProduct } from '../types';
import { ProductCard } from '../components/ProductCard';

const CATEGORIES: { brand: StoreBrand | 'all'; label: string; hint: string }[] =
  [
    { brand: 'Apple', label: 'iPhone', hint: 'Sprawdzone Apple' },
    { brand: 'Samsung', label: 'Samsung', hint: 'Galaxy i więcej' },
    { brand: 'Other', label: 'Pozostałe', hint: 'Inne marki' },
  ];

const WHY = [
  {
    title: 'Sprawdzone urządzenia',
    text: 'Każdy telefon przechodzi testy sprawności przed wystawieniem.',
  },
  {
    title: 'Gwarancja',
    text: 'Kupujesz ze spokojem — gwarancja SmartFix na każdy egzemplarz.',
  },
  {
    title: 'Szybka wysyłka',
    text: 'Spakowane i gotowe do drogi. Śledzenie przesyłki w standardzie.',
  },
  {
    title: 'Bezpieczne zakupy',
    text: 'Uczciwy opis stanu, zdjęcia i jasna cena — bez niespodzianek.',
  },
];

export function HomePage() {
  const [featured, setFeatured] = useState<StoreProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listFeaturedProducts(4).then((items) => {
      if (!cancelled) setFeatured(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">SmartFix</p>
          <h1>Znajdź swojego iPhone&apos;a</h1>
          <p className="hero-lead">
            Sprawdzone telefony, uczciwe ceny i gwarancja.
          </p>
          <div className="hero-actions">
            <Link to="/sklep" className="btn primary">
              Zobacz telefony
            </Link>
            <Link to="/skup" className="btn ghost">
              Sprzedaj telefon
            </Link>
          </div>
        </div>
      </section>

      <section className="store-section">
        <div className="store-section-head">
          <h2>Kategorie</h2>
          <p>Wybierz markę i przejdź prosto do oferty.</p>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.label}
              to={`/sklep?brand=${cat.brand}`}
              className="category-tile"
            >
              <span className="category-label">{cat.label}</span>
              <span className="category-hint">{cat.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="store-section">
        <div className="store-section-head">
          <h2>Polecane telefony</h2>
          <Link to="/sklep">Zobacz wszystkie</Link>
        </div>
        <div className="product-grid">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="store-section">
        <div className="store-section-head">
          <h2>Dlaczego SmartFix?</h2>
          <p>Premium doświadczenie zakupowe bez ryzyka.</p>
        </div>
        <div className="why-grid">
          {WHY.map((item) => (
            <article key={item.title} className="why-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <h2>Chcesz sprzedać swój telefon?</h2>
          <p>
            Szybka wycena online. Fair deal, bezpieczna transakcja, wypłata bez
            zbędnych formalności.
          </p>
          <Link to="/skup" className="btn primary">
            Oblicz wycenę
          </Link>
        </div>
      </section>
    </main>
  );
}
