import { invoke } from '@tauri-apps/api/core';

export interface FileNode {
  name: string;
  path: string;          // 절대 경로
  relativePath: string;  // 루트 기준 상대 경로 (구분자는 반드시 '/'로 정규화)
  isDirectory: boolean;
  size: number;
  mtimeMs: number;       // Unix epoch milliseconds (f64 / u64)
  isHidden: boolean;
}

export interface DiffRow {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  leftLineNumber?: number;
  rightLineNumber?: number;
  leftContent: string;
  rightContent: string;
}

export interface DiffResult {
  rows: DiffRow[];
  hasDifferences: boolean;
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

export const api = {
  selectDirectory: async (defaultPath?: string): Promise<string | null> => {
    return await invoke<string | null>('select_directory', { defaultPath });
  },
  selectFile: async (defaultPath?: string): Promise<string | null> => {
    return await invoke<string | null>('select_file', { defaultPath });
  },
  readFile: async (filePath: string): Promise<string> => {
    return await invoke<string>('read_file', { filePath });
  },
  writeFile: async (filePath: string, content: string): Promise<boolean> => {
    return await invoke<boolean>('write_file', { filePath, content });
  },
  copyFile: async (srcPath: string, destPath: string): Promise<boolean> => {
    return await invoke<boolean>('copy_file', { srcPath, destPath });
  },
  deleteItem: async (itemPath: string): Promise<boolean> => {
    return await invoke<boolean>('delete_item', { itemPath });
  },
  scanDirectory: async (dirPath: string): Promise<FileNode[]> => {
    return await invoke<FileNode[]>('scan_directory', { dirPath });
  },
  compareFiles: async (leftPath: string, rightPath: string): Promise<DiffResult> => {
    return await invoke<DiffResult>('compare_files', { leftPath, rightPath });
  },
};

// Also expose as window.api for full compatibility
(window as any).api = api;

declare global {
  interface Window {
    api: typeof api;
  }
}
