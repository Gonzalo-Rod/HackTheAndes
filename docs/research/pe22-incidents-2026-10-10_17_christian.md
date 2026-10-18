# Carretera Central (PE-22) road incidents, 10–17 October 2026

Research note for the PeruRoad Climate team: road incidents on the Carretera Central whose date could be confirmed inside the
window, followed by the reports that could not be confirmed.

- **Window:** 10–17 October 2026, inclusive.
- **Search date:** 17 October 2026 (America/Lima, UTC−05:00).
- **Corridor:** PE-22 Lima–Chosica–Matucana–San Mateo–Ticlio–La Oroya, and La Oroya–Huancayo, which SUTRAN codes as PE-3S.
- **SUTRAN check:** [`/public/alerts`](https://api.sigea.sutran.gob.pe/public/alerts) read at 15:56 and 16:06. Both pulls returned the
  same 13 alerts nationwide, 5 of them on the corridor. The other 8 are on PE-1N (Tumbes), PE-20 (Callao), PE-1S (Ica and Arequipa),
  PE-34A (Arequipa), PE-3S km 351 (Ayacucho) and PE-5ND (Amazonas).
- **Method:** Tavily search, mostly with `time_range: "week"` (news, plus searches limited to Andina, RPP, El Comercio, Correo,
  Infobae, TV Perú, Exitosa, gob.pe, indeci.gob.pe, x.com and twitter.com), Tavily extract on the most relevant pages, and SUTRAN's
  API read directly (alert list, `/public/alerts/{id}` and `/public/alerts/{id}/historial`).
- **Rules:** an incident counts as confirmed only when a source dates it inside the window. Missing fields say "no indicado", and
  nothing is estimated. SUTRAN gives the event date but not its time, so the times in SUTRAN rows are when the alert was published
  and when its status changed (from `/historial`, converted to Lima time). Names of victims and drivers and vehicle plates that
  appear in some sources are left out on purpose.

## Confirmed incidents

| # | Date and time (Lima) | Place and km | Type | Road status | Source | In SUTRAN's current alerts? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 10 Oct 2026; event time no indicado (published in SUTRAN 10:43, set to `normal` 18:00) | PE-22 km 64+800, Surco (Huarochirí, Lima); both directions | Roadworks: maintenance ("Trabajos de mantenimiento"; SUTRAN sub-reason "Mejoramiento de la infraestructura vial") | Open: `normal`, "Via libre y transitable", since 18:00 on 10 Oct; earlier status no indicado | [SUTRAN SIGEA-101026-02](https://api.sigea.sutran.gob.pe/public/alerts/99c525ba-ec57-41a1-9db1-862657df0daa), reported by Concesionaria Deviandes | Yes, valid until 31 Oct 2026 |
| 2 | 11 Oct 2026; event time no indicado (published in SUTRAN 07:59, set to `normal` 14:56) | PE-22 km 96, San Mateo (Huarochirí, Lima); both directions | Accident: a vehicle ran off the road and overturned ("despiste y volcadura") | Restricted ("VIA RESTRINGIDA POR ACCIDENTE DE TRANSITO"), then open: `normal` since 14:56, "Se liberó la vía y se restableció el tránsito en ambos sentidos" | [SUTRAN SIGEA-111026-02](https://api.sigea.sutran.gob.pe/public/alerts/98a4c1d9-b1ad-4069-aa26-33941df1f38b), reported by Concesionaria Deviandes | Yes, valid until 31 Oct 2026 |
| 3 | Sun 11 Oct 2026; 17:20 (Ahora) or about 17:18 (Radio Stereo Mantaro) | Carretera Central (margen izquierda), near the barrio Palia stop, Concepción (Junín); km no indicado | Accident: multi-vehicle crash with several injured. Ahora: two cars and a motorcycle; local posts: a combi, two cars and a motorcycle | no indicado | [Ahora](https://ahora.com.pe/policiales/choque-multiple-carretera-central-concepcion-heridos), dated 13 Oct 2026. Also [Radio Stereo Mantaro](https://www.facebook.com/estereomantaro/posts/lo%C3%BAltimo-cu%C3%A1druple-choque-en-la-carretera-central-a-la-altura-de-palia-en-concep/1608318454642774) (Facebook: "hoy, domingo 11 de octubre, aproximadamente a las 5:18 p. m.") and [Noticias Junín](https://www.tiktok.com/@noticiasjuninhyo/video/7695583193193303317) (TikTok), both seen as search snippets | No |
| 4 | 14 Oct 2026; event time no indicado (published in SUTRAN 17:42, set to `normal` 20:54) | PE-3S km 6, La Oroya (Yauli, Junín); both directions | Accident: a heavy goods vehicle ran off the road and overturned ("con posterior despiste y volcadura") | Open: `normal`, "La Via se encuentra libre y transitable", since 20:54; earlier status no indicado | [SUTRAN SIGEA-141026-01](https://api.sigea.sutran.gob.pe/public/alerts/a2bb3a6a-bb15-4f88-bc1d-aa35f36952e0), reported by Concesionaria Deviandes | Yes, valid until 31 Oct 2026 |
| 5 | 14 Oct 2026 (date Instagram shows for the post); time no indicado | Carretera Central at the Yanacoto entrance, Chosica (Lurigancho-Chosica, Lima); km no indicado | Accident: a woman lying on the road, helped by serenazgo; circumstances not stated ("noticia en desarrollo") | no indicado | [@lisethinforma](https://www.instagram.com/p/DefKtn1gfTd) (Instagram, local news account) | No |
| 6 | 15 Oct 2026 (date Instagram shows for the post); time no indicado | "En plena Carretera Central, a la altura de la salida de la autopista Ramiro Prialé hacia Huachipa"; km no indicado. Not confirmed whether the crash was on PE-22 or on the Ramiro Prialé exit itself | Accident: a tráiler hit a utility pole and brought it down | Closed: "mantiene interrumpido el tránsito", blocked for more than an hour when posted | [@lisethinforma](https://www.instagram.com/p/DeiA8tpxEkN) (Instagram). The same day, [SiscomTV](https://www.instagram.com/reel/DehzsJRlOYe) (Instagram) reported a truck that hit a pole "en la entrada de Huachipa, cerca de la zona del zoológico"; it is not confirmed that both posts describe the same event | No |
| 7 | 17 Oct 2026; event time no indicado (published in SUTRAN 10:21, set to `normal` 14:36) | PE-22 km 51, Santa Cruz de Cocachacra (Huarochirí, Lima); direction "Norte → Sur" | Accident: the trailer of a tráiler ran off the road and overturned ("despiste y volcadura de una carreta de un tráiler") | Open: `normal` ("VIA NORMAL") since 14:36; earlier status no indicado | [SUTRAN SIGEA-171026-01](https://api.sigea.sutran.gob.pe/public/alerts/3e20237e-1aca-4f6a-879f-95333e74b131), reported by Concesionaria Deviandes | Yes, valid until 17 Oct 2026 |
| 8 | 17 Oct 2026; event time no indicado (published in SUTRAN 15:12) | PE-22 km 88, San Mateo (Huarochirí, Lima); direction "Oeste → Este" | Breakdown: mechanical failure of a tráiler ("falla mecánica de un tráiler"; SUTRAN reason `accidentes`) | Restricted: `restringido` ("VIA RESTRINGIDA") at 16:06 | [SUTRAN SIGEA-171026-02](https://api.sigea.sutran.gob.pe/public/alerts/c954d0b8-e9e3-4889-bb1b-46749a3fc60b), reported by Concesionaria Deviandes | Yes, valid until 31 Oct 2026 |

Notes:

- Row 3: Ahora writes "domingo 12 de octubre", but Sunday was 11 October 2026. Either date is inside the window.
- No huaico, landslide, rockfall, protest or blockade on the corridor could be confirmed for these dates. The candidates are in the
  next section.

## Not confirmed

These reports could not be dated inside the window from what the tools could open. None of them is in SUTRAN's current alerts.

| # | Date and time | Place and km | Type | Road status | Source | Why it is not confirmed |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | no indicado (Correo published it on 16 Oct 2026) | Sector Chulec, La Oroya (Junín), attended by the Santa Rosa de Sacco serenazgo; road and km no indicado | Accident: a car ran off the road into the Mantaro river; two injured | no indicado | [Correo](https://diariocorreo.pe/edicion/huancayo/la-oroya-dos-jovenes-resultan-heridos-tras-caer-con-su-auto-al-rio-mantaro-noticia), listed in its [16 Oct archive](https://diariocorreo.pe/archivo/todas/2026-10-16) | The article gives no date or time for the crash |
| U2 | no indicado | Carretera Central near the paradero de Mito, Concepción (Junín); km no indicado | Accident: a pedestrian was killed by a colectivo; the driver was detained | no indicado | [RPP](https://rpp.pe/peru/junin/hombre-muere-tras-ser-atropellado-por-auto-colectivo-en-la-carretera-central-noticia-1704866) | The article shows no date |
| U3 | Plan ends "sábado 17 de octubre, a las 12:00…"; start no indicado | km 36, Chosica (the snippet is cut off after "kilómetro 36 de la…") | Roadworks: traffic plan with a partial closure to install the "Rayos del Sol" pedestrian bridge, announced by the Municipalidad de Lurigancho-Chosica | Restricted: partial closure, according to the post | [Al Día Chosica](https://www.facebook.com/AlDiaChosica/posts/-atenci%C3%B3n-conductores-activan-plan-de-circulaci%C3%B3n-vehicular-por-cierre-parcial-d/1760088066123274) (Facebook) | The post could not be opened, its date is not visible, and no official notice was found |
| U4 | no indicado | Horacio Zevallos, Ate (Lima); km no indicado | Accident: a moto torito and a truck collided | Restricted: "cierre parcial de la Carretera Central", according to the post | [Instagram post](https://www.instagram.com/p/DedNd_Tkbyg) | The post could not be opened (two attempts); date not visible |
| U5 | no indicado | Ticlio: from km 122 (cruce Chinchán, near Casapalca) to a point cut off in the snippet | Closure attributed to cold, fog and slippery pavement | Closed: "bloqueo total", according to the post | [Aire de Radio 89.3](https://www.facebook.com/AiredeRadio89.3/posts/-el-fr%C3%ADo-la-neblina-y-el-pavimento-resbaladizo-obligaron-a-cerrar-un-tramo-clave/122286577904176250) (Facebook) | The post could not be opened; date not visible |
| U6 | no indicado | Matucana, at Puente Habich; km no indicado | Rockfall ("caída de rocas"); snippets from the same page also mention "derrumbe, accidentes y desvíos" | "el pase está relativamente cerrado", according to the post | [Alerta Huachipa](https://www.facebook.com/alertahuachipaoficial/posts/-lo%C3%BAltimo-accidente-carreteracentral-se-a-producido-un-accidente-en-la-carretera/1151482677212853) (Facebook) | No date in the snippet; the post was not opened |
| U7 | no indicado | San Mateo sector; km no indicado | Rockfall ("caída de rocas obstruyendo la vía") | Restricted, according to the post | [Facebook post](https://www.facebook.com/100072131346900/posts/-tr%C3%A1fico-en-la-carretera-central/1118624650551903) | No date |
| U8 | no indicado (09:00–11:00 stated; day not visible) | Puente Cascabel, Carretera Central km 59.130 | Roadworks: bridge maintenance by Deviandes | Restricted: partial closure, according to the post | [Prensa Digital Noticias](https://www.facebook.com/prensadigitalnoticias/posts/-atenci%C3%B3n-conductores-y-poblaci%C3%B3n-anuncian-cierre-parcial-por-mantenimiento-del-/1726966466098829) (Facebook) | No date |
| U9 | Conflicting: "domingo 12 de octubre" (12 Oct 2026 was a Monday) or "10 de octubre" | "Etapa 1: Lima – Huancayo" of the Caminos del Inca 2026 rally; restricted section not identified | Restriction for a motor rally | Restricted, according to the posts | [Facebook notice](https://www.facebook.com/100063499090748/posts/-aviso-importante-restricci%C3%B3n-vehicular-por-el-rally-caminos-del-inca-2026el-gob/1731231235670163), [Perú Off Road Racing TV](https://www.facebook.com/PeruOffRoadRacingTv/posts/orden-de-partida-caminos-del-inca-2026-lima-huancayo/2064714894472502), [Instagram](https://www.instagram.com/p/DeUjJNyDlC4) | Dates conflict and no official notice places a restriction on PE-22. SUTRAN lists only stage 2, at PE-3S km 351 in Ayacucho (SIGEA-121026-01), outside the corridor |
| U10 | no indicado | Paradero Yanacoto, Chosica; km no indicado | Accident: a car and a pickup collided; three dead, according to the post | no indicado | [Facebook post](https://www.facebook.com/61562212396665/posts/-accidente-de-tr%C3%A1nsito-en-el-paradero-yanacoto-en-la-carretera-centralun-acciden/122178722978407079) | No date |
| U11 | no indicado | Carretera Central km 42, Los Toboganes, Ricardo Palma (Huarochirí) | Accident: a tráiler ran off the road | no indicado | Tavily search snippet for [this Instagram URL](https://www.instagram.com/p/DefKtn1gfTd), whose page shows a different post (row 5) | The text appears only in a search snippet; no date |
| U12 | no indicado | Carretera Central km 166, Santa Rosa de Sacco | Accident: head-on crash between a truck and a semi-trailer | no indicado | Related-article teaser on the [Ahora](https://ahora.com.pe/policiales/choque-multiple-carretera-central-concepcion-heridos) page | The teaser has no date |
| U13 | no indicado | Carretera Central, sector Yanachacra, Jauja; km no indicado | Accident: triple crash with three dead and five injured | no indicado | Related-article teaser on the [Ahora](https://ahora.com.pe/policiales/choque-multiple-carretera-central-concepcion-heridos) page | The teaser has no date |

## Found, but outside the corridor or the window

- "Camión vuelca en la carretera Central" at km 164+200, Huariaca (Pasco), 11 Oct 2026 ([@pascolibre](https://www.instagram.com/p/DeYEmN3jVlg),
  Instagram). Pasco is outside the corridor.
- "Pasco: buses y camiones varados por bloqueo de carretera central" ([RPP tag page](https://rpp.pe/noticias/huarica)). Pasco is
  outside the corridor; the date was not checked.
- "Chosica: bus interprovincial chocó con dos automóviles en plena Carretera Central" (RPP). It already appeared next to RPP items
  dated 20 February ([sidebar](https://rpp.pe/peru/la-libertad/pataz-ciudadanos-se-enfrentaron-a-las-fuerzas-del-orden-durante-traslado-de-cuerpos-de-dos-hombres-asesinados-noticia-1676707)),
  so it predates the window.
- The Municipalidad de Ate reopened the Carretera Central in both directions after the Cerro Candela cut on 1 October 2026
  ([muniate.gob.pe sidebar](https://www.muniate.gob.pe/muncipalidad-de-ate-interviene-mototaxis-por-ocupar-zona-restringida-como-paradero)),
  before the window.
- Chosica: access to Puente Caracol was closed when the Rímac reached 93.15 m³/s, and heavy machinery hit a pedestrian bridge over the
  Rímac ([Exitosa, Facebook](https://www.facebook.com/Exitosanoticias/posts/-exitosaper%C3%BA-la-preocupaci%C3%B3n-crece-en-lurigancho-chosica-ante-el-riesgo-que-enfr/1582013457295040);
  [Exitosa, X](https://x.com/exitosape/status/2111132742406574436)). These are bridges over the river, not PE-22, and their dates
  were not confirmed.
- A combi fell into a ravine on the Yauyos–Chupaca road on 11 October 2026
  ([Correo](https://diariocorreo.pe/edicion/huancayo/junin-tres-muertos-y-varios-heridos-tras-caida-de-combi-a-abismo-en-carretera-yauyos-chupaca-noticia)).
  This is a different road.

## X (Twitter)

- Tavily searches limited to x.com and twitter.com found no posts from @SutranPeru, @ProviasNacional, @DeviandesPeru or
  @MTC_GobPeru about the corridor.
- Without logging in, profile pages show only the latest few posts. [@SutranPeru](https://x.com/SutranPeru) (five posts, the oldest
  shown as "22h") and [@MTC_GobPeru](https://x.com/MTC_GobPeru) (five posts, the oldest shown as "6h") had nothing on PE-22.
  [@DeviandesPeru](https://x.com/DeviandesPeru) showed images without text. x.com/ProviasNacional returned 404, and
  [@ProviasNac_Peru](https://x.com/ProviasNac_Peru), the handle MTC tags, showed no post text.
- X therefore could not be checked for the full week with these tools.

## Searches with no corridor incidents

- Searches limited to Andina, El Comercio, TV Perú and Exitosa for the last week returned no corridor incident. Infobae returned only
  articles about the planned Nueva Carretera Central.
- gob.pe (SUTRAN, MTC and Provías Nacional news) and indeci.gob.pe returned no corridor road incident; the INDECI results for the week
  were mostly forest fires and strong winds in other regions.
- Tavily extracts of Correo's daily archive for 10–17 October, ranked by corridor terms, surfaced only the La Oroya article (U1). The
  extracts return the best-matching parts of each page, not the full list, so this check is not exhaustive.
- Facebook posts could not be opened with Tavily (login wall), so reports that exist only on Facebook stay unconfirmed.
