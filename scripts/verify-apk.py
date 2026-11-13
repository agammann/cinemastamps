"""Verify every built web asset in the delivered APK, without installing an SDK."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

def verify(apk, web, prefix):
    expected = {file.relative_to(web).as_posix(): file.read_bytes() for file in web.rglob("*") if file.is_file()}
    if "index.html" not in expected:
        raise ValueError("Missing built index.html")
    with ZipFile(apk) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate APK entry")
        if archive.testzip() is not None:
            raise ValueError("Corrupt APK entry")
        for name, data in expected.items():
            if archive.read(prefix + name) != data:
                raise ValueError("APK asset differs from build: " + name)
    return {"schema": 1, "apk_sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
            "asset_count": len(expected), "assets": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in sorted(expected.items())],
            "scope": "APK ZIP integrity and exact web asset parity; not install, playback, emulator, Vega or physical-device verification."}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--web", type=Path, default=Path("dist"))
    parser.add_argument("--prefix", default="assets/web/")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.apk, args.web, args.prefix)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Verified {result['asset_count']} exact APK web assets; sha256={result['apk_sha256']}")
