# Triage SOC L2

App web que carga un Excel exportado de un SIEM, detecta y correlaciona incidentes con reglas, clasifica su riesgo y explica los resultados con apoyo opcional de IA. Todo se procesa en tu navegador.

## Cómo abrirla

| Forma | Sin IA | Con Ollama |
|---|---|---|
| Doble clic en `app/index.html` | Funciona entera | No disponible; la app lo avisa |
| `iniciar.bat` (Windows) o `./iniciar.sh` (Linux y macOS) | Funciona entera | Funciona |

`iniciar` necesita [Node.js](https://nodejs.org) y no instala nada: sirve `app/` en `http://127.0.0.1:8765` y abre el navegador. Para detenerla, cierra la ventana o pulsa Ctrl+C.

### Por qué hace falta `iniciar` para usar Ollama

Una página abierta con doble clic (`file://`) envía `Origin: null`, y Ollama la rechaza con un error 403. La única forma de admitirla sería `OLLAMA_ORIGINS=*`, que **deja que cualquier web que visites use tu Ollama**, así que no se recomienda. En cambio, Ollama acepta por defecto `http://127.0.0.1`, y sigue rechazando las webs ajenas sin configurar nada.

El servidor escucha solo en `127.0.0.1`, no en la red; sirve únicamente lo que hay en `app/` y comprueba la cabecera `Host` para evitar ataques de DNS rebinding.

## Conectar una IA

Abre **Ajustes de IA**, elige el proveedor y pulsa **Probar conexión**. La configuración se guarda en este navegador.

| Proveedor | Datos necesarios | ¿Salen datos del equipo? |
|---|---|---|
| Sin IA | Ninguno; usa plantillas | No |
| Ollama | Modelo; URL por defecto `http://localhost:11434` | No |
| Compatible con OpenAI | URL base, modelo y clave opcional | Sí, salvo que el servidor sea local |
| Anthropic | Clave de API y modelo | Sí |

Si el proveedor no es local, la app avisa de que las filas de evidencia salen del equipo. La clave se guarda sin cifrar en el navegador. Los adaptadores compatible con OpenAI y Anthropic se han probado contra servidores simulados, no contra el servicio real.

En el entorno de pruebas del autor se usó Ollama con `qwen2.5:7b` en una GTX 1660 Super de 6 GB.

```
ollama pull qwen2.5:7b
```

## Reglas e IA

Las reglas deciden qué es un incidente y su criticidad; la IA solo explica y sugiere. Cada respuesta pasa por un validador que comprueba que:

- el Log_ID citado exista en el archivo y sea evidencia de ese incidente;
- la cuenta, el equipo o la IP de la frase coincidan con la fila citada.

**El validador no comprueba todo.** No detecta cantidades o interpretaciones falsas apoyadas en citas válidas, como decir que todas las peticiones llevaban un parámetro cuando solo lo llevaban algunas. Las explicaciones de la IA deben revisarse antes de usarlas en un informe.

## Pruebas

```
node tests/test_generalizacion.js   # datasets sintéticos: cobertura y falsos positivos
node tests/test_dashboard.js        # cifras del dashboard frente al motor
node tests/test_ia.js               # adaptadores, errores, validador y prompts, sin proveedor real
node tests/test_servir.js           # servidor local
node tests/test_cliente.js          # Excel real; sin él, sale con un aviso
```

La prueba de generalización demuestra que el motor no depende de los valores de un cliente concreto. No demuestra que detecte ataques nuevos: el generador se escribió conociendo las reglas.

Para crear un dataset sintético: `node tools/generar_dataset.js --seed 42 --eventos 1500 --out datasets/sint_42.xlsx`. `datasets/demo_publico.xlsx` es un ejemplo público generado así.
