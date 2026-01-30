process.on('uncaughtException', (err) => {
    console.error('An unhandled exception occurred:', err);
    console.error(err.stack);
    // Keep alive? No, bad state. But log it.
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log("[Debug Wrapper] Starting Server...");

try {
    require('./server.js');
} catch (e) {
    console.error("Failed to require server.js:", e);
}
