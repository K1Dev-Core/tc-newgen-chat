import type { ChatFileAttachment } from './chat-files';

type UploadTicket = { uploadUrl: string; token: string };
type UploadResponse = { data?: { id: string; filename: string; mimeType: string; size: number }; error?: { message?: string } };

export async function uploadChatFile(file: File, accessToken: string, onProgress: (percentage: number) => void): Promise<ChatFileAttachment> {
  const ticketResponse = await fetch('/api/files/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ size: file.size }),
    cache: 'no-store',
  });
  const ticketPayload = await ticketResponse.json() as UploadTicket & { error?: { message?: string } };
  if (!ticketResponse.ok || !ticketPayload.uploadUrl || !ticketPayload.token) {
    throw new Error(ticketPayload.error?.message || 'ขอสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ');
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', ticketPayload.uploadUrl);
    request.setRequestHeader('Authorization', `Bearer ${ticketPayload.token}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('error', () => reject(new Error('เชื่อมต่อ File CDN ไม่ได้ ตรวจ URL และ CORS_ORIGINS ของบริการ')));
    request.addEventListener('load', () => {
      let payload: UploadResponse;
      try { payload = JSON.parse(request.responseText) as UploadResponse; }
      catch { return reject(new Error('File CDN ตอบกลับข้อมูลไม่ถูกต้อง')); }
      if (request.status < 200 || request.status >= 300 || !payload.data) {
        return reject(new Error(payload.error?.message || `อัปโหลดไม่สำเร็จ (${request.status})`));
      }
      resolve({
        id: payload.data.id,
        filename: payload.data.filename,
        mimeType: payload.data.mimeType,
        size: payload.data.size,
      });
    });
    const form = new FormData();
    form.append('file', file, file.name);
    request.send(form);
  });
}
