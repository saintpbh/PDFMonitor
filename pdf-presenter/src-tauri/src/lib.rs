use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(serde::Serialize)]
struct MonitorInfo {
  name: String,
  width: u32,
  height: u32,
  is_primary: bool,
}

// 1. OS가 감지한 사용 가능한 모니터 목록을 조회하여 프론트엔드로 반환하는 Rust 네이티브 커맨드
#[tauri::command]
async fn get_available_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
  let monitors = app.available_monitors().map_err(|e| e.to_string())?;
  let primary = app.primary_monitor().map_err(|e| e.to_string())?;
  
  let mut list = Vec::new();
  for monitor in monitors {
    let is_primary = if let Some(ref p) = primary {
      monitor.name() == p.name()
    } else {
      false
    };
    
    let size = monitor.size();
    list.push(MonitorInfo {
      name: monitor.name().map(|n| n.to_string()).unwrap_or_else(|| "알 수 없는 디스플레이".to_string()),
      width: size.width,
      height: size.height,
      is_primary,
    });
  }
  Ok(list)
}

// 2. 사용자가 선택한 특정 모니터 또는 자동으로 감지한 세컨 모니터로 송출창을 띄우는 Rust 네이티브 커맨드
#[tauri::command]
async fn open_presenter_window(app: AppHandle, target_monitor_name: Option<String>) -> Result<(), String> {
  // 이미 송출창이 스폰되어 있다면 즉시 전면 포커스 후 종료
  if let Some(presenter_win) = app.get_webview_window("antigravity-pdf-presenter") {
    let _ = presenter_win.set_focus();
    return Ok(());
  }

  // OS 수준 멀티 모니터 정보 획득
  let monitors = app.available_monitors().map_err(|e| e.to_string())?;
  let primary_monitor = app.primary_monitor().map_err(|e| e.to_string())?;
  
  // 사용자가 타겟으로 선정한 모니터 탐색
  let mut target_monitor = None;
  
  if let Some(ref name) = target_monitor_name {
    if name != "auto" {
      for monitor in &monitors {
        if let Some(m_name) = monitor.name() {
          if m_name == name {
            target_monitor = Some(monitor.clone());
            break;
          }
        }
      }
    }
  }

  // 모니터를 찾지 못했거나 자동(auto) 감지 모드일 경우 보조 모니터를 자동으로 타겟팅
  if target_monitor.is_none() {
    if let Some(ref primary) = primary_monitor {
      for monitor in &monitors {
        if monitor.name() != primary.name() {
          target_monitor = Some(monitor.clone());
          break;
        }
      }
    }
  }

  // 송출창 네이티브 빌더 세팅
  let mut builder = WebviewWindowBuilder::new(
    &app,
    "antigravity-pdf-presenter",
    WebviewUrl::App("presenter.html".into())
  )
  .title("Antigravity PDF Studio - Live Output")
  .decorations(false) // 타이틀바 및 프레임 0% 완전 제거 (보더리스)
  .shadow(false);

  if let Some(monitor) = target_monitor {
    // 지정된 모니터의 절대 좌표로 찰칵 결합 및 네이티브 전체화면 실행
    let pos = monitor.position();
    let size = monitor.size();
    
    builder = builder
      .position(pos.x as f64, pos.y as f64)
      .inner_size(size.width as f64, size.height as f64)
      .fullscreen(true);
  } else {
    // 단일 모니터일 경우 기본 해상도 창모드 팝업 실행
    builder = builder
      .inner_size(1280.0, 720.0)
      .resizable(true);
  }

  builder.build().map_err(|e| e.to_string())?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![open_presenter_window, get_available_monitors]) // 두 개 커맨드 모두 등록!
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
