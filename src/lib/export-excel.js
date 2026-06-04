import * as XLSX from 'xlsx';
import { MONTHS, getCurrentDate, toast } from '../utils.js';
import { buildDTRExportFilename } from './export-filenames.js';
import { buildDtrSheetModel } from './dtr-sheet-model.js';

function applyCellAlignment(ws, address, alignment) {
  if (!ws[address]) return;
  ws[address].s = {
    ...(ws[address].s || {}),
    alignment: {
      ...((ws[address].s || {}).alignment || {}),
      ...alignment,
    },
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
      ['Day', 'Day Name', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours Rendered', 'Overtime', 'Late (min)', 'Undertime (min)', 'Remarks'],
    ];

    for (const row of sheet.rows) {
      data.push([
        row.day,
        row.dayName,
        row.amTimeIn === '--' ? '' : row.amTimeIn,
        row.amTimeOut === '--' ? '' : row.amTimeOut,
        row.pmTimeIn === '--' ? '' : row.pmTimeIn,
        row.pmTimeOut === '--' ? '' : row.pmTimeOut,
        row.hoursDisplay ? parseFloat(row.hoursDisplay) : '',
        row.overtimeDisplay,
        row.entry?.lateMinutes || '',
        row.entry?.undertimeMinutes || '',
        row.remarks,
      ]);
    }

    data.push([]);
    data.push(['', '', '', '', '', 'TOTAL:', parseFloat(sheet.totals.totalHoursDisplay), sheet.totals.totalOvertimeDisplay]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 }, { wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 13 }, { wch: 42 },
    ];
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let row = 8; row <= range.e.r; row++) {
      applyCellAlignment(ws, XLSX.utils.encode_cell({ r: row, c: 10 }), {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true,
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
