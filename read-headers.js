const XLSX = require('xlsx');

function printHeaders(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- ${file} ---`);
  console.log(json[0]);
}

printHeaders('c:\\AI\\Hellmann\\Reporting\\LTAP_21.05.XLSX');
printHeaders('c:\\AI\\Hellmann\\Reporting\\VEKP_.xlsx');
printHeaders('c:\\AI\\Hellmann\\Reporting\\VEPO_.xlsx');
