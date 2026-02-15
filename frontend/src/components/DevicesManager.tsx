import { useEffect, useMemo, useState } from 'react';
import type { Device } from '../api/types';
import { ApiError } from '../api/http';
import { useArchiveDevice, useDeleteDevice, useDevices, useUpdateDevice } from '../query/hooks';
import LocationPinIcon from './LocationPinIcon';
import HoverTooltip from './HoverTooltip';

type DevicesManagerProps = {
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
  onOpenAutoSession?: () => void;
};

const LOCATION_INDICATOR_TOOLTIP = 'Has known last location';

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl) {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (absSeconds < 60) {
      return rtf.format(seconds, 'second');
    }
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) {
      return rtf.format(minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) {
      return rtf.format(hours, 'hour');
    }
    const days = Math.round(hours / 24);
    return rtf.format(days, 'day');
  }

  const minutes = Math.round(absSeconds / 60);
  if (minutes < 1) {
    return `${absSeconds}s ago`;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function normalizeDeviceName(device: Device): string {
  const trimmed = device.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '';
}

function getDevicePrimaryLabel(device: Device): string {
  const longName = device.longName?.trim();
  if (longName) {
    return longName;
  }
  const name = device.name?.trim();
  if (name) {
    return name;
  }
  return device.deviceUid;
}

function getDeviceSecondaryLabel(device: Device, primaryLabel: string): string | null {
  const secondaryParts: string[] = [];
  if (primaryLabel.toLowerCase() !== device.deviceUid.toLowerCase()) {
    secondaryParts.push(device.deviceUid);
  }
  const hwModel = device.hwModel?.trim();
  if (hwModel) {
    secondaryParts.push(hwModel);
  }
  return secondaryParts.length > 0 ? secondaryParts.join(' · ') : null;
}

function getErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export default function DevicesManager({
  selectedDeviceId,
  onSelectDevice,
  onOpenAutoSession
}: DevicesManagerProps) {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [actionMenuDeviceId, setActionMenuDeviceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  const hasQueryApiKey = Boolean((import.meta.env.VITE_QUERY_API_KEY ?? '').trim());
  const devicesQuery = useDevices(showArchived);
  const updateDeviceMutation = useUpdateDevice();
  const archiveDeviceMutation = useArchiveDevice();
  const deleteDeviceMutation = useDeleteDevice();
  const devices = devicesQuery.data?.items ?? [];

  const filteredDevices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return devices;
    }
    return devices.filter((device) => {
      const name = normalizeDeviceName(device).toLowerCase();
      const uid = device.deviceUid.toLowerCase();
      const longName = device.longName?.toLowerCase() ?? '';
      const hwModel = device.hwModel?.toLowerCase() ?? '';
      return (
        name.includes(normalizedSearch) ||
        uid.includes(normalizedSearch) ||
        longName.includes(normalizedSearch) ||
        hwModel.includes(normalizedSearch)
      );
    });
  }, [devices, search]);

  useEffect(() => {
    if (!actionMenuDeviceId) {
      return;
    }
    const handleWindowPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest('.devices-manager__menu') || event.target.closest('.devices-manager__menu-toggle')) {
        return;
      }
      setActionMenuDeviceId(null);
    };
    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [actionMenuDeviceId]);

  const toForbiddenMessage = (fallback: string) => {
    const mutationErrors = [
      updateDeviceMutation.error,
      archiveDeviceMutation.error,
      deleteDeviceMutation.error
    ];
    const hasForbidden = mutationErrors.some((error) => {
      const status = getErrorStatus(error);
      return status === 401 || status === 403;
    });
    return hasForbidden ? 'Device actions require QUERY key' : fallback;
  };

  const handleInlineSave = (device: Device) => {
    const nextName = (nameDrafts[device.id] ?? normalizeDeviceName(device)).trim();
    const currentName = normalizeDeviceName(device);
    if (nextName === currentName) {
      return;
    }
    setErrorMessage(null);
    setFeedback(null);
    setPendingDeviceId(device.id);
    updateDeviceMutation.mutate(
      { deviceId: device.id, data: { name: nextName } },
      {
        onSuccess: () => {
          setPendingDeviceId(null);
          setFeedback(`Updated ${device.deviceUid}`);
        },
        onError: () => {
          setPendingDeviceId(null);
          setErrorMessage(toForbiddenMessage('Could not update device name'));
        }
      }
    );
  };

  const handleArchiveToggle = (device: Device) => {
    setActionMenuDeviceId(null);
    setErrorMessage(null);
    setFeedback(null);
    setPendingDeviceId(device.id);

    if (device.isArchived) {
      updateDeviceMutation.mutate(
        { deviceId: device.id, data: { isArchived: false } },
        {
          onSuccess: () => {
            setPendingDeviceId(null);
            setFeedback(`Unarchived ${device.deviceUid}`);
          },
          onError: () => {
            setPendingDeviceId(null);
            setErrorMessage(toForbiddenMessage('Could not unarchive device'));
          }
        }
      );
      return;
    }

    archiveDeviceMutation.mutate(device.id, {
      onSuccess: () => {
        setPendingDeviceId(null);
        setFeedback(`Archived ${device.deviceUid}`);
        if (selectedDeviceId === device.id) {
          onSelectDevice(null);
        }
      },
      onError: () => {
        setPendingDeviceId(null);
        setErrorMessage(toForbiddenMessage('Could not archive device'));
      }
    });
  };

  const handleDelete = (device: Device) => {
    if (!hasQueryApiKey) {
      return;
    }
    setActionMenuDeviceId(null);
    const confirmed = window.confirm(
      `Delete ${device.deviceUid}? This permanently removes sessions and measurements for the device.`
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setFeedback(null);
    setPendingDeviceId(device.id);
    deleteDeviceMutation.mutate(device.id, {
      onSuccess: () => {
        setPendingDeviceId(null);
        setFeedback(`Deleted ${device.deviceUid}`);
        if (selectedDeviceId === device.id) {
          onSelectDevice(null);
        }
      },
      onError: () => {
        setPendingDeviceId(null);
        setErrorMessage(toForbiddenMessage('Could not delete device'));
      }
    });
  };

  const openEditModal = (device: Device) => {
    setActionMenuDeviceId(null);
    setEditingDevice(device);
    setModalName(normalizeDeviceName(device));
    setModalNotes(device.notes ?? '');
    setErrorMessage(null);
    setFeedback(null);
  };

  const closeEditModal = () => {
    setEditingDevice(null);
  };

  const handleModalSave = () => {
    if (!editingDevice) {
      return;
    }
    const payload: { name?: string; notes?: string } = {};
    const nextName = modalName.trim();
    const currentName = normalizeDeviceName(editingDevice);
    if (nextName !== currentName) {
      payload.name = nextName;
    }
    const currentNotes = editingDevice.notes ?? '';
    if (modalNotes !== currentNotes) {
      payload.notes = modalNotes;
    }
    if (Object.keys(payload).length === 0) {
      setEditingDevice(null);
      return;
    }

    setErrorMessage(null);
    setFeedback(null);
    setPendingDeviceId(editingDevice.id);
    updateDeviceMutation.mutate(
      { deviceId: editingDevice.id, data: payload },
      {
        onSuccess: () => {
          setPendingDeviceId(null);
          setFeedback(`Updated ${editingDevice.deviceUid}`);
          setEditingDevice(null);
        },
        onError: () => {
          setPendingDeviceId(null);
          setErrorMessage(toForbiddenMessage('Could not update device'));
        }
      }
    );
  };

  return (
    <section className="devices-manager" aria-label="Device list and actions">
      <div className="devices-manager__toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or deviceUid"
          aria-label="Search devices by name or device UID"
        />
        <label className="devices-manager__archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {errorMessage ? (
        <div className="devices-manager__message devices-manager__message--error" role="status">
          {errorMessage}
        </div>
      ) : null}
      {feedback ? (
        <div className="devices-manager__message" role="status">
          {feedback}
        </div>
      ) : null}

      <div className="devices-manager__header">
        <span>Name</span>
        <span>Identity</span>
        <span>Last seen</span>
        <span>Latest measurement</span>
        <span>Actions</span>
      </div>

      <div className="devices-manager__list">
        {devicesQuery.isLoading ? (
          <div className="devices-manager__empty">Loading devices...</div>
        ) : null}
        {!devicesQuery.isLoading && filteredDevices.length === 0 ? (
          <div className="devices-manager__empty">No devices match current filters.</div>
        ) : null}
        {filteredDevices.map((device) => {
          const inlineName = nameDrafts[device.id] ?? normalizeDeviceName(device);
          const isDirty = inlineName.trim() !== normalizeDeviceName(device);
          const isSelected = selectedDeviceId === device.id;
          const isPending = pendingDeviceId === device.id;
          const identityPrimary = getDevicePrimaryLabel(device);
          const identitySecondary = getDeviceSecondaryLabel(device, identityPrimary);
          return (
            <div
              key={device.id}
              className={`devices-manager__row${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelectDevice(device.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectDevice(device.id);
                }
              }}
            >
              <div className="devices-manager__cell devices-manager__cell--name">
                <input
                  type="text"
                  value={inlineName}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    setNameDrafts((prev) => ({ ...prev, [device.id]: event.target.value }))
                  }
                  aria-label={`Edit name for ${device.deviceUid}`}
                />
                {isDirty ? (
                  <button
                    type="button"
                    className="devices-manager__inline-save"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleInlineSave(device);
                    }}
                    disabled={isPending}
                  >
                    Save
                  </button>
                ) : null}
                {device.isArchived ? <span className="devices-manager__badge">Archived</span> : null}
                {device.latestMeasurementAt ? (
                  <HoverTooltip label={LOCATION_INDICATOR_TOOLTIP}>
                    <span
                      className="devices-manager__badge devices-manager__badge--location"
                      aria-label={LOCATION_INDICATOR_TOOLTIP}
                    >
                      <LocationPinIcon className="devices-manager__location-icon" />
                    </span>
                  </HoverTooltip>
                ) : null}
              </div>
              <div
                className="devices-manager__cell devices-manager__cell--uid"
                title={
                  identitySecondary
                    ? `${identityPrimary} (${identitySecondary})`
                    : identityPrimary
                }
              >
                <span className="devices-manager__identity-primary">{identityPrimary}</span>
                {identitySecondary ? (
                  <span className="devices-manager__identity-secondary">{identitySecondary}</span>
                ) : null}
              </div>
              <div className="devices-manager__cell" title={device.lastSeenAt ?? ''}>
                {formatRelativeTime(device.lastSeenAt)}
              </div>
              <div className="devices-manager__cell" title={device.latestMeasurementAt ?? ''}>
                {formatRelativeTime(device.latestMeasurementAt)}
              </div>
              <div className="devices-manager__cell devices-manager__cell--actions">
                <button
                  type="button"
                  className="devices-manager__menu-toggle"
                  aria-label={`Open actions for ${device.deviceUid}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActionMenuDeviceId((prev) => (prev === device.id ? null : device.id));
                  }}
                  disabled={isPending}
                >
                  ⋮
                </button>
                {actionMenuDeviceId === device.id ? (
                  <div
                    className="devices-manager__menu"
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button type="button" role="menuitem" onClick={() => openEditModal(device)}>
                      Edit
                    </button>
                    <button type="button" role="menuitem" onClick={() => handleArchiveToggle(device)}>
                      {device.isArchived ? 'Unarchive' : 'Archive'}
                    </button>
                    {hasQueryApiKey ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => handleDelete(device)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editingDevice ? (
        <div className="devices-manager__modal-backdrop" role="presentation" onClick={closeEditModal}>
          <div
            className="devices-manager__modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit device"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Edit device</h3>
            <div className="devices-manager__modal-meta">{editingDevice.deviceUid}</div>
            <label htmlFor="devices-modal-name">Name</label>
            <input
              id="devices-modal-name"
              type="text"
              value={modalName}
              onChange={(event) => setModalName(event.target.value)}
            />
            <label htmlFor="devices-modal-notes">Notes</label>
            <textarea
              id="devices-modal-notes"
              value={modalNotes}
              onChange={(event) => setModalNotes(event.target.value)}
              rows={4}
            />
            {onOpenAutoSession ? (
              <button
                type="button"
                className="devices-manager__modal-link"
                onClick={() => {
                  closeEditModal();
                  onOpenAutoSession();
                }}
              >
                Go to auto-session config
              </button>
            ) : null}
            <div className="devices-manager__modal-actions">
              <button type="button" onClick={closeEditModal}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalSave}
                disabled={pendingDeviceId === editingDevice.id}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
