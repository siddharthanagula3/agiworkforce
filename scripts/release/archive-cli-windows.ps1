$archivePlatform = "$env:CLI_PLATFORM".Replace("win32-", "windows-")
cd dist/cli/$env:CLI_PLATFORM/bin
7z a "../../../../agiworkforce-$archivePlatform.zip" *
