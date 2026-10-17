"""Local file decoding. Archive identity is verified by the TypeScript operator first."""

import hashlib
import io
import json
import zipfile
from pathlib import Path
import shapefile
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

ARCHIVE_SHA256 = "50afa9deb75d9fd5d61b5f43fa92586f0bdfe5242018a1f2fbe5a1837871d37c"


def read_archive(path: Path) -> tuple[shapefile.Reader, dict[int, int], dict[int, int]]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("HydroBASINS archive checksum mismatch")
    with zipfile.ZipFile(path) as archive:

        def part(extension: str) -> io.BytesIO:
            matches = [name for name in archive.namelist() if name.endswith(extension)]
            if len(matches) != 1:
                raise ValueError("Unexpected shapefile archive structure")
            info = archive.getinfo(matches[0])
            if info.file_size > 500_000_000:
                raise ValueError("Uncompressed archive member exceeds limit")
            return io.BytesIO(archive.read(matches[0]))

        reader = shapefile.Reader(shp=part(".shp"), shx=part(".shx"), dbf=part(".dbf"))
    indexes: dict[int, int] = {}
    downstream: dict[int, int] = {}
    for record in reader.iterRecords(fields=["HYBAS_ID", "NEXT_DOWN"]):
        identifier, target = int(record["HYBAS_ID"]), int(record["NEXT_DOWN"])
        if identifier in indexes or identifier <= 0 or target < 0:
            raise ValueError("Invalid HydroBASINS identity")
        indexes[identifier] = record.oid
        downstream[identifier] = target
    return reader, indexes, downstream


def read_json(path: Path) -> dict:
    with path.open(encoding="utf8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("Expected JSON object")
    return value


def read_geometry(reader: shapefile.Reader, index: int) -> BaseGeometry:
    return shape(reader.shape(index).__geo_interface__)
