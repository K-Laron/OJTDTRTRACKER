import * as XLSX from 'xlsx';
import { MONTHS, getDayName, getDaysInMonth, toast, fmtTimeStr } from '../utils.js';

export function exportDTRtoExcel(entries, month, year, profile, settings) {
  try {
    const data = [
      ['DAILY TIME RECORD'],
      ['Civil Service Form No. 48'],
      [],
      [`Name: ${profile.name || ''}`, '', '', `Department: ${profile.department || ''}`],
      [`Month/Year: ${MONTHS[month]} ${year}`, '', '', `Supervisor: ${profile.supervisor || ''}`],
      [`Position: ${profile.position || 'OJT Trainee'}`, '', '', `Schedule: ${settings.expectedTimeIn} - ${settings.expectedTimeOut}`],
      [],
      ['Day', 'Day Name', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours Rendered', 'Overtime', 'Late (min)', 'Undertime (min)', 'Activities', 'Remarks'],
    ];

    const daysInMonth = getDaysInMonth(year, month);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const e = entries.find(x => x.date === dateStr);
      data.push([
        d,
        getDayName(dateStr),
        fmtTimeStr(e?.amTimeIn) === '--' ? '' : fmtTimeStr(e?.amTimeIn),
        fmtTimeStr(e?.amTimeOut) === '--' ? '' : fmtTimeStr(e?.amTimeOut),
        fmtTimeStr(e?.pmTimeIn) === '--' ? '' : fmtTimeStr(e?.pmTimeIn),
        fmtTimeStr(e?.pmTimeOut) === '--' ? '' : fmtTimeStr(e?.pmTimeOut),
        (e?.amTimeOut || e?.pmTimeOut) ? parseFloat(e.hoursRendered.toFixed(2)) : '',
        e?.overtimeHours > 0 ? parseFloat(e.overtimeHours.toFixed(2)) : '',
        e?.lateMinutes || '',
        e?.undertimeMinutes || '',
        e?.activities || '',
        e?.remarks || '',
      ]);
    }

    const totalHrs = entries.reduce((s, e) => s + (e.hoursRendered || 0), 0);
    const totalOT = entries.reduce((s, e) => s + (e.overtimeHours || 0), 0);
    data.push([]);
    data.push(['', '', '', '', '', 'TOTAL:', parseFloat(totalHrs.toFixed(2)), parseFloat(totalOT.toFixed(2))]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `DTR ${MONTHS[month].slice(0, 3)} ${year}`);
    XLSX.writeFile(wb, `DTR_${MONTHS[month]}_${year}.xlsx`);
    toast('Excel exported!', 'success');
  } catch (err) {
    console.error('Excel export error:', err);
    toast('Excel export failed', 'error');
  }
}
