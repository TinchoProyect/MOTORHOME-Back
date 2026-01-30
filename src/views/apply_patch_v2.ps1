$file = "src/views/dashboard.html"
$content = Get-Content $file
$head = $content[0..1414]
$patch = Get-Content "src/views/dashboard_patch_v2.txt"
$tail = @("    </script>", "</body>", "</html>")
$newContent = $head + $patch + $tail
$newContent | Set-Content $file -Encoding UTF8
Write-Host "Dashboard V2 Patch applied."
