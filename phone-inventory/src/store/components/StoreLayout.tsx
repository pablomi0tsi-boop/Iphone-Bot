import { Outlet } from 'react-router-dom';
import { StoreFooter } from './StoreFooter';
import { StoreHeader } from './StoreHeader';
import './store.css';

export function StoreLayout() {
  return (
    <div className="sf-shell">
      <StoreHeader />
      <Outlet />
      <StoreFooter />
    </div>
  );
}
