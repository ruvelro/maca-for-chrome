# maca for Firefox

`maca` es una extensión de Firefox orientada exclusivamente a `WordPress` para generar, revisar y aplicar metadatos de imagen con IA directamente en `wp-admin`.

Genera:

- `ALT`
- `title`
- `leyenda`

Y puede además:

- rellenar los campos de WordPress automáticamente
- procesar selecciones múltiples
- auto-generar al subir varias imágenes
- añadir firma editorial en leyendas
- validar calidad SEO después de generar
- registrar métricas y diagnósticos

## Estado del proyecto

- Navegador: `Firefox`
- Versión actual: `1.0.7`
- Ámbito: solo `WordPress` (`*://*/*wp-admin/*`)
- Tipo de extensión: `Manifest V3` adaptado para Firefox
- Carpeta de esta versión: `maca for firefox/`

## Qué hace exactamente

`maca` analiza una imagen visible en WordPress y solicita a un modelo multimodal un conjunto de textos listos para usar:

- `ALT`: descriptivo, natural y útil para accesibilidad
- `title`: breve, limpio y utilizable como título del adjunto
- `leyenda`: más editorial y contextual

La extensión está pensada para flujos reales de medios en WordPress:

- biblioteca multimedia
- modal de adjuntos
- edición individual de medios
- inserción de imágenes en entradas

No pretende ser una extensión genérica para cualquier web. Está limitada a WordPress para reducir ruido, errores y lógica innecesaria.

## Funciones principales

### Generación manual

- Menú contextual sobre imágenes en `wp-admin`
- Atajo de teclado configurable
- Overlay flotante con previsualización de la imagen
- Edición manual antes de copiar o aplicar

### Aplicación directa en WordPress

- Pegado automático en los campos de:
  - texto alternativo
  - título
  - leyenda
- Reintentos automáticos cuando WordPress aún no ha terminado de renderizar el panel del adjunto

### Lotes

- Procesado de varias imágenes seleccionadas en la biblioteca
- Aplicación automática de resultados sobre cada adjunto
- Cancelación de lote en curso
- Respeto de reglas QA si la validación post-generación está activa

### Auto-generación al subir varias imágenes

- Cola automática al detectar nuevas subidas
- Controles de:
  - pausa
  - reanudar
  - cancelar
- Fusible de seguridad para evitar procesados masivos accidentales
- Modo cola visible para inspeccionar progreso

### Firma editorial

- Varias firmas configurables
- Selección de firma activa
- Aplicación de firma:
  - desde acciones rápidas
  - en generación manual
  - en lote
  - opcionalmente en auto-generación
- Botón manual `Añadir firma` en el overlay para añadirla después de revisar la leyenda

### Perfiles y calidad SEO

- Prompts base por perfil editorial/SEO
- Revisión SEO de salida
- Validación configurable de textos generados
- Reglas mínimas y máximas por campo
- Bloqueo o revisión manual de resultados flojos o demasiado genéricos

### Diagnóstico y observabilidad

- Historial local
- Modo debug
- Exportación de diagnóstico
- Métricas simples:
  - llamadas
  - éxitos
  - errores
  - tiempos medios
  - proveedor/modelo usado

## Proveedores de IA soportados

La extensión soporta actualmente estos tipos de backend:

- `OpenAI`
- `Google Gemini`
- `Anthropic`
- `Groq`
- `OpenRouter`
- `Ollama` local
- endpoint local `OpenAI-compatible`

### Nota sobre OpenRouter y GLM

La integración con `OpenRouter` tiene lógica específica para modelos `GLM`, incluyendo:

- prompt de calidad dedicado
- manejo más robusto de respuestas OpenAI-compatible
- reintentos ante errores transitorios
- timeout global y timeout de lectura
- mensajes de error más detallados

## Estructura del proyecto

- `manifest.json`
  - manifiesto de Firefox
- `background.js`
  - lógica principal
  - llamadas a APIs
  - colas
  - lotes
  - auto-subida
  - métricas
  - debug
- `context_helper.js`
  - integración con el DOM de WordPress
  - detección de selección y adjuntos
- `overlay.js`
  - interfaz flotante de generación
  - botones de copia
  - edición manual
  - controles de lote y auto-subida
- `options.html` / `options.js` / `options.css`
  - panel completo de configuración
- `popup.html` / `popup.js` / `popup.css`
  - acceso rápido desde el icono
- `prompts.js`
  - prompts base y perfiles de redacción/SEO
- `util.js`
  - utilidades comunes de normalización y parsing
- `icons/`
  - iconos de la extensión

## Instalación en Firefox

### Instalar la extensión desde la carpeta del proyecto

Este es el método más directo para probarla localmente.

1. Abre `about:debugging#/runtime/this-firefox`
2. Pulsa `Cargar complemento temporal`
3. Selecciona `manifest.json` dentro de la carpeta `maca for firefox`
4. Verifica que la extensión aparece como `maca for Firefox`

### Instalar desde el paquete `.xpi` o `.zip`

Archivos preparados:

- `maca-for-firefox-1.0.7-unsigned.xpi`
- `maca-for-firefox-1.0.7-unsigned.zip`

Uso recomendado:

1. Para pruebas, abre `about:debugging#/runtime/this-firefox`
2. Pulsa `Cargar complemento temporal`
3. Selecciona:
   - el `manifest.json` de la carpeta, o
   - el archivo `.xpi` si tu entorno Firefox lo acepta para carga temporal

Importante:

- Para instalación permanente en Firefox estable, normalmente necesitas un `XPI` firmado por Mozilla
- Un `XPI` sin firmar puede dar error de complemento dañado si intentas instalarlo como extensión final

