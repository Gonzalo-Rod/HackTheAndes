# Instrucciones del repositorio

## Contexto

Antes de trabajar, lee `inicio/README.md` y las entradas recientes de
`inicio/AVANCES.md`. El track elegido es **Clima y Territorio** (`environmental`).
La rúbrica vigente es la comunicada por el participante: 30% complejidad técnica,
25% funcionamiento, 20% calidad técnica, 15% problema e impacto y 10% claridad.
No la sustituyas por la rúbrica anterior que todavía aparece en la guía web.

## Registro automático durante las sesiones

Actualiza `inicio/AVANCES.md` sin que el usuario tenga que pedirlo, al terminar
una tarea con cambios relevantes, tomar una decisión de alcance o arquitectura,
verificar una demo, recoger evidencia de usuarios o encontrar un bloqueo.
Registra también el resultado antes de cerrar la sesión. Agrupa cambios menores
en una entrada útil y evita duplicados. No es necesario registrar consultas sin
hallazgos ni cada edición de un archivo.

- Añade entradas al final; conserva el historial. Si corriges un dato, deja
  constancia de la corrección.
- Usa fecha y hora reales de `America/Lima` con zona `-05:00`.
- Cada avance debe ser un único párrafo breve y puntual, de 2 a 4 frases,
  precedido por fecha y un título corto. Cuenta qué cambió y el siguiente paso;
  añade una decisión, evidencia o bloqueo solo cuando sea relevante. Evita
  listas de campos, secciones y explicaciones extensas.
- Distingue resultados comprobados, hipótesis y pendientes. No inventes pruebas
  con usuarios, métricas, despliegues ni funcionalidades completadas.
- Enlaza archivos, commits o demos cuando existan. No crees commits solamente
  para llenar la bitácora.
- No guardes secretos, códigos de beneficios, credenciales ni datos personales.

Este mecanismo funciona cuando un agente que respeta este archivo trabaja en el
repositorio. No existe un proceso en segundo plano: los cambios hechos fuera de
esas sesiones requieren su propia entrada.

## Avances para la organización

El registro local es automático; publicar mediante `andes` requiere una
instrucción del usuario que autorice esa publicación, incluso una autorización
permanente para la sesión. No publiques solamente por haber actualizado el MD.

Cuando se autorice, revisa el historial remoto, prepara un resumen factual con
`inicio/PLANTILLA_AVANCE.md` y publica únicamente el avance nuevo. Verifica el
contenido devuelto por el CLI antes de registrar que se publicó. Si una escritura
queda en estado incierto, consulta el historial antes de reintentar.
