# Download lunch photos from the school site, shrink to 800px for phones, save to images/
# (keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM)
param([int]$MaxSize = 800, [long]$Quality = 78)
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$list = Join-Path $root 'data\menus.txt'
$outDir = Join-Path $root 'images'
$tmp = Join-Path $env:TEMP "lunch-photo-$PID.jpg"
New-Item -ItemType Directory -Force $outDir | Out-Null

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$params = New-Object Drawing.Imaging.EncoderParameters 1
$params.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$files = Get-Content $list -Encoding UTF8 | Where-Object { $_ } | ForEach-Object { ($_ -split '\|')[4] } | Sort-Object -Unique
$i = 0
foreach ($f in $files) {
  $i++
  $out = Join-Path $outDir ($f.Substring(0, 8) + '.jpg')
  if (Test-Path $out) { continue }
  $img = $null; $bmp = $null; $g = $null
  try {
    Invoke-WebRequest "https://anigo-h.goegh.kr/upload/common/fm/images/anigo-h/img_$f" -OutFile $tmp -UseBasicParsing
    $img = [Drawing.Image]::FromFile($tmp)
    # apply EXIF orientation from phone cameras
    if ($img.PropertyIdList -contains 0x0112) {
      switch ($img.GetPropertyItem(0x0112).Value[0]) {
        3 { $img.RotateFlip('Rotate180FlipNone') }
        6 { $img.RotateFlip('Rotate90FlipNone') }
        8 { $img.RotateFlip('Rotate270FlipNone') }
      }
    }
    $scale = [Math]::Min(1.0, [double]$MaxSize / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
    $bmp = New-Object Drawing.Bitmap $w, $h
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($out, $codec, $params)
    Write-Output "[$i/$($files.Count)] $out"
  } catch {
    Write-Output "[$i/$($files.Count)] FAIL $f : $_ (line $($_.InvocationInfo.ScriptLineNumber), size $w x $h)"
  } finally {
    if ($g) { $g.Dispose() }; if ($bmp) { $bmp.Dispose() }; if ($img) { $img.Dispose() }
  }
}
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Output "done: $((Get-ChildItem $outDir -Filter *.jpg).Count) files"
