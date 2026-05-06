# Windows model download script for silent-speech
# Run from the slient-speech/ directory:
#   .\setup.ps1

$ErrorActionPreference = "Stop"

function Download-File {
    param([string]$Url, [string]$Dest)
    Write-Host "[download] $([System.IO.Path]::GetFileName($Dest))" -NoNewline
    $dir = [System.IO.Path]::GetDirectoryName($Dest)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    try {
        curl.exe -fsSL $Url -o $Dest
        Write-Host "  OK"
    } catch {
        Write-Host "  FAILED — trying Invoke-WebRequest"
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
        Write-Host "  OK"
    }
}

$BASE = "https://huggingface.co"

Write-Host "`n=== Downloading LRS3 VSR model (WER 19.1%) ===" -ForegroundColor Cyan
Download-File "$BASE/Amanvir/LRS3_V_WER19.1/resolve/main/model.json" "benchmarks/LRS3/models/LRS3_V_WER19.1/model.json"
Download-File "$BASE/Amanvir/LRS3_V_WER19.1/resolve/main/model.pth"  "benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth"

Write-Host "`n=== Downloading English subword LM ===" -ForegroundColor Cyan
Download-File "$BASE/Amanvir/lm_en_subword/resolve/main/model.json" "benchmarks/LRS3/language_models/lm_en_subword/model.json"
Download-File "$BASE/Amanvir/lm_en_subword/resolve/main/model.pth"  "benchmarks/LRS3/language_models/lm_en_subword/model.pth"

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host "Run with:"
Write-Host "  uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe"
