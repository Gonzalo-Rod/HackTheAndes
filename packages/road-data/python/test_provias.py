import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from road_data.integrations.provias import read_rows

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


class ProviasWorkbookTests(unittest.TestCase):
    def workbook(self, root, *, properties="", cell="<v>0</v>", strings=None):
        path = Path(root) / "fixture.xlsx"
        with ZipFile(path, "w") as archive:
            archive.writestr(
                "xl/workbook.xml", f'<workbook xmlns="{NS}">{properties}</workbook>'
            )
            archive.writestr(
                "xl/sharedStrings.xml",
                strings or f'<sst xmlns="{NS}"><si><t>PE-22</t></si></sst>',
            )
            archive.writestr(
                "xl/worksheets/sheet1.xml",
                f'<worksheet xmlns="{NS}"><sheetData><row><c r="A1" t="s">{cell}</c></row></sheetData></worksheet>',
            )
        return path

    def test_reads_source_strings_without_executing_workbook_content(self):
        with TemporaryDirectory() as root:
            self.assertEqual(read_rows(self.workbook(root)), [{"A": "PE-22"}])

    def test_rejects_unexpected_epoch_formulas_and_invalid_string_references(self):
        with TemporaryDirectory() as root:
            for options in [
                {"properties": '<workbookPr date1904="1"/>'},
                {"cell": "<f>external()</f><v>0</v>"},
                {"cell": "<v>-1</v>"},
                {"cell": "<v>10</v>"},
            ]:
                with self.assertRaises(ValueError):
                    read_rows(self.workbook(root, **options))

    def test_rejects_xml_entities_before_parsing(self):
        with TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "entities"):
                read_rows(
                    self.workbook(
                        root,
                        strings=f'<!DOCTYPE sst [<!ENTITY x "expanded">]><sst xmlns="{NS}"><si><t>&x;</t></si></sst>',
                    )
                )


if __name__ == "__main__":
    unittest.main()
