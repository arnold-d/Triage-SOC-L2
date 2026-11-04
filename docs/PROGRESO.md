# Bitácora de progreso

Una entrada por fase, la más reciente arriba. Cada entrada incluye: fecha · qué cambió · **cómo se ve en pantalla** (para el guion del video) · resultado de las pruebas · pendientes.

---

## 2026-11-04 · v1.1: resumen ejecutivo sin duplicar

Tras revisar el PDF combinado, el usuario detectó dos fallos:
- **Resumen duplicado**: "Qué pasó" (ejecutivo) y la sección 1 del técnico mostraban el párrafo de plantilla y, debajo, el de IA, casi iguales. Ahora, si hay resumen de IA, sustituye al de plantilla; si no, se usa la plantilla. Nunca salen los dos. En la pestaña Informe hay un botón "Usar la plantilla en su lugar" para descartar el de IA.
- **Etiqueta engañosa**: el resumen de IA decía "0 citas verificadas, 0 no encontradas", porque no cita Log_ID. Ahora dice "cifras comprobadas con el motor" (o "cifras no comprobadas en los datos del motor" si la comprobación falla).
- Pruebas: `test_pdf` comprueba en cada dataset que hay un solo resumen, que no dice "0 citas" y que lleva la etiqueta de cifras (214 de 214). Las demás siguen en verde.
- PDF finales regenerados en `entrega/` sin llamar a la IA (mismos textos revisados y la misma edición de INC-05), sin nombre de cliente: ejecutivo 2 páginas, técnico 17 y combinado 19. En el texto de los PDF: 0 párrafos de plantilla del resumen, un resumen de IA por informe con "cifras comprobadas con el motor", ningún "0 citas verificadas"; los 99 Log_ID existen.
- Zip `entrega/triage-soc-l2-v1.1.zip`, 30 archivos, 1.417 KB, SHA-256 `6cf7774c2d0fa8a30d787de010fb6890d9fc639adff1b7f37223fd7c7474ba7c`. Matriz repetida desde el zip descomprimido en una ruta con espacios y tildes: Edge y Chrome iguales que en v1.0, sin errores de JavaScript; revisión contra el Excel del cliente: 0 coincidencias. El zip v1.0 no se publica.

## 2026-11-04 · Fase 7: repositorio preparado (sin publicar)

- **README final**: qué hace, captura del dashboard (`docs/img/dashboard.png`, hecha con `datasets/demo_publico.xlsx` desde una copia del zip sin configuración de IA, nunca con el Excel del cliente), enlaces al video y al PDF como marcadores `RELLENAR_ENLACE_VIDEO` y `RELLENAR_ENLACE_PDF`, y sección "Cómo se construyó" con principios, fases, pruebas y uso de IA (en la app y en el desarrollo).
- **Revisión de todo el historial** (`git rev-list --objects --all`: 12 commits, 114 versiones de archivo, también los mensajes de commit), contra 821 valores del Excel del cliente y de `CLAUDE.local.md`:
  - Datos del cliente: ninguna IP, cuenta, equipo ni Log_ID suyos. Solo coinciden valores genéricos: nombres de procesos de Windows (`powershell.exe`, `vssadmin.exe delete shadows /all /quiet`, `cmd.exe /c whoami`), la cuenta integrada `IIS APPPOOL\DefaultAppPool`, `/admin/` y los identificadores `INC-01`…`INC-06`, que genera el motor para cualquier archivo.
  - Claves: la clave de `ai.config.local.js` (cargada sin imprimirla) no aparece en ningún objeto, y no hay patrones de clave (`sk-ant-`, `sk-`, `AKIA`, `ghp_`).
  - Archivos grandes: ninguno supera 1 MB (los mayores son las librerías de `vendor/` y la demo, de 0,8 a 0,95 MB). El repositorio ocupa unos 2 MB.
  - Rutas: ningún `.local`, `CLAUDE.local.md`, video, audio, `entrega/` ni `legacy/` en ningún commit. Autor y committer de todos los commits: `arnold_d` con el correo noreply de GitHub.
- **Pendiente**: el usuario publica el repositorio privado y crea el Release v1.1; rellenar los enlaces del README.

## 2026-11-04 · Fase 5 cerrada: PDF finales

