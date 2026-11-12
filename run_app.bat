@echo off
cd /d "%~dp0"
if exist venv\Scripts\python.exe (set PY=venv\Scripts\python.exe) else (set PY=python)
echo Using: %PY%
%PY% -m pip install -q -r requirements.txt
%PY% app.py
pause
