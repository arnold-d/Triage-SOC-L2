# Plan de desarrollo: 2 días

Cada fase termina igual: pruebas en verde, demostración en el navegador al usuario, entrada en `docs/PROGRESO.md` y commit local. **No pasar a la siguiente fase sin el visto bueno del usuario.** Marca cada fase como hecha aquí con `[x]`.

Punto de partida: `app/triage-soc-l2.html` (fases 1–2 hechas) y su código en `app/src/` (`engine.js`, `app.template.html`, `build.py`, `test_engine.js`, `sample.json`).

| Día | Fases | Resultado al final del día |
|---|---|---|
| 1 | 2.5 Reestructurar · 2.6 Generador y prueba de generalización · 3 Dashboard | App portable sin build, motor validado con datos que no ha visto, dashboard |
| 2 | 4 IA · 5 Informes en PDF · 6 Empaquetado y portabilidad · 7 Repositorio | PDF final listo para el video; repositorio preparado (el push lo decide el usuario) |

Si el día 1 se alarga, la fase 3 pasa al día 2 y la 7 se reduce al README.

---

## [x] Fase 2.5: Reestructurar (día 1, unas 2 h)

Objetivo: pasar de "plantilla + build.py" a la estructura de `CLAUDE.md`, sin cambiar lo que el usuario ve.

1. `git init` en la carpeta del proyecto con este `.gitignore`, validado por Claude Code el 02-11-2026 en un repositorio de prueba:
   ```
   *.xlsx
   *.mp4
   *.m4a
   *.local.js
   sample.json
   legacy/
   _claude_*
   node_modules/
   datasets/*
   !datasets/demo_publico.xlsx
   CLAUDE.local.md
   docs/local/
   entrega/
   ```
   Comprobar con `git status` y `git check-ignore -v` que no entra nada del cliente.
2. Mover el código actual a `legacy/` como referencia y crear `app/` con la estructura de `CLAUDE.md`: separar CSS, motor, parser y cada pestaña en su propio archivo.
3. SheetJS incrustado en `app/vendor/xlsx.full.min.js`. Usar la **última versión estable de la distribución oficial** (`cdn.sheetjs.com`), no la 0.18.5 de npm: verificar en su web si las versiones antiguas tienen vulnerabilidades al leer archivos manipulados (la app abre Excel de terceros). Anotar en PROGRESO la versión elegida y el motivo.
4. Fuentes: Google Fonts con alternativas del sistema. Sin internet, la app debe verse bien igualmente.
5. `sample.local.js`: script local que genera ese archivo desde el Excel del cliente (`window.SOC_SAMPLE = {name, cols, rows}`). El botón "Abrir el export del cliente" solo aparece si existe.
6. `ai.config.example.js` con la forma del objeto de configuración (proveedor `none`) y carga opcional de `ai.config.local.js`.
7. `tests/test_cliente.js`: el actual `test_engine.js`, leyendo el Excel o `sample.local.js`. Si no encuentra los datos, sale con un aviso, no con error.
8. Borrar `build.py` y `app/triage-soc-l2.html` del flujo (pueden quedar en `legacy/`).

Aceptación:
- [x] `app/index.html` abierto con doble clic (`file://`) en Windows carga el Excel arrastrado y muestra Registros y Análisis igual que antes.
- [ ] Funciona sin internet (probar desconectando la red). **No probado, descartado por el usuario** (02-11-2026): SheetJS ya está incluido en `vendor/`.
- [x] `node tests/test_cliente.js` → 6 incidentes + 2 a validar.
- [x] `git status` no muestra ni el Excel, ni `sample.local.js`, ni videos.

## [x] Fase 2.6: Generador sintético y prueba de generalización (día 1, unas 3 h)

Objetivo: **demostrar con datos que el motor no depende del dataset del cliente.** Es una prueba clave para el video y para GitHub.

### `tools/generar_dataset.js`

