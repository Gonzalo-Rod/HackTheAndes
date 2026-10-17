import { z } from "zod";
import { parseCalendarDate } from "../../domain/road-data/parsing.ts";

const text = z.string().trim().min(1);
const optionalText = z.string().trim().nullish();
const calendarDate = text
  .refine((value) => parseCalendarDate(value) !== null, {
    message: "Expected a valid DD/MM/YYYY calendar date",
  })
  .nullable();
const timestamp = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Number.isFinite(Date.parse(value)),
    "Expected a valid timestamp with timezone",
  );

/** Validate only consumed fields; unrelated additions are safe to ignore. */
export const sutranAlertSchema = z
  .object({
    id: z.uuid(),
    codigo: text,
    viaCodigo: text,
    estadoVia: text,
    motivo: text,
    titulo: text,
    descripcion: optionalText,
    situacionActual: optionalText,
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    km: optionalText,
    sentido: optionalText,
    fuente: optionalText,
    fechaEvento: calendarDate,
    vigenteDesde: calendarDate,
    vigenteHasta: calendarDate,
    vencida: z.boolean(),
    aunNoVigente: z.boolean(),
    lastActionAt: timestamp.nullable(),
  })
  .superRefine((value, ctx) => {
    if ((value.lat === null) !== (value.lng === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["lat"],
        message: "Coordinates must both be numbers or both be null",
      });
    }
    const startDate = value.vigenteDesde === null ? null : parseCalendarDate(value.vigenteDesde);
    const endDate = value.vigenteHasta === null ? null : parseCalendarDate(value.vigenteHasta);
    if (startDate !== null && endDate !== null && startDate > endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["vigenteHasta"],
        message: "Validity end precedes validity start",
      });
    }
  });

export const sutranHistorySchema = z.object({
  fecha: timestamp,
  tipo: text,
  estadoNuevo: text.nullable(),
});

/** A failure envelope or changed root shape is never a successful empty feed. */
export const sutranEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.array(z.unknown()),
});

export type SutranAlert = z.infer<typeof sutranAlertSchema>;
export type SutranHistoryEvent = z.infer<typeof sutranHistorySchema>;
