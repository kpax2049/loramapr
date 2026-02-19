import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { IconHomeSignal } from '@tabler/icons-react';
import L from 'leaflet';

type CreateHomeGeofenceDivIconOptions = {
  theme?: 'light' | 'dark';
  size?: number;
};

function readThemeFromDocument(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function createHomeGeofenceDivIcon(options: CreateHomeGeofenceDivIconOptions = {}): L.DivIcon {
  const size = typeof options.size === 'number' && options.size > 0 ? options.size : 28;
  const theme = options.theme ?? readThemeFromDocument();
  const html = renderToString(
    createElement(
      'div',
      {
        className: ['lm-home-geofence-marker', `lm-home-geofence-marker--${theme}`].join(' '),
        'data-tour': 'geofence-home-marker',
        style: {
          '--lm-home-geofence-size': `${size}px`
        }
      },
      createElement(IconHomeSignal, {
        className: 'lm-home-geofence-marker__icon',
        size: Math.max(13, Math.round(size * 0.58)),
        stroke: 1.85,
        'aria-hidden': true
      })
    )
  );

  return L.divIcon({
    html,
    className: 'lm-home-geofence-divicon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -Math.round(size / 2)]
  });
}
