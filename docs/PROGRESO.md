# Bitácora de progreso

Una entrada por fase, la más reciente arriba. Cada entrada incluye: fecha · qué cambió · **cómo se ve en pantalla** (para el guion del video) · resultado de las pruebas · pendientes.

---

## 2026-11-02 · Fase 2.6 (pendiente del visto bueno del usuario)

- **Qué cambió**:
  - `tools/generar_dataset.js`: datasets sintéticos deterministas por semilla, con 8 tipos de escenario, 6 casi-ataques, tres formatos de fecha y verdad de referencia.
  - `tests/test_generalizacion.js`: cada dataset recorre el camino real (`.xlsx` → parser → motor) y comprueba cobertura, falsos positivos, casi-ataques y la hora exacta de cada fila.
  - Motor: los hallazgos débiles (inicio fuera de horario, lectura masiva, acceso a recurso sensible, persistencia en ruta normal) solo suman a una señal fuerte del mismo actor; solos quedan "a validar", y los inicios fuera de horario se agrupan en una sola entrada. La conexión saliente aislada baja de Crítico a Alto y el incidente dice "posible exfiltración". Los textos que afirmaban más de lo comprobado ahora dicen lo que los datos permiten.
  - Parser: lee `dd/mm/aaaa` y fechas nativas de Excel sin desplazar la hora, y avisa en pantalla de las filas con fecha ilegible.
- **En pantalla**:
  - Excel del cliente: mismos 6 incidentes y 2 a validar; INC-02 se titula "Intrusión por fuerza bruta con movimiento lateral y posible exfiltración".
  - `datasets/demo_publico.xlsx` (semilla 21, 1.500 eventos): 7 incidentes para 7 escenarios (4 Críticos, 2 Altos, 1 Medio) y 3 entradas a validar.
  - Con una fecha ilegible aparece un aviso sobre la franja de resumen.
- **Pruebas**: antes de los ajustes, 976 incidentes falsos en 22 de 30 semillas y 26 fallos de cobertura. Después, `node tests/test_generalizacion.js` → 100 % de cobertura y 0 incidentes falsos en 30 semillas; también en 300 semillas (270 no usadas al ajustar), antes de añadir la comprobación de casi-ataques, que se ejecutó con 30. `node tests/test_cliente.js` → 6 + 2.
- **Límites de esta prueba**: el generador escribe los ataques con formas parecidas a las que el motor reconoce, así que demuestra que el motor no depende de los valores del cliente, no que detecte variantes nuevas. El caso de 3 fallos internos seguidos de éxito no se ha cambiado: los casi-ataques solo cubren 2 fallos, y esa regla sigue creando un incidente.
- **Pendiente**: visto bueno del usuario. Exponer `compromised` en el resultado del motor (fase 3).

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
