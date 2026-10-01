# Native Cinemastamps for Vega

React Native application for Vega OS 1.2. The release was built with Vega SDK 0.24.12112, CLI 1.4.2, Node 22.23.3, and React Native 0.83.0 on Ubuntu 24.04. Use Amazon's [SDK installation instructions](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk) to configure the SDK and package registry first.

## Build

From this directory, with the SDK environment active:

```sh
npm ci
npm test
npm run lint
npm run build:release
```

`npm test` runs TypeScript checking. The root project's `pnpm test` covers the review model and companion API. The native media integration test also needs FFmpeg and FFprobe; the root Docker image includes both.

Release output is under `build/{architecture}-release/`. Available architectures: x86_64 for the virtual device, aarch64 and armv7 for matching hardware. Hardware packages are built but not device-tested.

## Run

Start the root project's companion (`docker compose up --build -d`). Start the official virtual device using the SDK, then install:

```sh
vega run-app build/x86_64-release/cinemastamps-vega_x86_64.vpkg com.agammann.cinemastamps.native.main -d VirtualDevice
```

The native app defaults to `http://10.0.2.2:8091`, the virtual-device host route. Settings accepts another HTTP(S) companion base URL. Nested containers may need an explicit network forward; the prepared Windows demo uses a forward inside its Vega container to the companion container. That local Docker setup is a development convenience, not an officially supported Amazon host configuration.

To relaunch without reinstalling or resetting application data:

```sh
vega device terminate-app -d VirtualDevice --appName com.agammann.cinemastamps.native.main
vega device launch-app -d VirtualDevice --appName com.agammann.cinemastamps.native.main
```

## Demonstrate

1. Press Play. Use directional focus and Select to stamp Great moment, Dragging, or Confusing.
2. Open Review and filter a reaction. Select a timestamp, then press Play to revisit it.
3. Open Pair phone. Open the QR link on the same network, add a note, and watch it sync to TV.
4. Export CSV, Markdown, or JSON from the companion.
5. Send a local MP4/WebM, up to five minutes. This starts a new review. Wait for local media preparation, then press Play.

The companion must remain running. HTTP is intended for a trusted LAN; do not expose this server to the public internet. QR links grant access to the review until the session expires. The native player supports prepared short clips up to 32 MB, not arbitrary streaming URLs or DRM services. Fractional playback timestamps are retained, but frame-accurate editing timecode is not promised.

## Audio and VoiceView testing without hardware

On the prepared Linux simulator host, install `pulseaudio`, `pulseaudio-utils`, and `ffmpeg`, then run `bash scripts/start-vega-audio.sh` from the repository root **before starting the virtual device**. This creates a recording output, not a speaker or microphone connection. The emulator's PulseAudio sink input should identify `vega-virtual-device`.

```sh
pactl list sink-inputs
ffmpeg -f pulse -i cinemastamps.monitor -t 10 simulator-output.wav
```

Record while playing, then again after pausing. Open the resulting WAV in an audio player. A noVNC browser view itself does not transmit sound. On an ordinary desktop Linux host with speakers, use its normal audio output instead of this capture sink.

For VoiceView, hold Back + Menu for three seconds on the virtual remote, or use the documented `inputd-cli` shortcut from [Amazon's accessibility guide](https://developer.amazon.com/docs/react-native-vega/0.83/accessibility). Complete or exit the first-run tutorial, use the speech-compatible audio option, then navigate the app with directions and Select. The same Back + Menu shortcut turns VoiceView off. See [verification results](../docs/VERIFICATION.md) for tested behavior and remaining limits.

## Remote controls and reconnecting

Media commands use Amazon's W3C/Kepler Media Controls integration. In the virtual device, F4 is Play/Pause, F3 rewinds ten seconds, and F5 advances ten seconds. Click the simulator canvas after reconnecting noVNC so it receives keyboard input. Play after the trailer ends restarts it.

If the companion is unavailable at launch, restore the service and choose Connect with the same address. The saved pairing and review are reused. Changing the companion address starts a separate session. Use `vega device install-app` for an update that retains app data; `vega run-app` reinstalls and resets it.
