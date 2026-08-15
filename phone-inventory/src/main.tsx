import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './store/CartContext';
import { StoreLayout } from './store/components/StoreLayout';
import { MagazynRoute } from './store/MagazynRoute';
import { HomePage } from './store/pages/HomePage';
import { ShopPage } from './store/pages/ShopPage';
import { ProductPage } from './store/pages/ProductPage';
import { CartPage } from './store/pages/CartPage';
import { TradeInPage } from './store/pages/TradeInPage';
import { ServicePage } from './store/pages/ServicePage';
import {
  ContactPage,
  PrivacyPage,
  TermsPage,
} from './store/pages/ContactPages';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <CartProvider>
          <Routes>
            <Route path="/magazyn" element={<MagazynRoute />} />

            <Route element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="sklep" element={<ShopPage />} />
              <Route path="sklep/:id" element={<ProductPage />} />
              <Route path="koszyk" element={<CartPage />} />
              <Route path="skup" element={<TradeInPage />} />
              <Route path="serwis" element={<ServicePage />} />
              <Route path="kontakt" element={<ContactPage />} />
              <Route path="regulamin" element={<TermsPage />} />
              <Route path="polityka-prywatnosci" element={<PrivacyPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
