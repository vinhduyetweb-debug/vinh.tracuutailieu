# PCCC Legal Research OS V4

Mini app PWA tĩnh để tra cứu tài liệu pháp luật/kỹ thuật PCCC đã upload. App không dùng backend, không đăng nhập, không private API, không tracking. Dữ liệu tài liệu lưu trong IndexedDB của trình duyệt; hồ sơ, checklist, ghim và thiết lập lưu bằng localStorage.

## V4 có gì mới

- Đổi từ **keyword search** thành **Research OS**.
- Tra cứu theo tình huống thực tế: thẩm duyệt, nghiệm thu, hồ sơ cơ sở, thoát nạn, bình chữa cháy, báo cháy, xử phạt, trách nhiệm chủ cơ sở.
- Bộ chủ đề PCCC có từ đồng nghĩa để mở rộng tìm kiếm.
- Tìm kiếm không dấu tiếng Việt: `nghiem thu` vẫn tìm được `nghiệm thu`.
- Mỗi kết quả hiển thị dạng phiếu hiểu nhanh: chủ đề, mức liên quan, vị trí, tóm tắt, hành động gợi ý.
- Tạo **hồ sơ tra cứu** cho từng cơ sở/vụ việc.
- Thêm căn cứ vào hồ sơ, thêm việc vào checklist, cập nhật trạng thái kiểm tra.
- Export kết quả TXT, export hồ sơ TXT, export/import JSON toàn bộ dữ liệu.
- Thêm `service-worker.js`, cache shell app và trạng thái online/offline.
- Thêm `CHANGELOG.md`, `package.json`, validator.

## Cách chạy local

Mở trực tiếp `index.html` bằng trình duyệt hoặc chạy bằng server tĩnh:

```bash
npx serve .
```

Lần đầu cần internet để tải `pdf.js` và `mammoth.js` từ CDN khi đọc PDF/DOCX. File TXT không cần thư viện ngoài. Sau lần mở đầu, app shell có thể chạy offline; tài liệu đã nạp vẫn nằm trong trình duyệt.

## Cách test

```bash
npm run check
npm run validate
```

Validator kiểm tra file bắt buộc, manifest, service worker cache version, key localStorage V4, root container và placeholder còn sót.

## Cách dùng nhanh

1. Bấm **Nạp tài liệu** và upload PDF/DOCX/TXT.
2. Tạo một **Hồ sơ tra cứu** nếu đang kiểm tra một cơ sở/vụ việc cụ thể.
3. Chọn **Tra theo tình huống thực tế** hoặc nhập câu hỏi/từ khóa.
4. Đọc phiếu kết quả: chủ đề, mức liên quan, vị trí, tóm tắt, hành động.
5. Bấm **Mở gốc** để đọc ngữ cảnh.
6. Bấm **+ Hồ sơ** để gom căn cứ.
7. Bấm **+ Checklist** để tạo việc cần kiểm.
8. Xuất TXT/JSON để lưu lại.

## Backup / Restore

- **Export JSON toàn bộ**: xuất tài liệu, hồ sơ, checklist, ghim, lịch sử.
- **Import JSON**: gộp dữ liệu từ file backup vào trình duyệt hiện tại.
- **Reset dữ liệu V4**: xóa tài liệu IndexedDB và dữ liệu localStorage của app sau 2 lần xác nhận.

## Deploy Vercel

```bash
npm run check
git status
git add .
git commit -m "Release V4 PCCC Legal Research OS"
git push origin main
npx vercel --prod
```

## Deploy GitHub Pages

Upload toàn bộ source lên repository tĩnh, bật GitHub Pages ở branch `main`, folder root.

## Giới hạn

- Không OCR ảnh scan. PDF scan không có text sẽ không đọc được.
- Không tự xác định hiệu lực văn bản theo thời gian thực.
- Không thay thế tư vấn pháp lý/kỹ thuật chuyên môn.
- Lần đầu đọc PDF/DOCX cần internet để tải thư viện CDN.

## Nguyên tắc sử dụng

**Tra cứu nhanh. Đối chiếu chậm. Kết luận phải có căn cứ.**
