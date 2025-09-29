# NodeImage 图片上传助手

## 新增 chrome扩展插件 支持图片管理 上传 任意页面右键图片直接上传到图床.


![](https://cdn.nodeimage.com/i/BCTrW5kFCZ4VnycBDi0CRt4n8CrfP01E.png)

![](https://cdn.nodeimage.com/i/jPAJJzaVSTTPlWhs6NmiVtV5IpNs9Hc4.png)

![](https://cdn.nodeimage.com/i/C0QgDhlnpzGkG3vk1Y3yu0S7NooopHGP.png)


【浏览器扩展（ZIP）使用方法】
- 前往 Releases 下载 `chrome-nodeimage-extension.zip`。
- 将 ZIP 解压到本地任意目录（确保目录内包含 `manifest.json`）。
- 打开浏览器扩展页面：
  - Chrome/Brave/Vivaldi: 访问 `chrome://extensions`
  - Microsoft Edge: 访问 `edge://extensions`
- 开启“开发者模式”。
- 点击“加载已解压的扩展程序”（Load unpacked），选择刚解压的文件夹根目录。
- 注意：Chrome/Edge 不支持直接从 ZIP 安装，必须解压后加载。

一个面向 NodeSeek/NodeImage 的用户脚本，支持粘贴/拖拽上传、图片管理面板、复制/删除、Markdown 插入等。主脚本仅做引导，功能代码按模块从远程按需加载，便于热更新与多站点适配。

## 功能特性
- 粘贴/拖拽上传，自动生成 Markdown 并插入编辑器
- 管理面板：分页浏览、复制（直链/Markdown/HTML/BBCode）、批量删除
- 编辑器工具栏按钮与小屏适配（按钮整块换行，内部不折字）
- 图片列表接口（Cookie 认证，失败自动回退最近接口；分页信息直出）

## 安装与使用
1) 安装 Tampermonkey/Violentmonkey 等脚本管理器
2) 安装脚本（自动更新）：
   - https://raw.githubusercontent.com/likesrt/NodeImage-Uploader/main/nodeImage-uploader.user.js
3) 打开受支持站点后，工具栏右侧可见「打开管理面板」按钮；也可通过粘贴/拖拽直接上传

脚本菜单（浏览器扩展图标处）：
- 设置模块仓库地址：覆盖远程模块基地址（默认 GitHub raw 的 `modules/`）
- 从远程拉取最新模块（覆盖缓存）：强制刷新全部模块并重载页面
- 检查主脚本更新：打开安装地址触发管理器更新

## 模块加载与缓存
- 模块按固定顺序加载：config → storage → utils → filetype → api → integration → ui → handler → auth → boot
- 自动缓存策略：720 小时 TTL；命中新鲜缓存直接执行，过期联网刷新，失败回退缓存
- 可将模块基地址指向你的CDN（例如 `https://…/modules/`）

## 新列表接口与回退
- 优先调用 `GET https://api.nodeimage.com/api/images?page={p}&limit={n}`（仅 Cookie 认证）
- 非 200/解析失败/网络异常时自动回退旧接口 `/api/v1/list` 并在前端分页
- UI 已切换到新方法，直接展示总页数与总数量

## 本地开发
- 启动静态服务：`python3 -m http.server 8080`
- 脚本菜单 → 设置模块仓库地址：`http://localhost:8080/modules/`
- 变更后刷新页面即可验证；建议使用控制台查看网络与日志

## 许可证
MIT
