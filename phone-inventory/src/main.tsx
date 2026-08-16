import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './store/CartContext';
import { OrdersProvider } from './store/OrdersContext';
import { StoreLayout } from './store/components/StoreLayout';
import { MagazynRoute } from './store/MagazynRoute';
import { HomePage } from './store/pages/HomePage';
import { ShopPage } from './store/pages/ShopPage';
import { ProductPage } from './store/pages/ProductPage';
import { CartPage } from './store/pages/CartPage';
import { CheckoutPage } from './store/pages/CheckoutPage';
import { AccountPage } from './store/pages/AccountPage';
import {
  AboutPage,
  ContactPage,
  PrivacyPage,
  TermsPage,
} from './store/pages/ContentPages';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <CartProvider>
          <OrdersProvider>
            <Routes>
              <Route path="/magazyn" element={<MagazynRoute />} />

              <Route element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="sklep" element={<ShopPage />} />
                <Route path="sklep/:id" element={<ProductPage />} />
                <Route path="iphone" element={<ShopPage />} />
                <Route path="koszyk" element={<CartPage />} />
                <Route path="zamowienie" element={<CheckoutPage />} />
                <Route path="konto" element={<AccountPage />} />
                <Route path="o-nas" element={<AboutPage />} />
                <Route path="kontakt" element={<ContactPage />} />
                <Route path="regulamin" element={<TermsPage />} />
                <Route path="polityka-prywatnosci" element={<PrivacyPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OrdersProvider>
        </CartProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
