import DeviceIcon, {
  DEVICE_ICON_CATALOG,
  buildDeviceIdentityLabel,
  resolveDeviceIconFamily,
  type DeviceIdentityInput
} from '../DeviceIcon';

const SAMPLE_DEVICES: Array<{ label: string; device: DeviceIdentityInput }> = [
  { label: 'Home node', device: { deviceUid: '!home001', name: 'Home Node', role: 'home' } },
  { label: 'Gateway', device: { deviceUid: '!gw001', name: 'Gateway', role: 'gateway' } },
  { label: 'Heltec V3', device: { deviceUid: '!heltec01', hwModel: 'HELTEC_V3' } },
  { label: 'RAK WisBlock', device: { deviceUid: '!rak01', hwModel: 'RAK4631 WisBlock' } },
  { label: 'LilyGO T-Beam', device: { deviceUid: '!tb01', hwModel: 'LilyGO T-Beam' } },
  { label: 'LilyGO T-Echo', device: { deviceUid: '!te01', hwModel: 'LilyGO T-Echo' } },
  { label: 'Router role', device: { deviceUid: '!router01', role: 'router' } },
  { label: 'Tracker role', device: { deviceUid: '!trk01', role: 'tracker' } },
  { label: 'Sensor role', device: { deviceUid: '!sns01', role: 'sensor' } },
  { label: 'Unknown fallback', device: { deviceUid: '!unknown01' } }
];

const FAMILY_PREVIEW_INPUTS: Record<string, DeviceIdentityInput> = {
  home: { role: 'home' },
  gateway: { role: 'gateway' },
  heltec: { hwModel: 'Heltec v3' },
  tbeam: { hwModel: 'LilyGO T-Beam' },
  rak: { hwModel: 'RAK4631' },
  lilygo: { hwModel: 'LilyGO T-Echo' },
  router: { role: 'router' },
  tracker: { role: 'tracker' },
  sensor: { role: 'sensor' },
  generic: { deviceUid: '!generic' }
};

export default function DeviceIconGallery() {
  return (
    <main className="device-icon-gallery">
      <header className="device-icon-gallery__header">
        <h1>Device Icon Gallery</h1>
        <p>Dev-only preview route for LoRaMapr device icon mappings.</p>
        <a href="/">Back to app</a>
      </header>

      <section className="device-icon-gallery__section">
        <h2>Families</h2>
        <div className="device-icon-gallery__grid">
          {DEVICE_ICON_CATALOG.map((family) => (
            <article key={family.key} className="device-icon-gallery__card">
              <DeviceIcon device={FAMILY_PREVIEW_INPUTS[family.key]} title={family.label} />
              <div className="device-icon-gallery__card-title">{family.label}</div>
              <div className="device-icon-gallery__card-subtitle">
                {family.badge ? `badge: ${family.badge}` : 'badge: none'}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="device-icon-gallery__section">
        <h2>Sample devices</h2>
        <div className="device-icon-gallery__sample-list">
          {SAMPLE_DEVICES.map((sample) => {
            const resolved = resolveDeviceIconFamily(sample.device);
            return (
              <article key={sample.label} className="device-icon-gallery__sample-row">
                <DeviceIcon device={sample.device} title={resolved.label} />
                <div className="device-icon-gallery__sample-meta">
                  <div className="device-icon-gallery__sample-label">{sample.label}</div>
                  <div className="device-icon-gallery__sample-value">
                    {buildDeviceIdentityLabel(sample.device)}
                  </div>
                </div>
                <div className="device-icon-gallery__sample-family">{resolved.key}</div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
