# Regenerate the offline mirrors (data/journal.js, data/philosophy.js)
# from the JSON files in data/. Use this on Windows when Node.js is not installed.
# (Keep this file ASCII-only: PowerShell 5.1 mis-decodes BOM-less UTF-8.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    @{ Json = 'data\journal.json';    Js = 'data\journal.js';    Var = '__JOURNAL_DATA__' },
    @{ Json = 'data\philosophy.json'; Js = 'data\philosophy.js'; Var = '__PHILOSOPHY_DATA__' }
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
foreach ($t in $targets) {
    $jsonFile = Join-Path $root $t.Json
    if (-not (Test-Path $jsonFile)) { Write-Host "skip $($t.Json) (not found)"; continue }
    $body = [System.IO.File]::ReadAllText($jsonFile, [System.Text.Encoding]::UTF8).Trim()
    $null = ConvertFrom-Json $body   # fail fast if the JSON is broken
    $out = 'window.' + $t.Var + ' = ' + $body + ';' + "`n"
    [System.IO.File]::WriteAllText((Join-Path $root $t.Js), $out, $utf8NoBom)
    Write-Host "wrote $($t.Js)"
}
