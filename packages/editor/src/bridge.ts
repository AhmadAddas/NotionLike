export type NativeToEditorMessage = {
  type: "initialize";
  apiBaseUrl: string;
  token: string;
  pageId: string;
};

export type EditorToNativeMessage =
  | { type: "ready" }
  | { type: "sync"; state: "loading" | "offline" | "saving" | "saved" | "error" }
  | { type: "attachment"; accept: string };

export function parseEditorMessage(value: string): EditorToNativeMessage | null {
  try {
    const message = JSON.parse(value) as EditorToNativeMessage;
    return ["ready", "sync", "attachment"].includes(message.type) ? message : null;
  } catch { return null; }
}

