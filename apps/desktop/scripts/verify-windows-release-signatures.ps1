$releaseRoot = 'target/release'
$executables = @(
  Get-ChildItem -Path $releaseRoot -Filter '*.exe' -File -ErrorAction SilentlyContinue
  Get-ChildItem -Path "$releaseRoot/bundle/nsis" -Filter '*.exe' -File -ErrorAction SilentlyContinue
) | Sort-Object -Property FullName -Unique
if ($executables.Count -eq 0) {
  throw 'no Windows executables were produced'
}
foreach ($executable in $executables) {
  $signature = Get-AuthenticodeSignature -FilePath $executable.FullName
  if ($signature.Status -ne 'Valid') {
    throw "invalid Authenticode signature for $($executable.FullName): $($signature.Status)"
  }
  Write-Host "Verified Authenticode: $($executable.Name)"
}
