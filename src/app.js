// Tauri API 참조 및 안전 기둥 (Safe Wrapper)
const isTauri = !!window.__TAURI__;

// 매우 안전한 invoke 호출 함수
function safeInvoke(cmd, args = {}) {
  if (isTauri && window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
    return window.__TAURI__.core.invoke(cmd, args).catch(err => {
      console.error(`Tauri Invoke Error [${cmd}]:`, err);
      throw err;
    });
  } else if (isTauri && window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
    // Tauri v1 호환성 대비 2차 백업
    return window.__TAURI__.invoke(cmd, args).catch(err => {
      console.error(`Tauri Legacy Invoke Error [${cmd}]:`, err);
      throw err;
    });
  }
  console.warn(`Tauri가 활성화되어 있지 않거나 API가 정의되지 않아 Invoke 생략: ${cmd}`);
  return Promise.resolve();
}

// 매우 안전한 emit 호출 함수
function safeEmit(event, payload) {
  if (isTauri && window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.emit === 'function') {
    return window.__TAURI__.event.emit(event, payload).catch(err => {
      console.error(`Tauri Emit Error [${event}]:`, err);
    });
  }
  return Promise.resolve();
}

// 기존 변수 명칭 매핑 유지로 하위 코드 수정 최소화
const invoke = safeInvoke;
const emit = safeEmit;

// ═══════════════════════════════════════════
// 1. 애플리케이션 상태 (State)
// ═══════════════════════════════════════════
const state = {
  baseTotalSecs: 180, // 오리지널 설정 시간 보존용
  totalSecs: 180, // 기본 3분
  remainingSecs: 180,
  isRunning: false,
  alarmFired1: false,
  alarmFired2: false,
  alarmFired3: false,
  
  // 설정값 (LocalStorage 보관)
  settings: {
    timer: {
      position: 'tr',
      offsetX: 20,
      offsetY: 20,
      scale: 1.0,
      fontSize: 5.0,
      color: '#00e5ff'
    },
    alert: {
      position: 'bc',
      offsetX: 0,
      offsetY: 40,
      scale: 1.0,
      fontSize: 1.8,
      color: '#ff3d00'
    },
    alarm: {
      soundVolume: 80,
      warnLevel1: 60,
      soundEnabled1: true,
      warnLevel2: 30,
      soundEnabled2: true,
      warnLevel3: 10,
      soundEnabled3: true
    },
    overlay: {
      backgroundEffect: 'transparent',
      backgroundColor: '#000000',
      backgroundOpacity: 0
    }
  },
  
  alert: {
    enabled: false,
    message: ''
  }
};

// ═══════════════════════════════════════════
// 2. DOM 요소들
// ═══════════════════════════════════════════
const timerDigits = document.getElementById('timer-digits');
const timerSublabel = document.getElementById('timer-sublabel');
const progressBar = document.getElementById('progress-bar');
const statusBadge = document.getElementById('status-badge');
const monitorSelect = document.getElementById('monitor-select');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const btnAdd30s = document.getElementById('btn-add-30s');
const btnAdd1m = document.getElementById('btn-add-1m');

const customMin = document.getElementById('custom-min');
const customSec = document.getElementById('custom-sec');
const btnApplyCustom = document.getElementById('btn-apply-custom');

const alertMessage = document.getElementById('alert-message');
const btnAlertSend = document.getElementById('btn-alert-send');
const btnAlertClear = document.getElementById('btn-alert-clear');

const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsDialog = document.getElementById('settings-dialog');

// 설정 모달 탭 스위칭 관련 요소들
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// ⏱ 1. 타이머 시계 설정 탭 요소들
const timerPosButtons = document.querySelectorAll('.timer-pos-btn');
const timerOffsetXInput = document.getElementById('timer-offset-x');
const timerOffsetYInput = document.getElementById('timer-offset-y');
const timerScaleInput = document.getElementById('timer-scale');
const timerFontSizeInput = document.getElementById('timer-font-size');
const timerColorInput = document.getElementById('timer-color');

const timerOffsetXVal = document.getElementById('timer-offset-x-val');
const timerOffsetYVal = document.getElementById('timer-offset-y-val');
const timerScaleVal = document.getElementById('timer-scale-val');
const timerFontSizeVal = document.getElementById('timer-font-size-val');