Uso: `node tools/generar_dataset.js --seed 42 --eventos 1500 --out datasets/sint_42.xlsx`. Genera el `.xlsx` y `sint_42.truth.json` con la verdad de referencia. Usa `app/vendor/xlsx.full.min.js` en Node (sin npm). Es determinista por semilla.

Variación aleatoria por semilla:
- Dominio (`CORP`, `ACME`, `NORDBANK`…), usuarios generados de listas de nombres, hosts con otro esquema de nombres (p. ej. `PC-1043`, `SRV-FIN-02`) y subred interna distinta (10.x, 172.16–31.x, 192.168.x).
- IPs externas aleatorias: rangos de documentación (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) y otras públicas.
- Fecha, hora de inicio, duración (4–10 h) y volumen (300–5000 eventos).
- Formato: orden de columnas barajado, una columna extra irrelevante y timestamp como texto ISO, como fecha nativa de Excel o como `dd/mm/aaaa hh:mm:ss`.

Tráfico normal, con proporciones parecidas al Excel del cliente:
- 4624/4625/4634/4688/4663/5140/5156/7036, más proxy y HTTP benignos.
- 4672 legítimos de cuentas administrativas.
- Fallos de contraseña sueltos.

Escenarios de ataque. Se insertan al azar entre 3 y 7 por dataset, cada uno con actor y momento aleatorios:
- Password spraying, con o sin éxito, seguido de privilegios especiales.
- Fuerza bruta RDP con éxito + PowerShell codificado + reconocimiento + movimiento lateral + staging + conexión saliente.
- Precursor de ransomware: lectura masiva de ficheros + `vssadmin delete shadows`.
- Exfiltración: compresión + subidas grandes a una IP externa.
- Persistencia: tarea programada o servicio en ruta sospechosa + beacon periódico.
- Webshell: peticiones con `cmd=` + proceso del servidor web lanzando una shell.
- Inicio de sesión fuera de horario desde IP externa.
- Nombres parecidos (cuenta u host) → debe quedar "a validar", no como incidente.

Casi-ataques benignos que **no** deben generar incidentes:
- Usuario que falla la contraseña 2 veces y entra.
- Usuario interno que falla la contraseña 3–4 veces y entra.
- Subida pequeña (menos de 50 MB).
- Tarea programada legítima en `C:\Windows\System32`.
- Copia de seguridad nocturna legítima.
- Administrador con 4672 habitual.
- Escaneo web leve con 3–4 errores 404.

`*.truth.json`: lista de escenarios insertados con tipo, categorías esperadas, criticidad mínima esperada, actor y Log_ID clave; y lista de casi-ataques.

### `tests/test_generalizacion.js`

Genera N datasets (por defecto 30 semillas) en memoria, ejecuta el motor y compara con la verdad:
- **Cobertura**: cada escenario insertado aparece en algún incidente que contiene sus Log_ID clave, con la categoría esperada y al menos la criticidad esperada.
- **Falsos positivos**: ningún incidente formado solo por eventos normales o casi-ataques.
- Informe por consola: tabla por tipo de escenario (detectados / insertados) y falsos positivos por semilla. Sale con código ≠ 0 si algo falla.

### Ajuste del motor

