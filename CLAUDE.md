# 给 Claude 的说明（games 仓库）

这个仓库放用户的网页游戏，用 GitHub Pages 发布，一个游戏一个文件：

- `skater.html`：3D 指尖滑板游戏的成品（打包好的单个网页）。线上地址：https://3855285335-gif.github.io/games/skater.html
- `skater-src/`：滑板游戏的源码、测试、SQL。改游戏要改这里，再打包成 `skater.html`。

## 用户定的规矩（必须遵守）

- 全部用中文写，包括步骤之间的进度说明，不写英文句子。
- 改动攒在一起交付。小改动不要单独发布；说过"不用上传"就不能再反悔。
- 发布由 Claude 直接推送到 main（用户已关联 GitHub），只在用户说"传"之后才推。推完核对线上文件。
- 画质只能由玩家自己选。不许为了省流量、省额度自动降画质；要取舍先问用户。
- 联网数据一开始就按省额度设计：紧凑的二进制消息、走中转时降低频率。
- 数字、额度、服务器地址先查官网再说；没查过要明说；估算要标明是估算。
- 模拟环境里测试通过，不等于在用户手机上能用。要写清楚哪些只模拟过、哪些还要真机测。
- 会变的配置（服务器地址、账号）尽量放数据库，改的时候只跑 SQL。
- 交付游戏时要给用户看桌面图标。
- 要跑 SQL 时先告诉用户，并给完整代码。Supabase 后台只有用户能登录。用户通过 Safari 机翻看 GitHub 和 Supabase 后台，步骤里写机翻后的中文按钮名，并给直达链接。
- 难以撤回的选择（比如项目区域）要提前说。
- 绝不能把 Supabase 的 secret key（以 sb_secret_ 开头）写进任何文件，只用 publishable key。
- 用户最怕 BUG：改完反复测试，回复要简洁。

## 打包和测试

- 打包：`cd skater-src && ./build.sh`，生成 `out/skate.html`，发布时复制成仓库根目录的 `skater.html`。
- 需要：Node、esbuild 0.28.2、three.js r187（`npm install three@0.187.0`）、Playwright（Chromium）。
- 测试：在 `skater-src` 里运行 `node test/名字.js`。全套是 wire、netcn、rate、sk8end、net3、phys、phys_roof、phys_yard、carve、kickturn、feel、twist2、touch3、ui3、fuzz2、qtip、turnbtn，外加 `test/remote_unit.mjs`（要先用 esbuild 打包再运行）。test 里其他脚本是调试、截图用的。

## 联机现状（2026-11-05 核实）

- Supabase 项目 games（ref bjpagltblvejqrvefdur，区域法兰克福），所有游戏共用，各游戏的表和函数用自己的前缀（滑板是 skate_）。
- 国内不开 VPN 时，Supabase 的实时通道（WebSocket）连不上，游戏会自动改用数据库牵线（`sql/games-cn.sql`）加 WebRTC 直连；直连也不通时走数据库转发。
- 中转服务器：
  - ExpressTURN 是主力。官网写免费每月 1000GB，免费版只开 3478 端口。真机实测：国内不开 VPN 时 UDP 不通、TCP 通；开 VPN 都通。
  - Metered 是备用。官网写的是"Free: 500 MB trial"，每月 500MB，和 Chatter 共用。只留 TLS 443：如果留着它的 UDP，浏览器会优先选 UDP 中转，在国内就会花掉 Metered 的 500MB，而不是 ExpressTURN 的额度。
  - 两家的账号直接写在网页里，任何人都看得到，和 Chatter 共用。
- 打洞服务器：小米、芒果TV、B站、Cloudflare、谷歌，国内真机实测都能用；stun.qq.com 不能用。
- 保活：`sql/games-setup.sql` 里的 keepalive() 函数，加上 GitHub Actions 每天签到（`sql/games-keepalive.yml`）。这个工作流实际放在哪个仓库运行，还要和用户确认。

## 相关项目

- Chatter（聊天 App）在 index.html 仓库，由另一个对话负责，和游戏共用中转账号。写交接说明或待办之前，先看那个对话里说过什么，别让用户在两个对话之间来回传话。
