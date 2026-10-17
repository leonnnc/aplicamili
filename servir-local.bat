@echo off
setlocal
cd /d "%~dp0"

rem ---------------------------------------------------------------
rem  LavaMili - servidor local
rem  Doble clic para abrir la app en http://localhost:8137
rem  Cierra esta ventana para detener el servidor.
rem ---------------------------------------------------------------

set "PY=python"
where python >nul 2>nul || set "PY=C:\Users\LpLeonnnc\AppData\Roaming\Accio\pre-install\bd5ff2c6816a\python\python.exe"

if not "%PY%"=="python" if not exist "%PY%" goto :sinpython

echo.
echo   LavaMili - servidor local
echo   http://localhost:8137/index.html
echo   Cierra esta ventana para detenerlo.
echo.

rem Abre el navegador dos segundos despues de arrancar el servidor
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:8137/index.html"

"%PY%" -m http.server 8137 --bind 127.0.0.1

echo.
echo Servidor detenido.
pause
exit /b 0

:sinpython
echo.
echo No se encontro Python para levantar el servidor.
echo Alternativa: abre https://leonnnc.github.io/aplicamili/
echo.
pause
exit /b 1
