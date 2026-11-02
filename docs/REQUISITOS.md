# Requisitos del reto (fuentes y detalle)

Fuentes:
- Diapositivas de la clase del 24-10-2026 (Mentimeter "2026 - Día 7 - Analista SOC N2").
- Transcripción del audio de esa clase (`bootcampt_instrucciones_1.m4a`, hecha con uniscribe.co).

Si las dos fuentes difieren, se cumplen ambas. **Entrega: domingo 8 de noviembre de 2026.**

## Contexto y misión
- Consultora de ciberseguridad en Estocolmo (Suecia). Rol: Analista SOC Nivel 2. El lead técnico entrega el encargo.
- El cliente sufrió un grupo de incidentes y entrega un Excel exportado de su SIEM. No hay acceso a sus plataformas, porque se trabaja como tercero.
- Misión: encontrar qué pasó, con IoC, correlación de eventos y si hubo uno o varios incidentes.
- Se espera usar programación, investigación y apoyo de IA para construir la app. "No le vamos a decir cómo hacerlo porque usted es un analista nivel 2."

## Qué debe detectar la app
Fuerza bruta · inicios sospechosos (por origen, horario o patrón) · escalamiento de privilegios · comandos y procesos sospechosos · movimiento lateral · otras anomalías.

## Funcionalidades
1. Carga de archivos: importar y visualizar el .xlsx.
2. Análisis de seguridad: identificar eventos sospechosos y correlacionarlos.
3. Dashboard: estadísticas y gráficos interactivos por criticidad, "cuántas cosas encontraron" y "explicaciones de lo que encontraron".
4. Clasificación de riesgos: Crítico, Alto, Medio o Bajo, con justificación. El audio menciona bajo, medio y alto; se usan los 4 niveles.
5. **Dos informes**: uno ejecutivo, "en español ejecutivo" y entendible para directivos, y uno técnico detallado.
6. Exportación de los dos informes a PDF.

## IA integrada (obligatoria)
- Audio: "que la IA lo ayude", "todo eso lo hace la IA, mete su componente de IA", "integrada con agentes de IA o modelos de inteligencia artificial generativa", "mi agente hizo el análisis".
- Diapositiva: "IA integrada: apoya el análisis de datos y la redacción del informe".
- Decisión del proyecto: IA independiente del proveedor (en el equipo del autor, Ollama local). Las reglas deciden los incidentes; la IA explica, redacta y sugiere, y sus citas se validan.

## Contenido del informe (diapositiva)
Resumen ejecutivo · hallazgos identificados · explicación técnica de cada hallazgo · evidencias en los logs · criticidad y justificación · posible impacto · plan de acción (investigar, contener, remediar) · recomendaciones generales.

## Otros requisitos
- Interfaz moderna, intuitiva y fácil de usar.
- Sin Microsoft Sentinel.
- **Rigor analítico**: no inventar hallazgos; cada conclusión se apoya estrictamente en los registros.
- Se puede practicar con Excel propios; se evalúa con el oficial.

## Entregables
1. PDF generado por la app, con los informes ejecutivo y técnico.
2. Video de máximo 5 minutos que **demuestre la autoría**: carga del Excel, dashboard, informe y PDF, explicando cómo se hizo y el proceso.
- Formulario web: nombre completo, correo, enlace al PDF y enlace al video.
- Recomendado: repositorio en GitHub con código, PDF y video (portafolio). Decidido: se publica al final y sin el Excel del cliente.
- Dudas: Discord del bootcamp.