Lo más probable es que fallen cosas; para eso sirve la prueba. Puntos que ya sabemos frágiles:
- Regla "fallos repetidos usuario + IP seguidos de éxito": con IP interna y 3 fallos puede marcar typos legítimos. Decidido el 02-11-2026: umbral de 5 para IP interna y 3 para IP externa.
- Persistencia con ruta no sospechosa → hoy crea un hallazgo Medio y, con él, un incidente. Debería quedar "a validar".
- Lectura masiva de ficheros por una cuenta de copia de seguridad legítima.
- Detección de texto en inglés (`failed to log on`): apoyarse primero en el Event_ID y luego en el texto.
- **Regla "inicio fuera de horario"** (engine.js, en torno a la línea 119): hoy cada inicio de sesión correcto fuera de 7:00–20:00 crea un hallazgo Bajo y, con él, un incidente. Con los horarios aleatorios de los sintéticos dará falsos positivos. Por sí solo no debe crear incidente: que solo sume a otros hallazgos del mismo actor, o que quede como "a validar".
- **Fechas `dd/mm/aaaa`**: hoy se descartan sin avisar. El parser debe interpretarlas (y las fechas nativas de Excel) e informar en pantalla de las filas con fecha ilegible, sin perderlas en silencio.
- **"Exfiltración" sin volumen**: el título del incidente solo dice "exfiltración" si hay evidencia de subida (bytes salientes). Una conexión saliente aislada tras el staging → "posible exfiltración", y valorar que ese hallazgo sea Alto en lugar de Crítico. Con el Excel del cliente, INC-02 pasa a llamarse "…y posible exfiltración" (ver `CLAUDE.local.md`).

Corregir con reglas genéricas, **nunca** con valores del dataset. Después de cada cambio deben pasar las dos pruebas.

Aceptación:
- [x] `node tests/test_generalizacion.js` → 100 % de cobertura en todos los tipos de escenario y 0 incidentes falsos en 30 semillas.
- [x] `node tests/test_cliente.js` sigue dando 6 + 2.
- [x] Un dataset sintético (`datasets/demo_publico.xlsx`) cargado en la app muestra sus incidentes correctamente. Ese archivo sí puede ir a GitHub como ejemplo público; añadir una excepción al `.gitignore` solo para él.

## [x] Fase 3: Dashboard (día 1, unas 2–3 h)

Pestaña **Dashboard**, entre Análisis e Informe. Gráficos en SVG propio, con colores de los tokens y en ambos temas.

- KPIs: incidentes por criticidad, hallazgos, eventos implicados / total, cuentas comprometidas, IP externas implicadas.
  Nota: `analyze` no devuelve hoy la lista de cuentas comprometidas (variable `compromised` en `engine.js`). Exponerla en el resultado y repetir las dos pruebas.
- Incidentes por criticidad (barras) y hallazgos por categoría (las 6 del reto).
- Actividad en el tiempo: histograma por intervalos con eventos normales y eventos marcados diferenciados, y la franja de cada incidente.
- Top de hosts, cuentas e IP implicadas en incidentes.
- Técnicas MITRE observadas.
- Interactivo: clic en una barra o elemento → filtra Registros o salta al incidente en Análisis. Tooltips al pasar el ratón.
- Bloque "Qué encontramos" con una frase por incidente (plantilla). En la fase 4 se sustituye por la explicación de la IA.

Aceptación:
- [x] Con el Excel del cliente y con 2 datasets sintéticos, las cifras del dashboard coinciden con las de Análisis.
- [x] Sin scroll horizontal a 400 px y legible en tema claro y oscuro.

## [x] Fase 4: IA independiente del proveedor (día 2, unas 3 h)

**Decisión del usuario (04-11-2026)**: Ollama no es viable en el equipo del autor (con la GPU ocupada, por ejemplo grabando, no llega a responder). La IA se usa por API: la configuración del autor es Anthropic con `claude-haiku-5-5`, en `app/ai.config.local.js`. Ollama queda como adaptador opcional, no como predeterminado; la app sigue funcionando entera sin IA. Con Anthropic la app funciona abierta con doble clic, así que el lanzador `iniciar` solo hace falta para Ollama. Se mantienen el streaming, una petición a la vez y el límite por inactividad.

