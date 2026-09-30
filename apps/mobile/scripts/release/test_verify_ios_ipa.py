import importlib.util
import io
import plistlib
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("verify-ios-ipa.py")
SPEC = importlib.util.spec_from_file_location("verify_ios_ipa", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VerifyIosIpaTests(unittest.TestCase):
    def make_ipa(self, version="0.0.1", extension_build="3", bundle_id="com.agiworkforce.app"):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "Payload/AGI.app/Info.plist",
                plistlib.dumps(
                    {
                        "CFBundleIdentifier": bundle_id,
                        "CFBundleShortVersionString": version,
                        "CFBundleVersion": "3",
                    }
                ),
            )
            archive.writestr(
                "Payload/AGI.app/PlugIns/AGIShareExtension.appex/Info.plist",
                plistlib.dumps(
                    {
                        "CFBundleIdentifier": f"{bundle_id}.share-extension",
                        "CFBundleShortVersionString": version,
                        "CFBundleVersion": extension_build,
                    }
                ),
            )
        path = Path(self.temp_dir.name) / "app.ipa"
        path.write_bytes(buffer.getvalue())
        return str(path)

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_accepts_matching_app_and_extension(self):
        MODULE.verify(self.make_ipa(), "0.0.1", "com.agiworkforce.app")

    def test_rejects_archived_version(self):
        with self.assertRaisesRegex(ValueError, "app version"):
            MODULE.verify(self.make_ipa(version="1.2.0"), "0.0.1", "com.agiworkforce.app")

    def test_rejects_wrong_bundle(self):
        with self.assertRaisesRegex(ValueError, "bundle identifier"):
            MODULE.verify(self.make_ipa(bundle_id="com.other.app"), "0.0.1", "com.agiworkforce.app")

    def test_rejects_extension_build_mismatch(self):
        with self.assertRaisesRegex(ValueError, "share extension build number"):
            MODULE.verify(self.make_ipa(extension_build="2"), "0.0.1", "com.agiworkforce.app")


if __name__ == "__main__":
    unittest.main()