// 📢 2. 실시간 알림 설정 탭 요소들
const alertPosButtons = document.querySelectorAll('.alert-pos-btn');
const alertOffsetXInput = document.getElementById('alert-offset-x');
const alertOffsetYInput = document.getElementById('alert-offset-y');
const alertScaleInput = document.getElementById('alert-scale');
const alertFontSizeInput = document.getElementById('alert-font-size');
const alertColorInput = document.getElementById('alert-color');

const alertOffsetXVal = document.getElementById('alert-offset-x-val');
const alertOffsetYVal = document.getElementById('alert-offset-y-val');
const alertScaleVal = document.getElementById('alert-scale-val');
const alertFontSizeVal = document.getElementById('alert-font-size-val');

// 🔔 3. 알람과 벨소리 탭 요소들
const soundVolumeInput = document.getElementById('sound-volume');
const soundVolumeVal = document.getElementById('sound-volume-val');

const alarmSoundEnabled1 = document.getElementById('alarm-sound-enabled-1');
const alarmSoundEnabled2 = document.getElementById('alarm-sound-enabled-2');
const alarmSoundEnabled3 = document.getElementById('alarm-sound-enabled-3');

const alarmWarnLevel1 = document.getElementById('alarm-warn-level-1');
const alarmWarnLevel2 = document.getElementById('alarm-warn-level-2');
const alarmWarnLevel3 = document.getElementById('alarm-warn-level-3');

// 📺 4. 오버레이 창 배경 설정 요소들
const overlayBgEffectSelect = document.getElementById('overlay-bg-effect');
const overlayBgColorInput = document.getElementById('overlay-bg-color');
const overlayBgOpacityInput = document.getElementById('overlay-bg-opacity');
const overlayBgColorRow = document.getElementById('overlay-bg-color-row');
const overlayBgOpacityRow = document.getElementById('overlay-bg-opacity-row');
const overlayBgOpacityVal = document.getElementById('overlay-bg-opacity-val');

// ═══════════════════════════════════════════
// 3. Web Audio API 기반 오디오 톤 합성기 (Chime)
// ═══════════════════════════════════════════
function playPremiumChime(volumePercent, type = 1) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    const gainNode = ctx.createGain();
    // 볼륨 적용
    const volume = (volumePercent / 100) * 0.5;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (type === 3 ? 2.5 : 1.8));
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    
    if (type === 1) {
      // 1차 경고: 부드러운 하모니 (A5, E6)
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(440, now + 0.8);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.6);
    } else if (type === 2) {
      // 2차 경고: 주의 환기 (C6, G6)
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1046.5, now); // C6
      osc1.frequency.exponentialRampToValueAtTime(523.25, now + 1.0);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1568, now); // G6
      osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.8);
    } else {
      // 3차 경고 / 타임오버: 긴박한 강력 주의 환기 (E6, Bb6 - 감5도 트라이톤 불협화음)
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1318.5, now); // E6
      osc1.frequency.linearRampToValueAtTime(659.25, now + 1.5);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1864.7, now); // Bb6
      osc2.frequency.linearRampToValueAtTime(932.33, now + 1.2);
    }
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + (type === 3 ? 2.5 : 1.8));
    osc2.stop(now + (type === 3 ? 2.5 : 1.8));
  } catch (err) {
    console.error("사운드 합성 중 에러 발생:", err);
  }
}

// ═══════════════════════════════════════════
// 4. 타이머 제어 및 갱신 로직
// ═══════════════════════════════════════════
let lastTickTime = 0;
let timerId = null;

function formatTime(secs) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.floor(Math.abs(secs) % 60);
  const sign = secs < 0 ? '-' : '';
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getWarningLevel(secs) {
  if (secs <= 0) return 'danger';
  if (secs <= state.settings.alarm.warnLevel3) return 'danger';
  if (secs <= state.settings.alarm.warnLevel2) return 'danger';
  if (secs <= state.settings.alarm.warnLevel1) return 'warning';
  return 'safe';
}

