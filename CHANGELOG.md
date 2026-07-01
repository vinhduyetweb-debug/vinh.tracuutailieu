# CHANGELOG

## V4.0.0 - 2026-07-01

### Thay đổi chính
- Nâng cấp sản phẩm thành **PCCC Legal Research OS V4**.
- Thêm command center: trạng thái app, kết luận nhanh, slogan theo trạng thái.
- Thêm tra cứu theo tình huống thực tế.
- Thêm taxonomy PCCC với nhóm từ đồng nghĩa.
- Thêm tìm kiếm không dấu tiếng Việt.
- Thêm phiếu hiểu nhanh cho kết quả: chủ đề, mức liên quan, vị trí, tóm tắt, hành động gợi ý.
- Thêm hồ sơ tra cứu/case file.
- Thêm checklist builder.
- Thêm export kết quả TXT, export hồ sơ TXT.
- Thêm export/import JSON toàn bộ dữ liệu.
- Thêm trạng thái online/offline.
- Thêm PWA service worker, cache shell app, icon SVG.
- Thêm `package.json` và `tools/validate-app.js`.

### File đã sửa/thêm
- Sửa: `index.html`
- Sửa: `style.css`
- Sửa: `app.js`
- Sửa: `manifest.json`
- Sửa: `README.md`
- Thêm: `taxonomy.js`
- Thêm: `service-worker.js`
- Thêm: `icon.svg`
- Thêm: `CHANGELOG.md`
- Thêm: `package.json`
- Thêm: `tools/validate-app.js`

### Tương thích dữ liệu
- Giữ IndexedDB cũ: `pccc_legal_search_v3`, store `docs`.
- Không phá tài liệu đã upload ở V3.
- Ghim V3 `pccc_pinned_v3` được đọc làm fallback khi chưa có `pccc_pinned_v4`.
- Dữ liệu V4 mới dùng localStorage keys:
  - `pccc_app_settings_v4`
  - `pccc_cases_v4`
  - `pccc_checklist_v4`
  - `pccc_pinned_v4`
  - `pccc_search_history_v4`
  - `pccc_last_query_v4`

### Test đã chạy
- `node --check app.js`
- `node --check taxonomy.js`
- `node --check service-worker.js`
- `node tools/validate-app.js`
- `npm run check`

### Ghi chú chưa test được tự động
- Chưa tự động test đọc PDF/DOCX thật trong browser vì phụ thuộc CDN và file người dùng.
- Cần mở browser để smoke test upload, tìm kiếm, thêm checklist, export/import.
