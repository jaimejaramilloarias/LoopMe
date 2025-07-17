# LoopMe

Aplicación web sencilla para crear loops de audio. Permite cargar archivos de audio locales, visualizar la onda, seleccionar un fragmento con marcadores y reproducirlo en bucle. Incluye controles para modificar el tempo sin alterar el pitch y para variar el pitch sin cambiar el tempo usando la librería SoundTouch. La interfaz cuenta ahora con un diseño compacto y botones de colores para un aspecto más atractivo.

## Uso

1. Inicia un servidor estático en la carpeta del proyecto. Por ejemplo, con
   Python se puede ejecutar:

   ```bash
   python3 -m http.server
   ```

   Esto servirá los archivos en `http://localhost:8000/`.

2. Abre `http://localhost:8000/index.html` en un navegador moderno.
3. Carga un archivo de audio con el selector "Choose file".
4. Ajusta los marcadores para definir el loop y usa los controles de tempo y
   pitch según sea necesario.

Si el navegador muestra un mensaje indicando que el `AudioContext` no se pudo
iniciar, basta con hacer clic o tocar cualquier parte de la página para activar
el sonido.

El proyecto está pensado como base para un diseño de interfaz más elaborado.

## Uso en escritorio (Electron)

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Ejecuta la aplicación:
   ```bash
   npm start
   ```
   o bien
   ```bash
   npx electron .
   ```

La ventana de la aplicación cargará `index.html` y funcionará igual que en el navegador Chrome, incluyendo soporte para AudioWorklet.
