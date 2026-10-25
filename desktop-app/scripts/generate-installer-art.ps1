# Generates 24-bit BMP artwork for the NSIS assisted installer.
# Windows-only: called by GitHub Actions before electron-builder.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assets = Join-Path $PSScriptRoot '..\assets'
$assets = [System.IO.Path]::GetFullPath($assets)
New-Item -ItemType Directory -Path $assets -Force | Out-Null

function New-BrandBitmap([int]$width, [int]$height, [string]$output, [bool]$header) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  try {
    for ($y = 0; $y -lt $height; $y++) {
      $fraction = $y / [math]::Max(1, $height - 1)
      $red = [int](13 + $fraction * 8)
      $green = [int](16 + $fraction * 7)
      $blue = [int](31 + $fraction * 15)
      $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($red, $green, $blue))
      try { $graphics.DrawLine($pen, 0, $y, $width, $y) } finally { $pen.Dispose() }
    }

    $aqua = [System.Drawing.Color]::FromArgb(33, 223, 219)
    $purple = [System.Drawing.Color]::FromArgb(131, 85, 247)
    $white = [System.Drawing.Color]::FromArgb(239, 246, 255)
    $muted = [System.Drawing.Color]::FromArgb(153, 172, 200)
    $aquaPen = [System.Drawing.Pen]::new($aqua, 3)
    $purplePen = [System.Drawing.Pen]::new($purple, 2)
    $titleFont = [System.Drawing.Font]::new('Segoe UI', $(if ($header) { 11 } else { 17 }), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
    $smallFont = [System.Drawing.Font]::new('Segoe UI', $(if ($header) { 7 } else { 9 }), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
    $whiteBrush = [System.Drawing.SolidBrush]::new($white)
    $mutedBrush = [System.Drawing.SolidBrush]::new($muted)
    $aquaBrush = [System.Drawing.SolidBrush]::new($aqua)
    try {
      if ($header) {
        $graphics.DrawEllipse($aquaPen, 8, 9, 35, 35)
        $graphics.DrawLine($purplePen, 14, 26, 23, 35)
        $graphics.DrawLine($aquaPen, 23, 35, 37, 15)
        $graphics.DrawString('VortexChat', $titleFont, $whiteBrush, 49, 8)
        $graphics.DrawString('PFT STUDIO', $smallFont, $aquaBrush, 51, 31)
      } else {
        # Subtle brand grid.
        $gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(27, 39, 59), 1)
        try {
          for ($x = 0; $x -lt $width; $x += 21) { $graphics.DrawLine($gridPen, $x, 0, $x, $height) }
          for ($y = 0; $y -lt $height; $y += 21) { $graphics.DrawLine($gridPen, 0, $y, $width, $y) }
        } finally { $gridPen.Dispose() }
        $graphics.DrawEllipse($aquaPen, 35, 42, 94, 94)
        $graphics.DrawArc($purplePen, 28, 35, 108, 108, 210, 140)
        $graphics.DrawLine($purplePen, 51, 89, 73, 110)
        $graphics.DrawLine($aquaPen, 73, 110, 111, 62)
        $graphics.DrawString('VORTEX', $titleFont, $whiteBrush, 22, 164)
        $graphics.DrawString('CHAT', $titleFont, $aquaBrush, 22, 191)
        $graphics.DrawString('STREAM. CONNECT.', $smallFont, $mutedBrush, 20, 238)
        $graphics.DrawString('CREATE.', $smallFont, $mutedBrush, 20, 255)
        $graphics.FillRectangle($aquaBrush, 20, 283, 38, 3)
        $graphics.DrawString('PFT STUDIO', $smallFont, $mutedBrush, 20, 291)
      }
    } finally {
      $aquaPen.Dispose(); $purplePen.Dispose()
      $titleFont.Dispose(); $smallFont.Dispose()
      $whiteBrush.Dispose(); $mutedBrush.Dispose(); $aquaBrush.Dispose()
    }
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Bmp)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-BrandBitmap 164 314 (Join-Path $assets 'installerSidebar.bmp') $false
New-BrandBitmap 150 57 (Join-Path $assets 'installerHeader.bmp') $true
New-BrandBitmap 164 314 (Join-Path $assets 'uninstallerSidebar.bmp') $false
Write-Host 'Generated VortexChat NSIS artwork (24-bit BMP).'
