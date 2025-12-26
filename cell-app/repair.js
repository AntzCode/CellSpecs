// repair.js - Repair script for cell data JSON files
//
// This script scans all JSON files in the 'data' directory and updates the 'stage' field
// based on the completeness of the data. The stage indicates the testing progress:
//
// Stage 0: New - Basic info entered (cell number, voltage, IR)
// Stage 1: Testing - First charge voltage entered
// Stage 2: Charging - Capacity data (mAh, mWh, flat voltage) entered
// Stage 3: On hold - Recharge voltage entered
// Stage 4: Tested - 7-day voltage and IR entered
//
// Usage: Run with `node repair.js` or `docker-compose exec app node repair.js`
// This is useful after importing data or if stages become inconsistent.

const fs = require('fs');
const path = require('path');

const dataDir = 'data';

fs.readdir(dataDir, (err, files) => {
if (err) throw err;
files.filter(f => f.endsWith('.json')).forEach(file => {
  const filePath = path.join(dataDir, file);
  const cell = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let stage = 0;
  if (cell.firstChargeVoltage) stage = 1;
  if (cell.capacityMah && cell.capacityMwh && cell.voltageFlat) stage = 2;
  if (cell.voltageRecharge) stage = 3;
  if (cell.voltage7days && cell.ir7days) stage = 4;
  cell.stage = stage;
  // Convert dates to date-only format
  if (cell.rechargeDate) {
    if (cell.rechargeDate.includes('T')) {
      cell.rechargeDate = cell.rechargeDate.split('T')[0];
    } else if (cell.rechargeDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [dd, mm, yyyy] = cell.rechargeDate.split('/');
      cell.rechargeDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  if (cell.voltage7daysDate) {
    if (cell.voltage7daysDate.includes('T')) {
      cell.voltage7daysDate = cell.voltage7daysDate.split('T')[0];
    } else if (cell.voltage7daysDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [dd, mm, yyyy] = cell.voltage7daysDate.split('/');
      cell.voltage7daysDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(cell, null, 2));
  console.log(`Repaired ${file}: stage ${stage}`);
});
});