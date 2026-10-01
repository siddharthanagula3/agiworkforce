$triple = ((rustc -vV) | Select-String '^host: ').ToString().Split(' ')[1]
New-Item -ItemType Directory -Force -Path apps/desktop/src-tauri/binaries | Out-Null
New-Item -ItemType File -Force -Path "apps/desktop/src-tauri/binaries/native_messaging_host-$triple.exe" | Out-Null