1. **Primero, verificar el entorno del autor** y anotarlo en PROGRESO:
   - `ollama --version` y `ollama list`.
   - Probar 1–2 modelos de 7–8B (p. ej. qwen2.5:7b, llama3.1:8b) que quepan en 6 GB de VRAM (GTX 1660 Super). Elegir por calidad del español y tiempo de respuesta medidos. Elegido `qwen2.5:7b` (ver PROGRESO).
   - Comprobado el 02-11-2026: abierto como `file://`, Ollama rechaza `Origin: null` con 403. Decisión del usuario: no usar `OLLAMA_ORIGINS=*`, que expone Ollama a cualquier web. La app se abre con `iniciar`, que sirve `app/` en `http://127.0.0.1:8765` (`tools/servir.js`). Con doble clic funciona sin IA y, al elegir Ollama, avisa: "Para usar Ollama, abre la app con iniciar".
2. `js/ai.js`: interfaz `chat(messages, {temperature, maxTokens, signal}) → texto` con adaptadores `none`, `ollama` (API nativa `/api/chat`), `openai-compatible` (URL base + modelo + clave opcional) y `anthropic` (opcional).
3. Panel **Ajustes de IA**: proveedor, URL, modelo, clave, botón "Probar conexión" e indicador de estado. Se guarda en `localStorage`; `ai.config.local.js` puede dar valores por defecto.
4. Usos, con prompts en español y temperatura baja:
   - **Explicar incidente**: recibe el incidente, sus hallazgos y como máximo unas 40 filas de evidencia; devuelve una explicación clara que cita los Log_ID entre corchetes.
   - **Sugerencias del analista IA**: recibe estadísticas agregadas de los eventos NO marcados y propone qué más revisar, citando Log_ID. Se muestra como "Sugerencia de la IA, no verificada por reglas".
   - **Redacción de informes** (fase 5).
5. **Validador de citas**: extraer Log_ID e IP del texto de la IA y comprobar que existen en el archivo cargado (y, para explicaciones, en la evidencia del incidente). Mostrar "N citas verificadas / M no encontradas" y resaltar las no encontradas.
6. Errores: tiempo de espera, IA no disponible o respuesta vacía → mensaje claro y uso de la plantilla.

Aceptación:
- [x] Con `none`, la app funciona entera.
- [x] Con Ollama en el equipo del autor, cada incidente del cliente tiene explicación y el validador muestra sus citas.
- [x] Una cita inventada a propósito (prueba manual) aparece marcada como no encontrada.
- [x] Ninguna clave ni configuración local en `git status`.

## [x] Fase 5: Informes en PDF (fusiona las antiguas fases 5 y 6; día 2, unas 3 h)

**Decisión del usuario (04-11-2026)**: los informes son archivos PDF. Se generan con pdfmake incluido en `app/vendor/`, sin diálogo de impresión, igual en Windows y Linux.

Pestaña **Informe**:
- Campos de analista y cliente, y fecha del informe.
- Casilla **"Revisado por el analista"**, que exige el nombre; el nombre y la revisión aparecen en la portada.
- Dos botones que descargan `Informe_Ejecutivo_<fecha>.pdf` e `Informe_Tecnico_<fecha>.pdf`. Solo se activan con el informe revisado y cuando la IA no está generando texto.

Contenido, con plantillas a partir del motor:
- **Informe ejecutivo** ("en español ejecutivo", sin jerga): qué pasó, nivel de riesgo global, impacto para el negocio, incidentes en una tabla sencilla y hasta 5 decisiones prioritarias.
- **Informe técnico**, con las 8 secciones del reto: resumen ejecutivo, hallazgos identificados, explicación técnica con MITRE, evidencias en los logs (Log_ID y extracto), criticidad y justificación con la tabla de criterios, posible impacto, plan de acción (investigar, contener, remediar) por incidente y recomendaciones generales. Anexo de metodología (reglas, umbrales, cómo se valida la IA) y anomalías a validar.
- Las cifras, tablas, evidencias, MITRE y criticidad salen siempre del motor. Los planes de acción, el impacto y las decisiones son plantillas por tipo de incidente rellenadas con sus actores reales.
- La IA solo redacta el resumen ejecutivo (una llamada; se comprueba que sus cifras e incidentes estén en los datos del motor). El técnico reutiliza las explicaciones ya guardadas. Todo texto de IA va marcado y es editable antes de exportar.

