param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId,

  [Parameter(Mandatory = $false)]
  [string]$HostPath = "$Env:LOCALAPPDATA\Programs\AGI Workforce\native_messaging_host.exe"
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$template = Join-Path $scriptDir '..\native-host\com.agiworkforce.browser.json.template'
if (!(Test-Path $template)) {
  throw "Template not found: $template"
}

$manifestDir = Join-Path $Env:LOCALAPPDATA 'com.agiworkforce.desktop\native-messaging\chrome'
$edgeManifestDir = Join-Path $Env:LOCALAPPDATA 'com.agiworkforce.desktop\native-messaging\edge'
$manifestPath = Join-Path $manifestDir 'com.agiworkforce.browser.json'
$edgeManifestPath = Join-Path $edgeManifestDir 'com.agiworkforce.browser.json'

New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
New-Item -ItemType Directory -Force -Path $edgeManifestDir | Out-Null

$escapedHostPath = $HostPath.Replace('\', '\\')
$json = Get-Content -Raw $template
$json = $json.Replace('<EXTENSION_ID_PLACEHOLDER>', $ExtensionId)
$json = $json.Replace('<NATIVE_HOST_PATH_PLACEHOLDER>', $escapedHostPath)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)
[System.IO.File]::WriteAllText($edgeManifestPath, $json, $utf8NoBom)

$chromeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser'
$edgeKey = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.agiworkforce.browser'

New-Item -Force -Path $chromeKey | Out-Null
New-Item -Force -Path $edgeKey | Out-Null
& reg.exe add 'HKCU\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser' /ve /t REG_SZ /d $manifestPath /f | Out-Null
& reg.exe add 'HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.agiworkforce.browser' /ve /t REG_SZ /d $edgeManifestPath /f | Out-Null

Write-Host "Installed: $manifestPath"
Write-Host "Installed: $edgeManifestPath"
Write-Host 'Registered HKCU Chrome and Edge native messaging host keys.'
Write-Host 'Reload the extension in chrome://extensions to apply.'
