$file = "src/views/dashboard.html"
$content = Get-Content $file
$head = $content[0..1483]
$patch = Get-Content "src/views/temp_render_patch.txt"
$tail = $content[1552..($content.Count-1)]
$newContent = $head + $patch + $tail
$newContent | Set-Content $file -Encoding UTF8
Write-Host "Patch applied successfully."
