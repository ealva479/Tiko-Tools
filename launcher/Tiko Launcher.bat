@echo off
rem Starts the launcher. Installs dependencies the first time and after updates.
cd /d "%~dp0"
call npm install --no-audit --no-fund
if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
call npm start
