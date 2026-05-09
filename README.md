# PCCC Legal Search PWA

## Tính năng
- Upload PDF, DOCX, TXT.
- Đọc nội dung tài liệu bằng pdf.js và mammoth.js.
- Lưu thư viện tài liệu trong IndexedDB.
- Tìm kiếm từ khóa, highlight kết quả.
- Lọc PDF / Word / TXT.
- Copy đoạn trích, ghim kết quả, export kết quả ra TXT.
- Giao diện dark legal dashboard.
- Mobile/iPad friendly.
- Deploy Vercel dạng HTML tĩnh.

## Lưu ý quan trọng
- Lần đầu cần internet để tải thư viện CDN: pdf.js và mammoth.js.
- Sau khi tải được thư viện, tài liệu đã upload được lưu trong trình duyệt.
- Kết quả chỉ hỗ trợ tra cứu nội bộ, cần đối chiếu văn bản gốc trước khi áp dụng.

## Deploy Vercel
Kéo thả thư mục lên Vercel hoặc chạy:
```bash
vercel --prod
```