function updateUI() {
  // 1. 시간 텍스트 업데이트
  const formatted = formatTime(state.remainingSecs);
  timerDigits.innerText = formatted;
  
  // 경고 레벨에 따른 텍스트 색상
  const wLevel = getWarningLevel(state.remainingSecs);
  if (wLevel === 'danger') {
    timerDigits.style.color = 'var(--danger)';
    timerSublabel.innerText = state.remainingSecs <= 0 ? 'TIME OVER' : 'WARNING!';
    timerSublabel.style.color = 'var(--danger)';
  } else if (wLevel === 'warning') {
    timerDigits.style.color = 'var(--warning)';
    timerSublabel.innerText = 'CAUTION';
    timerSublabel.style.color = 'var(--warning)';
  } else {
    timerDigits.style.color = 'var(--text-main)';
    timerSublabel.innerText = 'SAFE';
    timerSublabel.style.color = 'var(--safe)';
  }

  // 2. SVG Circular Progress 업데이트
  // 반경 88 원주 = 552.92
  const maxOffset = 552.92;
  const progress = state.totalSecs > 0 ? (state.remainingSecs / state.totalSecs) : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const offset = maxOffset * (1 - clampedProgress);
  progressBar.style.strokeDashoffset = offset;

  // 프로그레스 바 색상
  if (wLevel === 'danger') {
    progressBar.style.stroke = 'var(--danger)';
  } else if (wLevel === 'warning') {
    progressBar.style.stroke = 'var(--warning)';
  } else {
    progressBar.style.stroke = 'var(--primary)';
  }

  // 3. 상태 배지 업데이트
  if (state.isRunning) {
    statusBadge.innerText = '● 실행 중';
    statusBadge.className = 'status-badge running';
    btnStart.style.display = 'none';
    btnPause.style.display = 'block';
  } else {
    statusBadge.innerText = state.remainingSecs <= 0 ? '● 종료' : '● 대기';
    statusBadge.className = 'status-badge';
    btnStart.style.display = 'block';
    btnPause.style.display = 'none';
  }

  // 4. 오버레이 창으로 실시간 상태 이벤트 송출
  sendStateToOverlay();
}

function sendStateToOverlay() {
  if (isTauri) {
    invoke('share_timer_state', {
      payload: {
        totalSecs: state.totalSecs,
        remainingSecs: state.remainingSecs,
        isRunning: state.isRunning,
        warningLevel: getWarningLevel(state.remainingSecs),
        formattedTime: formatTime(state.remainingSecs),
        alertEnabled: state.alert.enabled,
        alertMessage: state.alert.message,
        settings: state.settings
      }
    });
  }
}

function tick() {
  if (!state.isRunning) return;
  
  const now = Date.now();
  const delta = (now - lastTickTime) / 1000;
  lastTickTime = now;
  
  state.remainingSecs -= delta;
  
  // 1차 경고 판단
  if (state.settings.alarm.soundEnabled1 && !state.alarmFired1 && state.remainingSecs <= state.settings.alarm.warnLevel1 && state.remainingSecs > state.settings.alarm.warnLevel2) {
    state.alarmFired1 = true;
    playPremiumChime(state.settings.alarm.soundVolume, 1);
  }
  // 2차 경고 판단
  if (state.settings.alarm.soundEnabled2 && !state.alarmFired2 && state.remainingSecs <= state.settings.alarm.warnLevel2 && state.remainingSecs > state.settings.alarm.warnLevel3) {
    state.alarmFired2 = true;
    playPremiumChime(state.settings.alarm.soundVolume, 2);
  }
  // 3차 경고 판단 (타임오버 포함)
  if (state.settings.alarm.soundEnabled3 && !state.alarmFired3 && state.remainingSecs <= state.settings.alarm.warnLevel3) {
    state.alarmFired3 = true;
    playPremiumChime(state.settings.alarm.soundVolume, 3);
  }
  
  // 무제한 마이너스 흘러가기 또는 0초 정지 등의 제어
  // 여기서는 프레젠테이션의 초과 시간을 시각화하기 위해 마이너스로 지속 카운트합니다.
  if (state.remainingSecs < -3600) { // 1시간 초과 시 자동정지
    pauseTimer();
  }

  updateUI();
  
  if (state.isRunning) {
    timerId = requestAnimationFrame(tick);
  }
}

