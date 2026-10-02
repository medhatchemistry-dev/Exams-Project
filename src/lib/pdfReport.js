import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Multi-page capture that paginates at question boundaries ([data-qblock]) so a
// question is never cut mid-line. Used for the detailed correction report.
export async function downloadPaginatedPdf(el, filename) {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pxPerMm = canvas.width / pageW;
  const maxSlice = Math.floor(pageH * pxPerMm);
  const boundaries = Array.from(el.querySelectorAll('[data-qblock]')).map((b) => Math.round(b.offsetTop * 2));
  let y = 0;
  let page = 0;
  while (y < canvas.height) {
    let end = Math.min(y + maxSlice, canvas.height);
    for (let j = boundaries.length - 1; j >= 0; j--) {
      const b = boundaries[j];
      if (b <= y) break;
      if (b <= end && end - b <= maxSlice * 0.35) {
        end = b;
        break;
      }
    }
    const sliceH = end - y;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const sctx = slice.getContext('2d');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, sliceH / pxPerMm);
    y = end;
    page++;
  }
  pdf.save(filename);
}

// Single-page capture scaled to fit the page — used for the certificate.
export async function downloadSinglePagePdf(el, filename, orientation = 'portrait') {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const pdf = new jsPDF({ orientation: orientation === 'landscape' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / (canvas.width / 2), pageH / (canvas.height / 2));
  const w = (canvas.width / 2) * ratio;
  const h = (canvas.height / 2) * ratio;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  pdf.save(filename);
}
