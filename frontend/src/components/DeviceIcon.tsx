import type { ComponentType, CSSProperties } from 'react';
import autoIconUrl from '../assets/device-icons/auto.png';
import gatewayIconUrl from '../assets/device-icons/gateway.png';
import heltecIconUrl from '../assets/device-icons/heltec.png';
import homeIconUrl from '../assets/device-icons/home.png';
import nodeIconUrl from '../assets/device-icons/node.png';
import phoneIconUrl from '../assets/device-icons/phone.png';
import rakIconUrl from '../assets/device-icons/rak.png';
import tbeamIconUrl from '../assets/device-icons/tbeam.png';
import trackerIconUrl from '../assets/device-icons/tracker.png';
import unknownIconUrl from '../assets/device-icons/unknown.png';
import wioIconUrl from '../assets/device-icons/wio.png';

export type DeviceIdentityInput = {
  deviceUid?: string | null;
  name?: string | null;
  longName?: string | null;
  shortName?: string | null;
  hwModel?: string | null;
  role?: string | null;
  iconOverride?: boolean | null;
  iconKey?: DeviceIconKey | string | null;
};

export const DEVICE_ICON_KEYS = [
  'auto',
  'unknown',
  'heltec',
  'tbeam',
  'rak',
  'wio',
  'tracker',
  'gateway',
  'node',
  'phone',
  'home'
] as const;

export type DeviceIconKey = (typeof DEVICE_ICON_KEYS)[number];

type DeviceIconComponent = ComponentType<{
  size?: string | number;
  stroke?: string | number;
  className?: string;
  'aria-hidden'?: boolean;
}>;

export type DeviceIconDefinition = {
  key: DeviceIconKey;
  IconComponent: DeviceIconComponent;
  label: string;
  badgeText: string | null;
};

function createMaskIcon(src: string): DeviceIconComponent {
  function MaskDeviceIcon({
    className,
    'aria-hidden': ariaHidden
  }: {
    size?: string | number;
    stroke?: string | number;
    className?: string;
    'aria-hidden'?: boolean;
  }) {
    const style: CSSProperties = {
      WebkitMaskImage: `url(${src})`,
      maskImage: `url(${src})`
    };

    return (
      <span
        className={['device-icon-mask', className].filter(Boolean).join(' ')}
        style={style}
        aria-hidden={ariaHidden}
      />
    );
  }

  return MaskDeviceIcon;
}

export const DEVICE_ICON_REGISTRY: Record<DeviceIconKey, DeviceIconDefinition> = {
  auto: {
    key: 'auto',
    label: 'Auto resolve',
    badgeText: null,
    IconComponent: createMaskIcon(autoIconUrl)
  },
  unknown: {
    key: 'unknown',
    label: 'Unknown device',
    badgeText: null,
    IconComponent: createMaskIcon(unknownIconUrl)
  },
  heltec: {
    key: 'heltec',
    label: 'Heltec',
    badgeText: 'HL',
    IconComponent: createMaskIcon(heltecIconUrl)
  },
  tbeam: {
    key: 'tbeam',
    label: 'LilyGO T-Beam',
    badgeText: 'TB',
    IconComponent: createMaskIcon(tbeamIconUrl)
  },
  rak: {
    key: 'rak',
    label: 'RAK/WisBlock',
    badgeText: 'RAK',
    IconComponent: createMaskIcon(rakIconUrl)
  },
  wio: {
    key: 'wio',
    label: 'Wio',
    badgeText: 'WIO',
    IconComponent: createMaskIcon(wioIconUrl)
  },
  tracker: {
    key: 'tracker',
    label: 'Tracker/client',
    badgeText: 'TRK',
    IconComponent: createMaskIcon(trackerIconUrl)
  },
  gateway: {
    key: 'gateway',
    label: 'Gateway',
    badgeText: 'GW',
    IconComponent: createMaskIcon(gatewayIconUrl)
  },
  node: {
    key: 'node',
    label: 'Node',
    badgeText: 'ND',
    IconComponent: createMaskIcon(nodeIconUrl)
  },
  phone: {
    key: 'phone',
    label: 'Phone',
    badgeText: 'PH',
    IconComponent: createMaskIcon(phoneIconUrl)
  },
  home: {
    key: 'home',
    label: 'Home node',
    badgeText: 'HM',
    IconComponent: createMaskIcon(homeIconUrl)
  }
};

