import json
import plistlib
import sys
import xml.etree.ElementTree as ET
from xml.parsers.expat import ExpatError


class UniqueKeys(dict):
    def __setitem__(self, key, value):
        if not isinstance(key, str) or key in self:
            raise ValueError("invalid or duplicate plist key")
        super().__setitem__(key, value)


def validate_xml_node(node):
    if node.tag not in {"dict", "array", "key", "string", "true", "false"} or node.attrib:
        raise ValueError("invalid privacy plist element")
    children = list(node)
    if node.tag in {"dict", "array"}:
        if (node.text or "").strip() or any((child.tail or "").strip() for child in children):
            raise ValueError("invalid privacy plist container")
        if node.tag == "dict":
            if len(children) % 2:
                raise ValueError("invalid privacy plist dictionary")
            for index in range(0, len(children), 2):
                if children[index].tag != "key" or children[index + 1].tag == "key":
                    raise ValueError("invalid privacy plist dictionary")
        elif any(child.tag == "key" for child in children):
            raise ValueError("invalid privacy plist array")
        for child in children:
            validate_xml_node(child)
    elif children or (node.tag in {"true", "false"} and (node.text or "").strip()):
        raise ValueError("invalid privacy plist value")


def parse_manifest(source):
    manifest = plistlib.loads(source, dict_type=UniqueKeys)
    if not source.startswith(b"bplist00"):
        root = ET.fromstring(source)
        if (
            root.tag != "plist"
            or root.attrib != {"version": "1.0"}
            or len(root) != 1
            or root[0].tag != "dict"
            or (root.text or "").strip()
            or (root[0].tail or "").strip()
        ):
            raise ValueError("invalid privacy plist root")
        validate_xml_node(root[0])
    return manifest


def main():
    try:
        source = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
        if not source or len(source) > 4 * 1024 * 1024:
            raise ValueError("invalid privacy plist size")
        json.dump(parse_manifest(source), sys.stdout, allow_nan=False)
    except (ValueError, TypeError, OSError, ExpatError, ET.ParseError, RecursionError):
        sys.stderr.write("invalid privacy plist\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
