# LoopMe

Aplicación minimalista para reproducir en bucle un fragmento de audio. Está basada en parte del código de [AudioMass](https://github.com/pkalogiros/AudioMass) para visualizar la onda y manejar regiones.

## Uso

1. Inicia un servidor estático en la carpeta del proyecto, por ejemplo con:
   ```bash
   python3 -m http.server
   ```
   Luego abre `http://localhost:8000/index.html` en tu navegador.
2. Carga un archivo de audio con el selector.
3. Ajusta la región para definir el fragmento y pulsa **Play** para escucharlo en bucle.

La aplicación también puede ejecutarse dentro de Electron usando `npm install` y `npm start`.

## Licencia

El código se distribuye bajo la licencia MIT. Consulta el proyecto original de AudioMass para más detalles.
