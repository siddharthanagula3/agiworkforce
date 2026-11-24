$source = Join-Path $PSScriptRoot '../../web/public/logo-512.png'
$destination = Join-Path $PSScriptRoot 'app-icon.png'
Copy-Item -LiteralPath $source -Destination $destination -Force
