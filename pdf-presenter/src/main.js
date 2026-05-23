import * as pdfjsLib from 'pdfjs-dist';

// Vite 환경에서 PDF.js Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// Tauri 2.0 네이티브 코어 API 동적 마운트 (웹 브라우저 호환용 하이브리드 폴백 설계)
let tauriCore = null;
if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined) {
  import('@tauri-apps/api/core').then(mod => {
    tauriCore = mod;
    // [OS 모니터 리스트 자동 로드 및 드롭다운 주입]
    mod.invoke('get_available_monitors')
      .then(monitors => {
        if (monitors && monitors.length > 0) {
          const savedMonitor = localStorage.getItem('pdf-target-monitor') || 'auto';
          
          // 기존 '자동' 옵션 외의 OS 감지된 모니터 목록을 드롭다운에 투입
          monitorSelect.innerHTML = '<option value="auto">🔌 자동 (세컨드 디스플레이)</option>';
          if (savedMonitor === 'auto') {
            monitorSelect.querySelector('option').selected = true;
          }
          
          monitors.forEach(monitor => {
            const roleText = monitor.is_primary ? ' (주 화면)' : ' (보조)';
            const option = document.createElement('option');
            option.value = monitor.name;
            option.textContent = `🖥️ ${monitor.name}${roleText} [${monitor.width}x${monitor.height}]`;
            
            // 보조 모니터가 감지되거나 저장된 설정이 있다면 복원
            if (monitor.name === savedMonitor) {
              option.selected = true;
            } else if (savedMonitor === 'auto' && !monitor.is_primary) {
              option.selected = true;
            }
            monitorSelect.appendChild(option);
          });
          
          // 모니터 수동 선택 시 로컬스토리지에 자동 저장
          monitorSelect.addEventListener('change', () => {
            localStorage.setItem('pdf-target-monitor', monitorSelect.value);
          });
          
          monitorCountBadge.textContent = `${monitors.length}개 감지`;
          monitorSelectorGroup.style.display = 'block'; // 네이티브 환경이므로 셀렉터 노출!
        }
      })
      .catch(err => {
        console.warn('Tauri 모니터 목록 획득 실패:', err);
      });
  }).catch(err => {
    console.warn('Tauri API 로딩 제한 (브라우저 폴백 구동):', err);
  });
}

// 글로벌 상태 객체
const state = {
  pdfDoc: null,
  pdfData: null, // ArrayBuffer
  pageCount: 0,
  pageCanvases: [], // 컨트롤러 중앙 프리뷰 페이지 캔버스 목록
  pageHeights: [], // 각 페이지 캔버스의 높이 누적값 기록용
  activePage: 1,
  aspectRatio: localStorage.getItem('pdf-aspect-ratio') || '16-9', // '16-9', '4-3', 'free'
  smoothing: parseFloat(localStorage.getItem('pdf-smoothing') || '0.85'),
  bgTheme: localStorage.getItem('pdf-bg-theme') || 'transparent',
  presenterWindow: null,
  
  // 소수점 이하(0.2px 등) 미세 스크롤 보존을 위한 고정밀 스크롤 좌표계
  currentScrollTop: 0,
  currentScrollLeft: 0,
  
  // 키보드 독서 스크롤 속도 및 송출창 모드 설정
  scrollSpeed: parseFloat(localStorage.getItem('pdf-scroll-speed') || '0.10'),
  scrollShiftMultiplier: parseFloat(localStorage.getItem('pdf-scroll-shift') || '5.0'),
  presenterMode: localStorage.getItem('pdf-presenter-mode') || 'windowed', // 'windowed' or 'fullscreen'
  pageTransitionMode: localStorage.getItem('pdf-transition-mode') || 'dissolve', // 'cut', 'ease', 'dissolve'
  keysPressed: {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Shift: false
  },
  
  // 뷰포트 박스 물리 상태 (pages-wrapper 기준 픽셀 좌표)
  viewport: {
    x: 100,
    y: 100,
    w: 533, // 16:9 기본 가로
    h: 300  // 16:9 기본 세로
  },
  
  // 드래그/리사이즈 인터랙션 상태
  isDragging: false,
  isResizing: false,
  resizeDirection: '',
  dragStart: { x: 0, y: 0 },
  viewportStart: { x: 0, y: 0, w: 0, h: 0 }
};

// Broadcast Channel 개설 (초저지연 로컬 통신)
const channel = new BroadcastChannel('pdf-studio-channel');

// DOM Elements
const pdfFileInput = document.getElementById('pdf-file-input');
const fileInfo = document.getElementById('file-info');
const btnOpenPresenter = document.getElementById('btn-open-presenter');
const thumbnailsList = document.getElementById('thumbnails-list');
const pagesWrapper = document.getElementById('pages-wrapper');
const canvasScrollContainer = document.getElementById('canvas-scroll-container');
const viewportBox = document.getElementById('viewport-box');
const pageCountBadge = document.getElementById('page-count-badge');
const viewportWrapper = document.getElementById('viewport-wrapper');
const dragDropOverlay = document.getElementById('drag-drop-overlay');
const smoothingSlider = document.getElementById('smoothing-slider');
const smoothingVal = document.getElementById('smoothing-val');

