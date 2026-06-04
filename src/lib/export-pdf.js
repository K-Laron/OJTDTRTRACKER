import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { getCurrentDate, toast } from '../utils.js';
import { buildDTRExportFilename } from './export-filenames.js';
import { DTR_SHEET_COLUMNS, buildDtrSheetModel } from './dtr-sheet-model.js';

const MM_PER_INCH = 25.4;
const SIDE_MARGIN_MM = MM_PER_INCH * 0.75;
const VERTICAL_MARGIN_MM = MM_PER_INCH * 0.75;
const PDF_DTR_COLUMNS = DTR_SHEET_COLUMNS.filter(column => column !== 'OT');
const WEEKEND_DAY_NAMES = new Set(['Saturday', 'Sunday']);

export function exportDTRtoPDF(entries, holidays, month, year, profile, settings, username = '') {
  try {
    const sheet = buildDtrSheetModel({ entries, holidays, month, year, profile, settings });
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    const marginX = SIDE_MARGIN_MM;
    const topMargin = VERTICAL_MARGIN_MM;
    const bottomMargin = VERTICAL_MARGIN_MM;
    const rightColumnX = 114;

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DAILY TIME RECORD', centerX, topMargin, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Civil Service Form No. 48', centerX, topMargin + 5, { align: 'center' });

    // Info fields
    doc.setFontSize(9);
    const y0 = topMargin + 12;
    doc.text(`Name: ${profile.name || '_______________'}`, marginX, y0);
    doc.text(`Department: ${profile.department || '_______________'}`, rightColumnX, y0);
    doc.text(`Month/Year: ${sheet.monthLabel}`, marginX, y0 + 6);
    doc.text(`Supervisor: ${profile.supervisor || '_______________'}`, rightColumnX, y0 + 6);
    doc.text(`Position: ${profile.position || 'OJT Trainee'}`, marginX, y0 + 12);
    doc.text(`Schedule: ${sheet.scheduleText}`, rightColumnX, y0 + 12, { maxWidth: pageWidth - marginX - rightColumnX });

    doc.autoTable({
      startY: y0 + 16,
      margin: { top: topMargin, right: marginX, bottom: bottomMargin, left: marginX },
      head: [PDF_DTR_COLUMNS],
      body: sheet.rows.filter(row => !WEEKEND_DAY_NAMES.has(row.dayName)).map(row => [
        row.day,
        row.dayName,
        row.amTimeIn,
        row.amTimeOut,
        row.pmTimeIn,
        row.pmTimeOut,
        row.hoursDisplay,
        row.remarks,
      ]),
      theme: 'grid',
      styles: {
        fontSize: 9.5,
        cellPadding: 1,
        lineColor: [80, 80, 80],
        lineWidth: 0.1,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 24 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'center', cellWidth: 15 },
        6: { halign: 'center', cellWidth: 19 },
        7: { halign: 'center', valign: 'middle', cellWidth: pageWidth - (marginX * 2) - 112 },
      },
    });

    const finalY = doc.lastAutoTable.finalY + 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Hours: ${sheet.totals.totalHoursDisplay}`, marginX, finalY);
    doc.text(`Overtime: ${sheet.totals.totalOvertimeDisplay}`, centerX - 18, finalY);
    doc.text(`Days Worked: ${sheet.totals.daysWorked}`, pageWidth - marginX, finalY, { align: 'right' });

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
    doc.line(marginX, sigY, marginX + 60, sigY);
    doc.text(profile.name || '_______________', marginX + 30, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text("Trainee's Signature", marginX + 30, sigY + 8, { align: 'center' });

    doc.setFontSize(8);
    doc.line(pageWidth - marginX - 60, sigY, pageWidth - marginX, sigY);
    doc.text(profile.supervisor || '_______________', pageWidth - marginX - 30, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text('Verified By (Supervisor)', pageWidth - marginX - 30, sigY + 8, { align: 'center' });

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
