# Tiến độ Kitchen Rush 3D

Cập nhật: 2026-10-09 (Asia/Saigon), phiên bản **0.4.0**. Theo yêu cầu mới, **tạm hoãn toàn bộ Account/Economy/Social**, ưu tiên chơi Guest và phần hoàn thiện trải nghiệm của MASTER PROMPT. Mã Giai đoạn 4.1 được giữ lại, chưa nghiệm thu PostgreSQL.

## Guest Pass 6 — mobile gameplay UX (implementation, final regression running)

- Added snapshot-confirmed station taps, shared pure pathfinding, duplicate-tap suppression, cancellation on changed inventory/disconnect, and pooled authoritative route markers. Tap remains default; Settings offers arrival interaction or a second confirmation tap.
- Added recipe-graph guidance, independent tracked tickets, missing-component text, teammate-aware branch selection, four full mobile label names plus compact status icons, occupancy markers, dismissible rotation hint, portrait tap-space recovery and closer landscape framing. Grouped campaign options by restaurant and added unlocked next-level navigation.
- Solo/co-op rooms now publish a three-second preparation countdown without consuming match time or accepting early gameplay commands. Existing simulation scoring, recipe timing, fifty-level balance, Guest storage and Retina profiles are preserved.
- Build/typecheck and 346 unit/integration tests passed (4 PostgreSQL cases skipped). Deterministic first dish: arrival 17 taps versus confirmation 29; these are automation proxies, not human error rates. Preliminary production E2E: 8 passed; final full 41-test run is in progress. See [GAMEPLAY_UX_PASS_6.md](GAMEPLAY_UX_PASS_6.md) for evidence, reference limitations and remaining device acceptance.

## Guest launch reliability (2026-10-09)

- Runtime follow-up: `/health` on the tunnel target `127.0.0.1:2568` still reported version 0.2.0 despite serving the newly built client. Restarted that exact Node process with the current server bundle and `GUEST_ONLY=true`; health now reports 0.4.0 and account status reports disabled. Rebuilding files alone does not reload a running production Node server.
- Follow-up after the iPhone loading-screen report: the ordinary production build still defaulted to `page-host:2567`, which bypassed the HTTPS tunnel/single-origin deployment. Production now defaults to the page origin; development retains LAN hostname + port 2567, and explicit API overrides remain supported. Nginx forwards API/matchmaking/WebSocket requests to the game server. Rebuilt the client and verified the running port-2568 server serves the new bundle. Four endpoint tests and the startup E2E against that running production server passed; build/typecheck passed. Actual iPhone/public-link confirmation and Docker/Nginx runtime verification remain outstanding. The earlier account-request fix alone did not establish the cause of the user's screenshot.
- Fixed a Guest startup stall when the optional `/api/account/status` request never completes: room entry waits at most two seconds for account state, and Colyseus room creation/reconnect now has a 15-second deadline. Late room connections are released instead of being left orphaned. Invite-link joins use the same bounded startup path.
- Added `tests/e2e/startup.spec.ts`, which keeps account status pending and verifies the Solo HUD still appears. Verified the test, the two-browser Multiplayer coordination/reconnect E2E, typecheck, production build, formatting of changed files, and unit tests (**286 passed, 4 database-dependent skipped**). The full production E2E suite was not rerun for this fix.

## Guest 4.3 - Pass 5B Mobile Portrait Layout (production verification complete, 2026-10-09)

