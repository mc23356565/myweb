# Regenerate the offline mirror data/journal.js from data/journal.json.
# Use this on Windows when Node.js is not installed.
# (Keep this file ASCII-only: PowerShell 5.1 mis-decodes BOM-less UTF-8.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jsonFile = Join-Path $root 'data\journal.json'
$jsFile   = Join-Path $root 'data\journal.js'

$body = [System.IO.File]::ReadAllText($jsonFile, [System.Text.Encoding]::UTF8).Trim()
$null = ConvertFrom-Json $body   # fail fast if the JSON is broken

$out = 'window.__JOURNAL_DATA__ = ' + $body + ';' + "`n"
[System.IO.File]::WriteAllText($jsFile, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "wrote $jsFile"
