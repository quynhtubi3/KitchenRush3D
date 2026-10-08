# Tiến độ Kitchen Rush 3D

Cập nhật: 2026-10-08, Asia/Saigon. Phiên bản **0.2.0**.

## Giai đoạn 3 đang triển khai

- Mốc content engine: simulation xử lý các bước chủ động/thụ động từ graph, lắp ráp và phục vụ theo recipe; bố cục, mục tiêu, tên món và thiết bị theo màn. 32/32 test hồi quy simulation/session/network của 0.2 đạt sau chuyển đổi.
- Mốc Nắng Mai: đã có 10 ca với dữ liệu riêng, recipe thường/đặc biệt, VIP/impatient/complex/combo mở dần, selector và tiến trình cục bộ. Driver gameplay kiểm tra cả 10 màn × 4 cỡ đội đã đạt.
- Mở rộng: dữ liệu 5 nhà hàng/50 màn và 10 recipe đã tích hợp. Lần kiểm tra đầu: 202/202 content/gameplay tests đạt, trong đó 200 trận mô phỏng dùng intent và tick, không sửa điểm/inventory/timer. Chưa coi đây là kiểm chứng 200 trận qua trình duyệt.
- Đang hoàn thiện validation, nội dung công đoạn bổ sung, UI, tests khách đặc biệt và E2E. Chưa tuyên bố Giai đoạn 3 hoàn thành.
- Cập nhật kiểm thử: build 0.3 đạt; 240/240 unit/integration đạt. E2E chuyển 50 màn phát hiện nhãn HUD mới có thể xuất hiện trước snapshot bố cục, gây dừng render. Đã thêm kiểm tra nhãn còn gắn DOM và trạm tồn tại, đang chạy lại trên bản production cố định. Lượt dev E2E trước bị HMR gián đoạn nên không tính là nghiệm thu.
- Mốc Nắng Mai đã qua E2E production sau sửa lỗi: tải 10/10 màn và nấu/phục vụ một món thật. Báo cáo [CAMPAIGN_BALANCE.md](CAMPAIGN_BALANCE.md) ghi kết quả 200 trận simulation và thời gian thắng từng cỡ đội; đây không phải số liệu playtest người thật. Bốn nhà hàng còn lại và hồi quy trình duyệt đang chạy.

**Giai đoạn 2 đã hoàn thành trong phạm vi multiplayer trên màn Little Sun 01**, với hai trình duyệt thật phối hợp và toàn bộ regression đạt. Giai đoạn 1 vẫn được bảo toàn. Chưa hoàn thành toàn bộ dự án 50 màn.

## Đã triển khai Giai đoạn 2

- `Game` tiếp tục là mô phỏng có thẩm quyền, dùng chung cho Solo và co-op. `protocol.ts` đọc intent; client không được đặt điểm, inventory hay kết quả.
- `CoopRoom` quản lý transport/lifecycle; `KitchenSession` quản lý lobby, Ready, Host, chọn màn hợp lệ, cấu hình đội, phiếu và giao tiếp.
- Phòng riêng bằng mã/URL, 2–4 người. Tất cả Ready rồi Host bắt đầu. Bộ chọn màn chỉ chứa màn thực Little Sun 01, không tạo màn giả.
- Public matchmaking theo cỡ đội 2/3/4, tự bắt đầu khi đủ đội và Ready. Khóa phòng sau bắt đầu; từ chối người vào muộn.
- Đồng bộ nhiều đầu bếp có màu riêng, vị trí và vật cầm; nguyên liệu/thiết bị/công thức; khách/hàng chờ; đĩa/bồn rửa; thời gian, điểm/combo và kết quả chung.
- Chuyển vật phẩm tuần tự, kiểm tra tay/slot/khoảng cách khi đến nơi, tránh nhân đôi khi tranh chấp.
- Reconnect 20 giây giữ nguyên nhân vật/vật phẩm. Co-op không tạm dừng khi một người mất mạng. Host chuyển sang người còn kết nối và không tự chuyển ngược khi chủ cũ trở lại.
- Rời hẳn/hết thời hạn: chuyển vật cầm về bàn trung gian, xếp FIFO trong kho thu hồi nếu bàn đầy. Không xóa đĩa bẩn, không sinh đĩa mới. Độ khó giữ nguyên theo đội lúc bắt đầu.
- Quick Chat, Emote, Ping trạm bằng lựa chọn có sẵn, dịch VI/EN. Chỉ phát trường được phép; sender/TTL do server gắn. Giới hạn một tín hiệu/giây, tồn tại sáu giây, tối đa tám tín hiệu. Không chat tự do.
- Khi đạt cả điểm và số đơn, cho bỏ/rút phiếu kết thúc sớm. Tất cả thành viên đang kết nối phải đồng ý; không kẹt vì người đã rời. Không tự chốt phiếu khi không còn ai hoạt động.
- Kết quả co-op lưu riêng theo cỡ đội trên thiết bị, không ghi đè Solo. Chưa cấp xu hoặc đăng leaderboard.
- Lobby chưa bắt đầu đóng sau 10 phút; giới hạn 15 intent/giây/client, payload 4096 byte.

