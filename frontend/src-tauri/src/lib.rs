use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Shared handle to the sidecar child process so we can kill it on exit.
struct BackendProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Tauri command: return the backend API base URL for production builds.
#[tauri::command]
fn get_api_base() -> String {
    "http://127.0.0.1:8000".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            // ── Spawn the Python backend as a Tauri sidecar ──
            let shell = app.shell();

            match shell.sidecar("synthmind-backend") {
                Ok(command) => {
                    match command.spawn() {
                        Ok((_rx, child)) => {
                            let state = app.state::<BackendProcess>();
                            *state.0.lock().unwrap() = Some(child);
                            println!("✅ Backend sidecar started");
                        }
                        Err(e) => {
                            eprintln!("⚠️  Could not spawn backend sidecar: {e}");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("⚠️  Sidecar binary not found: {e}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_base])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run the app and handle events (e.g. clean up sidecar on exit)
    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<BackendProcess>();
            let mut guard = state.0.lock().unwrap();
            let child = guard.take();
            drop(guard);
            drop(state);
            if let Some(child) = child {
                let _ = child.kill();
                println!("🟡 Backend sidecar stopped");
            }
        }
    });
}