function startTimer() {
  if (state.isRunning) return;
  state.isRunning = true;
  lastTickTime = Date.now();
  timerId = requestAnimationFrame(tick);
  
  // 오버레이 창을 나타나게 지시
  invoke('set_overlay_visible', { visible: true }).catch(err => {
    console.error("오버레이 가시성 설정 실패:", err);
  });
  
  // 지정된 모니터 공간으로 오버레이 즉시 배치
  if (isTauri && monitorSelect) {
    const idx = parseInt(monitorSelect.value, 10);
    if (!isNaN(idx)) {
      invoke('move_overlay_to_monitor', { monitorIndex: idx }).catch(err => {
        console.error("오버레이 모니터 배치 실패:", err);
      });
    }
  }
  
  updateUI();
}

function pauseTimer() {
  state.isRunning = false;
  if (timerId) {
    cancelAnimationFrame(timerId);
    timerId = null;
  }
  updateUI();
}

function resetTimer() {
  pauseTimer();
  // 추가시간 흔적을 소거하고 원래의 약속된 시간 프리셋으로 복원
  state.totalSecs = state.baseTotalSecs;
  state.remainingSecs = state.baseTotalSecs;
  state.alarmFired1 = false;
  state.alarmFired2 = false;
  state.alarmFired3 = false;
  
  // 오버레이 창을 숨김 지시
  invoke('set_overlay_visible', { visible: false }).catch(err => {
    console.error("오버레이 숨김 설정 실패:", err);
  });
  updateUI();
}

function setTime(secs) {
  state.baseTotalSecs = secs;
  state.totalSecs = secs;
  state.remainingSecs = secs;
  state.alarmFired1 = false;
  state.alarmFired2 = false;
  state.alarmFired3 = false;
  saveSettings();
  updateUI();
}

