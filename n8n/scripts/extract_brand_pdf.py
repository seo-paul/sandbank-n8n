#!/usr/bin/env python3
"""
Extract text from the Sandbank guideline PDF without external dependencies.
This parser targets PDF text operators in page content streams.
"""

from __future__ import annotations

import argparse
import re
import zlib
from pathlib import Path

OBJ_RE = re.compile(rb"(\d+)\s+(\d+)\s+obj(.*?)endobj", re.S)

BYTE_MAP = {
    0x80: "Ä",
    0x85: "Ö",
    0x86: "Ü",
    0x8A: "ä",
    0x9A: "ö",
    0x9F: "ü",
    0xA7: "ß",
    0xD1: "–",
    0xD4: "€",
}


def decode_bytes(raw: bytes) -> str:
    chars: list[str] = []
    for b in raw:
        if b in BYTE_MAP:
            chars.append(BYTE_MAP[b])
        elif 32 <= b <= 126 or b in (9, 10, 13):
            chars.append(chr(b))
        else:
            chars.append(chr(b))
    return "".join(chars)


def unescape_pdf_string(raw: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(raw):
        b = raw[i]
        if b == 0x5C and i + 1 < len(raw):
            n = raw[i + 1]
            if n in b"nrtbf":
                out += {
                    ord("n"): b"\n",
                    ord("r"): b"\r",
                    ord("t"): b"\t",
                    ord("b"): b"\b",
                    ord("f"): b"\f",
                }[n]
                i += 2
                continue
            if n in b"()\\":
                out.append(n)
                i += 2
                continue
            if 48 <= n <= 55:
                j = i + 1
                oct_digits = []
                for _ in range(3):
                    if j < len(raw) and 48 <= raw[j] <= 55:
                        oct_digits.append(raw[j])
                        j += 1
                    else:
                        break
                out.append(int(bytes(oct_digits), 8))
                i = j
                continue
            out.append(n)
            i += 2
            continue
        out.append(b)
        i += 1
    return bytes(out)


def extract_pages(pdf_bytes: bytes) -> list[tuple[int, list[str]]]:
    objects = {int(m.group(1)): m.group(3) for m in OBJ_RE.finditer(pdf_bytes)}
    pages: list[tuple[int, list[str]]] = []

    for obj_num, body in objects.items():
        if b"/Type /Page" not in body:
            continue

        contents_ref = re.search(rb"/Contents\s+(\d+)\s+0\s+R", body)
        if not contents_ref:
            continue

        content_obj = int(contents_ref.group(1))
        content_body = objects.get(content_obj, b"")
        if b"stream" not in content_body:
            continue

        stream = content_body.split(b"stream", 1)[1].rsplit(b"endstream", 1)[0]
        if stream.startswith(b"\r\n"):
            stream = stream[2:]
        elif stream.startswith(b"\n"):
            stream = stream[1:]
        if stream.endswith(b"\r\n"):
            stream = stream[:-2]
        elif stream.endswith(b"\n"):
            stream = stream[:-1]

        try:
            decoded_stream = zlib.decompress(stream)
        except zlib.error:
            continue

        lines: list[str] = []
        for match in re.finditer(rb"\((?:\\.|[^\\)])*\)\s*Tj", decoded_stream):
            payload = re.search(rb"^\((.*)\)\s*Tj$", match.group(0), re.S)
            if not payload:
                continue
            text = decode_bytes(unescape_pdf_string(payload.group(1))).strip()
            if text:
                lines.append(text)

        if lines:
            pages.append((obj_num, lines))

    pages.sort(key=lambda item: item[0])
    return pages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    pages = extract_pages(args.pdf.read_bytes())

    with args.output.open("w", encoding="utf-8") as f:
        for idx, (obj_num, lines) in enumerate(pages, start=1):
            f.write(f"\n=== PAGE {idx:02d} (obj {obj_num}) ===\n")
            for line in lines:
                f.write(line + "\n")

    print(f"wrote {args.output}")
    print(f"pages {len(pages)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
