# Arquitectura (versión local)

| Tema | Decisión | Por qué |
|---|---|---|
| Datos | **IndexedDB** del navegador (`compras-mensuales`), un único módulo `js/data.js` | Sin servidor ni cuenta; transacciones atómicas; persiste entre sesiones. |
| Interfaz | Sitio estático con módulos ES, sin compilar | Se publica en GitHub Pages y se edita desde el celular. |
| Instalación | PWA: `manifest.webmanifest` + `sw.js` (red primero, caché de respaldo) | Se instala en Android y abre sin internet. |
| Cálculos | `js/calc.js`, funciones puras con pruebas | Comparaciones verificables sin navegador. |
| Copias | Archivo JSON compartido a Drive (Web Share API) o descargado + copias internas automáticas | El navegador puede borrar IndexedDB: la copia útil es la que sale del celular. |

## Almacenes de IndexedDB
`stores`, `categories`, `products`, `periods` (índice único año+mes), `period_events` (cierres/reaperturas), `purchases` (índice único `client_op_id` contra duplicados; guarda una foto del producto), `purchase_audit` (historial de cambios), `settings`, `meta` (inicializado, cambios sin copia, última copia, versión vista), `backups` (copias internas: auto 14, antes de operaciones 20, antes de restaurar 10, manuales sin límite).

## Reglas
- Cada compra lleva un identificador de operación: un toque repetido devuelve la misma compra.
- Meses cerrados: no admiten altas, ediciones ni bajas hasta reabrirlos con motivo.
- Restaurar: valida estructura, conteos, total gastado e integridad; guarda antes una copia; reemplaza todo en **una transacción** (si falla, no cambia nada).
- Formato de copia: `{meta:{app:'compras-mensuales',version:1,exported_at,counts,total_spent}, data:{stores,categories,products,periods,period_events,purchases,purchase_audit,settings}}`, el mismo de la versión con Supabase.
- Comparación: precio del mes = última compra del mes; misma presentación → diferencia directa; misma unidad base con otra presentación → precio por unidad base; unidad distinta → «No comparable»; sin antecedentes → «Sin registro anterior»; sin compra este mes → último precio conocido con su mes.
