const isTauri = !!window.__TAURI__;

// 매우 안전한 listen 호출 함수
function safeListen(event, callback) {
  if (isTauri && window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
    return window.__TAURI__.event.listen(event, callback).catch(err => {
      console.error(`Tauri Listen Error [${event}]:`, err);
    });
  }
  console.warn(`Tauri가 활성화되어 있지 않거나 API가 정의되지 않아 Listen 생략: ${event}`);
  return Promise.resolve(() => {});
}

const listen = safeListen;

const overlayTimerContainer = document.getElementById('overlay-timer-container');
const overlayTimer = document.getElementById('overlay-timer');
const overlayAlertContainer = document.getElementById('overlay-alert-container');
const overlayAlert = document.getElementById('overlay-alert');

// ═══════════════════════════════════════════
// 1. 상태 동기화 이벤트 감지 (Tauri Event)
// ═══════════════════════════════════════════
if (isTauri) {
  listen('timer-update', (event) => {
    const payload = event.payload;
    updateOverlayUI(payload);
  });
} else {
  // 브라우저 단독 디버깅용 더미 갱신 루프
  console.log("Tauri 환경이 아닙니다. 디버깅 모드로 구동합니다.");
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'debug-update') {
      updateOverlayUI(e.data.payload);
    }
  });
}

// ═══════════════════════════════════════════
// 2. 정밀 절대 배치 함수 (3x3 포지셔닝 + X/Y 오프셋 + 스케일 + 스타일)
// ═══════════════════════════════════════════
function applyElementStyle(container, element, config, customColor = null) {
  if (!container || !element || !config) return;

  // 초기화
  container.style.top = 'auto';
  container.style.bottom = 'auto';
  container.style.left = 'auto';
  container.style.right = 'auto';
  container.style.transform = 'none';
  container.style.margin = '0';
  container.style.position = 'absolute';

  const pos = config.position || 'tr';

  // 가로 정렬 설정
  if (pos.endsWith('l')) {
    container.style.left = '0px';
  } else if (pos.endsWith('c')) {
    container.style.left = '50%';
  } else if (pos.endsWith('r')) {
    container.style.right = '0px';
  }

  // 세로 정렬 설정
  if (pos.startsWith('t')) {
    container.style.top = '0px';
  } else if (pos.startsWith('m')) {
    container.style.top = '50%';
  } else if (pos.startsWith('b')) {
    container.style.bottom = '0px';
  }

  // transform 계산 (정렬 보정 및 스케일)
  let transX = '0%';
  let transY = '0%';

  if (pos.endsWith('c')) transX = '-50%';
  if (pos.startsWith('m')) transY = '-50%';

  const scale = config.scale !== undefined ? config.scale : 1.0;
  container.style.transform = `translate(${transX}, ${transY}) scale(${scale})`;
  
  // transform origin 설정으로 깔끔한 배율 스케일링 보장
  let originX = pos.endsWith('l') ? 'left' : (pos.endsWith('r') ? 'right' : 'center');
  let originY = pos.startsWith('t') ? 'top' : (pos.startsWith('b') ? 'bottom' : 'center');
  container.style.transformOrigin = `${originX} ${originY}`;

  // 상세 X/Y 오프셋 적용
  const offsetX = config.offsetX !== undefined ? config.offsetX : 0;
  const offsetY = config.offsetY !== undefined ? config.offsetY : 0;

  if (pos.endsWith('l')) {
    container.style.marginLeft = `${offsetX}px`;
  } else if (pos.endsWith('r')) {
    container.style.marginRight = `${offsetX}px`;
  } else {
    container.style.marginLeft = `${offsetX}px`;
  }

  if (pos.startsWith('t')) {
    container.style.marginTop = `${offsetY}px`;
  } else if (pos.startsWith('b')) {
    container.style.marginBottom = `${offsetY}px`;
  } else {
    container.style.marginTop = `${offsetY}px`;
  }

  // 폰트 스타일 적용
  element.style.fontSize = `${config.fontSize || 2.0}rem`;
  element.style.color = customColor || config.color || '#ffffff';
}

// ═══════════════════════════════════════════
// 3. 오버레이 배경 스타일 실시간 렌더링 지원 함수군
// ═══════════════════════════════════════════
function hexToRgb(hex) {
  if (!hex) return { r: 0, g: 0, b: 0 };
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function updateBackgroundStyle(overlayConfig) {
  if (!overlayConfig) {
    document.body.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('backdrop-filter', 'none', 'important');
    document.body.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    return;
  }

  const effect = overlayConfig.backgroundEffect || 'transparent';
  const hex = overlayConfig.backgroundColor || '#000000';
  const opacityPercent = overlayConfig.backgroundOpacity !== undefined ? overlayConfig.backgroundOpacity : 0;
  const opacity = opacityPercent / 100;

  if (effect === 'transparent') {
    document.body.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('backdrop-filter', 'none', 'important');
    document.body.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
  } else if (effect === 'blur') {
    const rgb = hexToRgb(hex);
    document.body.style.setProperty('background', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`, 'important');
    document.body.style.setProperty('backdrop-filter', 'blur(16px)', 'important');
    document.body.style.setProperty('-webkit-backdrop-filter', 'blur(16px)', 'important');
  } else if (effect === 'solid') {
    const rgb = hexToRgb(hex);
    document.body.style.setProperty('background', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`, 'important');
    document.body.style.setProperty('backdrop-filter', 'none', 'important');
    document.body.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
  }
}

// ═══════════════════════════════════════════
// 4. 오버레이 화면 렌더링 갱신
// ═══════════════════════════════════════════
function updateOverlayUI(data) {
  if (!data || !data.settings) return;

  // A. 시간 텍스트 업데이트
  overlayTimer.innerText = data.formattedTime;

  // B. 경고 단계별 색상 적용 (위험/경고 단계에선 테마 프리셋 강제 적용, 평상시엔 커스텀 컬러)
  let timerColor = data.settings.timer.color;
  if (data.warningLevel === 'danger') {
    timerColor = 'var(--danger)';
  } else if (data.warningLevel === 'warning') {
    timerColor = 'var(--warning)';
  }

  // C. 타이머 정밀 포지셔닝 및 스타일 적용
  applyElementStyle(overlayTimerContainer, overlayTimer, data.settings.timer, timerColor);

  // D. 실시간 알림 텍스트 업데이트 및 표시 여부 분기
  if (data.alertEnabled && data.alertMessage && data.alertMessage.trim() !== '') {
    overlayAlert.innerText = data.alertMessage;
    overlayAlert.classList.add('show');
    
    // 알림 정밀 포지셔닝 및 스타일 적용
    applyElementStyle(overlayAlertContainer, overlayAlert, data.settings.alert, data.settings.alert.color);
  } else {
    overlayAlert.classList.remove('show');
  }

  // E. 오버레이 배경 스타일 실시간 렌더링
  updateBackgroundStyle(data.settings.overlay);
}

