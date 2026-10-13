// Built-in tool names verified against the pinned Pi SDK 1.0.3.
export const nativePiTools = ['read', 'write', 'edit', 'ls', 'find', 'grep', 'bash', 'powershell'] as const;
export const isNativePiTool = (name: string) => (nativePiTools as readonly string[]).includes(name);
