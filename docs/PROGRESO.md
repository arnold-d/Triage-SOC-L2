# Bitácora de progreso

Una entrada por fase, la más reciente arriba. Cada entrada incluye: fecha · qué cambió · **cómo se ve en pantalla** (para el guion del video) · resultado de las pruebas · pendientes.

---

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