// 키보드 독서 스크롤 및 송출모드 제어 엘리먼트
const scrollSpeedSlider = document.getElementById('scroll-speed-slider');
const scrollSpeedInput = document.getElementById('scroll-speed-input');
const scrollShiftSlider = document.getElementById('scroll-shift-slider');
const scrollShiftInput = document.getElementById('scroll-shift-input');
const btnModeWindowed = document.getElementById('btn-mode-windowed');
const btnModeFullscreen = document.getElementById('btn-mode-fullscreen');
const btnTransCut = document.getElementById('btn-trans-cut');
const btnTransEase = document.getElementById('btn-trans-ease');
const btnTransDissolve = document.getElementById('btn-trans-dissolve');
const monitorSelectorGroup = document.getElementById('monitor-selector-group');
const monitorSelect = document.getElementById('monitor-select');
const monitorCountBadge = document.getElementById('monitor-count-badge');

// Debug Elements
const debugCoords = document.getElementById('debug-coords');
const debugSize = document.getElementById('debug-size');
const debugPage = document.getElementById('debug-page');

/* ==========================================
   1. PDF 로딩 및 연속 렌더러 설계
   ========================================== */

pdfFileInput.addEventListener('change', handleFileSelect);

const btnLoadDemo = document.getElementById('btn-load-demo');
btnLoadDemo.addEventListener('click', async () => {
  try {
    fileInfo.textContent = '샘플 PDF 로드 중...';
    // 웹서버 루트의 test.pdf fetch
    const response = await fetch('/test.pdf');
    if (!response.ok) throw new Error('샘플 파일을 가져오지 못했습니다.');
    
    state.pdfData = await response.arrayBuffer();
    fileInfo.textContent = 'test.pdf (로컬 데모)';
    
    // 1. 송출 채널로 동기화 전송 (원본 버퍼가 온전할 때 전송)
    syncPDFToPresenter();
    
    // 2. 로컬 렌더러 로드 (로컬 소모용 복사본을 전달하여 원본 버퍼가 detached되는 것 방지!)
    await loadPDF(state.pdfData.slice(0));
    
    // 3. 뷰포트 오버레이 박스 개시
    initViewportBox();
  } catch (error) {
    console.error('데모 로드 에러:', error);
    fileInfo.textContent = '데모 로드 실패';
    alert('샘플 PDF 파일을 로드하지 못했습니다.');
  }
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file || file.type !== 'application/pdf') {
    alert('올바른 PDF 파일을 선택해 주세요.');
    return;
  }

  fileInfo.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  
  const reader = new FileReader();
  reader.onload = async function() {
    state.pdfData = this.result; // ArrayBuffer
    
    // 1. 송출 창에 PDF 데이터 동기화 전송 (소유권 이전 전)
    syncPDFToPresenter();
    
    // 2. 로컬 렌더링 개시 (복사본을 인자로 전달하여 원본 버퍼 탈취 방지)
    await loadPDF(state.pdfData.slice(0));
    
    // 3. 뷰포트 박스 노출 및 초기 크기 세팅
    initViewportBox();
  };
  reader.readAsArrayBuffer(file);
}

// 드래그 앤 드롭으로 떨어진 PDF 파일 로드 처리
async function loadDroppedPDF(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('올바른 PDF 파일을 드롭해 주세요.');
    return;
  }

  fileInfo.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  
  const reader = new FileReader();
  reader.onload = async function() {
    state.pdfData = this.result; // ArrayBuffer
    
    // 1. 송출 창에 PDF 데이터 동기화 전송 (원본 버퍼가 온전할 때)
    syncPDFToPresenter();
    
    // 2. 로컬 렌더링 개시 (복사본을 인자로 전달하여 원본 버퍼 탈취 방지)
    await loadPDF(state.pdfData.slice(0));
    
    // 3. 뷰포트 박스 노출 및 초기 크기 세팅
    initViewportBox();
  };
  reader.readAsArrayBuffer(file);
}

// 드래그앤드롭 이벤트 리스너 결합 (모니터 프리뷰 영역)
viewportWrapper.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDropOverlay.classList.add('active');
});

viewportWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!dragDropOverlay.classList.contains('active')) {
    dragDropOverlay.classList.add('active');
  }
});

viewportWrapper.addEventListener('dragleave', (e) => {
  e.preventDefault();
  // 마우스가 내부 자식 엘리먼트로 이동할 때 이탈 감지되어 불필요하게 깜빡이는 것 방지
  if (!viewportWrapper.contains(e.relatedTarget)) {
    dragDropOverlay.classList.remove('active');
  }
});

viewportWrapper.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDropOverlay.classList.remove('active');
  
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    const file = files[0];
    await loadDroppedPDF(file);
  }
});