- **Visto bueno del usuario a la fase 5** el 04-11-2026.
- **PDF finales** en `entrega/` (fuera de git), con el Excel del cliente, analista Arnold Duarte, sin nombre de cliente, IA del autor: `Informe_Ejecutivo_2026-11-04.pdf` (2 páginas), `Informe_Tecnico_2026-11-04.pdf` (17) y `Informe_Ejecutivo_y_Tecnico_2026-11-04.pdf` (19, para el formulario). Todos los Log_ID del informe existen; el resumen ejecutivo pasó la comprobación de cifras e incidentes. Coste: 7 llamadas, unos 0,011 $ (más 0,009 $ de una primera tanda descartada).
- **La IA señaló tres datos engañosos del prompt**, no del motor: "IP: ninguna" cuando el incidente solo tiene IP internas, "30 de 35 eventos" sin decir que era un extracto, y 4 citas de un hallazgo con 5 evidencias (parecía que la regla omitía una). El prompt dice ahora "IP señaladas por las reglas", "Extracto: n de los N eventos… no digas que faltan" y "(y n más)". `test_ia` tiene 3 comprobaciones nuevas (67 en total).
- **Corrección del analista**: la explicación de INC-05 terminaba con una frase falsa (que los registros no vinculan el binario con el servicio, cuando el servicio apunta a ese binario). Se eliminó solo esa frase y el PDF la marca como "editado por el analista". El resto de textos de IA se revisó contra los registros.

## 2026-11-04 · Fase 6: empaquetado y portabilidad (pendiente de la prueba en Linux)

- **Para grabar** (sustituye a la de la fase 5): graba desde la carpeta de trabajo, no desde el zip, porque el zip no lleva `ai.config.local.js` y la clave no debe copiarse a otro archivo. Abre `ABRIR_AQUI.html` con doble clic (con Anthropic no hace falta `iniciar`); en Ajustes de IA comprueba que la configuración activa es "archivo ai.config.local.js" y pulsa "Probar conexión"; genera las explicaciones y el resumen ejecutivo **antes** de grabar, porque se guardan durante la sesión del navegador; en la pestaña Informe escribe analista y cliente, marca "Revisado por el analista" y descarga los dos PDF. Para mostrar que no hace falta instalar nada, enseña aparte el zip descomprimido, sin IA, con `datasets/demo_publico.xlsx`.
- **Motivo**: en Linux, `iniciar.sh` pedía Node y no abría nada, lo que confunde aunque la app no lo necesite.
- **Qué cambió**:
  - `ABRIR_AQUI.html` en la raíz: redirige a `app/index.html` y, si no, muestra un enlace.
  - `iniciar.sh` e `iniciar.bat`: con Node, igual que antes; sin Node, abren `app/index.html` (`xdg-open` en Linux, `open` en macOS, `start` en Windows) y explican que Node solo hace falta para Ollama. Si no pueden abrirlo, muestran la ruta del archivo.
  - Licencia MIT (`LICENSE`, decisión del usuario). Licencias de terceros junto a cada librería: SheetJS Apache-2.0 (`xlsx.LICENSE.txt`, descargada de `cdn.sheetjs.com`), pdfmake MIT y **Roboto con SIL OFL 1.1** (`Roboto.OFL.txt`). Que Roboto es OFL y no MIT se comprobó leyendo la tabla `name` de la fuente: la OFL exige acompañar la fuente con su licencia.
  - SheetJS: el `xlsx.full.min.js` incluido coincide byte a byte con el de `cdn.sheetjs.com/xlsx-0.20.3` (mismo SHA-256).
  - `tools/empaquetar.js`: zip con `git archive` desde HEAD, lista cerrada de archivos y `core.autocrlf=false`; rechaza `.local`, `docs/`, `tests/`, `CLAUDE*` y cualquier `.xlsx` que no sea la demo. El resultado es reproducible: mismo contenido, mismo SHA-256. `iniciar.sh` conserva el permiso de ejecución dentro del zip.
  - README: empieza por cómo abrirla sin instalar nada, deja claro que sin clave de API todo funciona con plantillas y añade la tabla de librerías (versión, licencia y SHA-256) con la nota de que ningún script es necesario. Ajustes y `ai.config.example.js` también lo dicen.
