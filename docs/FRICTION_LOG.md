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
- Initial workaround: prepare the APK and device checklist for a released Fire OS Fire TV.
- Subsequent outcome: implemented a separate native Vega application and demonstrated it in the official Vega Virtual Device on an Ubuntu Docker host. This does not validate the APK on Fire OS.
- Suggestion: provide a supported Windows-accessible Fire OS test environment with explicit guidance on recordings that developers may publish for demonstrations.

## References

- [Fire TV web hybrid app FAQ](https://developer.amazon.com/docs/fire-tv/web-hybrid-app-faq.html)
- [Connect to Fire TV through ADB](https://developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html)
- [Amazon app testing tools](https://developer.amazon.com/apps-and-games/test)
- [Vega SDK setup](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)

## Vega Virtual Device and native media

- The Linux virtual-device image lacked the required WebView service, matching Amazon's documented Linux limitation. The demo therefore uses native React Native components and W3C media instead of a WebView wrapper.
- Software GL with virtual-device graphics acceleration enabled produced video; the no-acceleration mode showed a black video surface in this local configuration.
- Replacing a media surface immediately after deinitialization raced the asynchronous player cleanup. Serializing cleanup before the next initialization fixed uploaded-film playback without an app restart.
- The legacy core AsyncStorage path did not preserve the paired review in this environment. Amazon's dedicated async-storage library, installed through npm and autolinked, passed terminate/relaunch verification.
- Repeated virtual-device stop/start inside the container could leave a stale process lock. Restarting this dedicated container recovered it. The local launcher exposes an explicit restart option.

These are bounded observations from the documented environment, not general claims of platform defects. See [Vega known issues](https://developer.amazon.com/docs/vega/0.24/kvd-issues) and [React Native AsyncStorage](https://www.developer.amazon.com/docs/vega-api/0.24/react-native-async-storage).
