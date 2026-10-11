<#
  Merge two data/*.json files (same format as data/journal.json).

  Rules:
    * entries that exist in both are taken from -Source (it is the newer one)
    * entries only in -Source are appended
    * entries only in -Target are kept as well   <-- nothing is ever dropped
  The target file is backed up into _archive/ before being rewritten.

  Raw entry blocks are reused verbatim, so no character is re-escaped.
  NOTE: keep this file ASCII-only (PowerShell 5.1 mangles non-ASCII in BOM-less files).

  Usage:
    powershell -File scripts/merge-data.ps1 -Source ..\myweb_old\data\journal.json -Target data\journal.json
#>
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Resolve-PathUnderRoot([string]$p) {
    if ([System.IO.Path]::IsPathRooted($p)) { return $p }
    return (Join-Path $root $p)
}

$sourceFile = Resolve-PathUnderRoot $Source
$targetFile = Resolve-PathUnderRoot $Target
if (-not (Test-Path $sourceFile)) { throw "source not found: $sourceFile" }
if (-not (Test-Path $targetFile)) { throw "target not found: $targetFile" }

$entryRx = [regex]'(?s)\n        \{\n            "id": "((?:[^"\\]|\\.)*)",.*?\n        \}'

function Get-Entries([string]$file) {
    $text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    $json = ConvertFrom-Json $text          # sanity check
    $map = [ordered]@{}
    foreach ($m in $entryRx.Matches($text)) {
        $map[$m.Groups[1].Value] = $m.Value.TrimStart("`n")
    }
    if ($map.Count -ne $json.entries.Count) {
        throw "$file : parsed $($map.Count) raw blocks but $($json.entries.Count) entries - format changed?"
    }
    return $map
}

$src = Get-Entries $sourceFile
$tgt = Get-Entries $targetFile

$added = @()
$replaced = @()
$merged = [ordered]@{}
foreach ($id in $tgt.Keys) { $merged[$id] = $tgt[$id] }
foreach ($id in $src.Keys) {
    if ($merged.Contains($id)) { $replaced += $id } else { $added += $id }
    $merged[$id] = $src[$id]
}

# sort by date then id (same order the web app writes)
$srcJson = ConvertFrom-Json ([System.IO.File]::ReadAllText($sourceFile, [System.Text.Encoding]::UTF8))
$tgtJson = ConvertFrom-Json ([System.IO.File]::ReadAllText($targetFile, [System.Text.Encoding]::UTF8))
$dateOf = @{}
foreach ($e in $tgtJson.entries) { $dateOf[$e.id] = $e.date }
foreach ($e in $srcJson.entries) { $dateOf[$e.id] = $e.date }

$ordered = @($merged.Keys | Sort-Object { $dateOf[$_] }, { $_ })
if ($ordered.Count -eq 0) { throw 'merge produced 0 entries - aborting' }

$nl = "`n"
$stamp = (Get-Date).ToString("yyyy-MM-dd'T'HH:mm:ssK")
$body = ($ordered | ForEach-Object { $merged[$_] }) -join (',' + $nl)
$out = '{' + $nl +
       '    "version": 1,' + $nl +
       '    "updatedAt": "' + $stamp + '",' + $nl +
       '    "entries": [' + $nl +
       $body + $nl +
       '    ]' + $nl +
       '}' + $nl

$null = ConvertFrom-Json $out   # fail fast

# backup then write
$archive = Join-Path $root '_archive'
if (-not (Test-Path $archive)) { New-Item -ItemType Directory -Path $archive | Out-Null }
$name = [System.IO.Path]::GetFileName($targetFile)
$backup = Join-Path $archive ($name -replace '\.json$', ('.before-merge-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.json'))
Copy-Item -LiteralPath $targetFile -Destination $backup -Force

[System.IO.File]::WriteAllText($targetFile, $out, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "source : $sourceFile  ($($src.Count) entries)"
Write-Host "target : $targetFile  ($($tgt.Count) entries)"
Write-Host "backup : $backup"
Write-Host "replaced (source wins): $($replaced.Count)"
Write-Host "added   (only in source): $($added.Count)"
$added | ForEach-Object { Write-Host ("   + " + $_ + "  " + $dateOf[$_]) }
Write-Host "result  : $($ordered.Count) entries -> $targetFile"
