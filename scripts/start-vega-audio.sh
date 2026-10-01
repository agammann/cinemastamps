#!/usr/bin/env bash
# Capture only the virtual device's output, never the host microphone.
set -euo pipefail
command -v pulseaudio >/dev/null || {
  echo 'Install pulseaudio and pulseaudio-utils in the simulator host first.' >&2
  exit 1
}
# This prepared container has no init reaper. A restart can reuse the old
# daemon's PID for a zombie, which PulseAudio mistakes for a live server.
if ! pactl info >/dev/null 2>&1; then
  pulse_runtime=$(readlink -f "${XDG_CONFIG_HOME:-$HOME/.config}/pulse/$(cat /etc/machine-id)-runtime" || true)
  case "$pulse_runtime" in
    /tmp/pulse-*)
      if test -f "$pulse_runtime/pid"; then
        pulse_pid=$(cat "$pulse_runtime/pid")
        if [[ "$pulse_pid" =~ ^[0-9]+$ ]]; then
          pulse_state=$(ps -o stat= -p "$pulse_pid" || true)
          if [[ -z "$pulse_state" || "$pulse_state" == Z* ]]; then
            rm -f "$pulse_runtime/pid" "$pulse_runtime/native"
          fi
        fi
      fi
      ;;
  esac
fi
for attempt in $(seq 1 20); do
  if pactl info >/dev/null 2>&1; then break; fi
  pulseaudio --start --exit-idle-time=-1 >/dev/null 2>&1 || true
  sleep 0.25
done
pactl info >/dev/null
if ! pactl list short sinks | awk '{print $2}' | grep -qx cinemastamps; then
  pactl load-module module-null-sink sink_name=cinemastamps rate=48000 channels=2 >/dev/null
fi
pactl set-default-sink cinemastamps
echo 'Simulator capture output ready: cinemastamps.monitor'
