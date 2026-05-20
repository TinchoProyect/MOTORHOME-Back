$WshShell = New-Object -ComObject WScript.Shell
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "LAMDA.lnk"

$nodePath = "C:\Program Files\nodejs\node.exe"
$launcherPath = "c:\Users\Martin\Documents\sistema-gestion-proveedores-2\scripts\launcher.js"
$workingDir = "c:\Users\Martin\Documents\sistema-gestion-proveedores-2"
$iconPath = "c:\Users\Martin\Documents\sistema-gestion-proveedores-2\public\logo-lamda.ico"

if (Test-Path $nodePath) {
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $nodePath
    $Shortcut.Arguments = """$launcherPath"""
    $Shortcut.WorkingDirectory = $workingDir
    $Shortcut.IconLocation = "$iconPath,0"
    $Shortcut.Description = "Iniciar Sistema de Gestion LAMDA"
    $Shortcut.Save()
    Write-Output "Acceso directo creado exitosamente en el Escritorio: $shortcutPath"
} else {
    Write-Error "No se encontro node.exe en la ruta especificada."
}
