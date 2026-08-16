import { Link } from 'react-router-dom';

export function StoreFooter() {
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <div className="sf-footer-brand">
          <p className="sf-brand-name">SmartFix</p>
          <p className="sf-muted">
            Profesjonalny sklep z używanymi iPhone&apos;ami. Sprawdzone
            urządzenia, jasna wycena, wsparcie po zakupie.
          </p>
          <div className="sf-social">
            <a href="https://instagram.com" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href="https://tiktok.com" target="_blank" rel="noreferrer">
              TikTok
            </a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer">
              Facebook
            </a>
          </div>
        </div>

        <div>
          <h3>Sklep</h3>
          <ul>
            <li>
              <Link to="/sklep">Sklep</Link>
            </li>
            <li>
              <Link to="/sprzedaj">Sprzedaj iPhone&apos;a</Link>
            </li>
            <li>
              <Link to="/napraw">Napraw</Link>
            </li>
            <li>
              <Link to="/o-nas">O nas</Link>
            </li>
            <li>
              <Link to="/kontakt">Kontakt</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3>Pomoc</h3>
          <ul>
            <li>
              <Link to="/kontakt">Dostawa</Link>
            </li>
            <li>
              <Link to="/kontakt">Płatności</Link>
            </li>
            <li>
              <Link to="/regulamin">Gwarancja</Link>
            </li>
            <li>
              <Link to="/regulamin">Zwroty</Link>
            </li>
            <li>
              <Link to="/kontakt">FAQ</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3>Kontakt</h3>
          <ul>
            <li>
              <a href="tel:+48000000000">+48 000 000 000</a>
            </li>
            <li>
              <a href="mailto:kontakt@smartfix.pl">kontakt@smartfix.pl</a>
            </li>
            <li>Pon–Pt 10:00–18:00</li>
          </ul>
        </div>
      </div>
      <p className="sf-footer-copy">
        © {new Date().getFullYear()} SmartFix. Używane iPhone&apos;y —
        sprawdzone przed sprzedażą.
      </p>
    </footer>
  );
}