export const DEVICE_ICON_CATALOG: DeviceIconDefinition[] = DEVICE_ICON_KEYS.map(
  (key) => DEVICE_ICON_REGISTRY[key]
);

function isDeviceIconKey(value: string): value is DeviceIconKey {
  return value in DEVICE_ICON_REGISTRY;
}

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

export function resolveAutoIconKey(input: DeviceIdentityInput): DeviceIconKey {
  const role = normalizeValue(input.role);
  const hwModel = normalizeValue(input.hwModel);
  const haystack = buildSearchHaystack(input);

  if (
    hasAnyToken(role, ['phone']) ||
    hasAnyToken(haystack, [' phone ', 'android', 'iphone'])
  ) {
    return 'phone';
  }

  if (hasAnyToken(role, ['home', 'base']) || hasAnyToken(haystack, ['home node', 'base station'])) {
    return 'home';
  }

  if (hasAnyToken(role, ['gateway', 'router', 'relay', 'repeater']) || hasAnyToken(haystack, ['gateway'])) {
    return 'gateway';
  }

  if (hasAnyToken(role, ['tracker', 'client', 'mobile'])) {
    return 'tracker';
  }

  if (hasAnyToken(hwModel, ['t beam', 'tbeam'])) {
    return 'tbeam';
  }

  if (hasAnyToken(hwModel, ['heltec'])) {
    return 'heltec';
  }

  if (hasAnyToken(hwModel, ['rak', 'wisblock'])) {
    return 'rak';
  }

  if (hasAnyToken(hwModel, ['wio', 'seeed'])) {
    return 'wio';
  }

  if (
    hasAnyToken(hwModel, ['lilygo', 'ttgo', 't echo', 't deck', 't lora']) ||
    hasAnyToken(role, ['sensor', 'node'])
  ) {
    return 'node';
  }

  return 'unknown';
}

export function getEffectiveIconKey(input: DeviceIdentityInput): DeviceIconKey {
  const overrideKey = typeof input.iconKey === 'string' ? input.iconKey.trim() : '';
  if (input.iconOverride === true && overrideKey.length > 0) {
    return isDeviceIconKey(overrideKey) ? overrideKey : 'unknown';
  }

  const autoKey = resolveAutoIconKey(input);
  return isDeviceIconKey(autoKey) ? autoKey : 'unknown';
}

export function getDeviceIconDefinition(iconKey: DeviceIconKey): DeviceIconDefinition {
  return DEVICE_ICON_REGISTRY[iconKey] ?? DEVICE_ICON_REGISTRY.unknown;
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
  const resolvedKey = getEffectiveIconKey(input);
  const icon = getDeviceIconDefinition(resolvedKey);
  const badgePrefix = icon.badgeText ? `[${icon.badgeText}] ` : '';
  return `${badgePrefix}${buildDeviceIdentityLabel(input)}`;
}

type DeviceIconProps = {
  device: DeviceIdentityInput;
  iconKey?: DeviceIconKey;
  size?: number;
  showBadge?: boolean;
  className?: string;
  title?: string;
};

export default function DeviceIcon({
  device,
  iconKey,
  size = 16,
  showBadge = true,
  className,
  title
}: DeviceIconProps) {
  const resolvedKey = iconKey ?? getEffectiveIconKey(device);
  const iconDefinition = getDeviceIconDefinition(resolvedKey);
  const iconTitle = title ?? iconDefinition.label;
  const classes = ['device-identity-icon', className].filter(Boolean).join(' ');

  return (
    <span className={classes} title={iconTitle} aria-hidden="true">
      <iconDefinition.IconComponent
        className="device-identity-icon__glyph"
        size={size}
        stroke={1.9}
        aria-hidden
      />
      {showBadge && iconDefinition.badgeText ? (
        <span className="device-identity-icon__badge">{iconDefinition.badgeText}</span>
      ) : null}
    </span>
  );
}
