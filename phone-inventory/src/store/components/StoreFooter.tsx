import { Link } from 'react-router-dom';

export function StoreFooter() {
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <div>
          <p className="sf-brand-name">SmartFix</p>
          <p className="sf-muted">
            Profesjonalny sklep z używanymi iPhone&apos;ami. Każdy egzemplarz
            sprawdzony przed sprzedażą.
          </p>
        </div>
        <div>
          <h3>Sklep</h3>
          <ul>
            <li>
              <Link to="/sklep">Wszystkie iPhone&apos;y</Link>
            </li>
            <li>
              <Link to="/iphone">Popularne modele</Link>
            </li>
            <li>
              <Link to="/o-nas">O nas</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Informacje</h3>
          <ul>
            <li>
              <Link to="/regulamin">Regulamin</Link>
            </li>
            <li>
              <Link to="/polityka-prywatnosci">Polityka prywatności</Link>
            </li>
            <li>
              <Link to="/kontakt">Kontakt</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Kontakt</h3>
          <ul>
            <li>kontakt@smartfix.pl</li>
            <li>+48 000 000 000</li>
            <li>Pon–Pt 10:00–18:00</li>
          </ul>
        </div>
      </div>
      <p className="sf-footer-copy">
        © {new Date().getFullYear()} SmartFix. Tylko używane iPhone&apos;y.
      </p>
    </footer>
  );
}
