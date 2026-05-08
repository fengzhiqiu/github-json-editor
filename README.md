# GitHub JSON Editor

一个纯前端的可视化 JSON 编辑工具，用于管理 GitHub 仓库中的 JSON 数据文件。

## ✨ 功能

- 🔐 **GitHub 认证** — 支持 OAuth 和 Personal Access Token 两种方式登录
- 📁 **仓库管理** — 配置多个仓库和目录，快速切换
- 📄 **文件浏览** — 列出指定目录下的 JSON 文件
- 🎨 **可视化编辑** — 自动识别数据结构，表格/表单方式编辑
  - 数组类型：表格展示，支持新增/删除/排序
  - 对象类型：表单字段编辑
  - 嵌套结构：折叠面板
- 💻 **代码编辑** — Monaco Editor 原始 JSON 编辑器（高级模式）
- 🖼️ **图片上传** — 自动压缩 + 转 WebP + 上传到仓库
- ✅ **实时校验** — JSON 格式错误实时提示
- 💾 **一键提交** — 编辑完成后直接 commit & push 到 GitHub
- 📱 **响应式设计** — 支持手机端使用

## 🚀 部署步骤

### 1. 创建 GitHub OAuth App

1. 前往 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写信息：
   - **Application name**: `GitHub JSON Editor`
   - **Homepage URL**: `https://your-domain.vercel.app`
   - **Authorization callback URL**: `https://your-domain.vercel.app/api/auth/callback`
4. 创建后记录 **Client ID** 和 **Client Secret**

### 2. 部署到 Vercel

#### 方式一：一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/fengzhiqiu/github-json-editor)

#### 方式二：手动部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 在项目目录下
vercel
```

### 3. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_GITHUB_CLIENT_ID` | OAuth App 的 Client ID | `Ov23liXXXXXX` |
| `GITHUB_CLIENT_SECRET` | OAuth App 的 Client Secret | `xxxxxxxxxxxxxxxx` |

> ⚠️ `VITE_` 前缀的变量会暴露到前端，`GITHUB_CLIENT_SECRET` 仅在 serverless function 中使用。

### 4. 更新 OAuth 回调 URL

部署完成后，将 Vercel 分配的域名更新到 OAuth App 的回调 URL：
```
https://your-app.vercel.app/api/auth/callback
```

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 创建 .env 文件
cat > .env << EOF
VITE_GITHUB_CLIENT_ID=your_client_id_here
EOF

# 启动开发服务器
npm run dev
```

> 💡 本地开发时可以不配置 OAuth，直接使用 Personal Access Token 登录。

## 📦 技术栈

- **框架**: React 18 + TypeScript + Vite
- **UI**: Ant Design 5
- **代码编辑器**: Monaco Editor
- **GitHub API**: Octokit.js
- **图片处理**: browser-image-compression
- **校验**: Ajv (JSON Schema validation)
- **部署**: Vercel (含 Serverless Functions)

## 📁 项目结构

```
├── src/
│   ├── components/     # React 组件
│   ├── hooks/          # 自定义 Hooks
│   ├── utils/          # 工具函数
│   ├── config/         # 仓库配置
│   └── types/          # TypeScript 类型
├── api/                # Vercel Serverless Functions
├── vercel.json         # Vercel 配置
└── package.json
```

## 🔒 安全说明

- OAuth Client Secret 仅在服务端使用，不会暴露到前端
- Access Token 存储在 `sessionStorage`，关闭标签页即失效
- 建议为 OAuth App 设置最小必要权限

## 📄 License

MIT
