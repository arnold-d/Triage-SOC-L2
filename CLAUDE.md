# Triage SOC L2: reto final del bootcamp

App web que carga un Excel exportado de un SIEM, detecta y correlaciona incidentes con reglas, clasifica su riesgo (Crítico, Alto, Medio, Bajo), usa IA para explicar y redactar, y exporta un **informe ejecutivo** y un **informe técnico** a PDF.

- **Entrega: domingo 8 de noviembre de 2026.** El desarrollo debe cerrarse en 2 días.
- Plan, tareas y criterios de aceptación: `docs/PLAN.md`. **Léelo al empezar cada sesión** y trabaja por la primera fase que no esté marcada como hecha.
- Requisitos completos del reto (diapositivas + audio del instructor): `docs/REQUISITOS.md`.
- Bitácora: `docs/PROGRESO.md`. Al cerrar cada fase, añade una entrada con lo que cambió, cómo se ve en pantalla, el resultado de las pruebas y lo pendiente. Otro chat la lee para escribir el guion del video.

## Cómo trabajar con el usuario

- Escribe siempre en español. El usuario viene del "vibe coding" y prefiere una cosa a la vez: objetivo → probar → siguiente.
- Quiere que todo se contraste con los datos. No des nada por hecho: ejecuta, mide y muestra el resultado.
- Al terminar cada fase: ejecuta las pruebas, enséñale cómo verlo en el navegador, haz un commit local y espera su visto bueno antes de seguir.
- Si algo del plan no cuadra con lo que encuentras en el código o los datos, dilo antes de cambiar el plan.

## Reglas que no se rompen

1. **Rigor analítico: no inventar hallazgos.** Toda conclusión cita Log_ID reales del archivo cargado.
2. **Nada fijo del dataset en el código**: ni IPs, ni usuarios, ni hosts, ni Log_ID, ni fechas. Solo reglas genéricas con umbrales en `cfg`. Si una regla necesita un valor del Excel del cliente para acertar, está mal hecha.
3. **La IA no decide qué es un incidente.** Lo deciden las reglas del motor. La IA explica, redacta y sugiere; la app valida que cada Log_ID o IP que cite exista y marca lo que no.
4. **La app funciona completa sin IA** (proveedor `none`, con plantillas). **Nunca usar `OLLAMA_ORIGINS=*`**: expone Ollama a cualquier web visitada. Para Ollama, la app se abre con `iniciar`.
5. **Multiplataforma**: debe funcionar igual en Windows y Linux. Usa `path.join` en Node, nada de comandos exclusivos de un shell y archivos siempre en UTF-8.
6. **Nada sensible en git**: ni el Excel del cliente, ni datos derivados de él (tampoco IPs, cuentas o Log_ID suyos en la documentación), ni claves o tokens, ni la configuración local de IA, ni videos o audios. Lo específico del cliente va en `CLAUDE.local.md` o en `docs/local/`, ambos ignorados por git.
7. Tras cualquier cambio en el motor, deben pasar **las dos pruebas**: `node tests/test_cliente.js` (6 incidentes y 2 anomalías a validar con el Excel del cliente) y `node tests/test_generalizacion.js` (datasets sintéticos). Las cifras del dashboard se comprueban con `node tests/test_dashboard.js`.

## Arquitectura (sin paso de build)

```
app/
  index.html               interfaz; con doble clic funciona sin IA; con Ollama, abrir con iniciar
  css/app.css
  js/engine.js             motor de reglas → SOCEngine.analyze(rows, cfg)
  js/parser.js             lectura del .xlsx y normalización de columnas
  js/dashboard-data.js     cifras del dashboard a partir del resultado del motor
  js/ui-*.js               pestañas: registros, análisis, dashboard, informe
  js/ai.js                 adaptadores de IA: none, ollama, openai-compatible, anthropic
  js/report.js             informes ejecutivo y técnico + vista de impresión/PDF
  vendor/xlsx.full.min.js  SheetJS incrustado (funciona sin internet)
  ai.config.example.js     ejemplo                  → sí va a git
  ai.config.local.js       configuración del autor  → NO va a git
  sample.local.js          Excel del cliente en JS  → NO va a git
iniciar.bat, iniciar.sh    lanzadores de tools/servir.js
tools/servir.js            sirve app/ en 127.0.0.1:8765 y abre el navegador, sin dependencias
tools/generar_dataset.js   genera Excel sintéticos + verdad de referencia (.truth.json)
tests/test_cliente.js      prueba con el Excel del cliente (solo local)
tests/test_generalizacion.js  N semillas sintéticas: cobertura y falsos positivos
tests/test_dashboard.js    cuadra las cifras del dashboard con las del motor
tests/test_ia.js           adaptadores de IA, errores, validador de citas y prompts, sin proveedor real
tests/test_servir.js       servidor local: solo 127.0.0.1, sin salir de app/, Host comprobado
docs/                      PLAN, REQUISITOS, PROGRESO
legacy/                    versión anterior (fase 1–2) como referencia
```

Scripts clásicos con `<script src>` (no módulos ES, que fallan en `file://`). Los archivos `*.local.js` se cargan si existen; si no, la app sigue funcionando.

## Datos del cliente

Todo lo específico del Excel del cliente (columnas, IPs, cuentas, Log_ID y resultado esperado) está en `CLAUDE.local.md`, que se carga junto a este archivo y **no va a git**. Este `CLAUDE.md` sí va al repositorio, así que no debe contener datos del cliente.

## Principios del motor

- Cada hallazgo tiene: `cat, rule, mitre, sev, title, detail, why, evidence[Log_ID], actors, start, end`.
- Incidentes = hallazgos agrupados por actor compartido (IP externa, cuenta, destino) dentro de `incidentGapMin`. No se agrupa por host destino ni por las cuentas víctima de un spraying.
- IDs de incidente en orden cronológico; las tarjetas se muestran ordenadas por criticidad.

## Diseño

Azul marino y naranja, como el enunciado. Fuentes IBM Plex Sans, Plex Sans Condensed y JetBrains Mono, con alternativas del sistema si no hay internet. Colores en tokens CSS con tema claro y oscuro (`--risk-*`, `--sev-*`). Debe verse bien a 400 px de ancho. Gráficos en SVG propio, sin librerías pesadas.
