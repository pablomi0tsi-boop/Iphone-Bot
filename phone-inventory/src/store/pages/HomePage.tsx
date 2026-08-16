import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  POPULAR_STORE_MODELS,
  STORE_GENERATIONS,
  shopUrlForGeneration,
} from '../../domain/catalog';
import { listDealProducts, listFeaturedByModels } from '../catalog';
import { productImageForModel } from '../productImages';
import type { StoreProduct } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, LoadingState } from '../components/States';
import './home.css';

const WHY = [
  {
    title: 'Sprawdzone urządzenia',
    text: 'Każdy iPhone jest przez nas dokładnie sprawdzany.',
  },
  {
    title: 'Gwarancja',
    text: 'Każdy zakup objęty jest gwarancją.',
  },
  {
    title: 'Bezpieczne zakupy',
    text: 'Bezpieczny proces zamówienia i płatności.',
  },
  {
    title: 'Wsparcie',
    text: 'Masz pytania? Skontaktuj się z nami.',
  },
] as const;

const BUY_STEPS = [
  { n: '01', title: 'Wybierz iPhone\'a' },
  { n: '02', title: 'Sprawdź jego stan' },
  { n: '03', title: 'Dodaj do koszyka' },
  { n: '04', title: 'Zamów' },
  { n: '05', title: 'Odbierz telefon' },
] as const;