- **Zip v1.0 definitivo** (tras el README de la fase 7, con la captura): `entrega/triage-soc-l2-v1.0.zip`, 30 archivos, 1.416 KB. SHA-256 `d9dcbe117bae617b39f7a76c40df8617f6cdbb6eabc5f77dfa9d477fdb0331e2`. Repetidas con él la matriz de Edge y Chrome y la revisión contra el Excel del cliente: mismo resultado, sin errores de JavaScript. (El primer zip, sin la captura, tenía `2c5854ed…`.) Se genera desde el árbol de HEAD con la fecha del último commit que tocó sus archivos, así que los commits en `docs/` o `tests/` no cambian el hash (al principio usaba el commit y cambiaba con cada uno; corregido y comprobado). Revisión contra el Excel del cliente (774 valores de IP, cuenta, equipo y Log_ID): 0 coincidencias en los archivos de texto; en `demo_publico.xlsx` solo coinciden `-` y la cuenta integrada de Windows `IIS APPPOOL\DefaultAppPool`.
- **Matriz** (zip descomprimido con el Explorador en una carpeta `Prueba ñandú con espacios`, `file://`, sin IA):
  - Windows · Edge 156 y Chrome 156: `ABRIR_AQUI.html` redirige, la demo da 7 incidentes (igual que el motor en Node), dashboard, Ajustes dice que funciona sin IA, los botones de PDF esperan a la revisión, los 120 Log_ID del informe existen, y los dos PDF se descargan (32 KB y 117 KB, válidos). Sin errores de JavaScript; la consola solo muestra que faltan `sample.local.js` y `ai.config.local.js`, que son opcionales.
  - `iniciar.bat` sin Node (PATH sin Node), desde la ruta con tildes: muestra el aviso y llama a `start`; no pude comprobar desde aquí que se abriera la pestaña en el navegador predeterminado.
  - `iniciar.sh` sin Node, en Git Bash: muestra el aviso; con un `xdg-open` simulado lo llama con la ruta completa con tildes; sin él, muestra la ruta.
  - **Linux · Firefox y Chromium: sin probar** (no hay Linux ni Firefox en este equipo). Los prueba el usuario.
- **Pruebas**: todas en verde (generalización, dashboard 144, IA 64, informe 388, PDF 160, servidor 14, cliente).
- **Pendiente**: visto bueno del usuario; matriz en Linux.

## 2026-11-04 · Fase 5: informes en PDF (pendiente del visto bueno del usuario)

- **Para grabar** (ver la de la fase 6, que la sustituye): abre `app/index.html` con doble clic (con Anthropic no hace falta `iniciar`); en Ajustes de IA comprueba que la configuración activa es "archivo ai.config.local.js" y pulsa "Probar conexión"; genera las explicaciones y el resumen ejecutivo **antes** de grabar, porque se guardan durante la sesión del navegador; en la pestaña Informe escribe analista y cliente, marca "Revisado por el analista" y descarga los dos PDF.
- **Decisión del usuario**: las antiguas fases 5 (informes) y 6 (PDF) se fusionan. Los informes son archivos PDF generados en el navegador, sin diálogo de impresión.
- **Qué cambió**:
  - `js/report.js`: contenido de ambos informes solo a partir del motor. Ejecutivo: qué pasó, riesgo global, impacto, tabla de incidentes y hasta 5 decisiones. Técnico: las 8 secciones del reto y el anexo de metodología con los umbrales reales del motor. Planes de acción, impacto y decisiones son plantillas por tipo de incidente (webshell, ransomware, intrusión, exfiltración, persistencia, spraying, fuerza bruta, acceso externo) rellenadas con cuentas, equipos e IP reales.
  - Resumen ejecutivo con IA: una llamada con los hechos del motor, sin filas de log. Se comprueba que sus cifras y sus INC-xx estén en esos hechos. El técnico reutiliza las explicaciones guardadas.
  - `js/ui-informe.js`: pestaña Informe con analista, cliente y fecha, texto editable (las tablas del motor no), textos de IA marcados y revalidados al editarlos, y una franja que comprueba que todo Log_ID del informe exista.
  - "Revisado por el analista" exige el nombre y aparece en la portada; sin ello no se descarga. Los botones también esperan a que la IA termine: en una prueba, un PDF descargado mientras se redactaba el resumen salió sin él.
  - `js/pdf.js` con **pdfmake 0.3.12** en `vendor/` (MIT, publicada el 17-10-2026; la 0.3.13 tenía 10 días y se descartó). Integridad verificada contra el registro de npm. SHA-256: `pdfmake.min.js` `d69c826c…`, `vfs_fonts.js` `1483ed26…`. Elegida frente a jsPDF por sus tablas (cabecera repetida y salto de página) y porque incluye la fuente Roboto con tildes y eñes.
  - Roboto no tiene `→`, `←`, `✓` ni `⚠` (comprobado en su tabla de caracteres): `pdf.js` los sustituye y una prueba verifica que todo carácter de los PDF existe en la fuente.
