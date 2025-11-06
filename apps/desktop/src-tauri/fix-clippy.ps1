# PowerShell script to fix common clippy warnings

$ErrorActionPreference = "Stop"

# Function to fix redundant closures
function Fix-RedundantClosures {
    param($filePath)

    $content = Get-Content $filePath -Raw

    # Fix |e| Error::Http(e) -> Error::Http
    $content = $content -replace '\|e\|\s*Error::Http\(e\)', 'Error::Http'

    # Fix |e| Error::Calendar(e) -> Error::Calendar
    $content = $content -replace '\|e\|\s*Error::Calendar\(e\)', 'Error::Calendar'

    # Fix |e| Error::Cloud(e) -> Error::Cloud
    $content = $content -replace '\|e\|\s*Error::Cloud\(e\)', 'Error::Cloud'

    # Fix |e| Error::Database(e) -> Error::Database
    $content = $content -replace '\|e\|\s*Error::Database\(e\)', 'Error::Database'

    # Fix |e| Error::Communication(e) -> Error::Communication
    $content = $content -replace '\|e\|\s*Error::Communication\(e\)', 'Error::Communication'

    # Fix |e| Error::Productivity(e) -> Error::Productivity
    $content = $content -replace '\|e\|\s*Error::Productivity\(e\)', 'Error::Productivity'

    # Fix || Utc::now() -> Utc::now
    $content = $content -replace '\|\|\s*Utc::now\(\)', 'Utc::now'

    Set-Content $filePath -Value $content -NoNewline
}

# Function to fix explicit auto-deref
function Fix-AutoDeref {
    param($filePath)

    $content = Get-Content $filePath -Raw

    # Fix &*conn -> &conn (but be careful with context)
    $content = $content -replace '&\*conn,', '&conn,'

    Set-Content $filePath -Value $content -NoNewline
}

# Function to fix useless vec!
function Fix-UselessVec {
    param($filePath)

    $content = Get-Content $filePath -Raw

    # This is more complex, will handle manually for specific files

    Set-Content $filePath -Value $content -NoNewline
}

# Get all Rust files
$rustFiles = Get-ChildItem -Path "src" -Filter "*.rs" -Recurse

foreach ($file in $rustFiles) {
    Write-Host "Processing $($file.FullName)"
    Fix-RedundantClosures $file.FullName
    Fix-AutoDeref $file.FullName
}

Write-Host "Done!"
