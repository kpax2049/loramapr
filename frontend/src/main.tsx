import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';

import App from './App';
import './styles/theme.css';
import './index.css';
import { queryClient } from './query/queryClient';
import { AppTourProvider } from './tour/AppTourProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppTourProvider>
        <App />
      </AppTourProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
