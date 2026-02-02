import { z } from 'zod';

const EndDeviceIdsSchema = z
  .object({
    dev_eui: z.string().optional(),
    device_id: z.string().optional()
  })
  .refine((value) => Boolean(value.dev_eui || value.device_id), {
    message: 'end_device_ids must include dev_eui or device_id'
  });

const RxMetadataSchema = z
  .object({
    gateway_ids: z
      .object({
        gateway_id: z.string().optional()
      })
      .optional(),
    rssi: z.number().optional(),
    snr: z.number().optional()
  })
  .passthrough();

const UplinkSettingsSchema = z
  .object({
    frequency: z.union([z.number(), z.string()]).optional(),
    data_rate: z
      .object({
        lora: z
          .object({
            bandwidth: z.number().optional(),
            spreading_factor: z.number().optional()
          })
          .optional()
      })
      .optional()
  })
  .passthrough();

const UplinkMessageSchema = z
  .object({
    f_cnt: z.number().optional(),
    frm_payload: z.string().optional(),
    decoded_payload: z.record(z.unknown()).optional(),
    rx_metadata: z.array(RxMetadataSchema).optional(),
    settings: UplinkSettingsSchema.optional()
  })
  .passthrough();

export const TtsUplinkSchema = z
  .object({
    received_at: z.string(),
    end_device_ids: EndDeviceIdsSchema,
    uplink_message: UplinkMessageSchema,
    correlation_ids: z.array(z.string()).optional()
  })
  .passthrough();

export type TtsUplink = z.infer<typeof TtsUplinkSchema>;

export function parseTtsUplink(input: unknown): TtsUplink {
  return TtsUplinkSchema.parse(input);
}