// PDF.js를 이용해 메모리에 로드 및 렌더링
async function loadPDF(pdfData) {
  try {
    // 기존 프리뷰 클리어
    pagesWrapper.innerHTML = '';
    thumbnailsList.innerHTML = '';
    state.pageCanvases = [];
    state.pageHeights = [];
    
    // PDF 로드
    state.pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    state.pageCount = state.pdfDoc.numPages;
    pageCountBadge.textContent = `1 / ${state.pageCount}`;
    
    // 1. 좌측 썸네일 & 2. 중앙 프리뷰 병렬 생성
    for (let pageNum = 1; pageNum <= state.pageCount; pageNum++) {
      const page = await state.pdfDoc.getPage(pageNum);
      
      // 썸네일 생성
      createThumbnailItem(page, pageNum);
      
      // 중앙 고성능 프리뷰 캔버스 생성 (연속 스크롤 방식)
      await renderPreviewPage(page, pageNum);
    }
    
    // 페이지 높이 누적값 계산 (연속 뷰포트 매핑용)
    calculatePageHeights();
    
    // 3. 하단에 투명 유령 페이지(스페이스 여백)를 스크롤 컨테이너에 추가하여 
    // 마지막 페이지의 최하단부까지 송출 뷰포트 영역으로 매끄럽게 끌어올려 송출할 수 있게 합니다.
    const existingGhost = canvasScrollContainer.querySelector('.pdf-ghost-page');
    if (existingGhost) {
      existingGhost.remove();
    }
    
    const ghostPage = document.createElement('div');
    ghostPage.className = 'pdf-ghost-page';
    // 스크롤 컨테이너 높이와 뷰포트 박스 높이를 고려하여 넉넉히 700px의 가상 조작 영역 제공
    ghostPage.style.height = `${canvasScrollContainer.clientHeight || 700}px`;
    ghostPage.style.width = '100%';
    ghostPage.style.flexShrink = '0'; // flex 구조 하에서 찌그러짐 방지
    canvasScrollContainer.appendChild(ghostPage);
    
  } catch (error) {
    console.error('PDF 로드 중 오류 발생:', error);
    alert('PDF 문서를 파싱하지 못했습니다.');
  }
}

// 썸네일 생성
async function createThumbnailItem(page, pageNum) {
  const viewport = page.getViewport({ scale: 0.2 }); // 소형화
  
  const container = document.createElement('div');
  container.className = `thumbnail-item ${pageNum === 1 ? 'active' : ''}`;
  container.dataset.page = pageNum;
  
  const canvas = document.createElement('canvas');
  canvas.className = 'thumbnail-canvas';
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  const label = document.createElement('span');
  label.className = 'thumbnail-number';
  label.textContent = `PAGE ${pageNum}`;
  
  container.appendChild(canvas);
  container.appendChild(label);
  
  // 썸네일 클릭 시 해당 페이지로 스무스 스크롤 이동
  container.addEventListener('click', () => {
    scrollToPage(pageNum);
  });
  
  thumbnailsList.appendChild(container);
}

// 중앙 프리뷰 연속 캔버스 렌더링
async function renderPreviewPage(page, pageNum) {
  const containerWidth = pagesWrapper.clientWidth || 800;
  
  // 프리뷰 해상도는 화면 표시에 알맞은 스케일로 계산 (가로 고정형 연속 캔버스)
  const originalViewport = page.getViewport({ scale: 1.0 });
  const scale = containerWidth / originalViewport.width;
  const viewport = page.getViewport({ scale });
  
  const pageContainer = document.createElement('div');
  pageContainer.className = 'pdf-page-container';
  pageContainer.id = `page-container-${pageNum}`;
  pageContainer.style.width = `${viewport.width}px`;
  pageContainer.style.height = `${viewport.height}px`;
  pageContainer.dataset.page = pageNum;
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  
  pageContainer.appendChild(canvas);
  pagesWrapper.appendChild(pageContainer);
  
  state.pageCanvases.push(pageContainer);
  
  // PDF 렌더링
  await page.render({ canvasContext: ctx, viewport }).promise;
}

// 연속 캔버스 좌표 매핑을 위한 페이지 높이 리스트 갱신
function calculatePageHeights() {
  let accumulatedHeight = 0;
  state.pageHeights = [];
  
  state.pageCanvases.forEach((container, index) => {
    const pageNum = index + 1;
    const height = container.offsetHeight;
    
    // 페이지 높이 누적값 기록
    state.pageHeights.push({
      pageNum,
      top: accumulatedHeight,
      bottom: accumulatedHeight + height,
      height
    });
    
    accumulatedHeight += height; 
  });
}

/* ==========================================
   2. 뷰포트 박스 인터랙션 (고정형 뷰포트 & 배경 스크롤)
   ========================================== */

function initViewportBox() {
  viewportBox.style.display = 'block';
  
  if (state.pageHeights.length > 0) {
    // [사용자 핵심 피드백]: 여러 페이지가 겹치지 않고 여백이 완전히 지워지도록 
    // 사각형의 가로폭과 시작 위치를 실제 PDF 문서 실물 영역(pagesWrapper)과 오차범위 0%로 완벽 동기화!
    const targetWidth = pagesWrapper.clientWidth;
    state.viewport.w = targetWidth;
    state.viewport.h = getAspectHeight(targetWidth);
    
    // X 위치를 PDF 실물의 offsetLeft에 찰칵 결합!
    state.viewport.x = pagesWrapper.offsetLeft;
    // Y 위치는 상단 프레임 마진 60px 배치
    state.viewport.y = 60;
    
    updateViewportDOM();
    broadcastViewportState();
  }
}

