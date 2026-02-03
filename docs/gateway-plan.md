# Gateway Plan

A LoRaWAN gateway is the receiver for uplinks; it contributes `rx_metadata` (such as `rssi`, `snr`, and `gateway_id`). A “home gateway” is useful for coverage mapping, while a stationary Wio is just another end device.

In this app:
- `Measurement.gatewayId` is chosen from the “best” `rx_metadata` entry.
- `Measurement.rxMetadata` stores the full `rx_metadata` array.

When multiple gateways receive the same uplink, the app stores one Measurement and keeps the multi-gateway metadata in `rxMetadata`.
