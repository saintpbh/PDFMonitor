import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

async function createSamplePDF() {
  const pdfDoc = await PDFDocument.create();
  
  // 헬베티카 폰트 로드
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // 페이지 스펙 지정 (HD 16:9 슬라이드와 일치하게 841 x 473 Pt 또는 미국 표준 Letter 규격 612 x 792 Pt)
  // 방송용 슬라이드 느낌을 위해 가로형 레이아웃(Standard US Letter Landscape: 792 x 612 Pt)으로 세팅
  const pageWidth = 792;
  const pageHeight = 612;

  // 5페이지 데이터 정의
  const slides = [
    {
      title: "ANTIGRAVITY PDF STUDIO v1.0",
      subtitle: "High-Performance Live Broadcasting System",
      sections: [
        "PAGE 1: SYSTEM INITIATED",
        "--------------------------------------------------",
        "Welcome to the ultimate broadcast-ready presentation engine.",
        "Use the Controller Viewport box to frame this slide.",
        "Watch the smooth transitioning as you scroll downwards.",
        "",
        "Status: ONLINE  |  Latency: <10ms  |  FPS: 60+ GPU"
      ]
    },
    {
      title: "01. DUAL-WINDOW STATE SYNC",
      subtitle: "Ultra-Low Latency BroadcastChannel Technology",
      sections: [
        "PAGE 2: COMMUNICATION ARCHITECTURE",
        "--------------------------------------------------",
        "- Pure local memory communication without servers.",
        "- Sync latency is kept under 16ms (1 frame delay).",
        "- High-DPI independent viewport matrices transfer.",
        "- Supports continuous canvas layout for flawless pagination."
      ]
    },
    {
      title: "02. PHYSICAL LERP FILTERING",
      subtitle: "Visual Smoothing via Linear Interpolation",
      sections: [
        "PAGE 3: HARDWARE ACCELERATION & KINEMATICS",
        "--------------------------------------------------",
        "- Linear Interpolation (Lerp) algorithm smoothes viewport drift.",
        "- Dragging frames rapidly will still look like a physical crane shot.",
        "- Configure smoothness value dynamically on the right slider.",
        "- GPU accelerated CSS transform translates 3D coordinate spaces."
      ]
    },
    {
      title: "03. OBS OVERLAY & CHROMAKEY",
      subtitle: "Professional Chromakey / Transparent Alpha Channels",
      sections: [
        "PAGE 4: COMPOSITING & BROADCAST DESIGN",
        "--------------------------------------------------",
        "- Press green circle on Controller to activate Chromakey Green (#00FF00).",
        "- Use Transparent (T) theme to merge PDF drawings right over video feeds.",
        "- Simply add 'http://localhost:3000/presenter.html' to OBS Browser source.",
        "- Zero UI configuration prevents unwanted cursors or scrollbars."
      ]
    },
    {
      title: "STUDIO SYSTEM SHUTDOWN",
      subtitle: "Antigravity PDF Presenter - End of Demo Document",
      sections: [
        "PAGE 5: BROADCAST WRAP-UP & Q&A",
        "--------------------------------------------------",
        "Thank you for evaluating the premium broadcast PDF system.",
        "You can now replace this demo file with any client PDF files.",
        "Designed and implemented by Antigravity AI Engine.",
        "",
        "Ready to terminate transmitter... Status: IDLE"
      ]
    }
  ];

  for (const slide of slides) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // 심플하고 세련된 방송 스타일 가로 격자 가이드 배경 드로잉 (그리드 효과)
    page.drawRectangle({
      x: 20,
      y: 20,
      width: pageWidth - 40,
      height: pageHeight - 40,
      borderWidth: 2,
      borderColor: rgb(0.22, 0.74, 0.97), // Cyan Neon Border
      color: rgb(0.97, 0.98, 1.0) // Soft white background
    });

    // 헤더 장식 밴드
    page.drawRectangle({
      x: 20,
      y: pageHeight - 75,
      width: pageWidth - 40,
      height: 55,
      color: rgb(0.03, 0.03, 0.05) // Deep Slate header
    });

    // 타이틀
    page.drawText(slide.title, {
      x: 40,
      y: pageHeight - 50,
      size: 24,
      font: fontBold,
      color: rgb(0.22, 0.74, 0.97)
    });

    // 서브타이틀
    page.drawText(slide.subtitle, {
      x: 40,
      y: pageHeight - 68,
      size: 10,
      font: fontRegular,
      color: rgb(0.7, 0.7, 0.7)
    });

    // 본문 섹션 그리기
    let currentY = pageHeight - 120;
    for (const paragraph of slide.sections) {
      if (paragraph.startsWith("PAGE ") || paragraph.startsWith("---")) {
        page.drawText(paragraph, {
          x: 50,
          y: currentY,
          size: 14,
          font: fontBold,
          color: rgb(0.05, 0.05, 0.08)
        });
      } else {
        page.drawText(paragraph, {
          x: 50,
          y: currentY,
          size: 14,
          font: fontMono,
          color: rgb(0.2, 0.2, 0.25)
        });
      }
      currentY -= 28;
    }

    // 푸터 데코레이션
    page.drawText("ANTIGRAVITY BROADCAST STUDIO  |  DEMO SESSION", {
      x: 40,
      y: 35,
      size: 8,
      font: fontBold,
      color: rgb(0.5, 0.5, 0.6)
    });

    page.drawText(`SLIDE ${slides.indexOf(slide) + 1} OF 5`, {
      x: pageWidth - 110,
      y: 35,
      size: 8,
      font: fontBold,
      color: rgb(0.22, 0.74, 0.97)
    });
  }

  // PDF 바이너리 저장
  const pdfBytes = await pdfDoc.save();
  const outputPath = path.resolve('/Users/bongpark/타이머/pdf-presenter/public/test.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`성공적으로 5페이지 고성능 테스트 PDF를 작성했습니다: ${outputPath}`);
}

createSamplePDF().catch(err => {
  console.error('PDF 생성 실패:', err);
});