- Corrected portrait canvas sizing so CSS height matches the playable area instead of inheriting the viewport-sized intrinsic canvas height. The 390x844 viewport now allocates a 390x566 canvas; 360x640 allocates 360x362. Portrait camera framing follows the chef and enlarges the kitchen; Overview remains available for the full restaurant.
- Added bounded Overview/Follow camera state across resize and Reduced Motion, contextual mobile station labels with overlap avoidance and a show-all setting, plus a collapsible order rail. Restored the dynamic `orders-content` container ID so order tickets rerender after snapshots. Empty order-rail area passes pointer input through while ticket buttons remain interactive.
- `#game[data-camera-stats]` reports camera profile/zoom/bounds, chef-size estimate, visible floor area and station-label overlap. Resolution diagnostics continue to report CSS and buffer sizes, DPR, render scale, frame time and WebGL renderer.
- Production viewport evidence is in [screenshots/pass5b](screenshots/pass5b); full-screen before/after comparison and limits are in [MOBILE_LAYOUT_PASS_5B.md](MOBILE_LAYOUT_PASS_5B.md). Chromium measurements: 390x844 canvas 390x566, chef estimate 88 CSS px, projected floor 81.1%, sampled HUD/control coverage 5.9%; 360x640 canvas 360x362, chef estimate 67 px, floor 92.8%, sampled coverage 5.7%. These are browser estimates, not physical display measurements.
- Verification on 2026-10-09: typecheck, production build, `npm test` (**286 passed, 4 PostgreSQL-dependent tests skipped**), `npm run format:check`, and `git diff --check` passed. Full Guest production Playwright suite: **35 passed, 1 skipped, 30.4 minutes**. The skipped case is Account E2E because no test PostgreSQL is configured. The suite covered all five campaign selectors/recipes and cooked a real dish in each restaurant; it does not claim browser victories on all 50 levels. It also covered complete Solo win/persistence, two-client co-op coordination/reconnect/score sync, mobile touch/joystick in portrait and landscape, cooking warnings, six viewports, touch picking, desktop WASD, Retina DPR/orientation, Settings and ten restaurant visual captures. Production visual captures are under `docs/screenshots/*-43-pass4-*` and `docs/screenshots/*-43-pass4-world.png`.
- Long-form Solo, multiplayer, presentation and desktop visual fixtures use Overview so projected station controls remain stable during browser automation. Dedicated Follow, floor-picking, WASD and joystick tests exercise movement separately. Contextual labels intentionally hide distant idle stations on mobile.
- Safari on iPhone 13/14 Pro Max has not been tested here. Screenshots and render measurements use Chromium SwiftShader and do not establish physical-device sharpness, safe-area behavior, touch comfort or GPU performance. A four-client visual stress capture and crowded four-player HUD/warning review also remain outstanding. No gameplay simulation or campaign balance was changed; Account/Database/Economy/Social development remains paused.

## Guest 4.3 — Pass 5 / Priority 0 Retina (đã triển khai, xác nhận iPhone còn chờ, 2026-10-09)

- Tìm thấy lỗi thật trong công thức hardware scaling: DPR=3 đặt HSL=2, làm buffer chỉ bằng 0,5 kích thước CSS. Đã thay bằng HSL=1/effectiveScale với Low 1,5×, Balanced 2×, High 3× và giới hạn pixel; không tự giảm dưới CSS 1×. Giữ tương thích khóa lưu `standard` cho Balanced và tiến trình Guest.
- Settings có profile, sharpness riêng và diagnostics bật/tắt trên thiết bị: CSS/buffer/DPR/HSL/effective scale/FPS/frame mean/p95/p99/WebGL/camera. Không gửi telemetry lên server. Resize/orientation/settings/context restore áp dụng lại resolution.
- Đã bỏ hẳn hardware-scaling formula cũ khỏi constructor để cấu hình Retina là đường khởi tạo duy nhất. Pixel buffer được kiểm tra trên canvas thật với DPR=3, hai hướng màn hình và các profile.
- Build/typecheck đạt; unit/integration **286 passed, 4 PostgreSQL skipped**; format và `git diff --check` đạt. Full production E2E: **33 passed, 1 Account test skipped, 0 failed trong 29,6 phút**. Có Solo nấu/phục vụ/rửa/thắng, reconnect, hai browser Multiplayer, joystick, Settings, warnings và 5 nhà hàng desktop/mobile.
- Ma trận chụp/đo 45 tổ hợp 5 nhà hàng × desktop/portrait/landscape × Low/Balanced/High; chi tiết buffer, FPS/frame time, draw calls, triangle/mesh/material, heap nếu Chromium cung cấp, loading/entry time và renderer nằm ở [audit manifest](screenshots/pass5/audit/measurements.json). 45 ảnh cùng cảnh nằm trong `docs/screenshots/pass5/audit/`. Renderer là Chromium SwiftShader, không benchmark GPU vật lý.
- **Chưa xác nhận hết blur trên Safari iPhone 13/14 Pro Max.** Hướng dẫn và tiêu chí xác nhận: [MOBILE_PERFORMANCE_PASS_5.md](MOBILE_PERFORMANCE_PASS_5.md). Pass 5 còn thiếu LOD/instancing, giảm bundle/lazy-load, adaptive scaling đã đo trên máy thật, stress 4 người và kiểm tra tăng tài nguyên qua nhiều trận; không hy sinh độ nét để công bố FPS.

## Guest 4.3 — Pass 4 (đã xác minh regression; còn hạn chế mỹ thuật/UX, 2026-10-09)

