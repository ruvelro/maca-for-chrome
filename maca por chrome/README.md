/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/*/ INSTEAD. */
# maca for Chrome

README específico de la versión para `Chrome / Chromium`.

La información general del proyecto, funciones, arquitectura y flujo de uso está en:

- `../README.md`

## Estado

- Navegador: `Chrome / Chromium`
- Versión: `1.0.9`
- Carpeta de la extensión: `maca por chrome/`
- Tipo: `Manifest V3`

## Instalación en Chrome

### Opción recomendada

1. Abre `chrome://extensions`
2. Activa `Modo de desarrollador`
3. Pulsa `Cargar descomprimida`
4. Selecciona la carpeta `maca por chrome`

### Actualizar una instalación ya cargada

1. Abre `chrome://extensions`
2. Localiza `maca`
3. Pulsa `Recargar`

### Instalación desde ZIP

Archivo preparado:

- `../dist/chrome/maca-for-chrome-1.0.9.zip`

Uso:

1. Descomprime el ZIP en una carpeta
2. Abre `chrome://extensions`
3. Activa `Modo de desarrollador`
4. Pulsa `Cargar descomprimida`
5. Selecciona la carpeta descomprimida

## Notas específicas de Chrome

- Chrome no usa `XPI`
- Un `ZIP` no es un instalador directo estándar
- Para instalación real:
  - `Cargar descomprimida`, o
  - publicación en `Chrome Web Store`, o
  - despliegue gestionado con políticas

## Archivos principales

- `manifest.json`
- `background.js`
- `context_helper.js`
- `overlay.js`
- `options.*`
- `popup.*`

## Compatibilidad

- Diseñada para `WordPress`
- Limitada a `wp-admin`

## Diagnóstico rápido

Si algo falla:

1. Recarga la extensión en `chrome://extensions`
2. Revisa `Opciones`
3. Ejecuta `Probar configuración`
4. Si hace falta, activa debug