- **En pantalla y en el PDF**: con el Excel del cliente, el ejecutivo ocupa 2 páginas y el técnico unas 17. Portada con cliente, fecha, analista, revisión y fuente; tablas con cabecera repetida; textos de IA con una barra naranja y la etiqueta "TEXTO DE IA · modelo · revisado por…".
- **Pruebas**: `test_informe` 388 de 388 (cliente, demo y 30 semillas); `test_pdf` 160 de 160 (PDF generados en Node, caracteres en la fuente, todos los Log_ID del informe presentes y existentes). En Edge con Anthropic real: los 84 Log_ID del informe existen, los botones se activan al revisar y los dos PDF se descargaron. Contra un servidor simulado: 9 peticiones lanzadas a la vez se atendieron de una en una.
- **Coste de la prueba con Anthropic** (`claude-haiku-5-5`, 0,10 $ por millón de tokens de entrada y 0,50 $ de salida): 10 llamadas (6 explicaciones, 1 sugerencia, 1 resumen ejecutivo y 2 explicaciones sueltas), 29.147 tokens de entrada y 23.658 de salida, unos **0,015 $** en total. La mayor parte de la salida es razonamiento interno del modelo: unos 2.000 tokens por llamada para 100–150 palabras visibles.
- **Pendiente**: visto bueno del usuario. Probar los PDF en Linux. Generar los PDF finales en `entrega/`.

## 2026-11-02 · Fase 4 (cerrada)

- **04-11-2026 · Problemas del visto bueno parcial**:
  - Consola: los `*.local.js` que faltan devolvían 404 en texto plano. `servir.js` responde ahora con un script vacío de tipo JavaScript. Para que lo use, hay que cerrar y volver a abrir `iniciar` si estaba en marcha.
  - Ajustes de IA indica de dónde sale la configuración ("archivo ai.config.local.js", "guardada en este navegador" o valores por defecto) y tiene un botón **Restablecer** que borra lo guardado en el navegador. La clave que viene del archivo no se copia al navegador y se muestra oculta.
  - INC-06 sin respuesta en 180 s: el log de Ollama muestra que el modelo procesaba el prompt a 12–17 tokens/s (unas 20 veces más lento de lo normal) con 1,0 GiB de VRAM y 3,7 GiB de RAM libres, mientras se grababa; en 3 minutos no terminó de leer el prompt. Además se cargaron dos modelos distintos en 20 s, señal de dos configuraciones a la vez.
  - Streaming en los tres proveedores (NDJSON en Ollama, SSE en los demás): el texto aparece mientras se genera. Límite por inactividad: hasta 5 minutos para el primer fragmento, porque mientras el modelo lee el prompt no envía nada, y 60 s sin texto después. Una sola petición a la vez para toda la app, con estado "En cola" y cancelación. Evidencia por incidente: 30 filas como máximo (antes 40).
  - Opción "Explicar los incidentes en segundo plano al cargar un archivo", desactivada por defecto porque usa la IA mientras se trabaja o se graba.
- **04-11-2026 · Medición de `qwen2.5:3b` frente a `qwen2.5:7b`** (6 incidentes y una sugerencia, código actual):
  - `qwen2.5:3b`: unos 60 tokens/s, 10–19 s por respuesta, primer token en 5–14 s, todo en GPU. Pero solo 9 citas en total y 5 de 7 respuestas sin ninguna: no cumple la regla de citar.
  - `qwen2.5:7b`: medición no válida. Con la GPU ocupada fue a 1,5 tokens/s (primer token en 93 y 222 s) y Ollama se apagó a las 10:51. En INC-02 saltó el límite de 60 s sin texto, como estaba previsto.