// 뷰포트 조절 사각형의 DOM 바인딩 및 업데이트
function updateViewportDOM() {
  viewportBox.style.left = `${state.viewport.x}px`;
  viewportBox.style.top = `${state.viewport.y}px`;
  viewportBox.style.width = `${state.viewport.w}px`;
  viewportBox.style.height = `${state.viewport.h}px`;
  
  // 디버그 표시 업데이트 (현재 스크롤 위치 및 절대 바라보는 뷰포트 크기)
  debugCoords.textContent = `${Math.round(canvasScrollContainer.scrollLeft)}, ${Math.round(canvasScrollContainer.scrollTop)}`;
  debugSize.textContent = `${Math.round(state.viewport.w)} x ${Math.round(state.viewport.h)}`;
}

// 종횡비 기반 가로에 따른 세로 계산
function getAspectHeight(width) {
  if (state.aspectRatio === '16-9') return (width * 9) / 16;
  if (state.aspectRatio === '4-3') return (width * 3) / 4;
  return state.viewport.h; // Free 비율이면 기존 세로 유지
}

// 캔버스 스크롤 이벤트 감지 -> 배경이 스크롤되어 올라가면 송출 뷰포트의 절대 PDF 좌표가 변하므로 실시간 송출
canvasScrollContainer.addEventListener('scroll', () => {
  // 스크롤 발생 시 고정밀 가상 좌표를 실제 스크롤 위치와 즉각 동기화 (마우스 휠/트랙패드 조작 대응)
  state.currentScrollTop = canvasScrollContainer.scrollTop;
  state.currentScrollLeft = canvasScrollContainer.scrollLeft;

  determineCurrentPage();
  broadcastViewportState();
  debugCoords.textContent = `ScrollY: ${Math.round(canvasScrollContainer.scrollTop)}px`;
});

// 현재 뷰포트 위치(스크롤 값 + 뷰포트 세로 오프셋)를 기반으로 활성 페이지 판정
function determineCurrentPage() {
  if (state.pageHeights.length === 0) return;
  
  // 현재 뷰포트 중심이 바라보고 있는 PDF 전체 공간 내의 절대 Y좌표
  const absoluteCenterY = canvasScrollContainer.scrollTop + state.viewport.y - pagesWrapper.offsetTop + (state.viewport.h / 2);
  
  for (const pageObj of state.pageHeights) {
    if (absoluteCenterY >= pageObj.top && absoluteCenterY <= pageObj.bottom) {
      if (state.activePage !== pageObj.pageNum) {
        updateActiveThumbnail(pageObj.pageNum);
      }
      break;
    }
  }
}

// 특정 페이지로 이동
function scrollToPage(pageNum) {
  const pageHeightObj = state.pageHeights[pageNum - 1];
  if (!pageHeightObj) return;
  
  // 뷰포트가 페이지의 가장 상단을 가리키도록 스크롤링 타겟 세팅
  const targetScrollTop = Math.max(0, pageHeightObj.top - state.viewport.y + pagesWrapper.offsetTop);
  
  // 1. 컨트롤러 자체 뷰포트는 즉각 이동 처리하여 조작자 편의성 극대화
  canvasScrollContainer.scrollTo({
    top: targetScrollTop,
    behavior: 'auto'
  });
  
  updateActiveThumbnail(pageNum);
  
  // 2. 송출창으로 페이지 전환 연출 트랜잭션(PAGE_JUMP) 전송
  channel.postMessage({
    type: 'PAGE_JUMP',
    mode: state.pageTransitionMode,
    viewport: getViewportRatioState()
  });
}

