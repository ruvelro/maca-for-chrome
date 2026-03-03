# maca for Chrome

Extensión de Chrome (Manifest V3) para generar y rellenar automáticamente **ALT**, **title** y **leyenda** de imágenes en **WordPress (wp-admin)** usando IA.

## Estado actual

- Versión: `1.0.4`
- Scope: solo WordPress (`/wp-admin/`)
- Proveedores IA:
  - OpenAI
  - Gemini
  - Anthropic
  - Groq
  - OpenRouter
  - Local (Ollama)
  - Local (OpenAI-compatible)

## Funcionalidades principales

- Análisis de imagen desde menú contextual (normal / con firma en leyenda).
- Overlay flotante con edición manual antes de copiar.
- Copia por campos (`ALT`, `title`, `leyenda`) o `Copiar todo`.
- Relleno automático en campos de WordPress.
- Procesado por lotes de selección en Biblioteca de medios.
- Auto-generación al subir varias imágenes.
- Controles de auto-subida:
  - Cola visible
  - Pausa / Reanudar
  - Cancelar
  - Fusible de seguridad configurable (anti-procesado masivo accidental)
- Validación post-generación configurable.
- Métricas simples (llamadas, éxito/error, tiempos, proveedor/modelo).
- Modo debug + export de diagnóstico.

## Instalación (modo desarrollador)

1. Clona este repositorio.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida**.
5. Selecciona la carpeta del proyecto.

## Configuración rápida

En `Opciones` de la extensión:

1. Elige proveedor y modelo.
2. Introduce API key (o endpoint/modelo local).
3. Define modo de generación (`ALT+title+leyenda`, `ALT+title`, `solo leyenda`).
4. Opcional:
   - Activar autopaste en WordPress.
   - Activar auto-generación al subir varias imágenes.
   - Activar firma de leyenda.
   - Activar validación post-generación.

## Flujo de uso en WordPress

### 1) Imagen individual

- Clic derecho sobre imagen en `wp-admin` -> `maca`.
- Se abre overlay con resultado.
- Edita si quieres.
- Copia o aplica a campos de Medios.

### 2) Lote manual

- Selecciona varias imágenes en Biblioteca de medios.
- En overlay: `Procesar selección`.
- Puedes `Cancelar lote`.

### 3) Auto-subida múltiple

- Sube varias imágenes en una tanda.
- Se inicia cola automática.
- Controles disponibles: `Pausar/Reanudar`, `Cancelar`.

## Ajustes relevantes

- `Auto-generar metadatos al subir varias imágenes`
- `Modo cola visible en auto-subida`
- `Activar fusible de seguridad en auto-subida`
- `Límite del fusible (cola máxima)`
- `Activar validación post-generación`
- `Rechazar textos genéricos`
- Reglas mínimas/máximas para ALT/title/leyenda

## Privacidad

- No hay tracking ni analítica remota propia.
- API key almacenada en `chrome.storage` (`local` o `sync`, según config).
- Debug y métricas se guardan localmente.
- La extensión solo se ejecuta en `wp-admin` y recursos WP relacionados.

## Estructura del proyecto

- `manifest.json`: manifiesto MV3.
- `background.js`: service worker, IA, colas, lotes, auto-subida.
- `context_helper.js`: integración DOM de WordPress.
- `overlay.js`: UI flotante de resultados/acciones.
- `options.html` / `options.js`: configuración.
- `popup.html` / `popup.js`: popup de historial rápido.
- `prompts.js`: prompts base por perfil SEO.
- `util.js`: utilidades comunes.

## Troubleshooting rápido

- No genera nada:
  - Comprueba API key / endpoint / modelo.
  - Usa `Probar configuración` en Opciones.
- OpenRouter devuelve JSON inválido:
  - Revisa prompt personalizado.
  - Activa debug y revisa salida.
- Auto-subida se dispara de forma anómala:
  - Verifica que el fusible esté activo.
  - Ajusta límite de cola.
  - Mantén desactivado `Auto-generar al seleccionar` si no lo necesitas.

## Licencia

Pendiente de definir.