// ═══════════════════════════════════════════
// 5. 설정 영속 저장 및 복원 (LocalStorage)
// ═══════════════════════════════════════════
// 깊은 복사 & 머지 헬퍼 함수
function mergeDeep(target, source) {
  if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
    return source;
  }
  const output = { ...target };
  Object.keys(source).forEach(key => {
    if (typeof source[key] === 'object' && source[key] !== null) {
      output[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

function loadSettings() {
  const saved = localStorage.getItem('timer_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 기존 구형 단층 스키마 자동 마이그레이션
      if (parsed.overlayPosition !== undefined || parsed.soundVolume !== undefined) {
        console.log("구형 설정 스키마 감지. 신규 3탭 구조로 마이그레이션을 실행합니다.");
        if (parsed.overlayPosition !== undefined) state.settings.timer.position = parsed.overlayPosition;
        if (parsed.overlaySize !== undefined) state.settings.timer.fontSize = parsed.overlaySize;
        if (parsed.soundVolume !== undefined) state.settings.alarm.soundVolume = parsed.soundVolume;
        if (parsed.soundEnabled !== undefined) {
          state.settings.alarm.soundEnabled1 = parsed.soundEnabled;
          state.settings.alarm.soundEnabled2 = parsed.soundEnabled;
          state.settings.alarm.soundEnabled3 = parsed.soundEnabled;
        }
        if (parsed.warnLevel1 !== undefined) state.settings.alarm.warnLevel1 = parsed.warnLevel1;
        if (parsed.warnLevel2 !== undefined) state.settings.alarm.warnLevel2 = parsed.warnLevel2;
        // 즉시 영구 저장
        saveSettings();
      } else {
        // 안전하게 딥 머지
        state.settings = mergeDeep(state.settings, parsed);
      }
    } catch (e) {
      console.error("설정 파싱 에러:", e);
    }
  }
  
  const savedTime = localStorage.getItem('timer_total_secs');
  if (savedTime) {
    const val = parseInt(savedTime, 10) || 180;
    state.baseTotalSecs = val;
    state.totalSecs = val;
    state.remainingSecs = val;
  } else {
    state.baseTotalSecs = 180;
    state.totalSecs = 180;
    state.remainingSecs = 180;
  }

  // ⏱ 1. 타이머 시계 DOM 요소 채우기
  timerOffsetXInput.value = state.settings.timer.offsetX;
  timerOffsetXVal.innerText = state.settings.timer.offsetX;
  timerOffsetYInput.value = state.settings.timer.offsetY;
  timerOffsetYVal.innerText = state.settings.timer.offsetY;
  timerScaleInput.value = state.settings.timer.scale;
  timerScaleVal.innerText = state.settings.timer.scale.toFixed(1);
  timerFontSizeInput.value = state.settings.timer.fontSize;
  timerFontSizeVal.innerText = state.settings.timer.fontSize.toFixed(1);
  timerColorInput.value = state.settings.timer.color;

  // 📢 2. 실시간 알림 DOM 요소 채우기
  alertOffsetXInput.value = state.settings.alert.offsetX;
  alertOffsetXVal.innerText = state.settings.alert.offsetX;
  alertOffsetYInput.value = state.settings.alert.offsetY;
  alertOffsetYVal.innerText = state.settings.alert.offsetY;
  alertScaleInput.value = state.settings.alert.scale;
  alertScaleVal.innerText = state.settings.alert.scale.toFixed(1);
  alertFontSizeInput.value = state.settings.alert.fontSize;
  alertFontSizeVal.innerText = state.settings.alert.fontSize.toFixed(1);
  alertColorInput.value = state.settings.alert.color;

  // 🔔 3. 알람과 사운드 DOM 요소 채우기
  soundVolumeInput.value = state.settings.alarm.soundVolume;
  soundVolumeVal.innerText = state.settings.alarm.soundVolume;
  
  alarmSoundEnabled1.checked = state.settings.alarm.soundEnabled1;
  alarmSoundEnabled2.checked = state.settings.alarm.soundEnabled2;
  alarmSoundEnabled3.checked = state.settings.alarm.soundEnabled3;
  
  alarmWarnLevel1.value = state.settings.alarm.warnLevel1;
  alarmWarnLevel2.value = state.settings.alarm.warnLevel2;
  alarmWarnLevel3.value = state.settings.alarm.warnLevel3;

  // 📺 4. 오버레이 창 배경 설정 DOM 요소 채우기
  if (state.settings.overlay) {
    overlayBgEffectSelect.value = state.settings.overlay.backgroundEffect || 'transparent';
    overlayBgColorInput.value = state.settings.overlay.backgroundColor || '#000000';
    overlayBgOpacityInput.value = state.settings.overlay.backgroundOpacity !== undefined ? state.settings.overlay.backgroundOpacity : 0;
    overlayBgOpacityVal.innerText = overlayBgOpacityInput.value;
  }
  updateOverlayStyleSettingsUI();
  
  // 3x3 정렬 버튼 UI 초기화
  updateTimerPosButtonsUI();
  updateAlertPosButtonsUI();
}

function updateOverlayStyleSettingsUI() {
  if (!state.settings.overlay || !overlayBgColorRow || !overlayBgOpacityRow) return;
  const effect = state.settings.overlay.backgroundEffect;
  if (effect === 'transparent') {
    overlayBgColorRow.style.display = 'none';
    overlayBgOpacityRow.style.display = 'none';
  } else {
    overlayBgColorRow.style.display = 'flex';
    overlayBgOpacityRow.style.display = 'flex';
  }
}

function saveSettings() {
  localStorage.setItem('timer_settings', JSON.stringify(state.settings));
  localStorage.setItem('timer_total_secs', state.baseTotalSecs.toString());
}

// ═══════════════════════════════════════════
// 6. 이벤트 핸들러 바인딩
// ═══════════════════════════════════════════

// 타이머 조작
btnStart.addEventListener('click', startTimer);
btnPause.addEventListener('click', pauseTimer);
btnReset.addEventListener('click', resetTimer);

btnAdd30s.addEventListener('click', () => {
  state.totalSecs += 30;
  state.remainingSecs += 30;
  if (state.remainingSecs > state.settings.alarm.warnLevel1) state.alarmFired1 = false;
  if (state.remainingSecs > state.settings.alarm.warnLevel2) state.alarmFired2 = false;
  if (state.remainingSecs > state.settings.alarm.warnLevel3) state.alarmFired3 = false;
  updateUI();
});

btnAdd1m.addEventListener('click', () => {
  state.totalSecs += 60;
  state.remainingSecs += 60;
  if (state.remainingSecs > state.settings.alarm.warnLevel1) state.alarmFired1 = false;
  if (state.remainingSecs > state.settings.alarm.warnLevel2) state.alarmFired2 = false;
  if (state.remainingSecs > state.settings.alarm.warnLevel3) state.alarmFired3 = false;
  updateUI();
});

// 프리셋 버튼
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const secs = parseInt(btn.dataset.secs, 10);
    setTime(secs);
  });
});