// 활성 썸네일 스타일 및 메타 데이터 정보 갱신
function updateActiveThumbnail(pageNum) {
  state.activePage = pageNum;
  
  // 1. 모든 썸네일 아이템에서 active 제거 및 해당 페이지 썸네일에 active 추가
  document.querySelectorAll('.thumbnail-item').forEach(item => {
    if (parseInt(item.dataset.page) === pageNum) {
      item.classList.add('active');
      // 썸네일 목록이 많을 경우 보여지게 스무스 자동 스크롤 이동
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
  
  // 2. 상단 뱃지 페이지 넘버 업데이트
  pageCountBadge.textContent = `${pageNum} / ${state.pageCount}`;
  
  // 3. 디버그 및 텍스트 상태 업데이트
  debugPage.textContent = `Page ${pageNum}`;
}

// 뷰포트 상에서의 드래그 / 리사이즈 마우스 인터랙션 마운트
viewportBox.addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('viewport-handle')) {
    // 1. 리사이즈 모드 진입 (뷰포트 사각형 크기조정)
    state.isResizing = true;
    state.resizeDirection = e.target.className.split(' ')[1]; // nw, ne, sw, se
  } else {
    // 2. 드래그 모드 진입 (배경 스크롤링)
    state.isDragging = true;
    // 클릭 시점의 배경 스크롤 위치 기록
    state.scrollStart = {
      top: canvasScrollContainer.scrollTop,
      left: canvasScrollContainer.scrollLeft
    };
  }
  
  state.dragStart.x = e.clientX;
  state.dragStart.y = e.clientY;
  state.viewportStart = { ...state.viewport };
  
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!state.isDragging && !state.isResizing) return;
  
  const dx = e.clientX - state.dragStart.x;
  const dy = e.clientY - state.dragStart.y;
  
  if (state.isDragging) {
    // [사용자 핵심 요청 사항]: 사각형을 드래그하면, 사각형이 움직이는 게 아니라 
    // "배경의 PDF 파일"이 마치 스마트폰 터치 스크롤처럼 우아하게 반대 방향으로 끌려 움직입니다!
    canvasScrollContainer.scrollTop = state.scrollStart.top - dy;
    canvasScrollContainer.scrollLeft = state.scrollStart.left - dx;
  }
  
  if (state.isResizing) {
    // 뷰포트의 크기 리사이징 (종횡비 고려)
    let nextW = state.viewportStart.w;
    let nextH = state.viewportStart.h;
    let nextX = state.viewportStart.x;
    let nextY = state.viewportStart.y;
    
    const dir = state.resizeDirection;
    const minSize = 100;
    const wrapperWidth = document.getElementById('viewport-wrapper').clientWidth;
    
    if (dir === 'se') {
      nextW = Math.max(minSize, state.viewportStart.w + dx);
      if (state.aspectRatio !== 'free') {
        nextH = getAspectHeight(nextW);
      } else {
        nextH = Math.max(minSize, state.viewportStart.h + dy);
      }
    } else if (dir === 'sw') {
      const computedW = state.viewportStart.w - dx;
      if (computedW >= minSize) {
        nextW = computedW;
        nextX = state.viewportStart.x + dx;
      }
      if (state.aspectRatio !== 'free') {
        nextH = getAspectHeight(nextW);
      } else {
        nextH = Math.max(minSize, state.viewportStart.h + dy);
      }
    } else if (dir === 'ne') {
      nextW = Math.max(minSize, state.viewportStart.w + dx);
      if (state.aspectRatio !== 'free') {
        nextH = getAspectHeight(nextW);
        nextY = state.viewportStart.y - (nextH - state.viewportStart.h);
      } else {
        const computedH = state.viewportStart.h - dy;
        if (computedH >= minSize) {
          nextH = computedH;
          nextY = state.viewportStart.y + dy;
        }
      }
    } else if (dir === 'nw') {
      const computedW = state.viewportStart.w - dx;
      if (computedW >= minSize) {
        nextW = computedW;
        nextX = state.viewportStart.x + dx;
      }
      if (state.aspectRatio !== 'free') {
        nextH = getAspectHeight(nextW);
        nextY = state.viewportStart.y - (nextH - state.viewportStart.h);
      } else {
        const computedH = state.viewportStart.h - dy;
        if (computedH >= minSize) {
          nextH = computedH;
          nextY = state.viewportStart.y + dy;
        }
      }
    }
    
    // [사용자 핵심 피드백 반영]: 사각형이 1개 페이지 너비/높이를 절대 넘지 못하도록 상한 가드 장착!
    const maxW = pagesWrapper.clientWidth || wrapperWidth;
    const maxH = state.pageHeights[0]?.height || 500;
    
    nextW = Math.min(maxW, nextW);
    nextH = Math.min(maxH, nextH);
    
    // 비율 모드 일관화 보정
    if (state.aspectRatio !== 'free') {
      nextH = getAspectHeight(nextW);
      // 만약 세로 높이가 초과하면 가로를 줄여서 비율 강제 보존
      if (nextH > maxH) {
        nextH = maxH;
        nextW = (nextH * 16) / 9;
        if (state.aspectRatio === '4-3') nextW = (nextH * 4) / 3;
      }
    }
    
    // 경계 조건 체크
    if (nextX >= 0 && nextX + nextW <= wrapperWidth) {
      state.viewport.w = nextW;
      state.viewport.h = nextH;
      state.viewport.x = nextX;
      state.viewport.y = nextY;
    }
    
    updateViewportDOM();
    broadcastViewportState();
  }
});

document.addEventListener('mouseup', () => {
  state.isDragging = false;
  state.isResizing = false;
});

// 뷰포트 사각형 박스 위에서 마우스 휠 스크롤 시 -> 뒷배경 PDF 스크롤 컨테이너로 스크롤 이벤트 전달
viewportBox.addEventListener('wheel', (e) => {
  canvasScrollContainer.scrollTop += e.deltaY;
  canvasScrollContainer.scrollLeft += e.deltaX;
  e.preventDefault();
}, { passive: false });

// 키보드 실시간 부드러운 스크롤 애니메이션 루프
let scrollLoopActive = false;

function runScrollLoop() {
  if (!scrollLoopActive) return;

  let dy = 0;
  let dx = 0;
  
  const isShift = state.keysPressed.Shift;
  const baseSpeed = state.scrollSpeed;
  const currentSpeed = isShift ? baseSpeed * state.scrollShiftMultiplier : baseSpeed;

  if (state.keysPressed.ArrowDown) dy += currentSpeed;
  if (state.keysPressed.ArrowUp) dy -= currentSpeed;
  if (state.keysPressed.ArrowRight) dx += currentSpeed;
  if (state.keysPressed.ArrowLeft) dx -= currentSpeed;

  if (dy !== 0 || dx !== 0) {
    const maxScrollTop = canvasScrollContainer.scrollHeight - canvasScrollContainer.clientHeight;
    // 고정밀 가상 좌표를 업데이트하고 이를 실제 브라우저 scrollTop에 대입하여,
    // 0.2px 이하의 미세 소수점 속도가 반올림에 소멸되지 않고 매 프레임 축적되어 작동하도록 보장합니다.
    state.currentScrollTop = Math.max(0, Math.min(maxScrollTop, state.currentScrollTop + dy));
    canvasScrollContainer.scrollTop = state.currentScrollTop;

    const maxScrollLeft = canvasScrollContainer.scrollWidth - canvasScrollContainer.clientWidth;
    state.currentScrollLeft = Math.max(0, Math.min(maxScrollLeft, state.currentScrollLeft + dx));
    canvasScrollContainer.scrollLeft = state.currentScrollLeft;
  }

  // 방향키 중 하나라도 계속 눌려 있다면 루프 지속
  if (state.keysPressed.ArrowUp || state.keysPressed.ArrowDown || state.keysPressed.ArrowLeft || state.keysPressed.ArrowRight) {
    requestAnimationFrame(runScrollLoop);
  } else {
    scrollLoopActive = false;
  }
}