## Configuración inicial

Abre `Opciones` y configura al menos:

1. Proveedor
2. Modelo
3. API key o endpoint
4. Modo de generación

Recomendado también:

1. Activar `Probar configuración`
2. Ajustar perfil SEO/editorial
3. Revisar límites de longitud
4. Decidir si quieres auto-aplicación en WordPress
5. Decidir si quieres auto-generación al subir varias imágenes

## Ajustes importantes

### Generación

- proveedor IA
- modelo
- prompt o estilo adicional
- modo:
  - `ALT + title + leyenda`
  - `ALT + title`
  - `solo leyenda`

### WordPress

- aplicar automáticamente en campos del adjunto
- requerir presencia real de interfaz de medios antes de auto-aplicar
- limitar uso solo a `wp-admin`

### Firma

- activar o desactivar firma
- mantener varias firmas
- elegir firma activa
- permitir firma también en auto-generación

### Auto-subida

- activar o desactivar la función
- mostrar cola visible
- pausa / reanudar
- cancelación
- fusible de seguridad configurable
- límite máximo de cola

### QA / validación

- activar validación post-generación
- bloquear resultados demasiado genéricos
- mandar a revisión manual resultados problemáticos

### Debug y métricas

- activar debug
- exportar logs
- revisar métricas acumuladas

## Flujo de uso

### 1. Imagen individual

1. Abre un medio en `wp-admin`
2. Ejecuta `maca` desde el menú contextual o el atajo
3. Revisa el overlay
4. Edita si hace falta
5. Usa:
   - `Copiar ALT`
   - `Copiar title`
   - `Copiar leyenda`
   - `Copiar todo`
   - `Añadir firma`

### 2. Lote manual

1. Selecciona varias imágenes en la biblioteca
2. Ejecuta el lote
3. La extensión procesa una por una
4. Puedes cancelar en cualquier momento

### 3. Auto-subida múltiple

1. Sube varias imágenes a la vez
2. Si la función está activada, se crea una cola
3. Puedes:
   - ver el progreso
   - pausar
   - reanudar
   - cancelar

## Interfaz del overlay

El overlay principal está optimizado para revisar rápido sin perder control:

- previsualización de imagen
- estado de generación
- badge SEO
- contexto de sesión opcional
- bloques separados de `ALT`, `title` y `leyenda`
- botones de refinado rápido:
  - `Más técnico`
  - `Más corto`
  - `Más editorial`
- botones de copia y firma

## Contexto de sesión y nombre de archivo

La generación puede apoyarse en contexto adicional:

- nombre del archivo
- contexto de sesión de la pestaña
- estilo adicional manual

El nombre del archivo se envía como apoyo contextual, pero no se trata como fuente fiable. Puede ser útil o engañoso según cómo se haya nombrado la imagen.

## Perfiles y calidad del texto

La extensión intenta equilibrar:

- accesibilidad
- SEO
- claridad editorial
- longitud razonable

En la práctica:

- `ALT` debe describir la imagen, no sonar a plantilla
- `title` debe ser corto y limpio
- `leyenda` debe aportar contexto, no duplicar el ALT

## Limitaciones conocidas

- Depende de que WordPress exponga correctamente los campos del adjunto
- La calidad final depende del modelo usado
- Algunos modelos multimodales baratos pueden ser inconsistentes
- El paquete `.xpi` sin firma no equivale a una distribución final lista para usuarios normales de Firefox estable

## Privacidad y datos

- No hay tracking propio ni analítica remota de la extensión
- Las claves y ajustes se almacenan localmente en el navegador
- Los logs de debug y métricas se guardan localmente
- Las imágenes y prompts se envían al proveedor configurado solo cuando tú lanzas generación o la automatización correspondiente

## Troubleshooting

### `No genera nada`

Revisa:

1. API key
2. modelo
3. endpoint
4. permisos de red
5. que estés en `wp-admin`

### `Provider returned error`

Suele indicar un fallo upstream del proveedor o del modelo multimodal. Revisa:

1. `Probar configuración`
2. modo debug
3. proveedor/modelo seleccionado

### `OpenRouter / GLM devuelve resultados raros`

1. Revisa el modelo exacto
2. Activa debug
3. Comprueba la salida cruda
4. Ajusta el perfil o el prompt si el resultado es demasiado genérico

### `La auto-subida procesa demasiadas imágenes`

Revisa:

1. que la auto-subida esté realmente activada solo si la quieres usar
2. que el fusible de seguridad esté activo
3. el límite máximo de cola

### `No rellena los campos de WordPress`

Puede deberse a:

1. render tardío del panel de medios
2. variaciones del DOM de WordPress
3. foco incorrecto del adjunto seleccionado

La extensión ya reintenta automáticamente, pero sigue dependiendo del DOM real disponible.

## Empaquetado y distribución

### Firefox

Firefox sí admite distribución como archivo único:

1. `.zip` para distribución del código empaquetado
2. `.xpi` como formato nativo de extensión

Para publicación real a usuarios finales necesitas normalmente:

1. firma por Mozilla
2. o un entorno de pruebas / políticas controladas

## Compatibilidad

- Probada y diseñada para `WordPress`
- Adaptada para Firefox moderno con soporte suficiente para este manifiesto y esta API

## Versionado

### `1.0.7`

- overlay reorganizado y más usable
- sincronización visual entre Chrome y Firefox
- botón manual para añadir firma
- estabilización del flujo OpenRouter/GLM
- control más robusto de lotes y auto-subida

## Licencia

Pendiente de definir.
