try {
    const xlsx = require('xlsx');
    console.log("XLSX Loaded Successfully");
    const wb = xlsx.utils.book_new();
    console.log("Workbook created");
    process.exit(0);
} catch (e) {
    console.error("Error loading xlsx:", e);
    process.exit(1);
}