// 커스텀 적용
btnApplyCustom.addEventListener('click', () => {
  const m = parseInt(customMin.value, 10) || 0;
  const s = parseInt(customSec.value, 10) || 0;
  const total = m * 60 + s;
  if (total > 0) {
    setTime(total);
    customMin.value = '';
    customSec.value = '';
  }
});

// 실시간 알림 송출 버튼
btnAlertSend.addEventListener('click', () => {
  const msg = alertMessage.value.trim();
  if (msg !== '') {
    state.alert.enabled = true;
    state.alert.message = msg;
    // 마우스 이벤트를 비활성화하도록 설정하여 클릭 투과 보장
    invoke('set_overlay_clickthrough', { ignore: true }).catch(err => {
      console.error("알림 메시지 투과 설정 실패:", err);
    });
    // 송출 시 오버레이 창 강제 노출
    invoke('set_overlay_visible', { visible: true }).catch(err => {
      console.error("송출 시 오버레이 노출 실패:", err);
    });
  } else {
    state.alert.enabled = false;
    state.alert.message = '';
  }
  updateUI();
});

// 실시간 알림 지우기 버튼
btnAlertClear.addEventListener('click', () => {
  state.alert.enabled = false;
  state.alert.message = '';
  alertMessage.value = '';
  // 실행 중이 아닐 때는 오버레이를 지능적으로 숨김
  if (!state.isRunning) {
    invoke('set_overlay_visible', { visible: false }).catch(err => {
      console.error("알림 지우기 시 오버레이 숨김 실패:", err);
    });
  }
  updateUI();
});

// ⚙ 환경 설정 다이얼로그 토글 및 오버레이 연동
btnSettings.addEventListener('click', () => {
  settingsDialog.showModal();
  if (isTauri) {
    invoke('set_overlay_visible', { visible: true }).catch(err => {
      console.error("설정 창 오픈 시 오버레이 노출 실패:", err);
    });
    // 설정 열 때 오버레이를 지정된 모니터에 강제 재정렬
    if (monitorSelect) {
      const idx = parseInt(monitorSelect.value, 10);
      if (!isNaN(idx)) {
        invoke('move_overlay_to_monitor', { monitorIndex: idx }).catch(err => {
          console.error("설정 창 오픈 시 오버레이 화면 배치 실패:", err);
        });
      }
    }
  }
});

btnCloseSettings.addEventListener('click', () => {
  settingsDialog.close();
});

// 다이얼로그가 닫힐 때(Esc, 단축키, 닫기 버튼 포함) 지능적으로 오버레이 숨김 처리
settingsDialog.addEventListener('close', () => {
  if (!state.isRunning) {
    if (isTauri) {
      invoke('set_overlay_visible', { visible: false }).catch(err => {
        console.error("설정 창 클로즈 시 오버레이 숨김 실패:", err);
      });
    }
  }
});

// 탭 스위처 활성화 이벤트 바인딩
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const targetTabId = btn.dataset.tab;
    tabContents.forEach(c => {
      if (c.id === targetTabId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  });
});

// ⏱ 타이머 시계 3x3 버튼 및 세부 인풋들
timerPosButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.settings.timer.position = btn.dataset.pos;
    updateTimerPosButtonsUI();
    saveSettings();
    updateUI();
  });
});

