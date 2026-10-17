# Inicio · Hack the Andes 2026

Documento de referencia del equipo. Consultado el **17 de octubre de 2026**.

## El evento

[Hack the Andes](https://hacktheandes.com/) reúne a 100 participantes en Lima,
Perú, el **17 y 18 de octubre de 2026**, para construir durante **30 horas**.
Los equipos tienen de **1 a 4 integrantes**. El objetivo es resolver un problema
real del país con un producto que pueda usarse y demostrarse. Crafter Station
organiza el evento, con Chofex como sponsor principal y Peru Tech Week como
aliado.

La referencia operativa es la [guía oficial para equipos](https://hacktheandes.com/guide).

## Track elegido

**Clima y Territorio — `environmental`**, según la decisión comunicada por el
equipo. El alcance incluye agua, heladas, huaicos, lluvias, agricultura y alertas
de plagas. La selección guardada en la plataforma todavía no se ha consultado.

Los otros tracks son Movilidad y Transporte (`transport`), Educación Escolar
(`education`) y Seguridad (`security`).

## Rúbrica vigente para este equipo

**Fuente: actualización comunicada por el participante el 17/10/2026.** La guía
consultada aún muestra la versión anterior de tres criterios (30% tracción,
40% esfuerzo técnico y 30% pitch). Para preparar el proyecto usamos la siguiente
actualización de cinco criterios. No trasladamos la escala ni la fórmula de la
versión anterior; la escala actual queda por confirmar con la organización.

| Peso | Área | Criterio | Qué se evalúa |
| --- | --- | --- | --- |
| 30% | Técnico | Complejidad técnica | Integraciones, datos, modelos y arquitectura. |
| 25% | Técnico | Funciona | Flujo completo en vivo desde la URL pública. |
| 20% | Técnico | Calidad técnica | El jurado revisa el repositorio en GitHub. |
| 15% | Producto | Problema e impacto | Un usuario real del track elegido. |
| 10% | Producto | Claridad | Explicación de decisiones y tradeoffs. |
| **100%** | | **Total** | **75% técnico y 25% producto.** |

### Cómo convertir la rúbrica en trabajo

Estas son recomendaciones internas de preparación, no requisitos adicionales
atribuidos a la organización:

- **Complejidad:** dibujar el recorrido de datos, justificar integraciones y
  modelos, identificar qué parte aporta valor y documentar sus límites.
- **Funciona:** priorizar un recorrido completo, probarlo desde una sesión nueva
  y registrar el enlace y el resultado. Hacer visibles los errores recuperables.
- **Calidad:** mantener instrucciones de ejecución, configuración de ejemplo,
  estructura entendible y verificaciones apropiadas para los flujos críticos.
- **Impacto:** identificar una persona concreta del track, su problema actual
  y la acción que necesita completar. Registrar evidencia y aprendizajes reales.
- **Claridad:** explicar decisiones, alternativas descartadas, limitaciones y
  lo que cabe en la demo. Diferenciar implementación de planes futuros.

## Entrega y presentación

La [guía oficial](https://hacktheandes.com/guide) pide una aplicación desplegada,
una presentación, el repositorio en GitHub y una descripción Markdown. El nombre
del proyecto corresponde al equipo. Se puede entregar pronto y editar después.
La organización usa su computadora: comprobar los enlaces sin sesión ni
permisos pendientes. El pitch dura **3 minutos**, seguido de **2 de preguntas**.
Al abrir la evaluación se captura la entrega y la bitácora; ediciones posteriores
no actualizan esa copia.

Revisar también las [condiciones de entrega y presentación](https://hacktheandes.com/participation-terms)
antes de entregar; este documento no sustituye esos términos.

### Lista interna de preparación

- [ ] Definir usuario, territorio y problema prioritario dentro de `environmental`.
- [ ] Acotar la acción principal y qué quedará fuera del MVP.
- [ ] Verificar disponibilidad, procedencia y limitaciones de los datos elegidos.
- [ ] Completar y probar el recorrido principal desde la URL pública.
- [ ] Documentar ejecución, configuración, arquitectura y decisiones en el repo.
- [ ] Recoger evidencia verificable con un usuario real del track.
- [ ] Preparar la presentación y ensayar la demo con el tiempo disponible.
- [ ] Comprobar acceso a aplicación y presentación desde una sesión privada.
- [ ] Enviar los cuatro entregables y verificar lo guardado por el servidor.

## CLI `andes`

Se comprobó la instalación **v0.1.279** y la existencia de `team`, `project`,
`project update`, `project updates` y `project submit`. No se consultó la cuenta,
no se modificó el equipo y no se publicó ningún avance en esta preparación.

Desde la raíz del repositorio, las consultas de trabajo son:

```sh
andes --output json team
andes --output json project
andes --output json project updates
```

Para publicar un avance cuando el equipo lo autorice, crea un archivo con el
resumen nuevo usando [la plantilla](PLANTILLA_AVANCE.md), reemplaza sus campos y
ejecuta, por ejemplo:

```sh
andes --output json project update --file ./inicio/avance-publicar.md
```

Después comprueba el contenido guardado. No envíes la plantilla sin completar ni
toda la bitácora repetidamente. El historial puede hacerse público.

## Documentos de trabajo

- [AVANCES.md](AVANCES.md): historial local de decisiones, implementación,
  verificaciones, bloqueos y siguientes pasos, con un párrafo breve por avance.
- [PLANTILLA_AVANCE.md](PLANTILLA_AVANCE.md): estructura para preparar un resumen
  de 2 a 4 frases dirigido a mentores y jurado.
- [AGENTS.md](../AGENTS.md): instrucciones para que los agentes actualicen la
  bitácora durante sus sesiones. No hay un servicio de registro en segundo plano.

## Estado inicial

El repositorio estaba vacío al iniciar esta preparación. Track definido por el
equipo: `environmental`. Pendientes: usuario, problema concreto, nombre de equipo,
alcance del MVP, stack, fuentes de datos, demo y presentación.

Las fuentes públicas pueden cambiar. Mantener la fecha de consulta y registrar
en la bitácora cualquier nueva indicación de la organización o del participante.
