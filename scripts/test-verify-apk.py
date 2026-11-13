import importlib.util
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location("verify_apk", Path(__file__).with_name("verify-apk.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ApkContentsTest(unittest.TestCase):
    def test_fresh_package_exact_assets_and_tampering(self):
        with tempfile.TemporaryDirectory(prefix="apk-fixture-") as directory:
            root = Path(directory); web = root / "dist"; web.mkdir()
            (web / "index.html").write_text("<h1>synthetic fixture</h1>")
            (web / "offline.bin").write_bytes(bytes(range(256)))
            apk = root / "fixture.apk"
            for corrupt in (False, True):
                with ZipFile(apk, "w") as archive:
                    for file in web.iterdir():
                        archive.writestr("assets/web/" + file.name, b"wrong" if corrupt and file.name == "offline.bin" else file.read_bytes())
                if corrupt:
                    with self.assertRaisesRegex(ValueError, "differs"):
                        module.verify(apk, web, "assets/web/")
                else:
                    self.assertEqual(module.verify(apk, web, "assets/web/")["asset_count"], 2)
    def test_missing_asset_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="apk-fixture-") as directory:
            root = Path(directory); web = root / "dist"; web.mkdir()
            (web / "index.html").write_text("fixture")
            apk = root / "fixture.apk"
            with ZipFile(apk, "w") as archive:
                archive.writestr("unrelated", "fixture")
            with self.assertRaises(KeyError):
                module.verify(apk, web, "assets/web/")

if __name__ == "__main__":
    unittest.main()