## Kiểm chứng thực tế

| Kiểm tra                                         | Kết quả                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| TypeScript và production build                   | Đạt trên bản 0.2                                                  |
| 18 simulation tests cũ                           | Đạt, giữ các assertion gameplay                                   |
| 8 session-rule tests mới                         | Đạt                                                               |
| 6 integration tests qua WebSocket thật           | Đạt; tổng `npm test`: 32/32, 42,5 giây                            |
| Format check                                     | Đạt                                                               |
| npm audit                                        | 0 lỗ hổng được báo cáo                                            |
| Hai E2E Solo cũ và E2E co-op mới                 | **3/3 đạt**, tổng 5 phút; bài co-op hai trình duyệt chạy 3,1 phút |
| Docker/PostgreSQL                                | Chưa xác minh: môi trường không có Docker                         |
| FPS điện thoại, Safari/iOS, tải nhiều phòng, WAN | Chưa đo                                                           |

Integration tests tạo server Colyseus thật ở cổng loopback ngẫu nhiên và các SDK client độc lập. Đã kiểm tra public matching đúng cỡ, khởi động thật 2/3/4 người, giới hạn 4, khóa vào muộn, cùng nhặt/cùng đặt đồ/cùng dùng bếp, Host rớt mạng, reconnect giữ ID vật phẩm khi bếp chạy, rời rõ ràng và chờ hết 20 giây thật để thu hồi đồ. Có kiểm tra chống sửa điểm, pause/kết thúc trực tiếp và chuyển tiếp chat tự do.

E2E co-op dùng hai browser context: mã/lobby/Ready/Host start → chia nướng/cắt → phục vụ ba burger → thu/rửa/tái sử dụng đĩa → Quick Chat/Emote/Ping → reload khi cầm đĩa bẩn → chỉ kết thúc sau hai phiếu → so sánh các giá trị kết quả. Không có API đặt điểm hay inventory giả.

Đã chạy thành công toàn bộ luồng trên. Ảnh từ chính lần kiểm chứng này: `docs/screenshots/multiplayer-lobby.png`, `multiplayer-gameplay.png`, `multiplayer-result.png`. Health endpoint trả HTTP 200 với version 0.2.0/phase 2; client local trả HTTP 200.

Lỗi đã sửa khi kiểm chứng: cleanup test chờ `leave()` trên socket đã đóng; assertion lệ thuộc xuống dòng DOM; tên nút co-op trùng một phần nút Solo; trường dư trong thông điệp xã hội; vòng reconnect SDK cạnh tranh với vòng của ứng dụng.

## Chạy và kiểm tra bằng tay

```sh
npm ci
npm run dev
```

Windows có thể dùng `npm.cmd`. Mở http://localhost:5173 trên hai trình duyệt/profile hoặc thiết bị cùng LAN. Chọn **Chơi cùng bạn** → **Tạo phòng riêng**, chia sẻ mã. Người thứ hai nhập mã → cả hai **Sẵn sàng** → Host **Bắt đầu trận**. Hoặc cùng **Tìm đội công khai** với cùng số người.