- **Decisión del usuario (04-11-2026)**: Ollama no es viable en este equipo. La IA pasa a Anthropic con `claude-haiku-5-5` por API; Ollama queda como adaptador opcional. Prueba real: funciona abierta con doble clic y con `iniciar`, así que el lanzador solo hace falta para Ollama. Los 6 incidentes se explicaron en 84 s con 57 citas verificadas y 0 no válidas; la sugerencia dio 14 verificadas y 2 con datos que no coinciden, marcadas.

- **Entorno del autor**: Ollama 0.40.13 instalado con winget. GTX 1660 Super de 6 GB, con unos 2 GB en uso por otros programas; el modelo elegido queda al 82 % en GPU y el resto en CPU.
- **Conexión**: abierta con doble clic, la app envía `Origin: null` y Ollama responde 403 (comprobado). `OLLAMA_ORIGINS=null` hace que Ollama no arranque (`panic: bad origin`), y `OLLAMA_ORIGINS=*` funciona pero admite a cualquier web, incluso métodos como DELETE. Decisión del usuario: no usar `OLLAMA_ORIGINS`, cuyo valor no se llegó a cambiar. `iniciar.bat` e `iniciar.sh` lanzan `tools/servir.js`, que sirve `app/` en `http://127.0.0.1:8765` y abre el navegador. Ollama admite ese origen por defecto y sigue rechazando webs ajenas. Con doble clic la app funciona entera sin IA y, al elegir Ollama, avisa: "Para usar Ollama, abre la app con iniciar". El motivo está también en el README.
- **Qué cambió**:
  - `js/ai.js`: `chat(...)` con adaptadores `none`, `ollama`, `openai-compatible` y `anthropic`, validador de citas, prompts en español y errores. Las líneas de log van marcadas como datos, no como instrucciones.
  - `js/ui-ia.js`: panel Ajustes de IA, "Explicar con IA", "Explicar los N incidentes" y "Sugerencias del analista IA".
  - Validador semántico: si la frase de una cita nombra una cuenta, un equipo o una IP, comprueba que coincidan con la fila y marca "con datos que no coinciden". La cuenta se revisa fila a fila; equipos e IP, frente a todas las filas citadas en la frase. Los rangos entre dos Log_ID reales se validan por sus extremos.
  - Regla de recurso sensible: reconoce también el recurso en el detalle de los 5145 (`Recurso\\archivo`). El generador incluye ahora ese caso en el escenario RDP.
  - Para la demo: las explicaciones se guardan durante la sesión del navegador y se revalidan al abrir el mismo archivo. "Probar conexión" deja el modelo cargado, y cada petición lo mantiene 30 minutos.
  - `tools/servir.js`: solo `127.0.0.1`, solo `app/`, solo GET y HEAD, y comprueba `Host` para evitar DNS rebinding. Con `tests/test_servir.js`.
- **La IA encontró una evidencia que las reglas no veían**: la primera sugerencia de `qwen2.5:7b` señaló un acceso a un fichero sensible por 5145 que no estaba en las evidencias de un incidente, porque la regla solo reconocía rutas `\\\\host\\recurso`. El usuario lo revisó y se corrigió la regla de forma genérica. Con el Excel del cliente, ese evento entra en INC-02 y pasan a ser 25 hallazgos y 122 de 715 eventos; siguen siendo 6 incidentes con las mismas criticidades y 2 anomalías a validar.
- **Elección del modelo: `qwen2.5:7b`**, por citas correctas y luego velocidad. Segunda medición, 6 incidentes y una sugerencia con el Excel del cliente, recalculada con el validador final:

  | | `qwen2.5:7b` | `llama3.1:8b` |
  |---|---|---|
  | Citas correctas | 77 de 79 (97,5 %) | 63 de 66 (95,5 %) |
  | Citas inventadas | 0 | 0 |
  | Citas con datos que no coinciden | 2 | 3 |
  | Frases con cita | 29 de 31 (94 %) | 27 de 35 (77 %) |
  | Tiempo total | 246 s | 299 s |
  | Mediana por respuesta | 32,0 s | 43,2 s |
  | Velocidad | 17,7 tokens/s | 9,5 tokens/s |
  | Palabras, máximo (límite pedido: 150) | 113 | 144 |

  La diferencia en citas es de pocas unidades y una sola pasada; la velocidad sí es clara. Con el prompt inicial los modelos citaban solo 9 y 16 veces: las mejoras fueron exigir una cita por frase, dar los Log_ID por hallazgo y repetir la regla al final. Un ejemplo de frase en el prompt se copiaba en las respuestas, así que no se usa ninguno.