- Tăng chef và vật phẩm cầm trên touch lên 1,22×; giữ camera/lưới/collision. Chữ chính đơn hàng/tay cầm 12 px, số HUD 21 px, nhãn trạm gần/ưu tiên 12 px và trạng thái 11 px. Nhãn xa giữ nhỏ để hạn chế che bếp.
- Thêm chuyển tiếp tư thế tay theo inventory/action/progress server, tăng nhịp chân khi đi và phản ứng khách khi ăn/chờ lâu. Pool ba effect mesh mỗi trạm; giới hạn standard 24, low 6, Reduced Motion 0. Có màu/chuyển động hơi nước, bọt rửa, prep/mix và completion/service; không thêm postprocessing hoặc sửa simulation.
- Audio thêm cue bắt đầu nấu/rửa/trộn, timbre cắt/nấu và cao độ phục vụ/thắng/thua; throttle cue lặp. Snapshot đầu và reconnect gap không phát lại transient presentation; không tạo trạng thái gameplay phía client.
- Theo bổ sung về thao tác nấu/công thức: sổ tay có thẻ bước đánh số, nguyên liệu/thiết bị/thời gian và phụ thuộc/nhánh song song từ recipe graph. Quầy trộn timed hiển thị phần trăm trộn thay cho số nhát cắt. Chưa thay recipe, luật phục vụ, vị trí bàn/quầy hay cân bằng.
- Build/typecheck đạt; **283 unit/integration passed, 4 PostgreSQL skipped**. Lượt full production E2E cuối: **32 passed, 1 Account skipped, 0 failed trong 22,6 phút**; bao gồm Solo, co-op/reconnect, mobile controls, Settings, warnings, VFX/Reduced Motion, campaign và 10 ảnh Standard của 5 nhà hàng. Đã sửa timeout visual bằng chuẩn bị món Low rồi xác minh/chụp Standard; test WASD đợi snapshot đầu. Đây là kết quả một lượt toàn bộ, không gộp nhóm chạy lại.
- Video nấu và ba frame được lưu trong `docs/screenshots/pass4-after/`. Chef camera-scale estimate: 360×640 từ 40→49 px; portrait 390×844 từ 43→53 px; landscape 43→52 px; tablet 73→90 px. Các view ban đầu giữ 12/12 trạm. Standard capture ghi 306–393 draw calls và 2–9 FPS trên SwiftShader; chưa chứng minh hiệu năng điện thoại thật. Nhãn ưu tiên gần nhau vẫn có thể chồng, pose thao tác còn dùng chung, NPC chưa có biểu cảm/đường rời bàn hoàn chỉnh.
- Chi tiết, screenshot và giới hạn được ghi tại [VISUAL_PASS_4.md](VISUAL_PASS_4.md). Đây là procedural feedback pass, chưa phải chất lượng mỹ thuật cuối; chưa có kiểm thử điện thoại vật lý.

## Guest 4.3 — Mobile Gameplay Pass 3 (đã triển khai; xác minh 2026-10-09)

