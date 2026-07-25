import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safety stubs for Thư Viện Pháp Luật imported HTML scripts & event handlers
if (typeof window !== 'undefined') {
  const win = window as any;
  win.LS_Tootip_Type_Bookmark_DC_Archive = win.LS_Tootip_Type_Bookmark_DC_Archive || '';
  win.hideddrivetip = win.hideddrivetip || (() => {});
  win.showdrivetip = win.showdrivetip || (() => {});
  win.ddrivetip = win.ddrivetip || (() => {});
  win.stm = win.stm || (() => {});
  win.ShowPopupDoc = win.ShowPopupDoc || (() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
