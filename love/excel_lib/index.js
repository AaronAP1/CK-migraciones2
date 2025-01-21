const XLSX = require("xlsx");

function parseExcelFromBase64(fileToBase64) {
  console.log("[DEBUG] Decoding and parsing Excel file");
  const prefix = "base64,";
  const base64Data = fileToBase64.includes(prefix)
    ? fileToBase64.split(prefix)[1]
    : fileToBase64;
  const buffer = Buffer.from(base64Data, "base64");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  const excelArray = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null });
  console.log(`[DEBUG] Parsed ${excelArray.length} rows from Excel`);
  return excelArray;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  console.log(`[DEBUG] Divided data into ${chunks.length} chunks of size ${size}`);
  return chunks;
}