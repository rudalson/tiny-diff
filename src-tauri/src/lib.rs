use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub size: u64,
    pub mtime_ms: f64,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub r#type: String, // "unchanged" | "added" | "removed" | "modified"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_line_number: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_line_number: Option<usize>,
    pub left_content: String,
    pub right_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
    pub unchanged: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub rows: Vec<DiffRow>,
    pub has_differences: bool,
    pub stats: DiffStats,
}

#[tauri::command]
fn select_directory(app: tauri::AppHandle, default_path: Option<String>) -> Option<String> {
    let mut builder = app.dialog().file();
    if let Some(ref p) = default_path {
        builder = builder.set_directory(p);
    }
    builder
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn select_file(app: tauri::AppHandle, default_path: Option<String>) -> Option<String> {
    let mut builder = app.dialog().file();
    if let Some(ref p) = default_path {
        let path = Path::new(p);
        if path.is_file() {
            if let Some(parent) = path.parent() {
                builder = builder.set_directory(parent.to_string_lossy().to_string());
            }
        } else {
            builder = builder.set_directory(p);
        }
    }
    builder
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

#[tauri::command]
fn write_file(file_path: String, content: String) -> Result<bool, String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn copy_file(src_path: String, dest_path: String) -> Result<bool, String> {
    let src = Path::new(&src_path);
    let dest = Path::new(&dest_path);

    if !src.exists() {
        return Err(format!("Source file does not exist: {}", src_path));
    }

    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::copy(src, dest).map_err(|e| e.to_string())?;

    if let Ok(meta) = fs::metadata(src) {
        let mtime = filetime::FileTime::from_last_modification_time(&meta);
        let atime = filetime::FileTime::from_last_access_time(&meta);
        let _ = filetime::set_file_times(dest, atime, mtime);
    }

    Ok(true)
}

#[tauri::command]
fn delete_item(item_path: String) -> Result<bool, String> {
    let path = Path::new(&item_path);
    if !path.exists() {
        return Ok(true);
    }

    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[cfg(windows)]
fn is_windows_hidden_or_system(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    let attrs = metadata.file_attributes();
    (attrs & 0x00000002 != 0) || (attrs & 0x00000004 != 0)
}

#[cfg(not(windows))]
fn is_windows_hidden_or_system(_metadata: &fs::Metadata) -> bool {
    false
}

const KNOWN_SYSTEM_FILES: &[&str] = &[
    "desktop.ini",
    "thumbs.db",
    "iconcache.db",
    "$recycle.bin",
    "system volume information",
    "ntuser.dat",
    "ntuser.dat.log1",
    "ntuser.dat.log2",
    "ntuser.ini",
    "autorun.inf",
];

#[tauri::command]
fn scan_directory(dir_path: String) -> Result<Vec<FileNode>, String> {
    let root = Path::new(&dir_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Directory does not exist or is not a directory: {}", dir_path));
    }

    let mut nodes = Vec::new();
    let mut hidden_dirs = HashSet::<String>::new();

    for entry in walkdir::WalkDir::new(root).min_depth(1) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // Skip permission denied or unreadable entries
        };

        let entry_path = entry.path();
        let rel_path = match entry_path.strip_prefix(root) {
            Ok(p) => p.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();
        let is_directory = entry.file_type().is_dir();

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size = if is_directory { 0 } else { metadata.len() };
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);

        // Check if any ancestor folder is marked hidden
        let mut parent_is_hidden = false;
        let parts: Vec<&str> = rel_path.split('/').collect();
        if parts.len() > 1 {
            let mut prefix = String::new();
            for i in 0..(parts.len() - 1) {
                if !prefix.is_empty() {
                    prefix.push('/');
                }
                prefix.push_str(parts[i]);
                if hidden_dirs.contains(&prefix) {
                    parent_is_hidden = true;
                    break;
                }
            }
        }

        let is_hidden = parent_is_hidden
            || name.starts_with('.')
            || KNOWN_SYSTEM_FILES.contains(&name_lower.as_str())
            || is_windows_hidden_or_system(&metadata);

        if is_directory && is_hidden {
            hidden_dirs.insert(rel_path.clone());
        }

        nodes.push(FileNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            relative_path: rel_path,
            is_directory,
            size,
            mtime_ms,
            is_hidden,
        });
    }

    Ok(nodes)
}

#[derive(Debug, Clone)]
enum DiffOpItem {
    Keep(String),
    Delete(String),
    Insert(String),
}

