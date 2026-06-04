import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function installBrowserStubs() {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.document = {
    createElement: () => ({
      className: '',
      textContent: '',
      classList: { add() {}, remove() {} },
      remove() {},
    }),
    body: { appendChild() {}, className: '' },
    dispatchEvent() {},
  };
  globalThis.requestAnimationFrame = fn => fn();
  globalThis.setTimeout = () => 0;
}

const profile = {
  name: 'Kenneth Laron',
  department: 'Awani',
  supervisor: 'Supervisor Name',
  position: 'OJT Trainee',
};

const settings = {
  expectedTimeIn: '08:00',
  expectedTimeOut: '17:00',
  timeFormat: '24h',
};

const entries = [{
  date: '2026-01-01',
  amTimeIn: '08:00',
  amTimeOut: '12:00',
  pmTimeIn: '13:00',
  pmTimeOut: '17:00',
  hoursRendered: 8,
  overtimeHours: 0,
  lateMinutes: 0,
  undertimeMinutes: 0,
  activities: 'Prepared daily activity report',
  remarks: 'Reviewed',
}];

const overtimeEntries = [{
  date: '2026-03-09',
  amTimeIn: '07:00',
  amTimeOut: '12:00',
  pmTimeIn: '13:00',
  pmTimeOut: '18:30',
  hoursRendered: 10.5,
  overtimeHours: 2.5,
  lateMinutes: 0,
  undertimeMinutes: 0,
  activities: 'Prepared daily activity report',
  remarks: 'Reviewed',
}];