- **Aceptación con el modelo real, en Edge por `iniciar`**: `qwen2.5:7b` explicó los 6 incidentes en 230 s con 73 citas verificadas y 0 no válidas. Una cita y una IP inventadas a propósito quedaron marcadas. La sugerencia dio 10 citas verificadas y 1 con datos que no coinciden, marcada en pantalla. Tras recargar y abrir el mismo Excel, las explicaciones siguieron ahí. Por doble clic: sin IA funciona, el aviso aparece en el panel y en Análisis, y no hay llamadas a Ollama. Sin errores de JavaScript.
- **Pruebas**: `test_ia` 56 de 56; `test_servir` 12 de 12; `test_dashboard` 144 de 144; `test_cliente` 6 + 2; `test_generalizacion` 100 % y 0 falsos en 30 semillas. La demo (semilla 445) se regeneró porque el generador cambió: sigue dando 7 incidentes y 4 a validar.
- **Limitaciones**:
  - El validador no detecta cantidades ni interpretaciones falsas con citas válidas. En la prueba final, una explicación decía que todas las peticiones web llevaban parámetros de comando, cuando solo algunas los llevaban. Las explicaciones deben revisarse antes de ir a un informe.
  - El validador también puede avisar de más: es una comprobación ligera, no una prueba de que la frase sea falsa.
  - Adaptadores `openai-compatible` y `anthropic` probados solo contra servidores simulados.
- **Aceptación**: visto bueno del usuario a la fase 4 el 04-11-2026, con los problemas de arriba resueltos.

## 2026-11-02 · Fase 3 (cerrada)

- **Qué cambió**:
  - Pestaña Dashboard, entre Análisis e Informe, en `js/ui-dashboard.js`, con gráficos en SVG propio.
  - `js/dashboard-data.js` calcula las cifras solo a partir del resultado del motor; así se prueban en Node y no pueden contradecir a Análisis.
  - `analyze` devuelve ahora `compromised`. No cambia ningún hallazgo.
  - `tests/test_dashboard.js`: cuadra las cifras con el motor en el Excel del cliente, la demo y 10 datasets sintéticos.
- **En pantalla** (para el guion):
  - Cinco tarjetas: incidentes por criticidad, hallazgos, eventos implicados sobre el total, cuentas comprometidas e IP externas implicadas (origen y destino).
  - "Qué encontramos": una frase por incidente, generada con plantilla; un clic salta a su tarjeta en Análisis. En la fase 4 se sustituye por la explicación de la IA.
  - Barras de incidentes por criticidad y de hallazgos por las 6 categorías del reto.
  - Actividad en el tiempo: columnas apiladas de eventos normales y con incidente, y debajo la franja de cada incidente con su ID. Incluye la vista en tabla.
  - Top de hosts, cuentas e IP externas, y técnicas MITRE observadas.
  - Clic en una barra o columna: filtra Registros por esas filas. Clic en una franja: salta al incidente. Tooltip al pasar el ratón o con el foco.
- **Colores**: la serie principal usa `--chart` y los eventos normales `--chart-base`, separados de la paleta de riesgo. El validador da separación suficiente en ambos temas; el gris no alcanza el mínimo de croma porque es deliberadamente neutro. Del enunciado solo son el azul marino y el naranja; los colores de riesgo son del proyecto y se pueden ajustar. Medio pasa a `#c2a000` (claro) y `#f2d65c` (oscuro): la separación con Alto con daltonismo sube de ΔE 3,7 a 10,3 y de 4,4 a 12,2. Lleva texto oscuro y cada criticidad sigue mostrando su nombre. Crítico-Alto en tema oscuro sigue justo (ΔE 7,2), con el texto como refuerzo.
- **Pruebas**: `node tests/test_dashboard.js`, `node tests/test_cliente.js` y `node tests/test_generalizacion.js` correctas. En Edge, con el Excel del cliente y 2 sintéticos, en tema claro y oscuro, a 1280 y 400 px: cifras iguales a Análisis, sin scroll horizontal y sin errores de JavaScript. Clics comprobados a 1280 px en tema oscuro.
- **Aceptación**: el usuario arrastró su Excel y comprobó 6 incidentes, 24 hallazgos, 121 de 715 eventos, 79 eventos al hacer clic en Crítico y el tooltip.

