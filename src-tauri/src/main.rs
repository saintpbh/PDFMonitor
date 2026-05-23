#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, Emitter};

/// 오버레이 창의 마우스 이벤트 투과(Clickthrough)를 설정하는 Tauri Command
/// ignore = true 이면 마우스 클릭을 투과하여 뒤의 화면을 조작할 수 있음.
/// ignore = false 이면 오버레이 창이 마우스 클릭을 직접 수신함.
#[tauri::command]
fn set_overlay_clickthrough(app: AppHandle, ignore: bool) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_ignore_cursor_events(ignore);
        log::info!("오버레이 마우스 이벤트 투과 설정: {}", ignore);
    }
}

/// 오버레이 창 표시 제어
#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("overlay") {
        if visible {
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
        }
        log::info!("오버레이 창 가시성 설정: {}", visible);
    }
}

/// 메인 창의 타이머 상태를 오버레이 창으로 100% 안전하게 중계(Relay)하는 Tauri Command
#[tauri::command]
fn share_timer_state(app: AppHandle, payload: serde_json::Value) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("timer-update", payload);
    }
}

#[derive(serde::Serialize)]
struct MonitorInfo {
    name: Option<String>,
    position: (i32, i32),
    size: (u32, u32),
    scale_factor: f64,
}

/// 연결된 모니터 목록을 조회하는 Tauri Command
#[tauri::command]
fn get_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    if let Some(window) = app.get_webview_window("main") {
        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let info = monitors
            .into_iter()
            .map(|m| MonitorInfo {
                name: m.name().map(|s| s.to_string()),
                position: (m.position().x, m.position().y),
                size: (m.size().width, m.size().height),
                scale_factor: m.scale_factor(),
            })
            .collect();
        Ok(info)
    } else {
        Err("메인 윈도우를 찾을 수 없습니다.".into())
    }
}

/// 오버레이 창을 선택된 모니터로 이동시키는 Tauri Command
#[tauri::command]
fn move_overlay_to_monitor(app: AppHandle, monitor_index: usize) -> Result<(), String> {
    if let Some(overlay_window) = app.get_webview_window("overlay") {
        let monitors = overlay_window.available_monitors().map_err(|e| e.to_string())?;
        
        // 대상 모니터 선택 (지정된 인덱스가 없으면 첫 번째 모니터로 폴백)
        let target_monitor = if let Some(m) = monitors.get(monitor_index) {
            m
        } else if let Some(first_m) = monitors.first() {
            log::warn!("선택된 인덱스 {}의 모니터를 찾을 수 없어 첫 번째 모니터로 폴백합니다.", monitor_index);
            first_m
        } else {
            return Err("사용 가능한 모니터가 전혀 존재하지 않습니다.".into());
        };
        
        let pos = target_monitor.position();
        let size = target_monitor.size();
        
        // 무테두리 풀스크린 크기로 좌표 및 해상도 세팅
        let _ = overlay_window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        let _ = overlay_window.set_size(tauri::PhysicalSize::new(size.width, size.height));
        
        log::info!("오버레이 창을 모니터 (좌표: {:?}, 크기: {:?})로 배치 완료", pos, size);
        Ok(())
    } else {
        Err("오버레이 윈도우를 찾을 수 없습니다.".into())
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            set_overlay_clickthrough,
            set_overlay_visible,
            share_timer_state,
            get_monitors,
            move_overlay_to_monitor
        ])
        .setup(|app| {
            // 메인 윈도우 포커스
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 앱 구동 중 에러 발생");
}
