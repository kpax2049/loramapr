#!/usr/bin/env python3
"""Bridge Meshtastic pubsub packets to JSON lines for pi-forwarder stdin mode.

Usage:
  python meshtastic-json-bridge.py --port /dev/serial/by-id/...

Each received packet is written as one JSON object per line to stdout.
"""

import argparse
import json
import time

import meshtastic.serial_interface
from pubsub import pub


def to_jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(v) for v in value]

    # Protobuf-like objects (Position, Telemetry, User, etc.)
    if hasattr(value, "ListFields") and hasattr(value, "DESCRIPTOR"):
        try:
            from google.protobuf.json_format import MessageToDict

            return to_jsonable(
                MessageToDict(
                    value,
                    preserving_proto_field_name=True,
                    use_integers_for_enums=True,
                )
            )
        except Exception:
            pass

    if hasattr(value, "to_dict") and callable(value.to_dict):
        try:
            return to_jsonable(value.to_dict())
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        try:
            converted = {}
            for key, item in vars(value).items():
                if key.startswith("_"):
                    continue
                converted[key] = to_jsonable(item)
            if converted:
                return converted
        except Exception:
            pass

    return str(value)


def unwrap_packet(packet=None, **kwargs):
    resolved = packet if packet is not None else kwargs.get("packet")
    if isinstance(resolved, dict) and isinstance(resolved.get("packet"), dict):
        return resolved["packet"]
    return resolved


def on_receive(packet=None, interface=None, **kwargs):
    resolved = unwrap_packet(packet=packet, **kwargs)
    if resolved is None:
        return
    print(json.dumps(to_jsonable(resolved), ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Meshtastic JSON bridge")
    parser.add_argument("--port", required=True, help="Serial port path")
    args = parser.parse_args()

    iface = meshtastic.serial_interface.SerialInterface(devPath=args.port)
    pub.subscribe(on_receive, "meshtastic.receive")

    try:
        while True:
            time.sleep(1)
    finally:
        iface.close()


if __name__ == "__main__":
    main()