## 2026-11-02 · Fase 2.6 (cerrada)

- **Qué cambió**:
  - `tools/generar_dataset.js`: datasets sintéticos deterministas por semilla, con 7 tipos de ataque, nombres parecidos, 7 casi-ataques, tres formatos de fecha y verdad de referencia.
  - `tests/test_generalizacion.js`: cada dataset recorre el camino real (`.xlsx` → parser → motor) y comprueba cobertura, criticidad, categorías, falsos positivos, casi-ataques, hora exacta de cada fila y que un incidente no quede inflado con actividad ajena.
  - Motor, señales débiles: inicio fuera de horario, lectura masiva, acceso a recurso sensible y persistencia en ruta normal solo se unen a una señal fuerte del mismo actor a 30 minutos o menos (`weakAttachMin`); solas quedan "a validar", y los inicios fuera de horario se agrupan en una sola entrada.
  - Motor, fuerza bruta: umbral de 5 fallos para IP interna y 3 para externa (`pairFailMinInternal`, `pairFailMin`). Los fallos se cuentan en una ventana real (`denseBursts`), no encadenados. El éxito de un ataque solo cuenta si la cuenta estaba entre las atacadas.
  - Motor, exfiltración: la conexión saliente aislada baja de Crítico a Alto y el incidente dice "posible exfiltración". Los textos que afirmaban más de lo comprobado ahora dicen lo que los datos permiten.
  - Parser: lee `dd/mm/aaaa` y fechas nativas de Excel sin desplazar la hora, y avisa en pantalla de las filas con fecha ilegible.
  - Interfaz: la tarjeta de IP externas muestra el número, hasta 3 IP y un enlace "y N más" que filtra Registros por IP externa; las tarjetas se alinean arriba. La cronología adapta el intervalo a un máximo de 8 etiquetas y tiene un botón "Ajustar a incidentes".
- **En pantalla**:
  - Excel del cliente: mismos 6 incidentes y 2 a validar, comprobado en Edge por Claude Code. INC-02 se titula "Intrusión por fuerza bruta con movimiento lateral y posible exfiltración". La frase del usuario sobre este archivo llegó con la plantilla sin rellenar, así que no consta su observación.
  - `datasets/demo_publico.xlsx` (semilla 445, 1.500 eventos): 7 incidentes para 7 escenarios (4 Críticos, 2 Altos, 1 Medio) y 4 entradas a validar, entre ellas la copia de seguridad y la tarea legítima. El usuario revisó la versión anterior de la demo (semilla 21), que también daba 7 incidentes; esta es nueva porque el generador cambió.
  - Con una fecha ilegible aparece un aviso sobre la franja de resumen.
  - A 400 px no hay scroll horizontal, con la tarjeta y la cronología nuevas.
- **Pruebas**:
  - Antes de los ajustes: 976 incidentes falsos en 22 de 30 semillas y 26 fallos de cobertura.
  - `node tests/test_cliente.js` → 6 incidentes (4 Crítico, 2 Alto) + 2 a validar.
  - `node tests/test_generalizacion.js` → 100 % de cobertura y 0 incidentes falsos en 30 semillas, y también en 300.
  - Umbral interno: con 3, 26 de 26 casi-ataques de typos caían en un incidente; con 5, ninguno. Siguen detectándose 5 fallos internos y 3 externos.
  - Con 600 semillas (301–600 no usadas al ajustar): 100 % de cobertura, 263 de 264 casi-ataques de typos fuera de incidentes y 1 incidente falso (semilla 599).
