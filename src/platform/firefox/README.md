# maca for Firefox

README especifico de la version para `Firefox`.

La informacion general del proyecto, funciones y flujo de uso esta en:

- `../README.md`

## Estado

- Navegador: `Firefox`
- Version: `1.0.10`
- Carpeta de la extension: `maca for firefox/`
- Tipo: `Manifest V3` adaptado a Firefox

## Firma y empaquetado

Para evitar problemas de instalacion en Firefox estable, el flujo recomendado es:

1. Generar el paquete local:
   - `Set-ExecutionPolicy -Scope Process Bypass; .\scripts\build-firefox.ps1`
   - alternativa: `powershell -ExecutionPolicy Bypass -File .\scripts\build-firefox.ps1`
2. Firmarlo en Mozilla como extension `unlisted`:
   - `Set-ExecutionPolicy -Scope Process Bypass; .\scripts\sign-firefox.ps1`
   - alternativa: `powershell -ExecutionPolicy Bypass -File .\scripts\sign-firefox.ps1`

Salidas esperadas:

- paquete sin firma:
  - `../dist/firefox/unsigned/maca-for-firefox-<version>-unsigned.zip`
- paquete firmado para instalar:
  - `../dist/firefox/signed/maca-for-firefox-<version>.xpi`

Variables de entorno aceptadas para firmar:

- `WEB_EXT_API_KEY`
- `WEB_EXT_API_SECRET`
- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

Si usas `AMO_*`, el script las reutiliza automaticamente como alias de `web-ext`.

## Instalacion en Firefox

### Opcion recomendada para pruebas

1. Abre `about:debugging#/runtime/this-firefox`
2. Pulsa `Cargar complemento temporal`
3. Selecciona `manifest.json` dentro de `maca for firefox`

### Instalacion desde paquete

Uso recomendado:

1. Para Firefox estable, instala el `.xpi` firmado generado por `.\scripts\sign-firefox.ps1`
2. Para pruebas, abre `about:debugging#/runtime/this-firefox`
3. Pulsa `Cargar complemento temporal`
4. Selecciona:
   - `manifest.json` de la carpeta, o
   - el `.zip`/`.xpi` sin firma si tu entorno Firefox acepta carga temporal desde paquete

## Notas especificas de Firefox

- Firefox utiliza `XPI`
- La instalacion permanente en Firefox estable requiere firma de Mozilla
- `.\scripts\sign-firefox.ps1` usa `web-ext sign --channel unlisted`
- Si Firefox muestra `complemento danado`, normalmente no es un problema del ZIP/XPI sino de firma o compatibilidad del manifiesto

## Archivos principales

- `manifest.json`
- `background.js`
- `context_helper.js`
- `overlay.js`
- `options.*`
- `popup.*`

## Compatibilidad

- Disenada para `WordPress`
- Limitada a `wp-admin`

## Diagnostico rapido

Si algo falla:

1. Ejecuta `Set-ExecutionPolicy -Scope Process Bypass; .\scripts\build-firefox.ps1` para comprobar que el empaquetado local funciona
2. Revisa `Opciones`
3. Ejecuta `Probar configuracion`
4. Si hace falta, activa debug
