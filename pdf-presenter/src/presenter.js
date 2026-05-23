import * as pdfjsLib from 'pdfjs-dist';

// Vite 환경에서 PDF.js Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// 글로벌 상태 관리 (컨트롤러와 동기화)
const state = {
  pdfDoc: null,
  pageCount: 0,
  pageCanvases: [],
  pageHeights: [], // 누적 좌표 추적
  
  // 수신된 목표 뷰포트 (가로 1.0 기준 비율)
  targetViewport: {
    xRatio: 0,
    yRatio: 0,
    wRatio: 0.7,
    hRatio: 0.393 // 16:9
  },
  
  // 물리 보간(Lerp)을 거친 현재 화면 뷰포트
  currentViewport: {
    xRatio: 0,
    yRatio: 0,
    wRatio: 0.7,
    hRatio: 0.393
  },
  
  // 렌더링 제어 설정
  smoothing: 0.85,
  bgTheme: 'transparent',
  isTransitioning: false, // 페이지 전환 트랜지션 진행 여부 (디졸브 시 스크롤 무시 가드)
  
  // 가상 평면 기준 해상도
  basePlaneWidth: 1200 // 고화질 렌더링을 위한 기본 가로 평면 해상도
};

// Broadcast Channel 수신
const channel = new BroadcastChannel('pdf-studio-channel');

// DOM Elements
const presenterViewport = document.getElementById('presenter-viewport');
const presenterCanvasContainer = document.getElementById('presenter-canvas-container');
const waitingScreen = document.getElementById('waiting-screen');

// 1. 채널 메시지 이벤트 수신
channel.onmessage = async function(e) {
  const data = e.data;
  if (!data) return;

  switch (data.type) {
    case 'LOAD_PDF':
      // PDF 로딩
      waitingScreen.classList.remove('fade-out');
      await loadPDF(data.pdfData);
      waitingScreen.classList.add('fade-out');
      break;
      
    case 'UPDATE_VIEWPORT':
      // 트랜지션 중이 아닐 때만 60fps 마우스/키보드 실시간 스크롤 동기화 수용
      if (!state.isTransitioning) {
        state.targetViewport = data.viewport;
      }
      break;
      
    case 'PAGE_JUMP':
      // [핵심 연출 추가]: 페이지 순간이동(Jump) 액션을 연출 모드에 따라 실행
      handlePageJump(data.mode, data.viewport);
      break;
      
    case 'UPDATE_SETTINGS':
      // 배경 테마 및 스무딩 조절
      applySettings(data.settings);
      break;

    case 'FORCE_INSTANT_SYNC':
      state.currentViewport = { ...state.targetViewport };
      renderViewport();
      break;

    case 'TRANSITION_FADE_OUT':
      presenterCanvasContainer.classList.add('fade-out-active');
      break;

    case 'TRANSITION_FADE_IN':
      presenterCanvasContainer.classList.remove('fade-out-active');
      break;
  }
};

// 페이지 전환 연출 트랜지션 엔진 구현
function handlePageJump(mode, viewport) {
  if (mode === 'cut') {
    // 1) 즉시(CUT) 모드: 1프레임만에 Lerp 보간 없이 다이렉트 순간이동
    state.targetViewport = { ...viewport };
    state.currentViewport = { ...viewport };
    renderViewport();
    
  } else if (mode === 'ease') {
    // 2) 스무스(EASE) 모드: Lerp 스무딩 루프를 따라 부드럽게 스크롤링
    state.targetViewport = { ...viewport };
    
  } else {
    // 3) 디졸브(FADE) 모드: 0.25초 페이드아웃 -> 완전 투명화 상태에서 순간이동 -> 0.25초 페이드인
    state.isTransitioning = true;
    presenterCanvasContainer.classList.add('fade-out-active');
    
    setTimeout(() => {
      // 보이지 않는 상태에서 순간이동
      state.targetViewport = { ...viewport };
      state.currentViewport = { ...viewport };
      renderViewport();
      
      // 서서히 복구
      presenterCanvasContainer.classList.remove('fade-out-active');
      
      // 페이드인이 완전히 마쳐진 후(250ms 후) 락 해제
      setTimeout(() => {
        state.isTransitioning = false;
      }, 250);
    }, 250);
  }
}

