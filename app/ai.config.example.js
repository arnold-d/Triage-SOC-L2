// Ejemplo de configuración de IA. Copia este archivo como ai.config.local.js (no va a git) y ajústalo.
// Con provider "none" la app funciona entera con plantillas, sin IA.
window.SOC_AI_CONFIG = {
  provider: "none",   // none | anthropic | openai-compatible | ollama
  baseUrl: "",        // vacío: la URL por defecto del proveedor (Ollama: http://localhost:11434)
  model: "",          // p. ej. claude-haiku-5-5 con Anthropic
  apiKey: "",         // solo Anthropic y compatibles con OpenAI
  autoExplain: false, // explicar los incidentes en segundo plano al cargar un archivo
};
