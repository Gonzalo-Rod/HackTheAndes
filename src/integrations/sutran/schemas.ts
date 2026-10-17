import { z } from "zod";

import type { SutranAlertRecord, SutranEvidenceRecord, SutranHistoryRecord } from "@/domain/road-alerts/normalize";

// Shape validation for SUTRAN's public API (api.sigea.sutran.gob.pe/public), verified
// against live responses on 2026-10-17. Objects are loose so new upstream fields do not
// break ingestion; records missing required fields are skipped by the client.

const nullableString = z.string().nullish();
const nullableNumber = z.number().nullish();

export const SutranAlertRecordSchema = z.looseObject({
  id: z.string().min(1),
  codigo: nullableString,
  motivo: nullableString,
  estadoVia: nullableString,
  titulo: nullableString,
  descripcion: nullableString,
  situacionActual: nullableString,
  lat: nullableNumber,
  lng: nullableNumber,
  region: nullableString,
  provincia: nullableString,
  distrito: nullableString,
  viaCodigo: nullableString,
  viaNombre: nullableString,
  km: nullableString,
  sentido: nullableString,
  accionesPnp: nullableString,
  pasajerosDetenidos: nullableNumber,
  mercanciasDetenidas: nullableNumber,
  fechaEvento: nullableString,
  vigenteDesde: nullableString,
  vigenteHasta: nullableString,
  administrador: nullableString,
  fuente: nullableString,
  fuenteWeb: nullableString,
  vencida: z.boolean().nullish(),
  aunNoVigente: z.boolean().nullish(),
  reportCount: nullableNumber,
  lastActionAt: nullableString,
}) satisfies z.ZodType<SutranAlertRecord>;

export const SutranHistoryRecordSchema = z.looseObject({
  fecha: nullableString,
  tipo: nullableString,
  estadoNuevo: nullableString,
}) satisfies z.ZodType<SutranHistoryRecord>;

export const SutranEvidenceRecordSchema = z.looseObject({
  tipo: nullableString,
  url: nullableString,
  posterUrl: nullableString,
  nombre: nullableString,
}) satisfies z.ZodType<SutranEvidenceRecord>;

export const SutranAlertDetailSchema = z.looseObject({
  id: z.string(),
  submotivoLabel: nullableString,
  etiquetasLabels: z.array(z.string()).nullish(),
  evidencia: z.array(z.unknown()).nullish(),
});

/** Every SUTRAN response is wrapped as { success, data }. */
export const envelope = <T extends z.ZodType>(data: T) => z.looseObject({ success: z.boolean().optional(), data });
