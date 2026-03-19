import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { MONTHS, getDayName, getDaysInMonth, toast, fmtTimeStr } from '../utils.js';

export function exportDTRtoPDF(entries, month, year, profile, settings) {
  try {
    // Folio Portrait format (8.5 x 13 inches)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215.9, 330.2] });

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DAILY TIME RECORD', 108, 14, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Civil Service Form No. 48', 108, 19, { align: 'center' });

    // Info fields
    doc.setFontSize(9);
    const y0 = 26;
    doc.text(`Name: ${profile.name || '_______________'}`, 10, y0);
    doc.text(`Department: ${profile.department || '_______________'}`, 130, y0);
    doc.text(`Month/Year: ${MONTHS[month]} ${year}`, 10, y0 + 6);
    doc.text(`Supervisor: ${profile.supervisor || '_______________'}`, 130, y0 + 6);
    doc.text(`Position: ${profile.position || 'OJT Trainee'}`, 10, y0 + 12);
    doc.text(`Schedule: ${settings.expectedTimeIn} - ${settings.expectedTimeOut}`, 130, y0 + 12);

    // Build table
    const daysInMonth = getDaysInMonth(year, month);
    const tableData = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayName = getDayName(dateStr);
      const e = entries.find(x => x.date === dateStr);
      tableData.push([
        d, dayName,
        fmtTimeStr(e?.amTimeIn), fmtTimeStr(e?.amTimeOut),
        fmtTimeStr(e?.pmTimeIn), fmtTimeStr(e?.pmTimeOut),
        (e?.amTimeOut || e?.pmTimeOut) ? e.hoursRendered.toFixed(2) : '',
        e?.overtimeHours > 0 ? e.overtimeHours.toFixed(2) : '',
        e?.activities || '',
        e?.remarks || '',
      ]);
    }

    doc.autoTable({
      startY: y0 + 16,
      margin: { left: 10, right: 10 },
      head: [['Day', 'Day', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hrs', 'OT', 'Act.', 'Remarks']],
      body: tableData.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]]),
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 7 },
        1: { halign: 'center', cellWidth: 10 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'center', cellWidth: 15 },
        6: { halign: 'center', cellWidth: 8 },
        7: { halign: 'center', cellWidth: 8 },
        8: { cellWidth: 73 }, // Activities column (squeezed for portrait)
        9: { cellWidth: 30 }, // Remarks column
      },
    });

    const finalY = doc.lastAutoTable.finalY + 6;
    const totalHrs = entries.reduce((s, e) => s + (e.hoursRendered || 0), 0);
    const totalOT = entries.reduce((s, e) => s + (e.overtimeHours || 0), 0);
    const daysWorked = entries.filter(e => e.amTimeOut || e.pmTimeOut).length;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Hours: ${totalHrs.toFixed(2)}`, 10, finalY);
    doc.text(`Overtime: ${totalOT.toFixed(2)}`, 80, finalY);
    doc.text(`Days Worked: ${daysWorked}`, 160, finalY);

    // Certification
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    const certY = finalY + 8;
    doc.text('I CERTIFY on my honor that the above is a true and correct report of the hours of work performed,', 108, certY, { align: 'center' });
    doc.text('record of which was made daily at the time of arrival and departure from office.', 108, certY + 3.5, { align: 'center' });

    // Signatures
    const sigY = certY + 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.line(15, sigY, 90, sigY);
    doc.text(profile.name || '_______________', 52.5, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text("Trainee's Signature", 52.5, sigY + 8, { align: 'center' });

    doc.setFontSize(8);
    doc.line(125, sigY, 200, sigY);
    doc.text(profile.supervisor || '_______________', 162.5, sigY + 4, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text('Verified By (Supervisor)', 162.5, sigY + 8, { align: 'center' });

    doc.save(`DTR_${MONTHS[month]}_${year}.pdf`);
    toast('PDF exported!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    toast('PDF export failed', 'error');
  }
}
