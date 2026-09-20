$ErrorActionPreference = 'Stop'
$tools = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/mt.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending
if (-not $tools) { throw 'Windows SDK manifest tool was not found' }
$manifestTool = $tools[0].FullName

function Get-CargoExecutables([string[]]$CargoArguments) {
    $messages = & cargo @CargoArguments --locked --message-format=json-render-diagnostics
    if ($LASTEXITCODE -ne 0) { throw "cargo $CargoArguments failed" }
    $artifacts = $messages | ForEach-Object { $_ | ConvertFrom-Json } |
        Where-Object { $_.reason -eq 'compiler-artifact' -and $_.executable }
    if (-not $artifacts) { throw "cargo $CargoArguments produced no executable" }
    return $artifacts.executable
}

$executables = @(
    Get-CargoExecutables @('build', '-p', 'agiworkforce-desktop', '--bin', 'agiworkforce-desktop')
    Get-CargoExecutables @('test', '-p', 'agiworkforce-desktop', '--lib', '--no-run')
)
foreach ($executable in $executables) {
    $manifestPath = "$executable.manifest.xml"
    & $manifestTool -nologo "-inputresource:$executable;#1" "-out:$manifestPath"
    if ($LASTEXITCODE -ne 0) { throw "Missing application manifest: $executable" }
    [xml]$manifest = Get-Content -Raw $manifestPath
    $dependency = $manifest.SelectSingleNode("//*[local-name()='dependency']/*[local-name()='dependentAssembly']/*[local-name()='assemblyIdentity' and @name='Microsoft.Windows.Common-Controls' and @version='6.0.0.0' and @publicKeyToken='6595b64144ccf1df']")
    if (-not $dependency) { throw "Missing Common Controls v6 dependency: $executable" }
    Write-Host "Verified Common Controls v6 manifest: $executable"
}