- Sau sửa trục điều khiển, production E2E chạy lại toàn bộ `mobile-controls.spec.ts` và `mobile-gameplay.spec.ts`: **11/11 passed trong 5,9 phút**. Bao gồm PC/mobile cùng room, joystick portrait/landscape nhặt/trả đĩa và đổi mode, cảnh báo, năm viewport, tap-to-move và WASD. Typecheck/build và **281 passed, 4 skipped** đã chạy lại sau sửa này; format check đạt. Không chạy lại toàn bộ 32 E2E sau thay đổi cuối; kết quả lượt đầy đủ trước đó ghi riêng bên dưới.
- Đã so sánh ảnh trước/sau cùng Little Sun level 1 và trạng thái trận ban đầu. Thay camera perspective nghiêng bằng orthographic isometric góc cao; tách profile desktop/portrait/landscape/tablet theo viewport, căn frustum vào canvas sau khi chừa HUD, thêm follow mượt có giới hạn, zoom an toàn và nút overview.
- Sửa lỗi canvas dùng chiều cao viewport dù HUD đã chừa vùng chơi; canvas portrait 390×844 giờ là 390×530, landscape 844×390 là 844×296. Năm kích thước kiểm thử đều giữ 12/12 nhãn trạm trong khung và mục tiêu đầu bếp 40–122 px theo camera-scale estimate; đo HUD overlap lần lượt 26,9% desktop, 4,0% portrait, 9,5% landscape, 3,7% small phone và 3,7% tablet. Chỉ số overlap là ước lượng bảo thủ theo bounding-box, không phải phân tích che mesh.
- Joystick/action tiếp tục dùng intent move/interact server-authoritative. Tap sàn gửi move, PC thêm WASD/phím mũi tên theo camera. Nút chạm chọn trạm gần trong đúng bán kính server 1,05 ô, giữ mục tiêu với hysteresis 0,32 ô, hiện hành động dự kiến và highlight; client không tự xác nhận thao tác.
- Căn HUD dọc/ngang, safe-area, giữ khách/đơn/bếp khỏi vùng điều khiển chính. Tọa độ simulation, pathfinding, logic món, trạng thái Multiplayer, tiến trình 50 màn và chất lượng model Pass 2 không đổi. Nhãn trạm cập nhật 15 Hz; camera follow không tạo vector mới mỗi frame.
- Ảnh trước/sau và số đo: [MOBILE_GAMEPLAY_PASS_3.md](MOBILE_GAMEPLAY_PASS_3.md), `docs/screenshots/pass3-before/` và `docs/screenshots/pass3-after/`. E2E screenshot dùng cùng màn, khách burger đầu ca, điểm 0 và đầu bếp tay không.
- Phần chưa nghiệm thu: chưa thử thiết bị Android/iPhone vật lý hoặc đo GPU/FPS trên điện thoại; nhãn trạm hàng sau còn dày trên màn nhỏ; cần xem lại camera với props của bốn nhà hàng khác. Không coi browser emulation hoặc test pass là UX certification.
- Production build/typecheck đạt; unit/integration **281 passed, 4 skipped** (PostgreSQL). Bao gồm simulation thắng đủ 50 màn × 4 cỡ đội. Lượt E2E production đầy đủ: **30 passed, 1 failed, 1 skipped trong 26,7 phút**; lỗi joystick portrait do test chọn trạm xa ngoài camera crop. Đã sửa test dùng nút overview trước khi chọn trạm, giữ kiểm tra nhặt/trả đĩa và đổi chế độ chạm. Account E2E bị skip do không cấu hình database.
- Campaign E2E chọn đủ 50 mục màn và kiểm tra recipe references, chơi nấu/phục vụ thực tế màn 1 của mỗi nhà hàng; không tuyên bố browser đã thắng cả 50 màn. Solo đầy đủ, reconnect, hai browser phối hợp cùng trận/đồng bộ điểm, PC + mobile, Settings, cảnh báo và 10 lượt render 5 nhà hàng × desktop/mobile đã đạt trong lượt đầy đủ.
- Rà soát cuối sửa trục trái/phải bị đảo trong phép đổi hướng camera Babylon; joystick và WASD dùng cùng phép đổi hướng. Nhãn trạm được kẹp toàn bộ bounding-box để tránh tràn màn hình. Screenshot visual regression mang tên `*-43-pass2-*` đã được cập nhật bằng camera Pass 3; ảnh baseline riêng trong `pass3-before/` vẫn giữ nguyên.

## Guest 4.3 — 3D Pass 2 (đã triển khai; production regression đã xác minh)