A đặt đĩa và nướng thịt; B cắt rau và thêm lên đĩa. A thêm thịt chín/bánh; B lấy burger giao khách. Thu đĩa bẩn, rửa và tái sử dụng. Reload một client đang cầm đồ để kiểm tra reconnect. Khi đủ mục tiêu, phiếu đầu phải hiện `1/2` và trận còn chạy; phiếu thứ hai mới ra kết quả.

```sh
npm run build
npm test
npm run test:e2e
npm run format:check
npm audit
```

Ảnh/trace: `test-results/`; ảnh nghiệm thu: `docs/screenshots/`. Docker Compose vẫn có PostgreSQL, migration/seed, server và Nginx; không coi là đã xác minh trên môi trường này.

## Giới hạn còn lại

- Một nhà hàng, một màn, một recipe. Cấu hình đội chốt ở `teamConfig()`: 2/3/4 người cần 330/440/550 điểm và 3/4/5 đơn; 3/4/4 đĩa; khách đến mỗi 20/16/12 giây.
- Đầu bếp đi xuyên nhau mềm để tránh khóa đường; vẫn chặn tường/thiết bị. Chưa có va chạm vật lý giữa đầu bếp.
- Snapshot là trường JSON Colyseus; chưa tối ưu delta từng entity hoặc đo tải production.
- Restart server mất phòng đang chạy. Matchmaking/presence một process; nhiều instance cần driver/presence chung.
- Kết quả cục bộ không đáng tin cho thi đấu; chưa có tài khoản, transaction xu, thưởng hay leaderboard.
- Màu nhân vật theo slot; tùy chỉnh trang phục/trang trí chưa thuộc bản này.
- Bốn client SDK thật đã được kiểm tra; chưa chơi thử trên bốn cửa sổ render hoặc bốn điện thoại cùng lúc.

## Tiếp theo

### Chuẩn bị truy cập từ mạng khác (2026-10-08)

- Server hỗ trợ `CLIENT_DIST` để phục vụ bản client production và `HOST` để bind loopback cho reverse proxy/tunnel. Bản chia sẻ local đang chạy tại `http://127.0.0.1:2568`.
- Build client với `VITE_SAME_ORIGIN=true` dùng cùng origin cho HTTP/WebSocket, phù hợp HTTPS/WSS qua tunnel. Giữ nguyên mặc định local/Docker.
- Đã tải Cloudflare Tunnel Windows vào `.tools` (không đưa vào source). Lệnh khởi động tunnel bị bộ kiểm duyệt tự động chặn với lý do `blocked by policy`. **Chưa có URL public, chưa xác minh kết nối khác mạng.**
- Cách chạy thủ công: [DEPLOYMENT.md](DEPLOYMENT.md#temporary-public-link-from-windows). Máy, server và tunnel phải duy trì chạy; đây chưa phải hosting 24/7.
- Build đạt; 32/32 simulation/session/network tests đạt. Browser regression trên bản production cùng origin: **3/3 đạt (5,8 phút)**, gồm Solo desktop, mobile/reconnect và hai trình duyệt phối hợp nấu/phục vụ/rửa đĩa/biểu quyết trong cùng trận. Đây là kiểm chứng local cổng 2568, chưa phải qua Internet.
- Playwright nhận `E2E_BASE_URL` để kiểm tra deployment có sẵn, không tự mở dev server khi đặt biến này. Docker chưa được xác minh.

Giai đoạn 3: năm nhà hàng, 50 màn thiết kế riêng, recipe/thiết bị/khách đặc biệt, mở khóa và tutorial theo ngữ cảnh. Giai đoạn 4: PostgreSQL gameplay persistence, Guest/account merge, auth, shop/xu, cosmetics/decor, achievements, friends/privacy và leaderboards. Giai đoạn 5: animation/VFX/audio đầy đủ, tối ưu mobile/network, accessibility và production.
