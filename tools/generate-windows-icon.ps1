param(
  [string]$SourcePng = "build/onnx-nova-logo.png",
  [string]$DestinationIco = "build/ixon.ico"
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 256)
$sourcePath = (Resolve-Path $SourcePng).Path
$destinationPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationIco)

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

function New-PngBytes {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.DrawImage($Image, 0, 0, $Size, $Size)
    } finally {
      $graphics.Dispose()
    }

    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $bitmap.Dispose()
  }
}

try {
  $images = foreach ($size in $sizes) {
    [pscustomobject]@{
      Size = $size
      Bytes = New-PngBytes -Image $sourceImage -Size $size
    }
  }

  $directorySize = 6 + (16 * $images.Count)
  $offset = $directorySize

  $outputDirectory = Split-Path -Parent $destinationPath
  if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  }

  $fileStream = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $writer = New-Object System.IO.BinaryWriter $fileStream
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]$images.Count)

      foreach ($image in $images) {
        $iconSize = if ($image.Size -ge 256) { 0 } else { $image.Size }
        $writer.Write([byte]$iconSize)
        $writer.Write([byte]$iconSize)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$image.Bytes.Length)
        $writer.Write([UInt32]$offset)
        $offset += $image.Bytes.Length
      }

      foreach ($image in $images) {
        $writer.Write($image.Bytes)
      }
    } finally {
      $writer.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Created $DestinationIco from $SourcePng with sizes: $($sizes -join ', ')"
