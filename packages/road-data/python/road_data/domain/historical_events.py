"""Source candidates are not automatic training labels; absence is never a negative."""

from datetime import datetime, timedelta, timezone
from math import isfinite
import re
import unicodedata

LIMA = timezone(timedelta(hours=-5))


def normalized(value: str) -> str:
    return " ".join(
        "".join(
            c
            for c in unicodedata.normalize("NFKD", value)
            if not unicodedata.combining(c)
        )
        .upper()
        .split()
    )


def excel_date(value: str) -> str:
    serial = float(value)
    if not isfinite(serial) or serial < 1 or serial > 100_000:
        raise ValueError("Invalid event date")
    return (datetime(1899, 12, 30) + timedelta(days=serial)).date().isoformat()


def kilometer(value: str) -> float | None:
    match = re.fullmatch(r"\s*(\d+)\+(\d{1,3})\s*", value)
    return int(match[1]) + int(match[2]) / 1000 if match else None


def occurrence_day(date: str) -> tuple[str, str]:
    start = datetime.fromisoformat(date).replace(tzinfo=LIMA)
    return start.astimezone(timezone.utc).isoformat(), (
        start + timedelta(days=1)
    ).astimezone(timezone.utc).isoformat()


def natural_hazard(raw_type: str, raw_hazard: str) -> str | None:
    text = normalized(raw_type + " " + raw_hazard)
    if "ACCIDENTE" in text or "OBRA" in text:
        return None
    if "HUAICO" in text or "HUAYCO" in text:
        return "debris_flow"
    if "DERRUMBE" in text:
        return "rockfall_or_slope_failure"
    if "DESLIZAMIENTO" in text:
        return "landslide"
    if "INUNDACION" in text:
        return "flood"
    return None
