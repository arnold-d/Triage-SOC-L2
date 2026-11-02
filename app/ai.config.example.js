// Ejemplo de configuración de IA. Copia este archivo como ai.config.local.js (no va a git) y ajústalo.
// Con provider "none" la app funciona entera con plantillas, sin IA.
window.SOC_AI_CONFIG = {
  provider: "none",   // none | ollama | openai-compatible | anthropic
  baseUrl: "",        // p. ej. http://localhost:11434 para Ollama
  model: "",
  apiKey: "",
};
