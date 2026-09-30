# Fire OS acceptance check

Use a released Fire OS device. A Vega OS device cannot install this APK. Keep the model, Fire OS version, Amazon WebView version, APK checksum, and date with the test results.

1. Enable ADB debugging on the Fire TV, connect from the computer, and accept the on-device prompt. Use the README's install commands.
2. Launch from the TV launcher. Check that the first screen fits, focus is visible, and all primary controls can be reached with the remote.
3. Disconnect the companion computer and verify that the bundled film still plays. Check audio, pause, fast-forward, rewind, and end-of-video behavior.
4. Add all three reactions with the remote. Verify timestamps against playback, enter a note, restart the app, and verify that the review is retained.
5. Filter the review and select a stamp. Check the playback position. Enter theater view and confirm that focus remains on visible controls; Back exits theater.
6. Start `pnpm start:lan` on the computer. Pair through the computer's LAN address. Scan the QR code from a real phone on that network.
7. Add a note from the phone and check it on TV. Send a compatible MP4 under 250 MB, check playback/audio, and add a TV stamp that appears on the phone.
8. Export CSV, Markdown, and JSON from the phone. Check timestamps and notes in the downloaded files. Export JSON on TV and retrieve it using the documented ADB path.
9. Disconnect and pair again. Verify existing stamps remain and a new stamp appears immediately on both screens.
10. Stop the companion while connected. Confirm that a failed save is reported. Restart it and verify recovery. Preserve/export notes before deliberately starting a new screening.
11. Put the device to sleep and wake it. Confirm playback is paused and the remote still works. Check Back at the root exits the app.
12. Test VoiceView navigation and labels. Record any accessibility limitations and fix blockers before making accessibility claims.

For the hackathon, record the working app on this Fire TV (or an officially accepted Fire TV/Vega simulator). An ordinary Android TV emulator capture is development evidence only. Publish the qualifying demo publicly on YouTube or Vimeo, in English, under three minutes.