- Tách một phần tessellation khỏi kích thước mesh, lượng tử hóa roughness/metallic để tái dùng material, giảm chi tiết garnish khó đọc ở match zoom và tạo lá rau low-poly có gờ/vertex color.
- Giữ nguyên ID/vị trí thiết bị và lưới simulation. Thớt, bồn, rack/quầy dùng chân bàn mở; booth có bệ ghế; thùng rác dạng côn; oven có cửa kính và mixer có tô/whisk. Station labels xa chuyển mờ vừa phải; warning/ready/target/ping/hover/focus vẫn nổi và tappable.
- Hạ shadow map xuống 768px, bỏ vật trang trí rất nhỏ khỏi danh sách shadow caster. Thêm draw call/active mesh/geometry/triangle/shadow count và ước lượng byte geometry/texture. Byte là ước lượng CPU-side, không phải GPU profiler. Camera/canvas theo dõi thay đổi kích thước vùng render; không cắt bớt trạm để lấp khung portrait.
- Thêm loader glTF 2.0/GLB lazy, cache theo scene, tạo instance và cleanup. Bài test dựng GLB nhỏ và kiểm tra cache/instance/dispose. Chưa có model GLB production; game vẫn render procedural.
- Desktop captures: trung bình **256,921 → 114,091 triangles (-55.6%)**, **323 → 271 meshes (-16.2%)**, vật liệu **155 → 152 (-1.7%)**. SwiftShader ghi 1–5 FPS; không dùng kết quả này làm benchmark điện thoại. Xem [VISUAL_PASS_2_PLAN.md](VISUAL_PASS_2_PLAN.md) và [ASSET_MANIFEST.md](ASSET_MANIFEST.md) để xem ảnh trước/sau từng nhà hàng, JSON đo renderer và giới hạn.
- Kiểm chứng 2026-10-08: production typecheck/build đạt; unit/integration **271 passed, 4 skipped** (cần PostgreSQL); format check đạt. Production Playwright **24 passed, 1 skipped trong 30,0 phút**. Năm bài campaign tải đủ **50/50 màn** và phục vụ món thật ở từng nhà hàng; các bài Solo, mobile/reconnect, joystick dọc/ngang, cảnh báo mobile, phối hợp hai browser trong một trận và Settings desktop/mobile đều đạt. Mười bài render/chụp ảnh thật cho 5 nhà hàng × desktop/mobile cũng đạt. Bài account duy nhất bị skip do chưa cấu hình `E2E_ACCOUNT_DATABASE_URL`; không phải Guest regression. Screenshots Pass 2 và stats nằm trong `docs/screenshots/`, được lập chỉ mục ở [VISUAL_PASS_2_PLAN.md](VISUAL_PASS_2_PLAN.md).
- Pass 2 chưa đạt mức “complete art overhaul”: chef/khách vẫn là procedural mesh, chưa có GLB production, AO/IBL, atlas texture, animation clip hoặc texture/lighting hoàn thiện; nội thất vẫn chia sẻ hình thái cơ bản. Pass 3 xử lý camera/HUD, không thay thế vòng sculpted chef/customer, furniture, baked AO/IBL hay profiling Android/iOS. Không tuyên bố chất lượng nghệ thuật chỉ từ số model/build/test.

## Guest 4.3 — 3D Pass 1 (đã triển khai; regression đã xác minh)

- **4.3A:** Đã tạo chef chibi có mắt/tóc/mũ/tạp dề/chi riêng, burger nhiều lớp và bộ thiết bị bo cạnh; Little Sun có nền terrazzo caro, wallpaper tự vẽ, cửa sổ, bảng hiệu, đèn và ghế bọc. Vertical slice đã lắp burger thật trên desktop và mở trận mobile.
- **4.3B:** Cache material PBR và geometry bo cạnh; sao chép vertex trước khi gộp mesh để tránh lỗi biến dạng khi đổi màn. Mesh tĩnh gộp theo material trong từng station; nhân vật gộp trong từng khớp. Animation theo rig, hơi nước/khói dùng pool ba mesh/trạm. Không tạo mesh mỗi frame.
- **4.3C:** Đã thêm shoji/tre/sóng/noren (Tide), vòm/gốm/ôliu/mosaic (Olive), mái ngói/đèn lồng/gỗ/menu phố (Lantern), porthole/planet/khung tàu/hydroponic (Orbit). Giữ bố cục/collision hiện có. Nguyên liệu từng cuisine có hình dạng riêng; món dùng các thành phần recipe thật.
- **4.3D:** Production build/typecheck đạt, unit/regression đạt 269 passed, 4 skipped (PostgreSQL). Production E2E đạt **24/24**: visual capture 10 (5 nhà hàng × desktop/mobile), Solo + Multiplayer 3 (bao gồm mất kết nối và reconnect), campaign 5 (đủ 50 màn, công thức và phục vụ món thật ở cả 5 nhà hàng), mobile-controls + Settings 6. Desktop/mobile visual suite kiểm tra lỗi trang và không tạo mesh/material dư theo thời gian; các bài khác kiểm tra simulation và tiếp tục chạy trận khi thay cài đặt. Chưa kết luận chất lượng mỹ thuật đạt chỉ từ build/tests. Guest-only giữ nguyên, không phát triển Account/Database/Economy/Social.
- Dùng mesh procedural nguyên bản, không có Blender trong PATH; không tuyên bố có GLB nhập ngoài hoặc asset AI. SwiftShader chỉ ghi 1–2 FPS, không phải benchmark GPU điện thoại; hiệu năng vật lý chưa được nghiệm thu. Chi tiết, ảnh và hạn chế Pass 2: [VISUAL_PASS_1.md](VISUAL_PASS_1.md).

## Mốc Guest — Settings, âm thanh và khả năng tiếp cận

### Guest 4.2 — Mobile Controls & Gameplay Feedback (đã triển khai, production E2E đạt)