// 송출창이 열렸음을 컨트롤러에 PING (컨트롤러가 살아있으면 데이터를 즉시 넘겨받음)
function notifyReady() {
  channel.postMessage({ type: 'PRESENTER_READY' });
}

// 2. PDF 파싱 및 고해상도 연속 렌더러 설계
async function loadPDF(pdfData) {
  try {
    presenterCanvasContainer.innerHTML = '';
    state.pageCanvases = [];
    state.pageHeights = [];
    
    // PDF 로드
    state.pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    state.pageCount = state.pdfDoc.numPages;
    
    // 가상 가로 폭 1200px 평면 기준으로 페이지들 연속 세로 렌더링 수행
    let accumulatedHeight = 0;
    
    for (let pageNum = 1; pageNum <= state.pageCount; pageNum++) {
      const page = await state.pdfDoc.getPage(pageNum);
      
      // 고화질 송출을 위한 스케일 계산
      const originalViewport = page.getViewport({ scale: 1.0 });
      const scale = state.basePlaneWidth / originalViewport.width;
      const viewport = page.getViewport({ scale });
      
      // 개별 페이지 컨테이너 생성 및 절대 위치 지정 (틈새 없이 밀착)
      const pageContainer = document.createElement('div');
      pageContainer.style.position = 'absolute';
      pageContainer.style.left = '0px';
      pageContainer.style.top = `${accumulatedHeight}px`;
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;
      pageContainer.style.backgroundColor = '#ffffff';
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.display = 'block';
      
      const ctx = canvas.getContext('2d');
      pageContainer.appendChild(canvas);
      presenterCanvasContainer.appendChild(pageContainer);
      
      state.pageCanvases.push(pageContainer);
      
      // 렌더링 프라미스
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      // 다음 페이지 Y 시작값 적재 (갭 없이 밀착 누적)
      accumulatedHeight += viewport.height;
    }
    
    // 송출 가상 가로 평면 너비 세팅
    presenterCanvasContainer.style.width = `${state.basePlaneWidth}px`;
    presenterCanvasContainer.style.height = `${accumulatedHeight}px`;
    
    // Lerp 애니메이션 루프 최초 기동
    startLerpAnimationLoop();
    
  } catch (error) {
    console.error('송출 PDF 렌더링 에러:', error);
  }
}

// 3. UI 및 렌더링 셋팅 컨트롤
function applySettings(settings) {
  state.smoothing = settings.smoothing;
  state.bgTheme = settings.bgTheme;
  
  // 배경 테마 즉시 리플렉션
  document.body.className = ''; // 기존 모드 클리어
  if (state.bgTheme !== 'transparent') {
    document.body.classList.add(state.bgTheme);
  }
}

/* ==========================================
   4. Lerp (Linear Interpolation) 스무딩 루프
   ========================================== */

let animationFrameId = null;

function startLerpAnimationLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  // 초기 정렬
  state.currentViewport = { ...state.targetViewport };
  
  function updateFrame() {
    const s = 1 - state.smoothing; // 보간 이동 계수 (스무딩이 낮을수록 1에 수렴하여 즉시 반응)
    
    // Lerp 수식 적용 (현재값 += (목표값 - 현재값) * 감속율)
    state.currentViewport.xRatio += (state.targetViewport.xRatio - state.currentViewport.xRatio) * s;
    state.currentViewport.yRatio += (state.targetViewport.yRatio - state.currentViewport.yRatio) * s;
    state.currentViewport.wRatio += (state.targetViewport.wRatio - state.currentViewport.wRatio) * s;
    state.currentViewport.hRatio += (state.targetViewport.hRatio - state.currentViewport.hRatio) * s;
    
    // 물리 뷰포트 배치 반영
    renderViewport();
    
    animationFrameId = requestAnimationFrame(updateFrame);
  }
  
  animationFrameId = requestAnimationFrame(updateFrame);
}