#[tauri::command]
fn compare_files(left_path: String, right_path: String) -> Result<DiffResult, String> {
    let left_p = Path::new(&left_path);
    let right_p = Path::new(&right_path);

    let left_exists = left_p.is_file();
    let right_exists = right_p.is_file();

    if !left_exists && !right_exists {
        return Ok(DiffResult {
            rows: Vec::new(),
            has_differences: false,
            stats: DiffStats {
                added: 0,
                removed: 0,
                modified: 0,
                unchanged: 0,
            },
        });
    }

    if !left_exists {
        let right_bytes = fs::read(right_p).map_err(|e| e.to_string())?;
        let right_text = String::from_utf8_lossy(&right_bytes);
        let right_lines: Vec<&str> = right_text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
        let rows: Vec<DiffRow> = right_lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| DiffRow {
                r#type: "added".to_string(),
                left_line_number: None,
                right_line_number: Some(idx + 1),
                left_content: String::new(),
                right_content: line.to_string(),
            })
            .collect();
        let count = rows.len();
        return Ok(DiffResult {
            rows,
            has_differences: count > 0,
            stats: DiffStats {
                added: count,
                removed: 0,
                modified: 0,
                unchanged: 0,
            },
        });
    }

    if !right_exists {
        let left_bytes = fs::read(left_p).map_err(|e| e.to_string())?;
        let left_text = String::from_utf8_lossy(&left_bytes);
        let left_lines: Vec<&str> = left_text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
        let rows: Vec<DiffRow> = left_lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| DiffRow {
                r#type: "removed".to_string(),
                left_line_number: Some(idx + 1),
                right_line_number: None,
                left_content: line.to_string(),
                right_content: String::new(),
            })
            .collect();
        let count = rows.len();
        return Ok(DiffResult {
            rows,
            has_differences: count > 0,
            stats: DiffStats {
                added: 0,
                removed: count,
                modified: 0,
                unchanged: 0,
            },
        });
    }

    let left_bytes = fs::read(left_p).map_err(|e| e.to_string())?;
    let right_bytes = fs::read(right_p).map_err(|e| e.to_string())?;

    let left_text = String::from_utf8_lossy(&left_bytes);
    let right_text = String::from_utf8_lossy(&right_bytes);

    let left_lines: Vec<&str> = left_text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let right_lines: Vec<&str> = right_text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();

    let diff = similar::TextDiff::configure()
        .algorithm(similar::Algorithm::Myers)
        .diff_slices(&left_lines, &right_lines);

    let mut raw_ops: Vec<DiffOpItem> = Vec::new();
    for op in diff.ops() {
        match op {
            similar::DiffOp::Equal { old_index, len, .. } => {
                for i in 0..*len {
                    raw_ops.push(DiffOpItem::Keep(left_lines[old_index + i].to_string()));
                }
            }
            similar::DiffOp::Delete { old_index, old_len, .. } => {
                for i in 0..*old_len {
                    raw_ops.push(DiffOpItem::Delete(left_lines[old_index + i].to_string()));
                }
            }
            similar::DiffOp::Insert { new_index, new_len, .. } => {
                for i in 0..*new_len {
                    raw_ops.push(DiffOpItem::Insert(right_lines[new_index + i].to_string()));
                }
            }
            similar::DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                for i in 0..*old_len {
                    raw_ops.push(DiffOpItem::Delete(left_lines[old_index + i].to_string()));
                }
                for i in 0..*new_len {
                    raw_ops.push(DiffOpItem::Insert(right_lines[new_index + i].to_string()));
                }
            }
        }
    }

    // Convert raw_ops to side-by-side DiffRows pairing consecutive deletes & inserts into modified
    let mut rows: Vec<DiffRow> = Vec::new();
    let mut left_line_num = 1;
    let mut right_line_num = 1;

    let mut i = 0;
    while i < raw_ops.len() {
        match &raw_ops[i] {
            DiffOpItem::Keep(val) => {
                rows.push(DiffRow {
                    r#type: "unchanged".to_string(),
                    left_line_number: Some(left_line_num),
                    right_line_number: Some(right_line_num),
                    left_content: val.clone(),
                    right_content: val.clone(),
                });
                left_line_num += 1;
                right_line_num += 1;
                i += 1;
            }
            _ => {
                let mut deletes = Vec::new();
                let mut inserts = Vec::new();

                let mut j = i;
                while j < raw_ops.len() {
                    match &raw_ops[j] {
                        DiffOpItem::Delete(d) => deletes.push(d.clone()),
                        DiffOpItem::Insert(ins) => inserts.push(ins.clone()),
                        DiffOpItem::Keep(_) => break,
                    }
                    j += 1;
                }

                let max_len = deletes.len().max(inserts.len());
                let min_len = deletes.len().min(inserts.len());

                for k in 0..max_len {
                    if k < min_len {
                        rows.push(DiffRow {
                            r#type: "modified".to_string(),
                            left_line_number: Some(left_line_num),
                            right_line_number: Some(right_line_num),
                            left_content: deletes[k].clone(),
                            right_content: inserts[k].clone(),
                        });
                        left_line_num += 1;
                        right_line_num += 1;
                    } else if k < deletes.len() {
                        rows.push(DiffRow {
                            r#type: "removed".to_string(),
                            left_line_number: Some(left_line_num),
                            right_line_number: None,
                            left_content: deletes[k].clone(),
                            right_content: String::new(),
                        });
                        left_line_num += 1;
                    } else {
                        rows.push(DiffRow {
                            r#type: "added".to_string(),
                            left_line_number: None,
                            right_line_number: Some(right_line_num),
                            left_content: String::new(),
                            right_content: inserts[k].clone(),
                        });
                        right_line_num += 1;
                    }
                }

                i = j;
            }
        }
    }

    let mut added = 0;
    let mut removed = 0;
    let mut modified = 0;
    let mut unchanged = 0;

    for row in &rows {
        match row.r#type.as_str() {
            "added" => added += 1,
            "removed" => removed += 1,
            "modified" => modified += 1,
            "unchanged" => unchanged += 1,
            _ => {}
        }
    }

    let has_differences = added > 0 || removed > 0 || modified > 0;

    Ok(DiffResult {
        rows,
        has_differences,
        stats: DiffStats {
            added,
            removed,
            modified,
            unchanged,
        },
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            select_directory,
            select_file,
            read_file,
            write_file,
            copy_file,
            delete_item,
            scan_directory,
            compare_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
