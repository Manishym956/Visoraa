# Start the Visual Learner API
# Run from the repo root: .\start-api.ps1

$env:PYTHONPATH = "$PSScriptRoot\apps\api"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir "$PSScriptRoot\apps\api"