- Joystick tùy chọn trong Settings, mặc định vẫn là chạm. Joystick lượng tử hóa tám hướng trên màn hình rồi chuyển sang đích gần theo camera; dùng nguyên giao thức move/pathfinding ô hiện có (đường chéo qua các đoạn ô), không thêm tốc độ hoặc di chuyển phía client.
- Nút tương tác lớn chọn trạm trong phạm vi 1,55 ô, hiển thị tên và viền trạm; mỗi lần nhấn chỉ gửi một interact. Server quyết định hành động hợp lệ. Thả/cancel pointer, mất focus, đổi hướng về vùng chết, mở Settings hoặc đổi chế độ dừng joystick ở tâm ô gần đang đi tới.
- Khu vực điều khiển riêng, có safe-area cho ngón tay, bố cục dọc/ngang và camera được co theo vùng bếp còn lại. Menu ngang được sửa để nút Play không bị cắt trên màn hình thấp.
- Cảnh báo khách/queue khi còn ≤ min(20 giây, 25% patience), món gần cháy khi còn ≤ min(5 giây, 35% burn window), viền hoàn tất trên trạm. Cảnh báo chỉ đọc snapshot và dữ liệu màn, không đổi simulation hoặc cân bằng.
- SFX ngắn cho ráp món và cảnh báo; giữ pickup/place/dishReady/served/washed. Cảnh báo âm thanh được chống lặp theo customer/item, dùng kênh SFX và Master/Mute; cảnh báo chữ/màu vẫn nhìn thấy với Reduced Motion và mute.
- Xác minh cuối: typecheck/build production đạt; unit/regression **262 passed, 4 skipped** (4 bài cần PostgreSQL). **9/9 production browser E2E passed trong 7,1 phút**: Solo nấu/phục vụ/rửa/tái dùng/thắng/lưu kết quả; touch và reconnect; hai client PC + mobile cùng phòng, phối hợp trận Multiplayer thật và đồng bộ trạng thái; joystick portrait/landscape; cảnh báo món/khách; Settings desktop/mobile và trận tiếp tục chạy khi mở Settings. `npm run format:check` và `git diff --check` đạt.
- Giới hạn kiểm thử: thiết bị mobile là browser mô phỏng touch/viewport, chưa đo FPS/GPU hoặc thử safe-area/tai thỏ trên điện thoại vật lý. Build có cảnh báo bundle JS client >500 kB; Docker/PostgreSQL và 4 bài test phụ thuộc DB chưa chạy.

### Guest 4.1 — Settings (mốc trước)

- `GUEST_ONLY=true` chủ động tắt tài khoản/persistence kể cả khi có `DATABASE_URL`; không kết nối DB trong chế độ này. Solo/co-op vẫn mô phỏng trên server; tiến trình Guest lưu tại thiết bị, chưa đồng bộ giữa thiết bị và chưa chống sửa localStorage.
- Menu Guest hiển thị trạng thái Khách, ẩn nút tài khoản không khả dụng. Có Settings trong menu và trong trận, tiếng Việt/Anh, lưu cài đặt trên thiết bị.
- Master/Music/SFX Volume và Mute hoạt động qua các kênh Web Audio riêng. Nhạc menu và 5 nhà hàng là motif tổng hợp nguyên bản; chỉ khởi tạo AudioContext sau tương tác, tắt tiếng khi tab bị ẩn. Đây là nhạc procedural cơ bản, chưa phải bộ nhạc/âm thanh hoàn chỉnh.
- Đồ họa nhẹ tắt bóng đổ và giảm độ phân giải render; không thay đổi simulation. Giảm chuyển động tắt nhún nhân vật/khách, nhấp nhô emote, camera bám theo và chuyển động CSS; giữ hiển thị vị trí và tín hiệu gameplay. Mặc định theo lựa chọn hệ điều hành nếu chưa có cài đặt.
- Settings dùng dialog có nhãn, focus bàn phím và điều khiển cảm ứng. Mở Settings không tạm dừng trận; cài đặt mỗi thiết bị độc lập trong co-op.
- Kiểm chứng mốc Guest ngày 2026-10-08: build/typecheck và format đạt; **256 tests passed, 4 skipped** (PostgreSQL đang hoãn). **5/5 production E2E passed trong 4,4 phút**: Solo, mobile/reconnect, hai người phối hợp và Settings desktop/mobile. Regression simulation vẫn kiểm tra 50 màn × 4 cỡ đội. Không chạy lại 5 campaign browser tests ở mốc này; kết quả 8/8 của mốc trước được giữ ở phần lịch sử bên dưới.
- Đã xem screenshot mobile; chưa đo FPS/GPU trên điện thoại thật hoặc đánh giá âm thanh bằng nghe trên nhiều thiết bị. Chưa tuyên bố hoàn thành toàn bộ giai đoạn polish.
- Joystick và cảnh báo đã chuyển sang mốc Guest 4.2 ở trên. Sau đó ưu tiên Guest 4.3–4.5: hiệu ứng 3D, animation, âm thanh, tối ưu và kiểm thử trải nghiệm. Không tự chuyển sang Account/Database/Economy/Social.

