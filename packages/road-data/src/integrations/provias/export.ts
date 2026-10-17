import type { BinaryTransport } from "../http/binary-transport.ts";
export function proviasExportUrl(year: 2024 | 2025): string {
  const params = new URLSearchParams({
    fechaInicio: `01/01/${year}`,
    fechaFin: `30/04/${year}`,
    idDepartamento: "",
    idTipoEmergencia: "",
    idTipoAdministracion: "1_2_3_4_5_6_7",
  });
  return `https://wsgcv.proviasnac.gob.pe/emergenciavial/EmergenciaVial/ReportToPdfDeExcel?${params}`;
}
export async function fetchProviasExport(
  transport: BinaryTransport,
  year: 2024 | 2025,
  requestId: string,
) {
  const url = proviasExportUrl(year);
  const bytes = await transport.getBytes(url, { provider: "provias", requestId });
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("Provias did not return an XLSX archive");
  return { bytes, url };
}
