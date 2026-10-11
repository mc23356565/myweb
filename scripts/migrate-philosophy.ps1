<#
  One-off migration: pull PHILOSOPHY_TOPICS out of
  Thoughts/ThoughtDebatePhilosophy.html into data/philosophy.json (+ mirror .js).

  Same guarantees as migrate-journal.ps1: raw JS string literals are reused
  verbatim, every entry is decoded with a JSON parser, and the script aborts
  on the first problem.

  NOTE: keep this file ASCII-only (Windows PowerShell 5.1 decodes BOM-less
  files as ANSI and mangles non-ASCII literals).
#>
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$srcFile = Join-Path $root 'Thoughts\ThoughtDebatePhilosophy.html'
$dataDir = Join-Path $root 'data'

$text = [System.IO.File]::ReadAllText($srcFile, [System.Text.Encoding]::UTF8)

$startMarker = 'const PHILOSOPHY_TOPICS = ['
$start = $text.IndexOf($startMarker)
if ($start -lt 0) { throw "start marker not found: $startMarker" }
$end = $text.IndexOf("`n    ];", $start)
if ($end -lt 0) { throw 'end marker not found' }

$block = $text.Substring($start + $startMarker.Length, $end - ($start + $startMarker.Length))

$rx = [regex]'(?s)date:\s*("(?:[^"\\]|\\.)*")\s*,\s*title:\s*("(?:[^"\\]|\\.)*")\s*,\s*content:\s*("(?:[^"\\]|\\.)*")'
$found = $rx.Matches($block)
Write-Host "entries found: $($found.Count)"
if ($found.Count -eq 0) { throw 'no entries extracted' }

$entries    = New-Object System.Collections.Generic.List[string]
$seenIds    = @{}
$totalChars = 0
$nl = "`n"

foreach ($m in $found) {
    $dateLiteral    = $m.Groups[1].Value
    $titleLiteral   = $m.Groups[2].Value
    $contentLiteral = $m.Groups[3].Value

    $probe = ConvertFrom-Json ('{"d":' + $dateLiteral + ',"t":' + $titleLiteral + ',"c":' + $contentLiteral + '}')
    $date  = $probe.d
    $totalChars += $probe.c.Length

    if ($date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "bad date: $date" }
    if ($probe.t.Trim().Length -eq 0) { throw "empty title: $date" }
    if ($probe.c.Trim().Length -eq 0) { throw "empty content: $date" }

    $id = 'p' + $date
    if ($seenIds.ContainsKey($id)) {
        $n = 1
        while ($seenIds.ContainsKey("$id-$n")) { $n++ }
        $id = "$id-$n"
    }
    $seenIds[$id] = $true

    $entry = '        {' + $nl +
             '            "id": "' + $id + '",' + $nl +
             '            "date": "' + $date + '",' + $nl +
             '            "title": ' + $titleLiteral + ',' + $nl +
             '            "content": ' + $contentLiteral + $nl +
             '        }'
    $entries.Add($entry)
}

$stamp = (Get-Date).ToString("yyyy-MM-dd'T'HH:mm:ssK")

$json = '{' + $nl +
        '    "version": 1,' + $nl +
        '    "updatedAt": "' + $stamp + '",' + $nl +
        '    "entries": [' + $nl +
        ($entries -join (',' + $nl)) + $nl +
        '    ]' + $nl +
        '}' + $nl

$parsed = ConvertFrom-Json $json
if ($parsed.entries.Count -ne $found.Count) {
    throw "verification failed: parsed $($parsed.entries.Count), expected $($found.Count)"
}

Write-Host ('dates: ' + (($parsed.entries | ForEach-Object { $_.date }) -join ', '))
Write-Host "total content chars: $totalChars"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $dataDir 'philosophy.json'), $json, $utf8NoBom)

$mirror = 'window.__PHILOSOPHY_DATA__ = ' + $json.TrimEnd() + ';' + $nl
[System.IO.File]::WriteAllText((Join-Path $dataDir 'philosophy.js'), $mirror, $utf8NoBom)

Write-Host 'wrote data/philosophy.json and data/philosophy.js'
