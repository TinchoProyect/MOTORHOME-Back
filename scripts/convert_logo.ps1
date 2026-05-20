Add-Type -AssemblyName System.Drawing
$jpgPath = "c:\Users\Martin\Documents\sistema-gestion-proveedores-2\public\logo-lamda.jpg"
$icoPath = "c:\Users\Martin\Documents\sistema-gestion-proveedores-2\public\logo-lamda.ico"

if (Test-Path $jpgPath) {
    $bitmap = New-Object System.Drawing.Bitmap($jpgPath)
    $hIcon = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fileStream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $icon.Save($fileStream)
    $fileStream.Close()
    $icon.Dispose()
    $bitmap.Dispose()
    Write-Output "Icono generado exitosamente en: $icoPath"
} else {
    Write-Error "No se encontro el logo en la ruta especificada."
}
