import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { getCurrentDate, toast } from '../utils.js';
import { buildDTRExportFilename } from './export-filenames.js';
import { buildDtrSheetModel } from './dtr-sheet-model.js';

// A4 portrait with three-quarter inch margins.
const MM_PER_INCH = 25.4;
const MARGIN = MM_PER_INCH * 0.75;
const TIME_COLUMN_WIDTH = 16;

// This exporter's own column set. Activities are left out on purpose: ten
// columns do not fit A4 portrait at a readable size, and the free-text field
// is the one that gives first. Activities stay in the on-screen sheet and in
// the spreadsheet export.
const HEADERS = ['Day', 'Day Name', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hrs', 'OT', 'Remarks'];
const COLUMN_WIDTHS = [9, 20, TIME_COLUMN_WIDTH, TIME_COLUMN_WIDTH, TIME_COLUMN_WIDTH, TIME_COLUMN_WIDTH, 16, 12];

function toRowValues(row) {
  return [
    row.day,
    row.dayName,
    row.amTimeIn === '--' ? '' : row.amTimeIn,
    row.amTimeOut === '--' ? '' : row.amTimeOut,
    row.pmTimeIn === '--' ? '' : row.pmTimeIn,
    row.pmTimeOut === '--' ? '' : row.pmTimeOut,
    row.hasClockOut ? row.hoursRendered.toFixed(2) : '',
    row.overtimeHours > 0 ? row.overtimeHours.toFixed(2) : '',
    row.remarks,
  ];
}

export function exportDTRtoPDF(entries, holidays, month, year, profile, settings, username = '') {
  try {
    const sheet = buildDtrSheetModel({ entries, holidays, month, year, profile, settings });
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    const rightColumnX = 114;

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DAILY TIME RECORD', centerX, MARGIN, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Civil Service Form No. 48', centerX, MARGIN + 5, { align: 'center' });

    // Info fields
    doc.setFontSize(9);
    const y0 = MARGIN + 12;
    doc.text(`Name: ${profile.name || '_______________'}`, MARGIN, y0);
    doc.text(`Department: ${profile.department || '_______________'}`, rightColumnX, y0);
    doc.text(`Month/Year: ${sheet.monthLabel}`, MARGIN, y0 + 6);
    doc.text(`Supervisor: ${profile.supervisor || '_______________'}`, rightColumnX, y0 + 6);
    doc.text(`Position: ${profile.position || 'OJT Trainee'}`, MARGIN, y0 + 12);
    doc.text(`Schedule: ${sheet.scheduleText}`, rightColumnX, y0 + 12, {
      maxWidth: pageWidth - MARGIN - rightColumnX,
    });

    const remarksWidth = pageWidth - (MARGIN * 2) - COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);

    doc.autoTable({
      startY: y0 + 16,
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      head: [HEADERS],
      body: sheet.rows.map(toRowValues),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1, lineWidth: 0.1, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries([
        ...COLUMN_WIDTHS.map((width, column) => [column, { halign: 'center', cellWidth: width }]),
        [HEADERS.length - 1, { halign: 'left', cellWidth: remarksWidth }],
      ]),
    });

    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Hours: ${sheet.totals.totalHours.toFixed(2)}`, MARGIN, finalY);
    doc.text(`Overtime: ${sheet.totals.totalOvertime.toFixed(2)}`, centerX - 18, finalY);
    doc.text(`Days Worked: ${sheet.totals.daysWorked}`, pageWidth - MARGIN, finalY, { align: 'right' });

    // Certification
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    const certY = finalY + 8;
    doc.text('I CERTIFY on my honor that the above is a true and correct report of the hours of work performed,', centerX, certY, { align: 'center' });
    doc.text('record of which was made daily at the time of arrival and departure from office.', centerX, certY + 3.5, { align: 'center' });

    // Signatures
    const sigY = certY + 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.line(MARGIN, sigY, MARGIN + 60, sigY);
    doc.text(profile.name || '_______________', MARGIN + 30, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text("Trainee's Signature", MARGIN + 30, sigY + 8, { align: 'center' });

    doc.setFontSize(8);
    doc.line(pageWidth - MARGIN - 60, sigY, pageWidth - MARGIN, sigY);
    doc.text(profile.supervisor || '_______________', pageWidth - MARGIN - 30, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text('Verified By (Supervisor)', pageWidth - MARGIN - 30, sigY + 8, { align: 'center' });

    doc.save(buildDTRExportFilename({
      profileName: profile.name,
      username,
      month,
      year,
      exportedDate: getCurrentDate(),
      extension: 'pdf',
    }));
    toast('PDF exported!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    toast('PDF export failed', 'error');
  }
}