// 키보드 다운 이벤트 감지 (연속 스크롤 및 단발 핫키)
document.addEventListener('keydown', (e) => {
  if (!state.pdfDoc) return;
  if (document.activeElement.tagName === 'INPUT') return;

  // 방향키 감지 및 스크롤 플래그 셋업
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    state.keysPressed[e.key] = true;
    state.keysPressed.Shift = e.shiftKey;
    
    // 루프 미작동 상태면 기동
    if (!scrollLoopActive) {
      scrollLoopActive = true;
      requestAnimationFrame(runScrollLoop);
    }
    e.preventDefault();
    return;
  }

  // Shift 조작 상태 보정
  if (e.key === 'Shift') {
    state.keysPressed.Shift = true;
    return;
  }

  // 단발성 프레젠테이션 스크롤 키 처리
  let scrolled = false;
  switch (e.key) {
    case 'PageUp':
      canvasScrollContainer.scrollBy({ top: -450, behavior: 'smooth' });
      scrolled = true;
      break;
    case 'PageDown':
      canvasScrollContainer.scrollBy({ top: 450, behavior: 'smooth' });
      scrolled = true;
      break;
    case ' ':
      if (e.shiftKey) {
        canvasScrollContainer.scrollBy({ top: -450, behavior: 'smooth' });
      } else {
        canvasScrollContainer.scrollBy({ top: 450, behavior: 'smooth' });
      }
      scrolled = true;
      break;
  }

  if (scrolled) {
    e.preventDefault();
  }
});

// 키보드 업 이벤트 감지 (눌려있던 스크롤 해제)
document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    state.keysPressed[e.key] = false;
  }
  if (e.key === 'Shift') {
    state.keysPressed.Shift = false;
  }
  state.keysPressed.Shift = e.shiftKey;
});

/* ==========================================
   3. Broadcast Channel 실시간 무지연 송출 로직
   ========================================== */

