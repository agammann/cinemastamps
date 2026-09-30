# Cinemastamps hackathon demonstration

The finished recording is **1 minute 58 seconds**, 1280 x 720, H.264 video with English narration and on-screen captions. Application footage was captured from the installed native app on Amazon's official Vega Virtual Device, edited for length. The export card reproduces the actual CSV downloaded during the screening.

| Time | Demonstration |
|---|---|
| 0:00-0:08 | Product purpose and native Vega target |
| 0:08-0:39 | Film playback and three remote reactions at actual playback times |
| 0:39-0:50 | Review screen and timestamp revisit |
| 0:50-1:04 | Private QR companion link |
| 1:04-1:12 | Companion note visible on the TV |
| 1:12-1:28 | Uploaded film playing in the native app |
| 1:28-1:42 | Actual exported timestamps, reactions, and note |
| 1:42-1:58 | Repository, local companion requirement, environment, and film credits |

Watch the [public YouTube demonstration](https://www.youtube.com/watch?v=EfczFnhj0PA), or download `Cinemastamps-hackathon-demo.mp4` from the release assets. The YouTube URL is saved in the Devpost video field.

## Live demonstration

1. Start the companion and installed native Vega app following `vega/README.md`.
2. Play the bundled trailer. Move focus with arrows and select the three reactions.
3. Open Review, filter reactions, select a timestamp, then press Play.
4. Open Pair phone and use its link from a phone/browser on the same network. Add a note and show it on TV.
5. Download CSV and inspect the precise fractional timestamps.
6. Send an MP4/WebM shorter than five minutes. Wait for preparation and play it. Uploading begins a new review; export first.

On the prepared Windows computer, `Start-Cinemastamps-Demo.ps1` launches the existing Docker environment and opens the native simulator in the browser. It does not reinstall the app or reset reviews. Use `-RestartSimulator` only to recover a stale simulator process.

Do not describe this as physical Fire TV testing or claim that timestamped video review was invented here. The demonstrated distinction is remote reactions plus a private companion and export, implemented as a native Vega TV application.

Film: Sintel trailer, copyright 2010 Blender Foundation, CC BY 3.0. See `THIRD_PARTY_NOTICES.md`. The recording's narration is separate from film audio; audible TV output was not verified through noVNC.
