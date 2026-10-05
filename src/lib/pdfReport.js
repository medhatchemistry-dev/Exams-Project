import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

async function waitForReportAssets(el) {
  if (document.fonts?.ready) await document.fonts.ready;
  const images = Array.from(el.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    image.loading = 'eager';
    if (!image.complete) await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 12_000);
      const finish = () => { window.clearTimeout(timeout); resolve(); };
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    });
    if (image.complete && image.naturalWidth > 0 && image.decode) {
      try { await image.decode(); } catch { /* broken images are reported below */ }
    }
  }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const missingImages = images.filter((image) => image.naturalWidth === 0);
  if (missingImages.length) throw new Error(`${missingImages.length} image(s) could not be loaded for the report.`);
}

async function captureReportSection(element) {
  return html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.max(element.scrollWidth, element.clientWidth),
  });
}

// Capture the report by header, question, and footer. Page breaks are chosen
// between sections, so the old full-height screenshot slicing can't leave gaps.
export async function downloadPaginatedPdf(el, filename) {
  await waitForReportAssets(el);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 11;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const sections = [el.firstElementChild, ...el.querySelectorAll('[data-qblock]'), el.lastElementChild]
    .filter((section) => section instanceof HTMLElement && section.offsetHeight > 0);
  let y = margin;
  for (const section of sections) {
    const canvas = await captureReportSection(section);
    const sectionH = (canvas.height / canvas.width) * contentW;
    if (sectionH > contentH) {
      if (y > margin) {
        pdf.addPage();
        y = margin;
      }
      const maxPixels = Math.floor((contentH / contentW) * canvas.width);
      let sourceY = 0;
      while (sourceY < canvas.height) {
        const sliceH = Math.min(maxPixels, canvas.height - sourceY);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d');
        if (!ctx) throw new Error('Unable to create a PDF page canvas.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (sourceY > 0) pdf.addPage();
        const sliceMm = (sliceH / slice.width) * contentW;
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentW, sliceMm);
        sourceY += sliceH;
      }
      y = pageH - margin;
      continue;
    }

    if (y > margin && y + sectionH > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, sectionH);
    y += sectionH + 3;
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
