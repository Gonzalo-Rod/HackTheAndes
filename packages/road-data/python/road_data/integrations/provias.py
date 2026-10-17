"""Read a bounded public XLSX without executing formulas or external references."""

from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAX_XML_BYTES = 20 * 1024 * 1024


def read_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:

        def xml(name: str):
            info = archive.getinfo(name)
            if info.file_size > MAX_XML_BYTES:
                raise ValueError("Oversized XLSX XML member")
            data = archive.read(name).decode("utf-8-sig", errors="strict")
            if "<!DOCTYPE" in data or "<!ENTITY" in data:
                raise ValueError("XLSX entities are unsupported")
            return ET.fromstring(data)

        workbook = xml("xl/workbook.xml")
        properties = workbook.find("m:workbookPr", NS)
        if properties is not None and properties.get("date1904") in {"1", "true"}:
            raise ValueError("Unexpected XLSX date epoch")
        strings = [
            "".join(v.itertext())
            for v in xml("xl/sharedStrings.xml").findall("m:si", NS)
        ]
        rows = []
        for row in xml("xl/worksheets/sheet1.xml").findall("m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                if cell.find("m:f", NS) is not None:
                    raise ValueError("XLSX formulas are unsupported")
                value = cell.find("m:v", NS)
                if value is None:
                    continue
                text = value.text or ""
                if cell.get("t") == "s":
                    index = int(text)
                    if not 0 <= index < len(strings):
                        raise ValueError("Invalid XLSX shared-string reference")
                    text = strings[index]
                column = re.sub(r"\d", "", cell.get("r", ""))
                values[column] = text
            rows.append(values)
    return rows
