Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $PSScriptRoot '..\public\icons'
$iconDirectory = [System.IO.Path]::GetFullPath($iconDirectory)

function New-StrappIcon {
  param(
    [Parameter(Mandatory)] [int] $Size,
    [Parameter(Mandatory)] [string] $Output,
    [switch] $Maskable
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#176b58'))

    $inset = if ($Maskable) { 0.324 } else { 0.295 }
    $left = [int]($Size * $inset)
    $top = [int]($Size * $inset)
    $width = [int]($Size * (1 - 2 * $inset))
    $bar = [Math]::Max(2, [int]($Size * 0.105))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#fffefb'))
    $gold = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#e4b85f'))
    try {
      $graphics.FillRectangle($white, $left, $top, $bar, $width)
      $graphics.FillRectangle($white, $left, $top, $width, $bar)
      $graphics.FillRectangle($white, $left, $top + [int](($width - $bar) / 2), [int]($width * 0.88), $bar)
      $graphics.FillRectangle($white, $left, $top + $width - $bar, $width, $bar)
      $dot = [Math]::Max(4, [int]($Size * 0.105))
      $graphics.FillEllipse($gold, $left + $width - [int]($dot * 0.5), $top + $width - [int]($dot * 0.5), $dot, $dot)
    }
    finally {
      $white.Dispose()
      $gold.Dispose()
    }

    $bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-StrappIcon -Size 180 -Output (Join-Path $iconDirectory 'icon-180.png')
New-StrappIcon -Size 192 -Output (Join-Path $iconDirectory 'icon-192.png')
New-StrappIcon -Size 512 -Output (Join-Path $iconDirectory 'icon-512.png')
New-StrappIcon -Size 512 -Output (Join-Path $iconDirectory 'icon-maskable-512.png') -Maskable
