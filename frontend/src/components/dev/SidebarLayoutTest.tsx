const LONG_DEVICE_NAME = 'Very long device name that should never overflow the sidebar layout boundaries';
const LONG_DEVICE_UID = 'agent-e2e-1770806102-with-an-even-longer-uid-for-overflow-testing';

const testWidths = [360, 320];

export default function SidebarLayoutTest() {
  return (
    <main className="sidebar-layout-test">
      <header className="sidebar-layout-test__header">
        <h1>Sidebar Layout Test</h1>
        <p>
          Validate narrow widths for sidebar sub-panels. No horizontal overflow should appear at 360px
          and 320px.
        </p>
      </header>
      <div className="sidebar-layout-test__cases">
        {testWidths.map((width) => (
          <section key={width} className="sidebar-layout-test__case">
            <h2>{width}px</h2>
            <div className="sidebar-layout-test__sidebar" style={{ width }}>
              <div className="selected-device-header">
                <div className="selected-device-header__row">
                  <div className="selected-device-header__identity-wrap minw0">
                    <div className="device-identity-icon selected-device-header__icon" aria-hidden="true">
                      L
                    </div>
                    <div className="selected-device-header__identity flex1 minw0">
                      <div className="selected-device-header__name-row minw0">
                        <span className="device-online-dot selected-device-header__online-dot" aria-hidden="true" />
                        <strong className="flex1 minw0">{LONG_DEVICE_NAME}</strong>
                      </div>
                      <span className="selected-device-header__uid-row">
                        <span title={LONG_DEVICE_UID}>{LONG_DEVICE_UID}</span>
                      </span>
                    </div>
                  </div>
                  <div className="selected-device-header__meta">
                    <div className="selected-device-header__tools">
                      <button type="button" className="selected-device-header__tool-button">
                        C
                      </button>
                      <button type="button" className="selected-device-header__tool-button">
                        F
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="controls">
                <div className="controls__group">
                  <span className="controls__label">Device</span>
                  <button type="button" className="controls__device-picker-trigger">
                    <span className="controls__device-picker-label">{LONG_DEVICE_NAME}</span>
                  </button>
                </div>

                <div className="controls__group auto-session-panel">
                  <button type="button" className="auto-session-panel__toggle">
                    <span>Home Auto Session (HAS)</span>
                    <span className="auto-session-panel__toggle-meta">-</span>
                  </button>
                  <div className="auto-session-panel__body">
                    <div className="controls__row minw0">
                      <div className="controls__group minw0 flex1">
                        <label htmlFor={`lat-${width}`}>homeLat</label>
                        <input id={`lat-${width}`} type="number" value="50.0809728" readOnly />
                      </div>
                      <div className="controls__group minw0 flex1">
                        <label htmlFor={`lon-${width}`}>homeLon</label>
                        <input id={`lon-${width}`} type="number" value="8.2362368" readOnly />
                      </div>
                    </div>
                    <div className="controls__row minw0">
                      <div className="controls__group minw0 flex1">
                        <label htmlFor={`radius-${width}`}>radiusMeters</label>
                        <input id={`radius-${width}`} type="number" value="20" readOnly />
                      </div>
                      <div className="controls__group minw0 flex1">
                        <label htmlFor={`outside-${width}`}>minOutsideSeconds</label>
                        <input id={`outside-${width}`} type="number" value="30" readOnly />
                      </div>
                    </div>
                    <button type="button" className="controls__button">
                      Save
                    </button>
                    <label className="controls__toggle">
                      <input type="checkbox" checked readOnly />
                      Show Home Geofence with an extra long label to verify responsive wrapping
                    </label>
                  </div>
                </div>

                <div className="controls__group device-details">
                  <button type="button" className="device-details__toggle">
                    <span>Details</span>
                    <span>-</span>
                  </button>
                  <div className="device-details__body">
                    <div className="device-details__row">
                      <span>Name</span>
                      <div className="device-details__name-edit">
                        <input type="text" value={LONG_DEVICE_NAME} readOnly />
                        <button type="button">Save</button>
                      </div>
                    </div>
                    <div className="device-details__row">
                      <span>UID</span>
                      <strong>{LONG_DEVICE_UID}</strong>
                    </div>
                    <div className="device-details__row">
                      <span>Raw node info</span>
                      <div className="device-details__events-links">
                        <button type="button" className="device-details__events-link">
                          View raw nodeinfo event
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="devices-manager">
                  <div className="devices-manager__header">
                    <span>Name</span>
                    <span>Identity</span>
                    <span>Last seen</span>
                    <span>Latest measurement</span>
                    <span>Actions</span>
                  </div>
                  <div className="devices-manager__list">
                    <div className="devices-manager__row">
                      <div className="devices-manager__cell devices-manager__cell--name">
                        <span className="device-online-dot devices-manager__online-dot" aria-hidden="true" />
                        <input type="text" value={LONG_DEVICE_NAME} readOnly />
                        <button type="button" className="devices-manager__inline-save">
                          Save
                        </button>
                      </div>
                      <div className="devices-manager__cell devices-manager__cell--uid">
                        <div className="devices-manager__identity">
                          <div className="device-identity-icon devices-manager__device-icon" aria-hidden="true">
                            L
                          </div>
                          <div className="devices-manager__identity-text">
                            <span className="devices-manager__identity-primary">{LONG_DEVICE_NAME}</span>
                            <span className="devices-manager__identity-secondary">{LONG_DEVICE_UID}</span>
                          </div>
                        </div>
                      </div>
                      <div className="devices-manager__cell">3m ago</div>
                      <div className="devices-manager__cell">7m ago</div>
                      <div className="devices-manager__cell devices-manager__cell--actions">
                        <button type="button" className="devices-manager__menu-toggle">
                          ⋮
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