// 뷰포트 박스 정보 기반으로 CSS 3D GPU 가속 스케일 & 변환 적용
function renderViewport() {
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  
  // 1. 송출창 기준 가상 평면에서의 실제 픽셀 크기 환산
  const vx = state.currentViewport.xRatio * state.basePlaneWidth;
  const vy = state.currentViewport.yRatio * state.basePlaneWidth;
  const vw = state.currentViewport.wRatio * state.basePlaneWidth;
  const vh = state.currentViewport.hRatio * state.basePlaneWidth;
  
  // 2. 송출 창에 맞추기 위한 확대 비율 계산
  // 송출 창의 가로세로 폭에 사각형이 빈틈없이 딱 들어맞도록 스케일링 설정
  const scaleX = winWidth / vw;
  const scaleY = winHeight / vh;
  
  // Aspect Ratio를 보호하며 최적 맞춤 (Letterbox 방지 위해 꽉 채움 권장)
  // 방송 송출에 최적화하기 위해 scaleX와 scaleY를 모두 활용하는 방식 또는 가로 고정 방식 중 선택 가능
  // 여기서는 뷰포트 사각형 비율 자체가 송출 창 종횡비를 대변하므로 그대로 배율 부여
  const finalScale = Math.min(scaleX, scaleY);
  
  // Centering offset 보정
  const offsetX = (winWidth - vw * finalScale) / 2;
  const offsetY = (winHeight - vh * finalScale) / 2;
  
  // 3. GPU 하드웨어 가속 적용 (translate3d 활용)
  // 전체 가상 캔버스 컨테이너를 역방향으로 이동시켜 뷰포트 영역을 원점(0,0)으로 배치하고 확대
  const tx = -vx * finalScale + offsetX;
  const ty = -vy * finalScale + offsetY;
  
  presenterCanvasContainer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${finalScale})`;
}

// 윈도우 리사이즈 시 즉시 재정렬
window.addEventListener('resize', () => {
  if (state.pdfDoc) {
    renderViewport();
  }
});

// 초기화 호출
notifyReady();

// 5) 전체화면 송출 설정 연동 (브라우저 보안상 클릭 제스처 필요)
const presenterMode = localStorage.getItem('pdf-presenter-mode') || 'windowed';

if (presenterMode === 'fullscreen') {
  // 전체화면 안내 플로팅 배너 동적 생성
  const fsPrompt = document.createElement('div');
  fsPrompt.id = 'fullscreen-prompt';
  fsPrompt.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(9, 9, 13, 0.9);
    border: 1px solid #facc15;
    box-shadow: 0 0 15px rgba(250, 204, 21, 0.4), inset 0 0 8px rgba(250, 204, 21, 0.1);
    padding: 10px 18px;
    border-radius: 8px;
    color: #facc15;
    font-size: 0.85rem;
    font-weight: 600;
    z-index: 100000;
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.5px;
    backdrop-filter: blur(8px);
  `;
  fsPrompt.innerHTML = `<span>📺</span> <span>전체창 송출 모드: 화면을 한 번 클릭하면 전체화면으로 자동 전환됩니다.</span>`;
  document.body.appendChild(fsPrompt);

  const enterFS = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => {
          fsPrompt.style.opacity = '0';
          fsPrompt.style.transform = 'translateY(-10px)';
          setTimeout(() => fsPrompt.remove(), 300);
        })
        .catch(err => {
          console.error('전체화면 전환 실패:', err);
        });
    }
  };

  document.body.addEventListener('click', enterFS);
  
  // 이미 다른 단축키(F11)로 들어갔거나 수동으로 들어간 경우 감지하여 지움
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      fsPrompt.style.opacity = '0';
      fsPrompt.style.transform = 'translateY(-10px)';
      setTimeout(() => fsPrompt.remove(), 300);
    }
  });
}

// 6) ESC 누르면 뷰어창 끄기(닫기) 및 닫힘 신호 채널 송출
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    channel.postMessage({ type: 'PRESENTER_CLOSED' });
    
    if (window.__TAURI_INTERNALS__ !== undefined) {
      // Tauri 환경
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      appWindow.close();
    } else {
      // 일반 웹 브라우저 환경
      window.close();
    }
    e.preventDefault();
  }
});

// 7) 사용자가 창을 수동으로 닫거나 언로드할 때 닫힘 신호 채널 송출
window.addEventListener('beforeunload', () => {
  channel.postMessage({ type: 'PRESENTER_CLOSED' });
});
