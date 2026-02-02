import { createHash } from 'crypto';

type UplinkPayload = {
  correlation_ids?: string[];
  received_at?: string;
  end_device_ids?: {
    dev_eui?: string;
    device_id?: string;
  };
  uplink_message?: {
    f_cnt?: number;
    frm_payload?: string;
  };
};

export function deriveUplinkId(payload: UplinkPayload): string {
  const correlationIds = payload.correlation_ids ?? [];
  const asUp = correlationIds.find((entry) => entry.startsWith('as:up:'));
  if (asUp) {
    return asUp;
  }

  const deviceUid = payload.end_device_ids?.dev_eui ?? payload.end_device_ids?.device_id ?? '';
  const fCnt = payload.uplink_message?.f_cnt ?? '';
  const receivedAt = payload.received_at ?? '';
  const frmPayload = payload.uplink_message?.frm_payload ?? '';

  const raw = `${deviceUid}|${fCnt}|${receivedAt}|${frmPayload}`;
  return createHash('sha256').update(raw).digest('hex');
}
