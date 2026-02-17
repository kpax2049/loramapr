import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import L from 'leaflet';
import {
  getDeviceIconDefinition,
  type DeviceIconKey
} from '../components/DeviceIcon';
import type { DeviceStatusBucket } from '../utils/deviceOnlineStatus';

type DeviceMarkerStatus = {
  measurementStatus: DeviceStatusBucket;
  webhookStatus: DeviceStatusBucket;
};

type CreateDeviceDivIconOptions = {
  iconKey: DeviceIconKey;
  badgeText?: string;
  status: DeviceMarkerStatus;
  theme?: 'light' | 'dark';
  size?: number;
};

const STATUS_RANK: Record<DeviceStatusBucket, number> = {
  unknown: 0,
  offline: 1,
  stale: 2,
  recent: 3,
  online: 4
};

function readThemeFromDocument(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' ? 'light' : 'dark';
}

export function createDeviceDivIcon(options: CreateDeviceDivIconOptions): L.DivIcon {
  const size = typeof options.size === 'number' && options.size > 0 ? options.size : 32;
  const theme = options.theme ?? readThemeFromDocument();
  const iconDefinition = getDeviceIconDefinition(options.iconKey);
  const IconComponent = iconDefinition.IconComponent;
  const badgeText = options.badgeText ?? iconDefinition.badgeText ?? undefined;
  const measurementStatus = options.status.measurementStatus;
  const webhookStatus = options.status.webhookStatus;
  const showRing = STATUS_RANK[webhookStatus] > STATUS_RANK[measurementStatus];

  const html = renderToString(
    createElement(
      'div',
      {
        className: [
          'lm-device-marker',
          `lm-device-marker--${theme}`,
          `lm-device-marker--measurement-${measurementStatus}`
        ].join(' '),
        style: {
          width: `${size}px`,
          height: `${size}px`
        }
      },
      createElement(
        'span',
        { className: 'lm-device-marker__icon-shell' },
        createElement(IconComponent, {
          className: 'lm-device-marker__icon',
          size: Math.max(14, Math.round(size * 0.58)),
          stroke: 1.85,
          'aria-hidden': true
        })
      ),
      createElement(
        'span',
        {
          className: [
            'lm-device-marker__status',
            `lm-device-marker__status--${measurementStatus}`
          ].join(' ')
        },
        showRing
          ? createElement('span', {
              className: [
                'lm-device-marker__status-ring',
                `lm-device-marker__status-ring--${webhookStatus}`
              ].join(' ')
            })
          : null,
        createElement('span', { className: 'lm-device-marker__status-dot' })
      ),
      badgeText
        ? createElement('span', { className: 'lm-device-marker__badge' }, badgeText)
        : null
    )
  );

  return L.divIcon({
    html,
    className: 'lm-device-divicon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size]
  });
}
