import * as XLSX from 'xlsx';
import { MONTHS, getCurrentDate, toast } from '../utils.js';
import { buildDTRExportFilename } from './export-filenames.js';
import { buildDtrSheetModel } from './dtr-sheet-model.js';

// This exporter's own column set. The model supplies row values, not headers,
// because the PDF wants a different set and both bind positionally.
const HEADERS = [
  'Day', 'Day Name', 'AM In', 'AM Out', 'PM In', 'PM Out',
  'Hours Rendered', 'Overtime', 'Late (min)', 'Undertime (min)', 'Activities', 'Remarks',
];
const DAY_NAME_COLUMN = 1;
const HOURS_COLUMN = 6;
const OVERTIME_COLUMN = 7;
const LATE_COLUMN = 8;
const UNDERTIME_COLUMN = 9;
const ACTIVITIES_COLUMN = 10;
const HEADER_ROW_COUNT = 8;

const timeCell = (value) => (value === '--' ? '' : value);
const hoursCell = (value) => Number(value.toFixed(2));
// Numeric cells, so a spreadsheet can still sum and sort these columns.
const numberCell = (value) => (value > 0 ? value : '');

function toRowValues(row) {
  return [
    row.day,
    row.dayName,
    timeCell(row.amTimeIn),
    timeCell(row.amTimeOut),
    timeCell(row.pmTimeIn),
    timeCell(row.pmTimeOut),
    row.hasClockOut ? hoursCell(row.hoursRendered) : '',
    numberCell(row.overtimeHours),
    numberCell(row.lateMinutes),
    numberCell(row.undertimeMinutes),
    row.activities,
    row.remarks,
  ];
}

function applyCellStyle(ws, address, style) {
  if (!ws[address]) return;
  const current = ws[address].s || {};
  ws[address].s = {
    ...current,
    ...style,
    alignment: { ...(current.alignment || {}), ...(style.alignment || {}) },
  };
}

export function exportDTRtoExcel(entries, holidays, month, year, profile, settings, username = '') {
  try {
    const sheet = buildDtrSheetModel({ entries, holidays, month, year, profile, settings });
    const data = [
      ['DAILY TIME RECORD'],
      ['Civil Service Form No. 48'],
      [],
      [`Name: ${profile.name || ''}`, '', '', `Department: ${profile.department || ''}`],
      [`Month/Year: ${sheet.monthLabel}`, '', '', `Supervisor: ${profile.supervisor || ''}`],
      [`Position: ${profile.position || 'OJT Trainee'}`, '', '', `Schedule: ${sheet.scheduleText}`],
      [],
      HEADERS,
    ];

    sheet.rows.forEach(row => data.push(toRowValues(row)));

    data.push([]);
    data.push([
      '', '', '', '', '', 'TOTAL:',
      hoursCell(sheet.totals.totalHours),
      hoursCell(sheet.totals.totalOvertime),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 20 },
    ];
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };

    const { e: lastRow } = XLSX.utils.decode_range(ws['!ref']);
    for (let row = HEADER_ROW_COUNT; row <= lastRow; row += 1) {
      const address = (column) => XLSX.utils.encode_cell({ r: row, c: column });
      applyCellStyle(ws, address(DAY_NAME_COLUMN), { alignment: { horizontal: 'left', wrapText: true } });
      applyCellStyle(ws, address(ACTIVITIES_COLUMN), {
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
      });
      [HOURS_COLUMN, OVERTIME_COLUMN, LATE_COLUMN, UNDERTIME_COLUMN].forEach(column => {
        applyCellStyle(ws, address(column), { alignment: { horizontal: 'right' } });
      });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `DTR ${MONTHS[month].slice(0, 3)} ${year}`);
    XLSX.writeFile(wb, buildDTRExportFilename({
      profileName: profile.name,
      username,
      month,
      year,
      exportedDate: getCurrentDate(),
      extension: 'xlsx',
    }));
    toast('Excel exported!', 'success');
  } catch (err) {
    console.error('Excel export error:', err);
    toast('Excel export failed', 'error');
  }
}