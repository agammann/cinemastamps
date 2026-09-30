# Development friction log

These observations describe this project's development environment. Android TV emulator findings are not Amazon WebView defect reports.

## Bundled video playback in an APK

- Task: play a small licensed video packaged with an Android WebView application, including seek.
- Steps: serve packaged media through `shouldInterceptRequest`, launch the installed APK, play and seek through the video.
- Expected: the same playback behavior as the browser build.
- Observed: partial reads of packaged media failed in the tested Android TV WebView; playback/seek was unreliable.
- Severity: important; the offline demo could not be relied on.
- Workaround: fetch the small bundled demo as a Blob before passing it to the player. User uploads continue streaming from the companion service.
- Suggestion: a maintained Fire TV hybrid sample covering packaged media, byte ranges, offline playback, and device-specific verification would make this path easier to validate.

## Local network video from a packaged app

- Task: play a phone-uploaded video from the local computer in the TV app.
- Steps: load the packaged UI through an HTTPS asset origin, pair the local HTTP companion, upload an MP4, then attempt playback.
- Expected: the chosen local video plays after pairing.
- Observed: the secure-origin media request was blocked in the tested Android TV WebView even with the attempted mixed-content setting.
- Severity: critical to the phone-to-TV workflow.
- Workaround: the bundled, locally intercepted UI uses an HTTP asset origin. The app documents that its companion is for trusted local networks and is not an internet-facing service.
- Suggestion: document a supported local-network media path for TV hybrid applications, with guidance on origin policy and a reproducible sample.

## Windows device-validation path

- Task: verify an Android APK on Fire OS and produce a qualifying public demo from a Windows development environment.
- Steps: build and exercise the APK in Android Studio's Android TV emulator; review Amazon's device-testing and Vega setup documentation.
- Expected: a clearly documented public simulator path appropriate to a Fire OS APK.
- Observed: an Android TV emulator is useful for development but does not establish Fire OS compatibility. The Vega SDK has a different platform/toolchain and is not an APK test environment.
- Severity: important; qualifying device evidence remains a separate release gate.
- Workaround: prepare the APK and device checklist for a released Fire OS Fire TV.
- Suggestion: provide a supported Windows-accessible Fire OS test environment with explicit guidance on recordings that developers may publish for demonstrations.

## References

- [Fire TV web hybrid app FAQ](https://developer.amazon.com/docs/fire-tv/web-hybrid-app-faq.html)
- [Connect to Fire TV through ADB](https://developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html)
- [Amazon app testing tools](https://developer.amazon.com/apps-and-games/test)
- [Vega SDK setup](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)
