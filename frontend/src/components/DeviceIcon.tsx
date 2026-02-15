import type { ComponentType } from 'react';
import {
  IconAccessPoint,
  IconAntennaBars5,
  IconCpu,
  IconHelpCircle,
  IconHomeSignal,
  IconMapPin,
  IconMapPinBolt,
  IconRadio,
  IconRouter,
  IconSatellite
} from '@tabler/icons-react';

export type DeviceIdentityInput = {
  deviceUid?: string | null;
  name?: string | null;
  longName?: string | null;
  shortName?: string | null;
  hwModel?: string | null;
  role?: string | null;
};

export type DeviceIconFamilyKey =
  | 'home'
  | 'gateway'
  | 'heltec'
  | 'tbeam'
  | 'rak'
  | 'lilygo'
  | 'router'
  | 'tracker'
  | 'sensor'
  | 'generic';

type DeviceIconFamily = {
  key: DeviceIconFamilyKey;
  label: string;
  badge: string | null;
  Icon: ComponentType<{
    size?: string | number;
    stroke?: string | number;
    className?: string;
    'aria-hidden'?: boolean;
  }>;
};

const DEVICE_ICON_FAMILIES: Record<DeviceIconFamilyKey, DeviceIconFamily> = {
  home: { key: 'home', label: 'Home node', badge: 'HM', Icon: IconHomeSignal },
  gateway: { key: 'gateway', label: 'Gateway', badge: 'GW', Icon: IconAccessPoint },
  heltec: { key: 'heltec', label: 'Heltec', badge: 'HL', Icon: IconRadio },
  tbeam: { key: 'tbeam', label: 'LilyGO T-Beam', badge: 'TB', Icon: IconSatellite },
  rak: { key: 'rak', label: 'RAK/WisBlock', badge: 'RAK', Icon: IconAntennaBars5 },
  lilygo: { key: 'lilygo', label: 'LilyGO', badge: 'T1', Icon: IconMapPinBolt },
  router: { key: 'router', label: 'Router/Relay', badge: 'RTR', Icon: IconRouter },
  tracker: { key: 'tracker', label: 'Tracker/Client', badge: 'TRK', Icon: IconMapPin },
  sensor: { key: 'sensor', label: 'Sensor node', badge: 'SNS', Icon: IconCpu },
  generic: { key: 'generic', label: 'Generic node', badge: null, Icon: IconHelpCircle }
};

const ICON_ORDER: DeviceIconFamilyKey[] = [
  'home',
  'gateway',
  'heltec',
  'tbeam',
  'rak',
  'lilygo',
  'router',
  'tracker',
  'sensor',
  'generic'
];

export const DEVICE_ICON_CATALOG: DeviceIconFamily[] = ICON_ORDER.map((key) => DEVICE_ICON_FAMILIES[key]);

function normalizeValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasAnyToken(value: string, tokens: string[]): boolean {
  if (!value) {
    return false;
  }
  return tokens.some((token) => value.includes(token));
}

function buildSearchHaystack(input: DeviceIdentityInput): string {
  return normalizeValue(
    [input.longName, input.name, input.shortName, input.deviceUid, input.hwModel, input.role]
      .filter(Boolean)
      .join(' ')
  );
}

export function resolveDeviceIconFamily(input: DeviceIdentityInput): DeviceIconFamily {
  const role = normalizeValue(input.role);
  const hwModel = normalizeValue(input.hwModel);
  const haystack = buildSearchHaystack(input);

  if (hasAnyToken(role, ['home', 'base']) || hasAnyToken(haystack, ['home node', 'base station'])) {
    return DEVICE_ICON_FAMILIES.home;
  }

  if (hasAnyToken(role, ['gateway']) || hasAnyToken(haystack, ['gateway'])) {
    return DEVICE_ICON_FAMILIES.gateway;
  }

  if (hasAnyToken(hwModel, ['t beam', 'tbeam'])) {
    return DEVICE_ICON_FAMILIES.tbeam;
  }

  if (hasAnyToken(hwModel, ['heltec'])) {
    return DEVICE_ICON_FAMILIES.heltec;
  }

  if (hasAnyToken(hwModel, ['rak', 'wisblock'])) {
    return DEVICE_ICON_FAMILIES.rak;
  }

  if (hasAnyToken(hwModel, ['lilygo', 'ttgo', 't echo', 't deck', 't lora'])) {
    return DEVICE_ICON_FAMILIES.lilygo;
  }

  if (hasAnyToken(role, ['router', 'relay', 'repeater'])) {
    return DEVICE_ICON_FAMILIES.router;
  }

  if (hasAnyToken(role, ['sensor'])) {
    return DEVICE_ICON_FAMILIES.sensor;
  }

  if (hasAnyToken(role, ['tracker', 'client', 'mobile'])) {
    return DEVICE_ICON_FAMILIES.tracker;
  }

  return DEVICE_ICON_FAMILIES.generic;
}

export function getDevicePrimaryLabel(input: DeviceIdentityInput): string {
  const longName = input.longName?.trim();
  if (longName) {
    return longName;
  }
  const name = input.name?.trim();
  if (name) {
    return name;
  }
  const shortName = input.shortName?.trim();
  if (shortName) {
    return shortName;
  }
  const deviceUid = input.deviceUid?.trim();
  if (deviceUid) {
    return deviceUid;
  }
  return 'Unknown device';
}

export function getDeviceSecondaryLabel(input: DeviceIdentityInput, primaryLabel?: string): string | null {
  const primary = (primaryLabel ?? getDevicePrimaryLabel(input)).toLowerCase();
  const details: string[] = [];
  const uid = input.deviceUid?.trim();
  const hwModel = input.hwModel?.trim();

  if (uid && uid.toLowerCase() !== primary) {
    details.push(uid);
  }
  if (hwModel) {
    details.push(hwModel);
  }

  return details.length > 0 ? details.join(' · ') : null;
}

export function buildDeviceIdentityLabel(input: DeviceIdentityInput): string {
  const primary = getDevicePrimaryLabel(input);
  const secondary = getDeviceSecondaryLabel(input, primary);
  return secondary ? `${primary} (${secondary})` : primary;
}

export function formatDeviceOptionLabel(input: DeviceIdentityInput): string {
  const family = resolveDeviceIconFamily(input);
  const badgePrefix = family.badge ? `[${family.badge}] ` : '';
  return `${badgePrefix}${buildDeviceIdentityLabel(input)}`;
}

type DeviceIconProps = {
  device: DeviceIdentityInput;
  size?: number;
  showBadge?: boolean;
  className?: string;
  title?: string;
};

export default function DeviceIcon({
  device,
  size = 16,
  showBadge = true,
  className,
  title
}: DeviceIconProps) {
  const family = resolveDeviceIconFamily(device);
  const iconTitle = title ?? family.label;
  const classes = ['device-identity-icon', className].filter(Boolean).join(' ');

  return (
    <span className={classes} title={iconTitle} aria-hidden="true">
      <family.Icon className="device-identity-icon__glyph" size={size} stroke={1.9} aria-hidden />
      {showBadge && family.badge ? (
        <span className="device-identity-icon__badge">{family.badge}</span>
      ) : null}
    </span>
  );
}