function updateTimerPosButtonsUI() {
  timerPosButtons.forEach(btn => {
    if (btn.dataset.pos === state.settings.timer.position) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

timerOffsetXInput.addEventListener('input', (e) => {
  state.settings.timer.offsetX = parseInt(e.target.value, 10);
  timerOffsetXVal.innerText = e.target.value;
  saveSettings();
  updateUI();
});

timerOffsetYInput.addEventListener('input', (e) => {
  state.settings.timer.offsetY = parseInt(e.target.value, 10);
  timerOffsetYVal.innerText = e.target.value;
  saveSettings();
  updateUI();
});

timerScaleInput.addEventListener('input', (e) => {
  state.settings.timer.scale = parseFloat(e.target.value);
  timerScaleVal.innerText = state.settings.timer.scale.toFixed(1);
  saveSettings();
  updateUI();
});

timerFontSizeInput.addEventListener('input', (e) => {
  state.settings.timer.fontSize = parseFloat(e.target.value);
  timerFontSizeVal.innerText = state.settings.timer.fontSize.toFixed(1);
  saveSettings();
  updateUI();
});

timerColorInput.addEventListener('input', (e) => {
  state.settings.timer.color = e.target.value;
  saveSettings();
  updateUI();
});

// 📢 실시간 알림 3x3 버튼 및 세부 인풋들
alertPosButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.settings.alert.position = btn.dataset.pos;
    updateAlertPosButtonsUI();
    saveSettings();
    updateUI();
  });
});