test('PDF DTR export uses A4 paper, full day names, and centered remarks column', async () => {
  installBrowserStubs();
  const originalAutoTable = jsPDF.API.autoTable;
  const originalSave = jsPDF.API.save;
  let tableOptions = null;
  let savedPageSize = null;

  jsPDF.API.autoTable = function captureAutoTable(options) {
    tableOptions = options;
    this.lastAutoTable = { finalY: 240 };
    return this;
  };
  jsPDF.API.save = function captureSave() {
    savedPageSize = {
      width: this.internal.pageSize.getWidth(),
      height: this.internal.pageSize.getHeight(),
    };
  };

  try {
    const { exportDTRtoPDF } = await import('./export-pdf.js');
    exportDTRtoPDF(entries, [], 0, 2026, profile, settings, 'kenneth.awani');
  } finally {
    jsPDF.API.autoTable = originalAutoTable;
    jsPDF.API.save = originalSave;
  }

  assert.ok(savedPageSize, 'expected PDF export to save a document');
  assert.equal(Math.round(savedPageSize.width), 210);
  assert.equal(Math.round(savedPageSize.height), 297);
  assert.deepEqual(tableOptions.head[0], ['Day', 'Day', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hrs', 'Remarks']);
  assert.equal(tableOptions.body[0][1], 'Thursday');
  assert.equal(tableOptions.columnStyles[7].halign, 'center');
  assert.equal(tableOptions.columnStyles[7].valign, 'middle');
});

test('PDF DTR export uses A4 three-quarter-inch margins, weekdays only, no OT column, and 9.5pt table text', async () => {
  installBrowserStubs();
  const originalAutoTable = jsPDF.API.autoTable;
  const originalSave = jsPDF.API.save;
  let tableOptions = null;
  let savedPageSize = null;

  jsPDF.API.autoTable = function captureAutoTable(options) {
    tableOptions = options;
    this.lastAutoTable = { finalY: 240 };
    return this;
  };
  jsPDF.API.save = function captureSave() {
    savedPageSize = {
      width: this.internal.pageSize.getWidth(),
      height: this.internal.pageSize.getHeight(),
    };
  };

  try {
    const { exportDTRtoPDF } = await import('./export-pdf.js');
    exportDTRtoPDF(entries, [], 0, 2026, profile, settings, 'kenneth.awani');
  } finally {
    jsPDF.API.autoTable = originalAutoTable;
    jsPDF.API.save = originalSave;
  }

  const columnWidths = Object.values(tableOptions.columnStyles).map(style => style.cellWidth);
  const totalColumnWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const usablePageWidth = savedPageSize.width - tableOptions.margin.left - tableOptions.margin.right;
  const threeQuarterInchMm = 25.4 * 0.75;

  assert.equal(Math.round(savedPageSize.width), 210);
  assert.equal(Math.round(savedPageSize.height), 297);
  assert.ok(Math.abs(tableOptions.margin.left - threeQuarterInchMm) < 0.1);
  assert.ok(Math.abs(tableOptions.margin.right - threeQuarterInchMm) < 0.1);
  assert.ok(Math.abs(tableOptions.margin.top - threeQuarterInchMm) < 0.1);
  assert.ok(Math.abs(tableOptions.margin.bottom - threeQuarterInchMm) < 0.1);
  assert.ok(tableOptions.startY >= tableOptions.margin.top);
  assert.equal(tableOptions.styles.fontSize, 9.5);
  assert.equal(tableOptions.head[0].includes('OT'), false);
  assert.equal(tableOptions.body.some(row => row[1] === 'Saturday' || row[1] === 'Sunday'), false);
  assert.ok(tableOptions.columnStyles[7].cellWidth <= 60);
  assert.equal(Math.round(totalColumnWidth), Math.round(usablePageWidth));
});

test('Excel DTR export marks the worksheet as A4 and centers remarks cells', async () => {
  installBrowserStubs();
  const originalWriteFile = XLSX.writeFile;
  let workbook = null;

  XLSX.writeFile = capturedWorkbook => {
    workbook = capturedWorkbook;
  };

  try {
    const { exportDTRtoExcel } = await import('./export-excel.js');
    exportDTRtoExcel(entries, [], 0, 2026, profile, settings, 'kenneth.awani');
  } finally {
    XLSX.writeFile = originalWriteFile;
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  assert.equal(worksheet['B9'].v, 'Thursday');
  assert.equal(worksheet['K8'].v, 'Remarks');
  assert.equal(worksheet['L8'], undefined);
  assert.equal(worksheet['!pageSetup'].paperSize, 9);
  assert.equal(worksheet['K9'].s.alignment.horizontal, 'center');
  assert.equal(worksheet['K9'].s.alignment.vertical, 'center');
});

test('PDF DTR export keeps overtime as a bottom total instead of a table column', async () => {
  installBrowserStubs();
  const originalAutoTable = jsPDF.API.autoTable;
  const originalSave = jsPDF.API.save;
  let tableOptions = null;
  let pdfOutput = '';

  jsPDF.API.autoTable = function captureAutoTable(options) {
    tableOptions = options;
    this.lastAutoTable = { finalY: 240 };
    return this;
  };
  jsPDF.API.save = function captureSave() {
    pdfOutput = this.output();
  };

  try {
    const { exportDTRtoPDF } = await import('./export-pdf.js');
    exportDTRtoPDF(overtimeEntries, [], 2, 2026, profile, settings, 'kenneth.awani');
  } finally {
    jsPDF.API.autoTable = originalAutoTable;
    jsPDF.API.save = originalSave;
  }

  assert.equal(tableOptions.head[0].includes('OT'), false);
  assert.equal(tableOptions.body[5][6], '10.50');
  assert.equal(tableOptions.body[5][7], 'Reviewed');
  assert.match(pdfOutput, /Overtime: 30 min/);
});

test('DTR exports put holiday name in remarks without an activities column', async () => {
  installBrowserStubs();
  const originalAutoTable = jsPDF.API.autoTable;
  const originalSave = jsPDF.API.save;
  let tableOptions = null;

  jsPDF.API.autoTable = function captureAutoTable(options) {
    tableOptions = options;
    this.lastAutoTable = { finalY: 240 };
    return this;
  };
  jsPDF.API.save = function captureSave() {};

  try {
    const { exportDTRtoPDF } = await import('./export-pdf.js');
    exportDTRtoPDF([], [{ date: '2026-01-01', type: 'holiday', name: 'New Year' }], 0, 2026, profile, settings, 'kenneth.awani');
  } finally {
    jsPDF.API.autoTable = originalAutoTable;
    jsPDF.API.save = originalSave;
  }

  assert.equal(tableOptions.body[0].length, 8);
  assert.equal(tableOptions.body[0][7], 'Holiday - New Year');
});
