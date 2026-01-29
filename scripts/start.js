const { exec } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';
const scriptName = isWindows ? 'start_motorhome.bat' : 'start_motorhome.sh';
const scriptPath = path.join(__dirname, scriptName);

console.log(`[Start Wrapper] Detectado OS: ${os.platform()}`);
console.log(`[Start Wrapper] Ejecutando: ${scriptPath}`);

const child = exec(isWindows ? `"${scriptPath}"` : `bash "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Stderr: ${stderr}`);
        return;
    }
    console.log(stdout);
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