## Trạng thái Giai đoạn 4

### 4.1 — Account & persistence (tạm hoãn theo yêu cầu)

- Migration `002_accounts_progress.sql` bổ sung username/player code, password hash, guest identity, session hash/expiry, tiến trình theo level, match participants và kho lưu tiến trình local cũ. Khóa màn/recipe hiện có được giữ nguyên.
- API đăng ký, đăng nhập, đăng xuất, guest session và đọc hồ sơ/progress. Mật khẩu hash bằng scrypt; session là token ngẫu nhiên, chỉ lưu digest trong PostgreSQL và gửi cho trình duyệt bằng cookie HttpOnly/SameSite. Có rate limit login/guest/register.
- Guest có thể chơi tiếp; khi DB được cấu hình, guest/progress mới được lưu trên server và có thể chuyển cùng hồ sơ thành tài khoản hoặc gộp vào tài khoản đăng nhập. Tiến trình 0.3 từ localStorage được lưu riêng để đối chiếu nhưng đánh dấu chưa xác minh, không tự mở khóa hoặc cấp sao vì dữ liệu cũ không có chữ ký.
- Solo và co-op xác thực session khi vào phòng. Server từ chối màn chưa mở trong Solo, yêu cầu Host mở màn trước khi tạo private room, cho phép khách được mời tham gia mà không sửa tiến trình của họ, và kiểm tra màn mỗi người khi public match/Host đổi màn.
- Kết quả được ghi từ snapshot simulation phía server trong transaction. `match_result`/`match_participant` và unique keys chống ghi trùng do retry/reconnect; progress cập nhật theo người tham gia từ kết quả do server tạo. Client không có API khai báo chiến thắng/điểm.
- UI có Guest/account, đăng ký, đăng nhập, đăng xuất, player code và trạng thái đồng bộ. Khi không đặt `DATABASE_URL`, gameplay Guest cũ vẫn chạy cục bộ và account API báo không cấu hình; không có database in-memory thay thế.
- Rà soát tiếp mốc 4.1: sửa SQL tạo Guest/gộp lịch sử trận, tính lại số trận thắng từ các match duy nhất khi hai danh tính cùng tham gia, giữ riêng các bản import từ nhiều thiết bị và thu hồi session Guest khi đăng ký. Public room kiểm tra quyền với màn thực tế của phòng. Các nhánh SQL này vẫn cần chạy trên PostgreSQL để nghiệm thu.
- UI chỉ báo lưu thành công trên server khi API xác nhận đúng match ID thuộc người chơi; đọc được hồ sơ cũ không đủ để báo đã lưu. Khi DB được cấu hình, lỗi đồng bộ không chuyển sang cấp tiến trình bằng localStorage.

### 4.2–4.4

Tạm hoãn currency/shop/cosmetics, achievements, friends/privacy và leaderboards theo yêu cầu. Tiếp tục gameplay, nội dung và UI Guest; không tạo nền kinh tế giả trên client.

## Kiểm chứng thực tế

