param(
  [Parameter(Mandatory = $true)]
  [string]$PythonPath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".local-web-player-data\speech-to-text"
$venvRoot = Join-Path $runtimeRoot "python"
$cacheRoot = Join-Path $runtimeRoot "models\huggingface"
$workerPath = Join-Path $PSScriptRoot "kotoba-whisper-v2.2.py"

& $PythonPath -m venv $venvRoot
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
& $venvPython -m pip install "transformers>=4.45,<5" "accelerate>=1,<2" safetensors soundfile "punctuators==0.0.5"
& $venvPython $workerPath --model "kotoba-tech/kotoba-whisper-v2.2" --cache-dir $cacheRoot --prepare-only

Write-Output "Kotoba-Whisper v2.2 环境已安装到 $runtimeRoot"