- **Falso positivo conocido**: la semilla 599 suma 4 typos y 1 fallo de ruido de la misma cuenta e IP en 10 minutos. Cumple el umbral de 5, así que la regla actúa como se definió; no se ha cambiado. A 1.500 eventos pasa con 2 de 209 semillas con typos (226 y 309).
- **Limitación de la prueba de generalización**: el 100 % no prueba que el motor detecte ataques nuevos. El generador se escribió conociendo las reglas, así que demuestra que el motor no depende de los valores del cliente, no que reconozca variantes distintas.
- **Decisión del usuario** (02-11-2026): visto bueno a la fase tras revisar la demo de la semilla 445 (7 incidentes, 4 a validar, cronología y "Ajustar a incidentes"). Acepta el falso positivo de la semilla 599 y la limitación de ataques lentos: por debajo de 10 fallos en 15 minutos, una fuerza bruta no se detecta.

## 2026-11-02 · Fase 2.5 (cerrada)

- **Qué cambió**: repositorio y `.gitignore`; código anterior en `legacy/`; `app/` separada en `index.html`, `css/app.css` y `js/` (`engine`, `parser`, `ui-comun`, `ui-registros`, `ui-analisis`, `app`), sin paso de build. El motor solo cambia en un comentario. El nombre del archivo y el recuento del botón de ejemplo salen ahora de `sample.local.js`. `tests/test_cliente.js` comprueba también las criticidades y que los Log_ID citados existan.
- **SheetJS**: se incorpora la 0.20.3, última versión de `cdn.sheetjs.com`. La 0.18.5 de npm está afectada por CVE-2023-30533 (contaminación de prototipos, corregida en 0.19.3) y CVE-2024-22363 (ReDoS, corregida en 0.20.2), y la app abre Excel de terceros. SHA-256 de `app/vendor/xlsx.full.min.js`: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.
- **Doctype y charset**: `index.html` los declara; la versión anterior funcionaba en modo de compatibilidad. Para conservar la altura de las filas de la tabla se añadió `line-height:normal`.
- **En pantalla**: Carga y Análisis son idénticas píxel a píxel a la versión anterior, a 1280 y 400 px. En Registros, el texto es igual y las filas miden lo mismo; la etiqueta de incidente baja 2–3 px y el texto de severidad 1 px.
- **Pruebas**: `node tests/test_cliente.js` (ejecutado por el usuario, Excel leído con SheetJS 0.20.3) → 6 incidentes (4 Crítico, 2 Alto) + 2 a validar, Log_ID correctos. `tools/generar_sample.js` genera 715 eventos, idénticos fila a fila a los datos anteriores. App sin red y sin ejecutar SheetJS, con datos de ejemplo: sin errores de JavaScript.
- **Aceptación**: el usuario abrió `index.html` con doble clic y arrastró el Excel: funcionó y se ve bien. **Prueba sin internet: no probado, descartado por el usuario** (SheetJS ya está incluido en `vendor/`); no cuenta como cumplida.
- **Repositorio**: `.gitattributes` con `app/vendor/** -text` para que `vendor/` no convierta saltos de línea y el SHA-256 anterior siga siendo válido.
- **Pendiente**: comprobar en la fase 2.6 que las fechas nativas de Excel se leen correctamente con la 0.20.3.

## 2026-10-31 · Fases 1 y 2 (hechas en el chat de planificación)

- **Qué cambió**:
  - Fase 1: app de un solo HTML que carga el .xlsx (SheetJS), con franja de resumen, tabla con filtros, ordenación y paginación, y panel de detalle con pivotes.
  - Fase 2: motor de reglas (`engine.js`) y pestaña Análisis.
- **En pantalla** (con el Excel del cliente):
  - Zona para arrastrar el Excel.
  - Franja de resumen: 715 eventos, ventana de 5 h 58 min, 11 hosts, 13 usuarios, 3 IP externas, 112 no informativos.
  - Pestaña Análisis: veredicto "6 incidentes independientes" (4 Críticos y 2 Altos, más 2 anomalías a validar), recuento por las 6 categorías, cronología SVG y tarjetas de incidente con hallazgos, MITRE, justificación y Log_ID clicables.
  - Pestaña Registros: columna de incidente, filtro "Solo eventos con hallazgos" y filtro por evidencias.
- **Pruebas**: `node app/src/test_engine.js` → 6 incidentes + 2 a validar. Con solo el tráfico normal: 0 incidentes (siguen saliendo las 2 anomalías a validar). Corregido el 02-11-2026; antes decía "0 hallazgos", que no era exacto.
- **Pendiente**: reestructurar sin build (fase 2.5) y prueba de generalización con datos sintéticos (fase 2.6).
