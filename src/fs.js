/**
 * File System Access API Wrapper
 */

export async function verifyPermission(fileHandle, readWrite = true) {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

export async function openWorkspace() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  } catch (err) {
    console.warn('Workspace selection cancelled', err);
    return null;
  }
}

export async function readDirectory(dirHandle, path = '') {
  const entries = [];
  try {
    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        // Skip hidden files or specific extensions if desired, but we'll include most text-like things.
        if (entry.name.startsWith('.')) continue; 
        entries.push({ kind: 'file', name: entry.name, path: entryPath, handle: entry });
      } else if (entry.kind === 'directory') {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const children = await readDirectory(entry, entryPath);
        entries.push({ kind: 'directory', name: entry.name, path: entryPath, handle: entry, children });
      }
    }
  } catch (e) {
    console.error('Error reading directory', e);
  }
  // Sort: directories first, then files alphabetically
  entries.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
  return entries;
}

export async function readFileText(fileHandle) {
  const file = await fileHandle.getFile();
  return await file.text();
}

export async function saveFileText(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function createFile(dirHandle, name) {
  try {
    return await dirHandle.getFileHandle(name, { create: true });
  } catch (e) {
    console.error('Failed to create file', e);
    return null;
  }
}

export async function createDirectory(dirHandle, name) {
  try {
    return await dirHandle.getDirectoryHandle(name, { create: true });
  } catch (e) {
    console.error('Failed to create directory', e);
    return null;
  }
}
