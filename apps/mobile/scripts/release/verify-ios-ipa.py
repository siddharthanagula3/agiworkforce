#!/usr/bin/env python3

import plistlib
import sys
import zipfile


def verify(ipa_path: str, expected_version: str, expected_bundle_id: str) -> None:
    with zipfile.ZipFile(ipa_path) as archive:
        app_plists = [
            name
            for name in archive.namelist()
            if name.startswith("Payload/")
            and name.count("/") == 2
            and name.endswith(".app/Info.plist")
        ]
        if len(app_plists) != 1:
            raise ValueError("IPA must contain exactly one Payload app Info.plist")

        app_path = app_plists[0]
        app = plistlib.loads(archive.read(app_path))
        if app.get("CFBundleIdentifier") != expected_bundle_id:
            raise ValueError("IPA bundle identifier does not match the release configuration")
        if app.get("CFBundleShortVersionString") != expected_version:
            raise ValueError("IPA app version does not match the release configuration")

        build_number = app.get("CFBundleVersion")
        if not isinstance(build_number, str) or not build_number:
            raise ValueError("IPA app build number is missing")

        extension_prefix = app_path.removesuffix("Info.plist") + "PlugIns/"
        extension_plists = [
            name
            for name in archive.namelist()
            if name.startswith(extension_prefix)
            and name.endswith(".appex/Info.plist")
            and name.count("/") == 4
        ]
        if len(extension_plists) != 1:
            raise ValueError("IPA must contain exactly one share extension Info.plist")

        extension = plistlib.loads(archive.read(extension_plists[0]))
        if extension.get("CFBundleIdentifier") != f"{expected_bundle_id}.share-extension":
            raise ValueError("IPA share extension bundle identifier does not match")
        if extension.get("CFBundleShortVersionString") != expected_version:
            raise ValueError("IPA share extension version does not match the app")
        if extension.get("CFBundleVersion") != build_number:
            raise ValueError("IPA share extension build number does not match the app")

    print(f"Verified iOS IPA: {expected_bundle_id} {expected_version} ({build_number})")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: verify-ios-ipa.py <ipa> <version> <bundle-id>")
    try:
        verify(*sys.argv[1:])
    except (OSError, ValueError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        sys.exit(f"iOS IPA verification failed: {error}")
