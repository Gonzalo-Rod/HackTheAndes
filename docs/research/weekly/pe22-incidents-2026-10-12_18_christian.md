# Carretera Central (PE-22) road incidents, 12–18 October 2026

Automated weekly report for the PeruRoad Climate team, written by `scripts/weekly-incident-report_christian.ts` from
the state file next to it. Official sources are listed as reported; news items need a human check before anyone uses them.

- **Window:** 12 Oct 2026 to 18 Oct 2026 (America/Lima), Monday to Sunday.
- **Corridor:** PE-22 Lima–La Oroya (Lima, Huarochirí and Yauli provinces) and PE-3S La Oroya–Huancayo (Yauli, Jauja,
  Concepción and Huancayo provinces).
- **Runs:** 3, first 17 Oct 2026, 16:48, last updated 17 Oct 2026, 17:47.
- **Sources in the latest run:** SUTRAN: ok, 3 kept; INDECI: ok, 0 kept; Google News: ok, 3 kept (1 title(s) named only "Carretera Central" and were left out).

## Official: SUTRAN alerts on the corridor

Alerts from SUTRAN's public API with an event date (`fechaEvento`) in this week. SUTRAN gives no event time; the status
changes come from each alert's `/historial`. Alerts are read every run, so ones that expire mid-week are kept.

| # | Event date | Place and km | Type | Road status | Status changes (Lima) | Source | Still in SUTRAN? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 14 Oct 2026 | PE-3S KM 6, La Oroya (Yauli, Junín); direction Ambos sentidos | Accident: Accidente KM 06. Accidente de un vehiculode de carga pesada con posterior despiste y volcadura | Open (`normal`): "La Via se encuentra libre y transitable" | 14 Oct 2026, 17:42 published; 14 Oct 2026, 20:54 set to `normal` | [SUTRAN SIGEA-141026-01](https://api.sigea.sutran.gob.pe/public/alerts/a2bb3a6a-bb15-4f88-bc1d-aa35f36952e0), reported by CONCESIONARIA DEVIANDES | Yes, valid until 31 Oct 2026 |
| 2 | 17 Oct 2026 | PE-22 KM 51, Santa Cruz de Cocachacra (Huarochiri, Lima); direction Norte → Sur | Accident: KM 51 - despiste y volcadura de una carreta de un tráiler | Open (`normal`): "Via normal" | 17 Oct 2026, 10:21 published; 17 Oct 2026, 14:36 set to `normal` | [SUTRAN SIGEA-171026-01](https://api.sigea.sutran.gob.pe/public/alerts/3e20237e-1aca-4f6a-879f-95333e74b131), reported by CONCESIONARIA DEVIANDES | Yes, valid until 17 Oct 2026 |
| 3 | 17 Oct 2026 | PE-22 KM 88, San Mateo (Huarochiri, Lima); direction Oeste → Este | Accident: Falla mecanica de un trailer KM 88. Falla mecanica de un trailer - la vía se encuentra con el transito restringido. | Restricted (`restringido`): "Via restringida" | 17 Oct 2026, 15:12 published | [SUTRAN SIGEA-171026-02](https://api.sigea.sutran.gob.pe/public/alerts/c954d0b8-e9e3-4889-bb1b-46749a3fc60b), reported by CONCESIONARIA DEVIANDES | Yes, valid until 31 Oct 2026 |

## Official: INDECI emergency reports in corridor districts

COEN reports for districts along the corridor with a hazard that can affect the road (landslides, huaicos, rain, snow,
road accidents). INDECI does not always say whether the road was affected; read the report.

No INDECI emergency report in a corridor district with a road-related hazard this week.

## News to review

Google News titles that name a corridor place and an incident word. Google News dates are listing dates and can belong
to an older article that was re-indexed, so confirm the place and the event date on the article before using an item.

| # | Listed by Google News (Lima) | Title | Outlet | Matched terms | Link |
| --- | --- | --- | --- | --- | --- |
| 1 | 12 Oct 2026, 19:58 | Canal de Huaycoloro, diseñado para huaicos, es usado como basurero en Lurigancho-Chosica | Diario Ahora | chosica, huaicos | [link](https://news.google.com/rss/articles/CBMif0FVX3lxTE9pSzg0M01mNDhVMkV1Z2NKdGJDTlVjR3RwU3owcXRXLTgxS0owV3pxcER0YnhrRkZlYklpVGhpYmxNU1lxeGU4WUd2dy1XakpqcUw1V01sRmR6UWZZUzdQeG5icjZxWjRRMnNobFJoUV9hQXdSYXBfVjZTZTU2ZVE?oc=5) |
| 2 | 13 Oct 2026, 10:59 | Choque múltiple en la Carretera Central deja varios heridos en Concepción | Diario Ahora | carretera central, concepcion, choque, heridos | [link](https://news.google.com/rss/articles/CBMijAFBVV95cUxOXzdtdTRwcDU4MHQ2cGxIdDlCaEdhQXRQZ1dzZ2ZCMWhwLTU3WTM2ancxbFRtNEMzM1l1dDNXWElzS3c5Y2hJbm9sZUZHR3pGS1N0d3VTZEJuZ0owVGhydGpRblZ6ekw4Y0FRR0UtTEgzUDl1cjZMS3RHb3dobmRfSGl6UDg5cUdEWk1EeA?oc=5) |
| 3 | 16 Oct 2026, 11:18 | La Oroya: dos jóvenes resultan heridos tras caer con su auto al río Mantaro | Diario Correo | la oroya, heridos | [link](https://news.google.com/rss/articles/CBMi1gFBVV95cUxNS09iMHotT2c1T2hYRnROMHFUZjVTdEdiMnZPbjRCZXlHc0Q3dHR1Z0gzLW10TURZZ1hSUUhyRHRDbmhHVmx5TGlLSUl5dVZOZlBsTFVMcFBFTk9WZF9hSXJ1YjRPY3RQdmphcnB6YkFqbGs3WEtOUVNKcGVBaG5DMTI3WHZpY1NLdm9pTVZubFhmX2kxYzZBZ0ozcTIyUmlSUUFBdkpjUUFacngtZzJOTFFVYzdCeUJUOGJ0aTBMbmhZRjFDMDNEU3EwNjM2eURjODJkOEN30gHWAUFVX3lxTE1LT2Iwei1PZzVPaFhGdE4wcVRmNVN0R2Iydk9uNEJleUdzRDd0dHVnSDMtbXRNRFlnWFJRSHJEdENuaEdWbHlMaUtJSXl1Vk5mUGxMVUxwUEVOT1ZkX2FJcnViNE9jdFB2amFycHpiQWpsazdYS05RU0pwZUFobkMxMjdYdmljU0t2b2lNVm5sWGZfaTFjNkFnSjNxMjJSaVJRQUF2SmNRQVpyeC1nMk5MUVVjN0J5QlQ4YnRpMExuaFlGMUMwM0RTcTA2MzZ5RGM4MmQ4Q3c?oc=5) |

## Not covered by this job

- Facebook, Instagram and X posts, which need a login to read. Deviandes publishes its alerts there; most reach SUTRAN.
- Provías Nacional's emergency viewer, which covers the non-concessioned national network and has no public dated feed.
