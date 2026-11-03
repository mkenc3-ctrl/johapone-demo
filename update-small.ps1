# Rebuilds small-law.js (소규모주택정비법 act + decree) from law.go.kr for the checklist's 가로주택·소규모재건축 versions. Run monthly with update-data.ps1.
# Run:  powershell -ExecutionPolicy Bypass -File update-data.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = 'https://www.law.go.kr'
# URL-encoded page names, so this file stays ASCII-only
$beop = '%EB%B2%95%EB%A0%B9'
$name = '%EB%B9%88%EC%A7%91%EB%B0%8F%EC%86%8C%EA%B7%9C%EB%AA%A8%EC%A3%BC%ED%83%9D%EC%A0%95%EB%B9%84%EC%97%90%EA%B4%80%ED%95%9C%ED%8A%B9%EB%A1%80%EB%B2%95'
$sources = @(
  @{ id = 'act';    path = "$beop/$name" },
  @{ id = 'decree'; path = "$beop/$name%EC%8B%9C%ED%96%89%EB%A0%B9" }
)

function Get-Page($url) {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [Text.Encoding]::UTF8
  $wc.DownloadString($url)
}

function Clean($html) {
  $t = [regex]::Replace($html, '<[^>]+>', '')
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  $t = $t -replace [char]0xA0, ' '
  ([regex]::Replace($t, '\s+', ' ')).Trim()
}

$levels = @{ 'pty1_p4' = 0; 'pty1_de2_1' = 0; 'pty1_de2' = 0; 'pty1_de2h' = 1; 'pty1_de3' = 2; 'pty1_de4_1' = 3; 'pty1_ye1' = 0 }
$opt = [Text.RegularExpressions.RegexOptions]::Singleline
$laws = @()

foreach ($s in $sources) {
  $frame = Get-Page "$base/$($s.path)"
  $m = [regex]::Match($frame, 'lsInfoP\.do\?lsiSeq=(\d+)[^"'']*?efYd=(\d+)')
  if (-not $m.Success) { throw "law id not found for $($s.id)" }
  $seq = $m.Groups[1].Value; $efYd = $m.Groups[2].Value
  $h = Get-Page "$base/LSW//lsInfoR.do?lsiSeq=$seq&efYd=$efYd&efYn=Y&chrClsCd=010202&nwJoYnInfo=Y&ancYnChk=0&netPrivateYn=N"

  $h2 = [regex]::Match($h, '<h2[^>]*>(.*?)</h2>', $opt).Groups[1].Value
  $title = Clean ([regex]::Replace($h2, '<span>.*?</span>', '', $opt))
  $meta = Clean ([regex]::Match($h, '<div class="ct_sub">(.*?)</div>', $opt).Groups[1].Value)

  # attached official forms ("[byeolji je N ho seosik] name") with their HWP/PDF file ids
  $forms = New-Object System.Collections.ArrayList
  # pattern built from char codes so this file stays ASCII-only
  $formPat = '\[' + [char]0xBCC4 + [char]0xC9C0 + ' ' + [char]0xC81C + '(\d+)' + [char]0xD638 + '(?:' + [char]0xC758 + '(\d+))?' + [char]0xC11C + [char]0xC2DD + '\]\s*([^<]+?)\s*</a>'
  foreach ($fm in [regex]::Matches($h, '<span class="pcf_cover[^"]*">(.*?)</span>', $opt)) {
    $c = $fm.Groups[1].Value
    $t = [regex]::Match($c, $formPat)
    $hw = [regex]::Match($c, 'flSeq=(\d+)&amp;bylClsCd=(\d+)"[^>]*>\s*<img alt="HWP')
    $pd = [regex]::Match($c, 'flSeq=(\d+)&amp;bylClsCd=\d+"[^>]*>\s*<img alt="PDF')
    if (-not ($t.Success -and $hw.Success)) { continue }
    $no = $t.Groups[1].Value; if ($t.Groups[2].Success) { $no = "$no-$($t.Groups[2].Value)" }
    [void]$forms.Add(@{ no = $no; name = (Clean $t.Groups[3].Value); hwp = $hw.Groups[1].Value; pdf = $pd.Groups[1].Value; cls = $hw.Groups[2].Value })
  }

  # main body only: drop addenda and attached forms
  $cut = $h.IndexOf('id="arDivArea"')
  if ($cut -gt 0) { $h = $h.Substring(0, $cut) }

  $items = New-Object System.Collections.ArrayList
  $chunks = [regex]::Split($h, '<div class="pgroup[^"]*"')
  foreach ($c in $chunks[1..($chunks.Length - 1)]) {
    $g = [regex]::Match($c, '<p class="gtit"[^>]*>(.*?)</p>', $opt)
    if ($g.Success) {
      [void]$items.Add(@{ t = 'h'; text = (Clean $g.Groups[1].Value) })
      continue
    }
    $lab = [regex]::Match($c, '<label for="Y(\d{4})(\d{2})">(.*?)</label>', $opt)
    if (-not $lab.Success) { continue }
    $ra = $c.IndexOf('<div class="rule_area"')
    if ($ra -gt 0) { $c = $c.Substring(0, $ra) }
    $ps = New-Object System.Collections.ArrayList
    foreach ($p in [regex]::Matches($c, '<p class="([^"]*)"[^>]*>(.*?)</p>', $opt)) {
      $cls = $p.Groups[1].Value
      $inner = $p.Groups[2].Value
      if ($cls -eq 'pty1_p4') { $inner = [regex]::Replace($inner, '<span class="bl">.*?</span>', '', $opt) }
      $text = Clean $inner
      if ($text -eq '') { continue }
      $lv = 0; if ($levels.ContainsKey($cls)) { $lv = $levels[$cls] }
      [void]$ps.Add(@($lv, $text))
    }
    [void]$items.Add(@{
      t = 'a'
      jo = [int]$lab.Groups[1].Value
      br = [int]$lab.Groups[2].Value
      title = (Clean $lab.Groups[3].Value)
      p = $ps.ToArray()
    })
  }
  $laws += @{ id = $s.id; name = $title; meta = $meta; path = $s.path; items = $items.ToArray(); forms = $forms.ToArray() }
  Write-Host "$($s.id): $(@($items | Where-Object { $_.t -eq 'a' }).Count) articles  $meta"
}

$data = @{ fetched = (Get-Date -Format 'yyyy-MM-dd'); laws = $laws }
$json = $data | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText((Join-Path $here 'small-law.js'), ("window.SMALL_LAW_DATA = " + ($json -replace '"id":"act"','"id":"sact"' -replace '"id":"decree"','"id":"sdecree"') + ";"), (New-Object Text.UTF8Encoding $false))
Write-Host "small-law.js written ($([math]::Round($json.Length / 1KB)) KB)"