- Đã xác nhận môi trường: Node.js 24.21; `docker` và `psql` không có trong PATH; không có PostgreSQL service và `127.0.0.1:5432` không lắng nghe. Vì vậy không tuyên bố migration, Compose hay database persistence đã chạy.
- Có test scrypt/session digest, kiểm tra hình dạng migration, khóa nội dung ổn định và kiểm tra không có REST endpoint ghi kết quả trận.
- `tests/postgres-account.integration.test.ts` là integration suite chạy SQL thật cho guest/register/login/session/progress/idempotency khi `ACCOUNT_TEST_DATABASE_URL` trỏ đến database biệt lập đã migrate/seed. Hiện các test này **bị skip** vì môi trường không có PostgreSQL; test cấu trúc không thay thế cho chúng.
- Kiểm chứng 2026-10-08: typecheck và production build đạt (có cảnh báo bundle client lớn hơn 500 kB); unit/regression đạt **249 passed, 4 skipped**; format check đạt. 4 test bị skip thuộc suite/setup PostgreSQL do không có URL. Test client dùng response giả chỉ kiểm tra logic xác nhận match ID và lỗi logout, không chứng minh database persistence.
- Production E2E gameplay **8/8 passed (11,2 phút)**: tải 50 màn, nấu/phục vụ ở cả 5 nhà hàng, Solo đầy đủ, mobile/pause/reconnect và hai browser context phối hợp nấu/rửa/social. Suite chạy không cấu hình DB. Các sửa xác nhận lưu DB được bổ sung trong lúc suite đang chạy, sau đó build lại và kiểm tra nhanh mobile/reconnect; chưa xác minh nhánh lưu DB bằng E2E.
- Bổ sung `tests/e2e/account.spec.ts` kiểm tra UI đăng ký, hai browser context dùng cùng tài khoản, legacy không tự mở khóa và đăng xuất một thiết bị. Kết quả **1 skipped** vì thiếu `E2E_ACCOUNT_DATABASE_URL`; chưa xác minh luồng này với database thật. Chưa có E2E thắng trận rồi xác nhận tiến trình ở thiết bị thứ hai.
- `npm.cmd run db:migrate` đã được thử với PostgreSQL local và thất bại `ECONNREFUSED 127.0.0.1:5432`. Do đó migration SQL, seed, account API với DB và persistence chưa được xác minh thực tế.

## Cách xác minh Giai đoạn 4.1 khi có PostgreSQL

Tạo một database kiểm thử biệt lập có tên chứa `test`, rồi chạy từ PowerShell:

```powershell
$env:ACCOUNT_TEST_DATABASE_URL='postgres://kitchen:password@localhost:5432/kitchen_test'
$env:DATABASE_URL=$env:ACCOUNT_TEST_DATABASE_URL
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run test:db
$env:E2E_ACCOUNT_DATABASE_URL=$env:ACCOUNT_TEST_DATABASE_URL
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
$env:E2E_PRODUCTION='true'
npx.cmd playwright test tests/e2e/account.spec.ts
```

Không trỏ `ACCOUNT_TEST_DATABASE_URL` tới database có dữ liệu người chơi; integration suite yêu cầu tên database có `test` và xóa hồ sơ/match fixture do nó tạo.

Với Compose: đặt `POSTGRES_PASSWORD`, sau đó `docker compose up --build`. Compose chạy migration + seed trước server; server đọc `DATABASE_URL`. Thao tác này chưa được xác minh trong môi trường hiện tại.

## Regression ứng dụng

```powershell
npm.cmd run typecheck
$env:VITE_SAME_ORIGIN='true'; npm.cmd run build
npm.cmd test
$env:E2E_PRODUCTION='true'; npm.cmd run test:e2e
npm.cmd run format:check
```

Playwright production dùng port loopback 2570. Server của suite mặc định không cấu hình database để kiểm tra Guest/campaign cục bộ. Chỉ đặt `E2E_ACCOUNT_DATABASE_URL` khi chạy riêng `account.spec.ts`; không đặt `E2E_BASE_URL` cho lần kiểm tra này. Cần PostgreSQL thật cho E2E tài khoản và đồng bộ.

## Giới hạn còn lại

- Chưa xác minh Giai đoạn 4.1 cho tới khi migration, seed và `test:db` chạy trên PostgreSQL thật. Khắc phục blocker: cung cấp Docker hoặc PostgreSQL và database test riêng theo lệnh phía trên.
- Còn cần kiểm thử với DB: phân quyền chọn màn qua kết nối Colyseus thật, ghi kết quả khi reconnect và gộp Guest trong lúc một trận còn hoạt động. E2E đồng bộ tiến trình sau một trận thắng qua hai thiết bị chưa hoàn tất.
- Tiến trình legacy được bảo toàn trong vùng lưu trữ **unverified**; không thể cấp lại unlock/sao tin cậy từ localStorage không ký của bản 0.3. Cần quy trình hỗ trợ/đối soát nếu muốn khôi phục quyền mở khóa cũ.
- Chưa triển khai tiền xu/shop, cosmetics, achievements, friends, privacy settings hoặc leaderboard.
- Docker, WAN/public deployment, Safari/iOS, tải server và playtest người thật chưa được xác minh.
- Giai đoạn 3: 50 màn/10 công thức; báo cáo test và cân bằng ở [CAMPAIGN_BALANCE.md](CAMPAIGN_BALANCE.md). Chi tiết nội dung: [CAMPAIGN.md](CAMPAIGN.md), [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md).
