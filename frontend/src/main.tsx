import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';

import App from './App';
import './styles/theme.css';
import UiKit from './pages/UiKit';
import './index.css';
import { queryClient } from './query/queryClient';
import { AppTourProvider } from './tour/AppTourProvider';

const shouldRenderUiKit =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  (window.location.pathname === '/ui-kit' ||
    new URLSearchParams(window.location.search).get('ui-kit') === '1');

const RootComponent = shouldRenderUiKit ? UiKit : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppTourProvider>
        <RootComponent />
      </AppTourProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
