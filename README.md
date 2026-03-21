# maca - Media ALT & Caption AI

`maca` es una extensión pensada para `WordPress` que genera metadatos de imagen con IA directamente dentro de `wp-admin`.

Genera y gestiona:

- `ALT`
- `title`
- `leyenda`

Todo desde un flujo centrado en edición real, no en demos:

- análisis manual sobre una imagen
- procesado por lotes
- auto-generación al subir varias imágenes
- aplicación automática sobre los campos del adjunto
- revisión manual en overlay antes de copiar o guardar

## ✨ Qué es maca

El nombre viene de:

- `M` = `Media`
- `A` = `ALT`
- `C` = `Caption`
- `A` = `AI`

Hoy la extensión ya cubre también `title`, pero mantiene el nombre `maca` como identidad del proyecto.

## 🎯 Objetivo del proyecto

Resolver un problema concreto en medios de WordPress:

- generar textos útiles y consistentes para imágenes
- acelerar el trabajo editorial
- mantener accesibilidad y SEO
- evitar tener que copiar y pegar manualmente entre herramientas externas

La extensión está limitada deliberadamente a `WordPress` para reducir errores, ruido y lógica innecesaria en otros sitios.

## 🧠 Qué genera exactamente

### ALT

- descriptivo
- natural
- útil para accesibilidad
- sin fórmulas vacías tipo `imagen de ...`

### Title

- corto
- claro
- apto para el campo de título del adjunto

### Leyenda

- más editorial
- contextual
- menos mecánica que el ALT

## 🚀 Funciones principales

### 1. Generación manual

- menú contextual sobre imágenes dentro de `wp-admin`
- atajo de teclado
- overlay flotante con previsualización
- edición manual antes de copiar

### 2. Aplicación directa en WordPress

- pegado automático en:
  - `Texto alternativo`
  - `Título`
  - `Leyenda`
- reintentos automáticos si WordPress aún no ha terminado de renderizar el panel

### 3. Procesado por lotes

- selección múltiple en la biblioteca de medios
- cola controlada
- cancelación de lote
- soporte de validación QA antes de aplicar

### 4. Auto-generación al subir varias imágenes

- detección de nuevas subidas
- cola automática
- controles de:
  - pausa
  - reanudar
  - cancelar
- fusible de seguridad para evitar procesados masivos accidentales

### 5. Firma editorial

- varias firmas configurables
- selección de firma activa
- aplicación opcional en:
  - menú contextual
  - lote
  - auto-generación
- botón manual `Añadir firma` en el overlay

### 6. Calidad y SEO

- perfiles editoriales/SEO
- revisión SEO con puntuación visible
- validación post-generación configurable
- posibilidad de mandar resultados dudosos a revisión manual

### 7. Observabilidad y debug

- historial local
- métricas simples
- logs de debug
- exportación de diagnóstico

## 🧩 Proveedores de IA soportados

`maca` puede trabajar con:

- `OpenAI`
- `Gemini`
- `Anthropic`
- `Groq`
- `OpenRouter`
- `Ollama`
- endpoints `OpenAI-compatible`

### OpenRouter / GLM

Hay lógica específica para `OpenRouter` con modelos `GLM`:

- prompt de calidad dedicado
- parsing más robusto de respuesta
- reintentos y fallback controlados
- timeouts más claros
- errores más legibles

## 🖼️ Cómo funciona el flujo

### Flujo manual

1. Abres una imagen o un adjunto en `wp-admin`
2. Ejecutas `maca`
3. La extensión analiza la imagen con el proveedor configurado
4. Muestra el resultado en un overlay
5. Puedes:
   - editar
   - copiar por campo
   - copiar todo
   - añadir firma
   - aplicar directamente a WordPress

### Flujo por lotes

1. Seleccionas varios medios
2. Lanzas el procesamiento
3. `maca` recorre la selección
4. Genera y aplica los textos de uno en uno
5. Puedes cancelar en cualquier momento

### Flujo de auto-subida

1. Subes varias imágenes
2. `maca` detecta la cola
3. Procesa solo si esa función está activada
4. Puedes ver progreso, pausar, reanudar o cancelar

## 🪄 Overlay de generación

El overlay es la pieza central del uso diario. Incluye:

- vista previa de la imagen
- estado de generación
- badge SEO
- contexto de sesión opcional
- bloques separados para `ALT`, `title` y `leyenda`
- acciones rápidas:
  - `Regenerar`
  - `Más técnico`
  - `Más corto`
  - `Más editorial`
- botones:
  - `Copiar ALT`
  - `Copiar title`
  - `Copiar leyenda`
  - `Copiar todo`
  - `Añadir firma`

## 🧾 Contexto adicional

La generación puede usar contexto extra para mejorar precisión:

- nombre del archivo
- contexto de sesión de la pestaña
- estilo adicional manual

El nombre del archivo se usa como ayuda, no como verdad absoluta. Puede ser útil o erróneo según cómo se haya nombrado la imagen.

## ⚙️ Ajustes configurables

### Generación

- proveedor
- modelo
- modo de salida
- prompt o estilo adicional

### Integración WordPress

- auto-aplicar en campos
- exigir interfaz de medios disponible antes de aplicar

### Firma

- varias firmas
- firma activa
- usar firma o no en cada flujo

### Auto-subida

- activar/desactivar
- mostrar cola
- pausa/reanudar
- cancelar
- fusible de seguridad
- límite máximo de cola

### QA

- validación post-generación
- detección de textos demasiado genéricos
- revisión manual de resultados flojos

### Debug

- logs
- exportación
- métricas

## 🧱 Estructura del repositorio

- `README.md`
  - documentación general del proyecto
- `maca por chrome/`
  - versión para Chrome/Chromium
- `maca for firefox/`
  - versión para Firefox
- paquetes generados
  - `maca-for-chrome-*.zip`
  - `maca-for-firefox-*.zip`
  - `maca-for-firefox-*.xpi`

## 🔒 Privacidad

- no hay tracking propio
- no hay analítica remota de la extensión
- claves, logs y métricas se guardan en el navegador
- las imágenes y prompts solo se envían al proveedor que configures

## ⚠️ Limitaciones

- depende del DOM real de WordPress
- la calidad final depende del modelo
- algunos modelos baratos pueden ser inconsistentes
- Firefox empaquetado requiere normalmente firma para instalación permanente estándar
- Chrome no ofrece un flujo local tan directo como `XPI`; lo normal es `Cargar descomprimida` o `Chrome Web Store`

## 🛠️ Instalación

La instalación específica depende del navegador.

### Chrome

Consulta:

- `maca por chrome/README.md`

### Firefox

Consulta:

- `maca for firefox/README.md`

## 🧪 Estado actual

Versión actual del proyecto:

- `1.0.10`

Incluye, entre otras cosas:

- overlay más usable
- sincronización visual Chrome/Firefox
- botón manual para firma
- mejoras en OpenRouter / GLM
- mayor control de lotes y auto-subida

## 📌 Resumen rápido

Si trabajas con imágenes en WordPress y quieres:

- ahorrar tiempo
- mejorar ALT, title y leyenda
- mantener control editorial
- automatizar sin perder supervisión

`maca` está hecha exactamente para eso.

## Licencia

Pendiente de definir.
