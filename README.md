# PCCC Legal Search PWA V2 Fixed

## Sửa lỗi upload
- Thay label upload bằng button gọi trực tiếp `fileInput.click()`.
- Thêm input file thật nằm ngoài vùng label để tránh lỗi trình duyệt mobile.
- Thêm thông báo trạng thái thư viện PDF/DOCX.
- Bắt lỗi rõ khi pdf.js/mammoth chưa tải.

## Tính năng
- Upload PDF, DOCX, TXT.
- Đọc nội dung tài liệu bằng pdf.js và mammoth.js.
- Lưu thư viện tài liệu trong IndexedDB.
- Tìm kiếm từ khóa, highlight kết quả.
- Lọc PDF / Word / TXT.
- Copy đoạn trích, ghim kết quả, export kết quả ra TXT.

## Lưu ý
Lần đầu cần internet để tải thư viện CDN:
- pdf.js cho PDF
- mammoth.js cho DOCX

TXT hoạt động ngay cả khi thiếu 2 thư viện trên.