function updateAlertPosButtonsUI() {
  alertPosButtons.forEach(btn => {
    if (btn.dataset.pos === state.settings.alert.position) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

alertOffsetXInput.addEventListener('input', (e) => {
  state.settings.alert.offsetX = parseInt(e.target.value, 10);
  alertOffsetXVal.innerText = e.target.value;
  saveSettings();
  updateUI();
});

alertOffsetYInput.addEventListener('input', (e) => {
  state.settings.alert.offsetY = parseInt(e.target.value, 10);
  alertOffsetYVal.innerText = e.target.value;
  saveSettings();
  updateUI();
});

alertScaleInput.addEventListener('input', (e) => {
  state.settings.alert.scale = parseFloat(e.target.value);
  alertScaleVal.innerText = state.settings.alert.scale.toFixed(1);
  saveSettings();
  updateUI();
});

alertFontSizeInput.addEventListener('input', (e) => {
  state.settings.alert.fontSize = parseFloat(e.target.value);
  alertFontSizeVal.innerText = state.settings.alert.fontSize.toFixed(1);
  saveSettings();
  updateUI();
});

alertColorInput.addEventListener('input', (e) => {
  state.settings.alert.color = e.target.value;
  saveSettings();
  updateUI();
});

// 🔔 알람과 사운드 탭 세부 인풋들
soundVolumeInput.addEventListener('input', (e) => {
  state.settings.alarm.soundVolume = parseInt(e.target.value, 10);
  soundVolumeVal.innerText = e.target.value;
  saveSettings();
  updateUI();
});

alarmSoundEnabled1.addEventListener('change', (e) => {
  state.settings.alarm.soundEnabled1 = e.target.checked;
  saveSettings();
  updateUI();
});

alarmSoundEnabled2.addEventListener('change', (e) => {
  state.settings.alarm.soundEnabled2 = e.target.checked;
  saveSettings();
  updateUI();
});

alarmSoundEnabled3.addEventListener('change', (e) => {
  state.settings.alarm.soundEnabled3 = e.target.checked;
  saveSettings();
  updateUI();
});

alarmWarnLevel1.addEventListener('input', (e) => {
  state.settings.alarm.warnLevel1 = parseInt(e.target.value, 10) || 60;
  saveSettings();
  updateUI();
});

alarmWarnLevel2.addEventListener('input', (e) => {
  state.settings.alarm.warnLevel2 = parseInt(e.target.value, 10) || 30;
  saveSettings();
  updateUI();
});

alarmWarnLevel3.addEventListener('input', (e) => {
  state.settings.alarm.warnLevel3 = parseInt(e.target.value, 10) || 10;
  saveSettings();
  updateUI();
});

// 📺 오버레이 창 배경 설정 탭 세부 인풋들
overlayBgEffectSelect.addEventListener('change', (e) => {
  if (!state.settings.overlay) {
    state.settings.overlay = {};
  }
  state.settings.overlay.backgroundEffect = e.target.value;
  updateOverlayStyleSettingsUI();
  saveSettings();
  updateUI();
});

overlayBgColorInput.addEventListener('input', (e) => {
  if (!state.settings.overlay) {
    state.settings.overlay = {};
  }
  state.settings.overlay.backgroundColor = e.target.value;
  saveSettings();
  updateUI();
});

overlayBgOpacityInput.addEventListener('input', (e) => {
  if (!state.settings.overlay) {
    state.settings.overlay = {};
  }
  const val = parseInt(e.target.value, 10);
  state.settings.overlay.backgroundOpacity = val;
  overlayBgOpacityVal.innerText = val;
  saveSettings();
  updateUI();
});

// ═══════════════════════════════════════════
// 7. 단축키 (Cmd + , / Ctrl + ,) 및 시스템 초기화
// ═══════════════════════════════════════════
window.addEventListener('keydown', (e) => {
  // Command (Mac) 또는 Control (Windows) + Comma 감지
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (isCmdOrCtrl && e.key === ',') {
    e.preventDefault();
    if (settingsDialog.open) {
      settingsDialog.close();
    } else {
      settingsDialog.showModal();
    }
  }
});

// 초기 실행
loadSettings();
updateUI();
loadMonitors(); // 디스플레이 스캔 기동

// ═══════════════════════════════════════════
// 8. 다중 모니터 스캔 및 실시간 즉시 전환 제어
// ═══════════════════════════════════════════
let availableMonitors = [];

async function loadMonitors() {
  if (!isTauri) {
    if (monitorSelect) {
      monitorSelect.innerHTML = `<option value="0">🖥 브라우저 가상 스크린 1</option>`;
    }
    return;
  }
  try {
    // 3초 타임아웃 get_monitors 감지 폴백 구축
    const getMonitorsPromise = invoke('get_monitors');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tauri get_monitors Timeout')), 3000)
    );
    
    const monitors = await Promise.race([getMonitorsPromise, timeoutPromise]);
    availableMonitors = monitors;
    if (!monitorSelect) return;
    monitorSelect.innerHTML = '';
    
    if (!monitors || monitors.length === 0) {
      monitorSelect.innerHTML = `<option value="0">📺 기본 모니터 (현재 화면)</option>`;
      return;
    }
    
    monitors.forEach((m, idx) => {
      const name = m.name || `모니터 ${idx + 1}`;
      const sizeStr = `${m.size[0]}x${m.size[1]}`;
      const isPrimary = (m.position[0] === 0 && m.position[1] === 0) ? ' (주)' : '';
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = `📺 ${name} [${sizeStr}]${isPrimary}`;
      monitorSelect.appendChild(option);
    });
    
    // 이전에 선택했던 모니터가 있다면 복원 로드
    const savedMonitorIdx = localStorage.getItem('timer_monitor_index') || '0';
    const idx = parseInt(savedMonitorIdx, 10);
    if (monitors.length === 0 || idx < monitors.length) {
      if (monitorSelect) {
        monitorSelect.value = savedMonitorIdx;
      }
      // 시작 시 오버레이 창 위치 즉시 선제 정렬
      invoke('move_overlay_to_monitor', { monitorIndex: idx }).catch(err => {
        console.error("오버레이 초기 모니터 배치 실패:", err);
      });
    }
  } catch (e) {
    console.error("디스플레이 스캔 실패 또는 타임아웃:", e);
    if (monitorSelect) {
      monitorSelect.innerHTML = `<option value="0">📺 기본 모니터 (현재 화면)</option>`;
    }
    // 타임아웃/에러 시에도 0번 기본 모니터로 배치 시도
    invoke('move_overlay_to_monitor', { monitorIndex: 0 }).catch(err => {
      console.error("오버레이 타임아웃 폴백 모니터 배치 실패:", err);
    });
  }
}

// 모니터 즉시 선택 제어 이벤트 바인딩
if (monitorSelect) {
  monitorSelect.addEventListener('change', async (e) => {
    const idx = parseInt(e.target.value, 10);
    if (isTauri && !isNaN(idx)) {
      try {
        await invoke('move_overlay_to_monitor', { monitorIndex: idx });
        localStorage.setItem('timer_monitor_index', idx.toString());
      } catch (err) {
        console.error("화면 전환 중 에러:", err);
      }
    }
  });
}

// 뷰포트 마우스 투과 기본 처리
if (isTauri) {
  // 오버레이 창은 마우스 클릭이 항상 무시(투과)되도록 초기 설정
  invoke('set_overlay_clickthrough', { ignore: true }).catch(err => {
    console.error("오버레이 클릭 투과 초기화 실패:", err);
  });
}
