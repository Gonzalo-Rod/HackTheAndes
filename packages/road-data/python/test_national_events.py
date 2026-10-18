import unittest
from prepare_national_events import normalize_rows, position
from road_data.domain.historical_events import (
    rainfall_reported,
    road_event_category,
    road_status,
)

HEADER = {
    "A": "CODIGO",
    "B": "DEPARTAMENTO",
    "C": "PROVINCIA",
    "D": "DISTRITO",
    "E": "RUTA",
    "F": "PROGRESIVA\nINICIAL",
    "G": "PROGRESIVA\nFINAL",
    "H": "LATITUD",
    "I": "LONGITUD",
    "J": "ORIGEN \nEMERGENCIA",
    "K": "PELIGRO \nEMERGENCIA",
    "L": "TIPO \nEMERGENCIA",
    "M": "INICIO",
    "N": "TRANSITABILIDAD INICIAL",
    "O": "DESARROLLO",
}


def row(**overrides):
    base = {
        "A": "21173",
        "B": "AMAZONAS",
        "C": "UTCUBAMBA",
        "D": "JAMALCA",
        "E": "pe-5n",
        "F": "1288+100",
        "G": "1288+150",
        "H": "-5.890797",
        "I": "-78.17094",
        "K": "LLUVIAS INTENSAS",
        "L": "OBSTRUCCION/DAÑO POR DERRUMBE\n",
        "M": "45720",
        "N": "RESTRINGIDO",
        "O": "Derrumbe de rocas.",
    }
    return {**base, **overrides}


class NationalEventTests(unittest.TestCase):
    def test_categorizes_reported_damage(self):
        self.assertEqual(road_event_category("OBSTRUCCION POR HUAICO"), "debris_flow")
        self.assertEqual(road_event_category("OBSTRUCCION/DAÑO POR DERRUMBE"), "rockfall_or_slope_failure")
        self.assertEqual(road_event_category("EROSION / SOCAVACION DE PUENTE"), "structure_damage")
        self.assertEqual(road_event_category("PERDIDA DE PLATAFORMA"), "road_damage")
        self.assertEqual(road_event_category("OBSTRUCCION POR DISTURBIO SOCIAL/HUELGA/PARO"), "social")
        self.assertEqual(road_event_category("ACCIDENTE DE TRANSITO"), "traffic")
        self.assertEqual(road_event_category("NEVADA"), "other")

    def test_rainfall_is_a_text_mention_and_status_defaults_to_unknown(self):
        self.assertTrue(rainfall_reported("", "Precipitaciones pluviales - Derrumbe"))
        self.assertFalse(rainfall_reported("ACCIDENTE", ""))
        self.assertEqual(road_status(" Interrumpido "), "interrumpido")
        self.assertEqual(road_status(""), "desconocido")

    def test_rejects_points_outside_peru(self):
        self.assertIsNone(position("-3.7", "40.4"))
        self.assertIsNone(position("", "-12"))
        self.assertEqual(position("-76.2", "-11.6"), [-76.2, -11.6])

    def test_normalizes_rows_and_counts_out_of_window_dates(self):
        events, diagnostics = normalize_rows(
            [{}, HEADER, row(), row(A="2", M="45900"), {"A": ""}], 2025
        )
        self.assertEqual(diagnostics, {"year": 2025, "rows": 2, "outsideWindow": 1, "withoutPosition": 0})
        self.assertEqual(events[0]["roadCode"], "PE-5N")
        self.assertEqual(events[0]["date"], "2025-03-04")
        self.assertEqual(events[0]["kmStart"], 1288.1)
        self.assertEqual(events[0]["category"], "rockfall_or_slope_failure")
        self.assertEqual(events[0]["rawType"], "OBSTRUCCION/DAÑO POR DERRUMBE")
        self.assertTrue(events[0]["rainfallReported"])

    def test_rejects_changed_columns_and_invalid_identity(self):
        with self.assertRaises(ValueError):
            normalize_rows([{"A": "RUTA", "B": "INICIO"}], 2025)
        with self.assertRaises(ValueError):
            normalize_rows([HEADER, row(A="X1")], 2025)


if __name__ == "__main__":
    unittest.main()