Aceptación:
- [x] Ambos PDF completos sin IA y con la IA del autor.
- [x] Todo Log_ID del informe existe en el archivo cargado (comprobación automática visible).
- [x] PDF correcto en Windows y en Linux: tildes, tablas sin cortes feos y saltos de página limpios (Linux: lo comprueba el usuario en la fase 6).
- [x] Generar los PDF finales con el Excel del cliente y guardarlos en `entrega/` (fuera de git).

## [ ] Fase 6: Empaquetado y portabilidad (día 2, unas 2 h)

**Decisión del usuario (04-11-2026)**, tras probar en Linux: `iniciar.sh` pedía Node y no abría nada, lo que confunde aunque la app no lo necesite. Licencia MIT para el código propio. El zip incluye también `iniciar` y `tools/servir.js`, para poder usar Ollama.

- `ABRIR_AQUI.html` en la raíz, que lleva a `app/index.html`. El README empieza por cómo abrirla sin ejecutar nada.
- `iniciar.sh` e `iniciar.bat`: sin Node, abren `app/index.html` y explican que Node solo hace falta para Ollama.
- Zip de entrega (`tools/empaquetar.js`, desde HEAD y con una lista cerrada de archivos): la app, el README, `LICENSE`, `iniciar`, `tools/servir.js` y `datasets/demo_publico.xlsx`. Sin datos del cliente ni archivos `.local`. Con su SHA-256, listo para un Release de GitHub.
- README: apartado de librerías de `vendor/` con versión, licencia y SHA-256, y nota de que ningún script es necesario. Licencias de terceros junto a cada librería (SheetJS Apache-2.0, pdfmake MIT, Roboto OFL 1.1).
- Dejar claro (README, Ajustes y `ai.config.example.js`) que sin clave de API todo funciona con plantillas.

Aceptación (desde el zip descomprimido, en una ruta con espacios y tildes, sin Node):
- [x] Windows · Edge: abrir `ABRIR_AQUI.html`, cargar `demo_publico.xlsx`, ver dashboard y descargar los dos PDF.
- [x] Windows · Chrome: lo mismo.
- [ ] Linux · Firefox: lo mismo (lo prueba el usuario).
- [ ] Linux · Chromium: lo mismo (lo prueba el usuario).
- [ ] `iniciar` sin Node abre la app en Windows y en Linux (probado el aviso en Windows y en Git Bash; falta ver que se abre el navegador).
- [x] El zip no contiene datos del cliente ni archivos `.local`, y su SHA-256 coincide.

## [ ] Fase 7: Repositorio listo para GitHub (día 2, unas 1 h)

**Preparada el 04-11-2026, sin publicar.** README final, captura con `demo_publico.xlsx`, revisión de todo el historial (todos los commits y objetos). El usuario publica desde VS Code como repositorio **privado** y crea el Release v1.0 con el zip y su SHA-256.

- `README.md`: qué hace, captura del dashboard, cómo usarla (abrir `index.html`), cómo conectar una IA (cada proveedor) y "en el entorno de pruebas del autor se usó Ollama con el modelo X", cómo ejecutar las pruebas y el generador, arquitectura y principios (reglas deterministas + IA validada). Enlaces al video y al PDF, que pone el usuario.
- Licencia: MIT (decidida en la fase 6). Publicar el zip de la fase 6 como Release con su SHA-256.
- Revisión final de `git status` y del historial: ningún dato del cliente (tampoco en `docs/` ni en `CLAUDE.md`), clave ni archivo grande. Buscar en lo que se va a subir IPs, cuentas y Log_ID del cliente, por ejemplo con `git grep` y los valores de `CLAUDE.local.md`.
- **No hacer push** sin que el usuario lo pida.