// 1) 신규 연결 송출창에 즉시 로드된 PDF 전송
btnOpenPresenter.addEventListener('click', () => {
  if (tauriCore) {
    const selectedMonitor = monitorSelect.value;
    // [Tauri 네이티브 실행]: 사용자가 드롭다운에서 선택한 OS 모니터로 1-Click 풀스크린 오픈!
    tauriCore.invoke('open_presenter_window', { targetMonitorName: selectedMonitor })
      .then(() => {
        setTimeout(() => {
          syncPDFToPresenter();
          broadcastViewportState();
          broadcastRenderSettings();
        }, 800);
      })
      .catch(err => {
        console.error('Tauri 네이티브 송출창 기동 에러:', err);
        alert('Tauri 네이티브 송출창을 기동하지 못했습니다: ' + err);
      });
  } else {
    // [웹 브라우저 폴백]: 기존 window.open 팝업 연동
    const url = `${window.location.origin}/presenter.html`;
    
    let specs = 'width=1280,height=720,menubar=no,toolbar=no,location=no';
    if (state.presenterMode === 'fullscreen') {
      const w = window.screen.width;
      const h = window.screen.height;
      specs = `width=${w},height=${h},top=0,left=0,menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
    }
    
    state.presenterWindow = window.open(url, 'antigravity-pdf-presenter', specs);
    
    setTimeout(() => {
      syncPDFToPresenter();
      broadcastViewportState();
      broadcastRenderSettings();
    }, 800);
  }
});

// PDF 바이너리를 송출창에 푸시
function syncPDFToPresenter() {
  if (!state.pdfData) return;
  channel.postMessage({
    type: 'LOAD_PDF',
    pdfData: state.pdfData.slice(0) // 원본 버퍼가 detached되는 것을 예방하기 위해 복사본(slice)을 전송
  });
}

// 뷰포트의 실시간 절대 매트릭스 정보 비율 헬퍼
function getViewportRatioState() {
  const totalWidth = pagesWrapper.clientWidth || 800;
  
  // [절대 좌표 매핑 공식]
  // 뷰포트가 바라보는 PDF 전체 가상 캔버스의 절대 X, Y 좌표를 계산합니다.
  const absoluteX = state.viewport.x + canvasScrollContainer.scrollLeft - pagesWrapper.offsetLeft;
  const absoluteY = state.viewport.y + canvasScrollContainer.scrollTop - pagesWrapper.offsetTop;
  
  // 송출 화면의 가로 너비 기준 비율 환산
  return {
    xRatio: absoluteX / totalWidth,
    yRatio: absoluteY / totalWidth,
    wRatio: state.viewport.w / totalWidth,
    hRatio: state.viewport.h / totalWidth
  };
}

// 뷰포트의 실시간 절대 매트릭스 정보를 송출창에 송신
function broadcastViewportState() {
  if (!state.pdfDoc) return;
  channel.postMessage({
    type: 'UPDATE_VIEWPORT',
    viewport: getViewportRatioState()
  });
}

// 렌더링 세팅 정보 송신
function broadcastRenderSettings() {
  channel.postMessage({
    type: 'UPDATE_SETTINGS',
    settings: {
      bgTheme: state.bgTheme,
      smoothing: state.smoothing
    }
  });
}

// 송출창에서 로드 완료 신호(PING)를 보내올 경우 대응
channel.onmessage = function(e) {
  if (e.data.type === 'PRESENTER_READY') {
    syncPDFToPresenter();
    setTimeout(() => {
      broadcastViewportState();
      broadcastRenderSettings();
    }, 300);
  }
};

/* ==========================================
   4. UI 컨트롤 패널 이벤트 바인딩
   ========================================== */

// 1) 종횡비 제어
document.querySelectorAll('.aspect-ratio-selector .btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.aspect-ratio-selector .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    state.aspectRatio = e.target.dataset.aspect;
    localStorage.setItem('pdf-aspect-ratio', state.aspectRatio);
    
    if (state.aspectRatio !== 'free' && state.pageHeights.length > 0) {
      state.viewport.h = getAspectHeight(state.viewport.w);
      updateViewportDOM();
      broadcastViewportState();
    }
  });
});

// 2) 관성 스무딩 슬라이더
smoothingSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  state.smoothing = val;
  smoothingVal.textContent = val.toFixed(2);
  localStorage.setItem('pdf-smoothing', val);
  broadcastRenderSettings();
});

// 3) 배경 테마 셀렉터
document.querySelectorAll('.bg-theme-selector .btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.bg-theme-selector .btn').forEach(b => b.classList.remove('active'));
    
    const targetBtn = e.target.closest('.btn-circle');
    targetBtn.classList.add('active');
    
    state.bgTheme = targetBtn.dataset.theme;
    localStorage.setItem('pdf-bg-theme', state.bgTheme);
    broadcastRenderSettings();
  });
});

// 윈도우 창 크기 변경 시 뷰포트 위치 자동 재정렬 가드
window.addEventListener('resize', () => {
  if (state.pdfDoc && state.pageHeights.length > 0) {
    state.viewport.x = pagesWrapper.offsetLeft;
    state.viewport.w = pagesWrapper.clientWidth;
    updateViewportDOM();
    broadcastViewportState();
  }
});

// 4) 키보드 스크롤 속도 제어 슬라이더 및 수동 입력 연동
// 슬라이더 값 v (0.0~1.0)를 실제 속도 (0.001 ~ 10.0 px/frame)로 매핑
// 중간값 0.5일 때 정확히 0.1이 됩니다.
function sliderToSpeed(v) {
  return 0.001 * Math.pow(10000, v);
}

// 실제 속도 (0.001 ~ 10.0 px/frame)에서 슬라이더 값 v (0.0~1.0)로 매핑 (역함수)
function speedToSlider(speed) {
  if (speed <= 0.001) return 0.000;
  if (speed >= 10.0) return 1.000;
  return Math.log(speed / 0.001) / Math.log(10000);
}

// 초기 데이터 매핑
const initialSliderVal = speedToSlider(state.scrollSpeed);
scrollSpeedSlider.value = initialSliderVal;
scrollSpeedInput.value = state.scrollSpeed.toFixed(3);

scrollShiftSlider.value = state.scrollShiftMultiplier;
scrollShiftInput.value = state.scrollShiftMultiplier.toFixed(1);

// 슬라이더 조작 시 -> 입력 필드와 동기화
scrollSpeedSlider.addEventListener('input', (e) => {
  const sliderVal = parseFloat(e.target.value);
  const speed = sliderToSpeed(sliderVal);
  state.scrollSpeed = speed;
  scrollSpeedInput.value = speed.toFixed(3);
  localStorage.setItem('pdf-scroll-speed', speed);
});

// 마우스에서 손을 떼는 순간 슬라이더 포커스를 자동으로 해제하여, 
// 즉시 키보드 방향키(↑/↓) 조작 시 슬라이더 바가 대신 움직이지 않고 PDF가 스크롤되도록 보장합니다.
scrollSpeedSlider.addEventListener('mouseup', () => scrollSpeedSlider.blur());
scrollSpeedSlider.addEventListener('touchend', () => scrollSpeedSlider.blur());

// 수동 숫자 입력 시 -> 슬라이더와 동기화 및 자동 포커스 해제
scrollSpeedInput.addEventListener('change', (e) => {
  let val = parseFloat(e.target.value);
  if (isNaN(val)) val = 0.10;
  // 한계선 가드 (최소 0.001px/프레임에서 최대 10.000px/프레임까지)
  val = Math.max(0.001, Math.min(10.000, val));
  
  state.scrollSpeed = val;
  scrollSpeedSlider.value = speedToSlider(val);
  scrollSpeedInput.value = val.toFixed(3);
  localStorage.setItem('pdf-scroll-speed', val);
  
  scrollSpeedInput.blur(); // 포커스 해제
});

scrollSpeedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    scrollSpeedInput.blur();
  }
});

// 시프트 배속 슬라이더 연동
scrollShiftSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  state.scrollShiftMultiplier = val;
  scrollShiftInput.value = val.toFixed(1);
  localStorage.setItem('pdf-scroll-shift', val);
});

scrollShiftSlider.addEventListener('mouseup', () => scrollShiftSlider.blur());
scrollShiftSlider.addEventListener('touchend', () => scrollShiftSlider.blur());

scrollShiftInput.addEventListener('change', (e) => {
  let val = parseFloat(e.target.value);
  if (isNaN(val)) val = 5.0;
  val = Math.max(1.0, Math.min(20.0, val));
  
  state.scrollShiftMultiplier = val;
  scrollShiftSlider.value = val;
  scrollShiftInput.value = val.toFixed(1);
  localStorage.setItem('pdf-scroll-shift', val);
  
  scrollShiftInput.blur();
});

scrollShiftInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    scrollShiftInput.blur();
  }
});

// 전역 클릭 감지: 슬라이더나 입력창 바깥의 다른 곳을 클릭하면 즉각 포커스를 강제 해제(Blur)합니다.
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#scroll-speed-slider') && 
      !e.target.closest('#scroll-speed-input') && 
      !e.target.closest('#scroll-shift-slider') && 
      !e.target.closest('#scroll-shift-input') &&
      !e.target.closest('#smoothing-slider')) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
});

// 5) 송출창 모드(전체화면 / 일반창) 버튼 토글 연동
function updatePresenterModeUI() {
  if (state.presenterMode === 'fullscreen') {
    btnModeFullscreen.classList.add('active');
    btnModeWindowed.classList.remove('active');
  } else {
    btnModeWindowed.classList.add('active');
    btnModeFullscreen.classList.remove('active');
  }
}

btnModeWindowed.addEventListener('click', () => {
  state.presenterMode = 'windowed';
  localStorage.setItem('pdf-presenter-mode', 'windowed');
  updatePresenterModeUI();
});

btnModeFullscreen.addEventListener('click', () => {
  state.presenterMode = 'fullscreen';
  localStorage.setItem('pdf-presenter-mode', 'fullscreen');
  updatePresenterModeUI();
});

// 6) 페이지 전환 모드 버튼 토글 연동
function updateTransitionModeUI() {
  btnTransCut.classList.remove('active');
  btnTransEase.classList.remove('active');
  btnTransDissolve.classList.remove('active');
  
  if (state.pageTransitionMode === 'cut') {
    btnTransCut.classList.add('active');
  } else if (state.pageTransitionMode === 'ease') {
    btnTransEase.classList.add('active');
  } else {
    btnTransDissolve.classList.add('active');
  }
}

btnTransCut.addEventListener('click', () => {
  state.pageTransitionMode = 'cut';
  localStorage.setItem('pdf-transition-mode', 'cut');
  updateTransitionModeUI();
});

btnTransEase.addEventListener('click', () => {
  state.pageTransitionMode = 'ease';
  localStorage.setItem('pdf-transition-mode', 'ease');
  updateTransitionModeUI();
});

btnTransDissolve.addEventListener('click', () => {
  state.pageTransitionMode = 'dissolve';
  localStorage.setItem('pdf-transition-mode', 'dissolve');
  updateTransitionModeUI();
});

// 모든 저장된 설정을 UI 엘리먼트에 동기화하여 복원하는 함수
function initSettingsUI() {
  // 1. 송출창 모드 UI 복원
  updatePresenterModeUI();
  
  // 2. 페이지 전환 모드 UI 복원
  updateTransitionModeUI();
  
  // 3. 종횡비 UI 복원
  document.querySelectorAll('.aspect-ratio-selector .btn').forEach(btn => {
    if (btn.dataset.aspect === state.aspectRatio) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // 4. 관성 스무딩 UI 복원
  smoothingSlider.value = state.smoothing;
  smoothingVal.textContent = state.smoothing.toFixed(2);
  
  // 5. 배경 테마 UI 복원
  document.querySelectorAll('.bg-theme-selector .btn').forEach(btn => {
    const targetBtn = btn.closest('.btn-circle');
    if (targetBtn) {
      if (targetBtn.dataset.theme === state.bgTheme) {
        targetBtn.classList.add('active');
      } else {
        targetBtn.classList.remove('active');
      }
    }
  });
}

// 초기 UI 세팅 자동 반영
initSettingsUI();

// [키보드 포커스 강제 획득 보정]
// 타우리 네이티브 환경 기동 및 문서 조작 시, 윈도우 포커스가 풀려 
// 키보드 방향키(↑/↓) 스크롤이 먹통이 되는 현상을 영구 차단합니다.
function forceFocusToBody() {
  document.body.tabIndex = -1;
  document.body.focus();
}

// 1. 페이지 최초 리소스 로딩 완결 시 포커싱 회수
window.addEventListener('DOMContentLoaded', forceFocusToBody);
window.addEventListener('load', forceFocusToBody);

// 2. 전역 클릭 감지 시 INPUT/SELECT 필드가 아니라면 0.05초 뒤 즉각 포커스를 body로 자동 반환하여
// 마우스 조작을 하다 가도 즉시 방향키 스크롤이 무결하게 작동하도록 보장합니다.
document.addEventListener('mouseup', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
    setTimeout(forceFocusToBody, 50);
  }
});



