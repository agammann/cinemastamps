"""Exercise the packaged WebView while the Android emulator is offline."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET


def adb(*args):
    return subprocess.run(
        ["adb", *args], check=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, timeout=30,
    ).stdout


def snapshot():
    adb("shell", "uiautomator", "dump", "/sdcard/cinemastamps-window.xml")
    xml = adb("shell", "cat", "/sdcard/cinemastamps-window.xml")
    return ET.fromstring(xml), xml


def find_text(root, text):
    return next((node for node in root.iter()
                 if text in (node.get("text", ""), node.get("content-desc", ""))), None)


def wait_for(*texts):
    deadline = time.monotonic() + 60
    last = ""
    while time.monotonic() < deadline:
        root, last = snapshot()
        if all(find_text(root, text) is not None for text in texts):
            return root
        time.sleep(2)
    raise AssertionError(f"Missing {texts} in offline WebView hierarchy:\n{last}")


adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk")
adb("shell", "svc", "wifi", "disable")
adb("shell", "svc", "data", "disable")
adb("shell", "am", "force-stop", "com.agammann.cinemastamps")
adb("shell", "am", "start", "-n", "com.agammann.cinemastamps/.MainActivity")
root = wait_for("Cinemastamps", "Screening room", "Pair phone")
button = find_text(root, "Pair phone")
coordinates = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", button.get("bounds", ""))
assert coordinates, "Pair phone control has no screen bounds"
x1, y1, x2, y2 = map(int, coordinates.groups())
assert x2 > x1 and y2 > y1, "Pair phone control is not visible"
adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
wait_for("Pair your phone")
print("Offline packaged WebView loaded and opened the pairing dialog")
