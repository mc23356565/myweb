<#
  One-off migration: pull the hard-coded DAILY_JOURNAL array out of
  Thoughts/ThoughtDebateDaily.html into data/journal.json (source of truth)
  and data/journal.js (offline mirror).

  Zero content loss by construction: the raw JS string literals are reused
  verbatim (they are already valid JSON strings), so no character can be
  re-escaped or rewritten. Every entry is decoded with a JSON parser as a
  sanity check and the script aborts on the first failure.

  NOTE: keep this file ASCII-only (Windows PowerShell 5.1 decodes BOM-less
  files as ANSI and mangles non-ASCII literals).
#>
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$srcFile = Join-Path $root 'Thoughts\ThoughtDebateDaily.html'
$dataDir = Join-Path $root 'data'

$text = [System.IO.File]::ReadAllText($srcFile, [System.Text.Encoding]::UTF8)

$startMarker = 'const DAILY_JOURNAL = ['
$start = $text.IndexOf($startMarker)
if ($start -lt 0) { throw "start marker not found: $startMarker" }
$end = $text.IndexOf("`n    ];", $start)
if ($end -lt 0) { throw 'end marker not found' }

$block = $text.Substring($start + $startMarker.Length, $end - ($start + $startMarker.Length))

$rx = [regex]'(?s)date:\s*("(?:[^"\\]|\\.)*")\s*,\s*content:\s*("(?:[^"\\]|\\.)*")'
$found = $rx.Matches($block)
Write-Host "entries found: $($found.Count)"
if ($found.Count -eq 0) { throw 'no entries extracted' }

$entries    = New-Object System.Collections.Generic.List[string]
$seenIds    = @{}
$totalChars = 0
# LF only: the browser writes the file back with JSON.stringify, which uses \n
$nl = "`n"

foreach ($m in $found) {
    $dateLiteral    = $m.Groups[1].Value
    $contentLiteral = $m.Groups[2].Value

    # decode with a JSON parser so a broken literal cannot slip through
    $probe = ConvertFrom-Json ('{"d":' + $dateLiteral + ',"c":' + $contentLiteral + '}')
    $date  = $probe.d
    $totalChars += $probe.c.Length

    if ($date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "bad date: $date" }
    if ($probe.c.Trim().Length -eq 0) { throw "empty content: $date" }

    $id = 'd' + $date
    if ($seenIds.ContainsKey($id)) {
        $n = 1
        while ($seenIds.ContainsKey("$id-$n")) { $n++ }
        $id = "$id-$n"
    }
    $seenIds[$id] = $true

    $entry = '        {' + $nl +
             '            "id": "' + $id + '",' + $nl +
             '            "date": "' + $date + '",' + $nl +
             '            "mood": "",' + $nl +
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

# whole-file check: it must parse back cleanly
$parsed = ConvertFrom-Json $json
if ($parsed.entries.Count -ne $found.Count) {
    throw "verification failed: parsed $($parsed.entries.Count), expected $($found.Count)"
}

Write-Host ('dates: ' + (($parsed.entries | ForEach-Object { $_.date }) -join ', '))
Write-Host "total content chars: $totalChars"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $dataDir 'journal.json'), $json, $utf8NoBom)

$mirror = 'window.__JOURNAL_DATA__ = ' + $json.TrimEnd() + ';' + $nl
[System.IO.File]::WriteAllText((Join-Path $dataDir 'journal.js'), $mirror, $utf8NoBom)

Write-Host 'wrote data/journal.json and data/journal.js'
