<#
  Proof that nothing was lost during migration:
  compares the content strings inside the LEGACY html pages (in _archive/)
  against the new data/*.json files, character by character.
  (ASCII-only: PowerShell 5.1 mangles non-ASCII in BOM-less files.)
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Get-RawLiterals([string]$html, [string]$startMarker, [string[]]$keys) {
    $start = $html.IndexOf($startMarker)
    if ($start -lt 0) { throw "marker not found: $startMarker" }
    $end = $html.IndexOf("`n    ];", $start)
    $block = $html.Substring($start + $startMarker.Length, $end - ($start + $startMarker.Length))
    $parts = $keys | ForEach-Object { $_ + ':\s*("(?:[^"\\]|\\.)*")' }
    $pattern = '(?s)' + ($parts -join '\s*,\s*')
    return ([regex]::Matches($block, $pattern))
}

function Compare-Set($legacyMatches, [string]$jsonFile, [string[]]$keys) {
    $data = ConvertFrom-Json ([System.IO.File]::ReadAllText($jsonFile, [System.Text.Encoding]::UTF8))
    $legacyCount = $legacyMatches.Count
    $newCount = $data.entries.Count
    $mismatch = 0
    $charsLegacy = 0
    $charsNew = 0
    if ($legacyCount -eq 0) { Write-Host "  PARSE ERROR: no entries found in the legacy page"; return 1 }

    foreach ($m in $legacyMatches) {
        $dateLiteral = $m.Groups[1].Value
        $contentIdx = $keys.Count       # 每组一个捕获组：1=date ... 最后一组=content
        $contentLiteral = $m.Groups[$contentIdx].Value
        $probe = ConvertFrom-Json ('{"d":' + $dateLiteral + ',"c":' + $contentLiteral + '}')
        $charsLegacy += $probe.c.Length

        $hit = $data.entries | Where-Object { $_.date -eq $probe.d }
        if (-not $hit) {
            Write-Host ("  MISSING in json: " + $probe.d)
            $mismatch++
            continue
        }
        $target = @($hit)[0]
        $charsNew += $target.content.Length
        if ($target.content -cne $probe.c) {
            Write-Host ("  CONTENT DIFFERS: " + $probe.d + " (legacy " + $probe.c.Length + " chars vs json " + $target.content.Length + ")")
            $mismatch++
        }
    }

    Write-Host ("  legacy entries: " + $legacyCount + " | json entries: " + $newCount)
    Write-Host ("  legacy content chars: " + $charsLegacy + " | json content chars: " + $charsNew)
    Write-Host ("  identical: " + ($legacyCount - $mismatch) + " / " + $legacyCount)
    if ($mismatch -gt 0) { Write-Host "  RESULT: MISMATCH!" } else { Write-Host "  RESULT: byte-identical (no content loss)" }
    return $mismatch
}

$problems = 0

Write-Host "=== 1. diary ==="
$legacyDiary = [System.IO.File]::ReadAllText((Join-Path $root '_archive\ThoughtDebateDaily.legacy.html'), [System.Text.Encoding]::UTF8)
$m1 = Get-RawLiterals $legacyDiary 'const DAILY_JOURNAL = [' @('date', 'content')
$problems += Compare-Set $m1 (Join-Path $root 'data\journal.json') @('date', 'content')

Write-Host "=== 2. philosophy ==="
$legacyPhil = [System.IO.File]::ReadAllText((Join-Path $root '_archive\ThoughtDebatePhilosophy.legacy.html'), [System.Text.Encoding]::UTF8)
$m2 = Get-RawLiterals $legacyPhil 'const PHILOSOPHY_TOPICS = [' @('date', 'title', 'content')
$problems += Compare-Set $m2 (Join-Path $root 'data\philosophy.json') @('date', 'title', 'content')

Write-Host ""
if ($problems -gt 0) { Write-Host "OVERALL: $problems problem(s) found"; exit 1 }
Write-Host "OVERALL: all migrated content matches the originals exactly"
