# LoopMe

Aplicación web sencilla para crear loops de audio. Permite cargar archivos de audio locales, visualizar la onda, seleccionar un fragmento con marcadores y reproducirlo en bucle. Incluye controles para modificar el tempo sin alterar el pitch y para variar el pitch sin cambiar el tempo usando la librería SoundTouch.

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

El proyecto está pensado como base para un diseño de interfaz más elaborado.