export function HomePage() {
  const [featured, setFeatured] = useState<StoreProduct[]>([]);
  const [deals, setDeals] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listFeaturedByModels(POPULAR_STORE_MODELS),
      listDealProducts(8),
    ])
      .then(([featuredItems, dealItems]) => {
        if (cancelled) return;
        setFeatured(featuredItems);
        setDeals(dealItems);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Błąd ładowania');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const heroArt =
    productImageForModel('iPhone 15 Pro') ??
    productImageForModel('iPhone 14 Pro');

  return (
    <main className="sf-home">
      <section className="sf-home-hero">
        <div className="sf-home-hero__inner">
          <div className="sf-home-hero__copy">
            <p className="sf-eyebrow">Sklep SmartFix</p>
            <h1>
              Używane iPhone&apos;y.
              <br />
              Sprawdzone przez nas.
              <br />
              Gotowe dla Ciebie.
            </h1>
            <p className="sf-home-hero__lead">
              Sprawdzone urządzenia Apple w atrakcyjnych cenach. Każdy iPhone
              przechodzi kontrolę przed sprzedażą.
            </p>
            <div className="sf-home-hero__actions">
              <Link to="/sklep" className="btn primary lg">
                Zobacz iPhone&apos;y
              </Link>
              <Link to="/sprzedaj" className="btn ghost lg">
                Sprzedaj swojego iPhone&apos;a
              </Link>
            </div>
          </div>
          <div className="sf-home-hero__visual" aria-hidden="true">
            <div className="sf-home-hero__glow" />
            {heroArt ? (
              <img src={heroArt} alt="" />
            ) : (
              <div className="sf-home-hero__placeholder" />
            )}
          </div>
        </div>
      </section>

      <section className="sf-section sf-home-cats">
        <div className="sf-section-head">
          <div>
            <p className="sf-eyebrow">Katalog</p>
            <h2>Znajdź swojego iPhone&apos;a</h2>
          </div>
          <Link to="/sklep">Wszystkie modele</Link>
        </div>
        <div className="sf-gen-grid">
          {STORE_GENERATIONS.map((gen) => {
            const cover =
              productImageForModel(`iPhone ${gen}`) ??
              productImageForModel(`iPhone ${gen} Pro`) ??
              productImageForModel(`iPhone ${gen} Pro Max`);
            return (
              <Link
                key={gen}
                to={shopUrlForGeneration(gen)}
                className="sf-gen-tile"
              >
                {cover ? <img src={cover} alt="" loading="lazy" /> : null}
                <span>iPhone {gen}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="sf-section" id="oferta">
        <div className="sf-section-head">
          <div>
            <p className="sf-eyebrow">Oferta</p>
            <h2>Polecane iPhone&apos;y</h2>
          </div>
          <Link to="/sklep">Zobacz sklep</Link>
        </div>
        {loading ? <LoadingState label="Ładowanie oferty…" /> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setLoading(true);
              setError(null);
              void Promise.all([
                listFeaturedByModels(POPULAR_STORE_MODELS),
                listDealProducts(8),
              ])
                .then(([featuredItems, dealItems]) => {
                  setFeatured(featuredItems);
                  setDeals(dealItems);
                  setLoading(false);
                })
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : 'Błąd ładowania',
                  );
                  setLoading(false);
                });
            }}
          />
        ) : null}
        {!loading && !error ? (
          <div className="sf-product-grid">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </section>

      {!loading && !error && deals.length > 0 ? (
        <section className="sf-section" id="okazje">
          <div className="sf-section-head">
            <div>
              <p className="sf-eyebrow">Promocje</p>
              <h2>Okazje SmartFix</h2>
            </div>
            <Link to="/sklep?sort=price_asc">Więcej w sklepie</Link>
          </div>
          <div className="sf-product-grid">
            {deals.map((product) => (
              <ProductCard
                key={`deal-${product.id}`}
                product={product}
                showDealBadge
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="sf-section" id="dlaczego">
        <div className="sf-section-head centered">
          <div>
            <p className="sf-eyebrow">Zaufanie</p>
            <h2>Dlaczego warto kupić w SmartFix?</h2>
          </div>
        </div>
        <div className="sf-why-grid">
          {WHY.map((item) => (
            <article key={item.title} className="sf-why-card">
              <span className="sf-why-check" aria-hidden>
                ✓
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sf-section" id="uslugi">
        <div className="sf-section-head centered">
          <div>
            <p className="sf-eyebrow">Usługi</p>
            <h2>SmartFix — nie tylko sklep</h2>
          </div>
        </div>
        <div className="sf-services-grid">
          <article className="sf-service-card">
            <h3>Masz iPhone&apos;a na sprzedaż?</h3>
            <p>Sprawdź jego wartość i otrzymaj szybką wycenę.</p>
            <Link to="/sprzedaj" className="btn primary">
              Sprzedaj iPhone&apos;a
            </Link>
          </article>
          <article className="sf-service-card">
            <h3>Twój iPhone potrzebuje naprawy?</h3>
            <p>Zostaw naprawę profesjonalistom.</p>
            <Link to="/napraw" className="btn primary">
              Umów naprawę
            </Link>
          </article>
        </div>
      </section>

      <section className="sf-section" id="jak-kupic">
        <div className="sf-section-head centered">
          <div>
            <p className="sf-eyebrow">Proces</p>
            <h2>Jak działa zakup?</h2>
          </div>
        </div>
        <ol className="sf-buy-steps">
          {BUY_STEPS.map((s) => (
            <li key={s.n}>
              <span>{s.n}</span>
              <strong>{s.title}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="sf-section sf-about-band" id="o-nas-skrot">
        <div className="sf-about-band__inner">
          <p className="sf-eyebrow">O nas</p>
          <h2>SmartFix — sprawdzone iPhone&apos;y bez kombinowania.</h2>
          <p>
            Kupujesz konkretny egzemplarz: ze stanem, baterią i historią kontroli.
            Bez niespodzianek — z jasną gwarancją.
          </p>
          <Link to="/o-nas" className="btn ghost">
            Poznaj SmartFix
          </Link>
        </div>
      </section>

      <section className="sf-section" id="opinie">
        <div className="sf-section-head centered">
          <div>
            <p className="sf-eyebrow">Opinie</p>
            <h2>Co mówią nasi klienci?</h2>
          </div>
        </div>
        <div className="sf-reviews-placeholder" role="status">
          <p>
            Wkrótce pokażemy tu prawdziwe opinie klientów. Miejsce jest gotowe
            pod dane z Supabase — nie publikujemy fikcyjnych recenzji.
          </p>
        </div>
      </section>

      <section className="sf-home-cta">
        <div className="sf-home-cta__inner">
          <h2>Szukasz swojego następnego iPhone&apos;a?</h2>
          <p>Sprawdź aktualną ofertę SmartFix.</p>
          <Link to="/sklep" className="btn primary lg">
            Przejdź do sklepu
          </Link>
        </div>
      </section>
    </main>
  );
}
