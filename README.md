# Compras mensuales (versión para tu celular)

Registrá las compras del mes (Makro y Avícola Lanús), compará precios con los meses anteriores y guardá copias de seguridad. **Sin servidor, sin cuenta y sin internet**: los datos viven en el navegador de tu celular.

> **Lo más importante:** si borrás los «datos de navegación» de Chrome (o desinstalás la app), los datos de la app se borran con ellos. Por eso la app te hace guardar un **archivo de copia** fuera del celular (Drive, por ejemplo). Con ese archivo recuperás todo en un minuto.

## Instalar en tu Android (10 minutos)

1. Creá un repositorio en GitHub y subí **todo el contenido de esta carpeta** (la carpeta `tests/` es opcional).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. Abrí la dirección que te da GitHub Pages en **Chrome del celular**.
4. Menú ⋮ → **Instalar app** (o «Agregar a pantalla principal»). Queda como una app más y abre aunque no haya internet.
5. Al abrirla la primera vez elegí **Empezar de cero con productos de ejemplo** y después cambiá los productos desde *Más → Productos*.
6. En *Más → Configuración* verificá que diga «Datos protegidos: sí». Si dice que no, tocá **Pedir protección de datos** (instalar la app ayuda a que Chrome la conceda).

## Copias de seguridad (hacelo seguido)

- **Más → Copias de seguridad → Guardar copia en Drive u otra app.** Se abre el menú de compartir de Android: elegí **Drive** (o mandátela por mail/WhatsApp a vos mismo). Eso deja el archivo `compras-backup-AAAA-MM-DD-HHMM.json` fuera del celular.
- Si tu navegador no ofrece el menú de compartir, el botón descarga el archivo; subilo después a Drive.
- La app muestra un aviso arriba cuando hay cambios sin copia (más de 7 días o 20 cambios). Una vez por mes, cuando cierres el mes, es un buen momento.
- Además la app guarda **copias internas** solas (una por día, antes de cerrar/reabrir un mes, antes de restaurar y al actualizarse). Sirven para deshacer un error, pero **se borran junto con los datos del navegador**: no reemplazan al archivo.

### Si se borraron los datos (o cambiás de celular)

1. Abrí la app (o la dirección de GitHub Pages en Chrome; reinstalala si hace falta).
2. En la pantalla de bienvenida tocá **Recuperar una copia** y elegí el archivo `.json` desde Drive/Descargas.
3. La app valida el archivo, te muestra cuántas compras y qué total contiene y recupera todo. Si el archivo está dañado o fue modificado, lo rechaza sin tocar nada.

*Restaurar con datos ya cargados:* Copias de seguridad → **Restaurar desde un archivo…** (pide escribir `RESTAURAR`, y antes guarda una copia de lo actual).

## Uso

- **Inicio:** total del mes con detalle por comercio, comparación con el mes anterior, y qué subió o bajó más.
- **Compras:** lista fija de productos. Cada tarjeta muestra el precio del mes, el del mes anterior (o el último conocido con su mes), la diferencia en $ y %, y **Agregar** (pide cantidad y confirmar el precio, sugerido con el último conocido).
- **Nueva compra (＋):** cargar varias seguidas.
- **Comparar / Historial / Informes (CSV para Excel) / Productos / Configuración:** menú inferior y **Más**.
- **Cerrar mes (Informes):** protege el mes y guarda el informe. Para corregir: **Reabrir mes**, con motivo (queda registrado).
- Los productos no se borran, se desactivan; editar uno **no cambia** las compras ya registradas. Cada compra editada guarda su historial de cambios.

Ejemplo: papel higiénico, «Pack de 4 unidades», 4 × $1.200 = **$4.800** ($300 por rollo); queso fresco, 1 kg × $30.000. Total **$34.800**.

## Actualizar la app

Reemplazá los archivos en GitHub. Subí la versión en `js/config.js` (`APP_VERSION`) y en `sw.js` (`CACHE`): la app guarda sola una copia antes de usar la versión nueva. Tus datos no se tocan, porque están en el celular y no en los archivos.

## Límites que conviene saber

- **No hay sincronización entre dispositivos**: lo que cargás en este celular está solo acá (y en tus archivos de copia).
- **Chrome puede borrar los datos** si el celular se queda sin espacio y la app no está «protegida», o si vos limpiás datos del sitio. Por eso existe el archivo de copia.
- **El archivo de copia no se guarda solo en Drive**: un sitio web no puede escribir en tus carpetas en segundo plano. Hay que tocar el botón (la app te avisa cuando toca).
- En modo incógnito no se puede usar la app.
- Las tipografías se cargan de Google Fonts; sin internet se usa la del sistema.

## Pruebas

Node 20 o más nuevo; sin dependencias para instalar.

```bash
node --test tests/calc.test.mjs                                  # cálculos y comparaciones
NODE_PATH=<node_modules con playwright> node tests/ui/smoke.mjs   # interfaz en Chromium real, con IndexedDB real
NODE_PATH=<node_modules con playwright> node tests/ui/offline.mjs # abre sin internet (service worker)
```

Última ejecución: **19** pruebas de cálculo, **45** comprobaciones de interfaz y **1** de uso sin conexión, todas aprobadas.

| # | Escenario pedido | Verificado |
|---|---|---|
| 1 | 4 packs × $1.200 = $4.800 | cálculo e interfaz |
| 2 | 1 kg × $30.000 = $30.000 | cálculo e interfaz |
| 3 | Total general $34.800 | cálculo e interfaz |
| 4 | Cerrar y reabrir: los datos siguen | recarga de la app |
| 5 | Mes nuevo: precios sí, cantidades y gastos no | interfaz (reloj en noviembre) |
| 6 | Precio nuevo y comparación (+$300, +25 %) | cálculo e interfaz |
| 7 | Backup y restauración | archivo descargado, archivo inválido/alterado rechazado, restauración |
| 8 | Histórico intacto tras editar un producto | interfaz |
| 9 | Totales por comercio = total general | cálculo e interfaz |
| 10 | Toques repetidos y falta de conexión | doble toque (1 sola compra); sin internet se guarda igual |
| + | **Se borran los datos de navegación** | se borra IndexedDB, la app arranca en bienvenida y el archivo devuelve los datos |

### Qué no pude probar

- **En tu Android real.** Probé en Chromium de escritorio con tamaño de celular. El menú de compartir de Android (Drive) lo simulé: verifiqué que la app le entrega el archivo, pero no el envío a Drive en sí. Si en tu Chrome no aparece el menú, el botón descarga el archivo.
- **Que Chrome conceda la protección de datos** («Datos protegidos: sí»): depende de Chrome y de cómo uses la app.

## Archivos

```
index.html, manifest.webmanifest, sw.js, icons/   instalación y uso sin conexión
css/styles.css                                    estilos (celular primero)
js/data.js                                        único módulo que toca IndexedDB y las copias
js/calc.js, format.js                             cálculos y formato argentino (puros, con pruebas)
js/views/                                         una pantalla por archivo
docs/ARQUITECTURA.md                              decisiones y modelo de datos
tests/                                            pruebas automáticas
```
