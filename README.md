# FastResume — AI Career Agent

FastResume 正在从「AI 简历工具」升级为「以 Career Brain 为核心的求职代理」。
本仓库是 Web 端(Career HQ / Brain)的代码。

> 状态:Career Agent Phase 1 已完成并通过验证,**尚未部署**。
> 线上 `fastresume.xyz` 跑的仍是旧版本。

---

## 产品定位

```
上传简历 → 建立 Career Profile → 明确求职目标
   → 录入职位 JD → 可解释的 Career Fit 匹配打分
   → 针对该 JD 生成定制简历 + 求职信
   → Application Tracker 追踪申请状态
   → 面试(绑定到具体申请)
   → [未来] 根据 Interview / Rejection / Offer 优化推荐
```

核心主张:**Don't apply everywhere. Apply where you belong.**
北极星指标是「高质量申请带来的面试转化率」,不是申请数量。

---

## 已有功能(原 FastResume)

| 模块 | 说明 |
|---|---|
| CV/Resume Builder | JD 分析、ATS 匹配打分、简历重写、求职信生成 |
| Portfolio AI | 作品集生成与分享 |
| Interview | AI 模拟面试 + 评分报告 |
| Career Path | 职业路径预测 |

## 新增功能(Career Agent,本次开发)

| 模块 | 说明 |
|---|---|
| **Career Profile** | 分步引导建档:上传简历 AI 提取 → 用户逐条确认 → 补充求职目标 |
| **Jobs** | 手动录入职位 JD(Phase 2 由 Chrome 插件自动抓取) |
| **Career Fit / Match Score** | 可解释的五维打分,不是黑箱百分比 |
| **Tailored Resume** | 针对单个 JD 生成简历 + 求职信,按职位保留多版本 |
| **Application Tracker** | 看板式追踪,含状态时间线审计 |

### Match Score 五个维度

| 维度 | 权重 | 说明 |
|---|---|---|
| 硬性资格 | 25–35% | 工作权利、学历、地点、必需证书。不满足直接降级 |
| 技能与经历 | 25–35% | 已确认技能与 JD 要求的重合度 |
| 目标与偏好 | 15–20% | 职位方向、地点、薪资、办公方式 |
| 机会质量 | 10–15% | JD 完整度与可信度(与候选人无关) |
| 历史结果 | 0–15% | 冷启动为 0,数据足够后才启用 |

输出形式:**百分比 + 每维证据 + 硬性缺口 + 推荐动作**。

实测样例(同一份 Profile 对两个职位):

```
Graduate Backend Engineer @ Zephyr Tech (Melbourne, Hybrid)
  OVERALL 96%   →  priority_apply
  硬性资格   100  近两年 CS 学位、澳洲 PR、graduate 级别、人在 Melbourne
  技能经历    95  核心要求(Python、PostgreSQL)全覆盖
  目标偏好   100  职位名/地点/办公方式/薪资区间全对上
  机会质量    85  JD 具体:技术栈、职责、薪资带、办公地点都写明
  缺口:无

Senior iOS Engineer @ Nimbus Mobile (Sydney, Onsite)
  OVERALL 18%   →  skip
  硬性资格    10  要求 7+ 年 vs 应届;Sydney 全周坐班 vs 人在 Melbourne
  技能经历     5  缺 Swift/SwiftUI/iOS 生态,无带团队经验
  目标偏好    15  方向、地点、办公方式全不符
  机会质量    75  JD 本身写得清楚(所以这一维不低)
  缺口:7+ 年 iOS 经验 / Swift 专家级 / Sydney 坐班 / 带 4 人以上团队经验
```

---

## 技术架构

```
FastResume Web  =  Brain / Career HQ     ← 本仓库
Chrome Extension = Hands / 执行申请       ← Phase 2,尚未开始
```

两端**共用**同一个 User Account、Career Profile、Job 数据、Resume 版本、
Application Tracker 和 Backend —— 插件不会重做一套简历系统。

### 技术栈

- **前端**:React 19 + Vite + Tailwind 4(SPA,无路由库,靠 `activeModule` state 切换)
- **后端**:Express(`server.ts`)—— 只做三件事:Stripe、积分、Gemini 代理
- **数据**:Supabase Postgres,全表 owner-only RLS(`auth.uid() = user_id`)
- **AI**:Gemini,统一走 `/api/gemini` 代理(鉴权 + 积分扣费,API key 不进浏览器)

### 目录结构

```
App.tsx                          主控制器(顶层 state 与模块切换)
server.ts                        Express:Stripe / 积分 / Gemini 代理
credits.ts                       各操作消耗积分的单一真相源
components/
  CareerAgent.tsx                Career Agent 外壳(三个子标签页)
  career/
    ProfileWizard.tsx            分步建档引导
    CareerProfileView.tsx        资料编辑表单
    JobsBoard.tsx                职位录入 + 匹配打分 + 定制简历
    ApplicationTracker.tsx       申请看板
  (其余为原有模块)
services/
  geminiService.ts               所有 AI 调用
  supabaseClient.ts              Supabase 客户端 + authedFetch
  career/                        Career Agent 业务层(与 React 解耦)
    profileService.ts            Career Profile CRUD
    profileImportService.ts      简历 → 结构化 Profile
    jobsService.ts               职位 CRUD
    matchService.ts              匹配打分 + 快照持久化
    tailoredResumeService.ts     职位定制简历
    applicationsService.ts       申请追踪
    connectors/                  职位来源连接器(仅接口 + 手动录入)
supabase/migrations/             数据库迁移,按序执行
```

`services/career/` 刻意不依赖 React 或浏览器专属 API,
Phase 2 的 Chrome 插件可以直接复用,不需要重写业务逻辑。

---

## 几个关键设计决定

**Match Snapshot 不可变**
重新打分是新增一行,不是覆盖。数据库层没有 UPDATE 策略强制这一点 ——
将来做 Outcome Learning 时,历史匹配结果必须能反映「当时」的判断依据,
不能被后来的资料修改追溯性地改写。

**一次申请绑定三样东西**
Job + 当时的 Match Snapshot + 当时的 Resume 版本。
这样不会出现「投的是 A 版本,面试却用 B 版本准备」。

**`applied_at` 只打戳一次**
首次进入 applied 状态时记录,之后状态怎么变都不改写,
否则「投递 → 面试」的时间统计会失真。

**受保护属性隔离**
年龄/性别为可选、默认不填、年龄只存区间。
仅用于中国市场简历格式和申请表填写,
**代码层面确保不进入匹配打分**(见 `types.ts` 与迁移 `0006` 的注释)。

**AU / CN 双市场预留**
`jobs.market` 是严格枚举(AU / CN),`jobs.source` 是开放文本 ——
新增职位来源只需加一个 connector,不需要改数据库。

---

## 协作者上手

GitHub 权限不等于能跑起来。**加进仓库之后还需要一步:被邀请进 Supabase 项目**
(Project Settings → Members),然后自己从 dashboard 读 key。

不要用聊天或邮件传 key。一人一份、各自可单独吊销 —— 谁离开就撤谁,
不用全站换密钥。`SUPABASE_SERVICE_ROLE_KEY` 绕过所有 RLS,
拿到它就能读写全部用户数据。

```bash
git clone https://github.com/hyy7010-ai/quick-apply.git
cd quick-apply
npm install
cp .env.example .env    # 填入自己的 key
npm run dev             # http://localhost:3000
```

`ALLOWED_ORIGINS` 必须填**你自己机器上的**扩展 ID。未打包插件的 ID
是从文件夹路径算出来的,每台机器不同,从 `chrome://extensions` 读。

数据库是**共用同一个 Supabase 项目**,所以迁移不用各自再跑一遍 ——
但要确认下表里 `0008` 已经执行过(见下)。

浏览器插件:

```bash
npm run build:ext       # 产物在 extension/dist
```

然后 `chrome://extensions` → 开发者模式 → Load unpacked → 选 `extension/dist`。
改完代码要重新 build 并在扩展卡片上按 ⟳,**再刷新目标网页**
(content script 只在页面加载时注入)。

---

## 本地运行

```bash
npm install
cp .env.example .env    # 填入你自己的 key
npm run dev             # http://localhost:3000

npm run dev:en          # 3000,默认英文
npm run dev:zh          # 3001,默认中文
```

需要配置:Supabase(URL / anon key / service role key)、Gemini API key、
Stripe(可选)。详见 `.env.example` 与 `SETUP.md`。

数据库迁移按编号顺序在 Supabase SQL Editor 执行:

| 迁移 | 内容 |
|---|---|
| `0001` | 积分账本 + RLS 基础 |
| `0002` | Career Profile / Jobs / Match Snapshots |
| `0003` | 修复 `resume_history` 缺少 ON DELETE CASCADE(用户无法删号) |
| `0004` | Tailored Resumes / Applications / 状态历史 / 面试关联 |
| `0005` | **安全修复**:关闭 `shared_portfolios` 匿名可读 |
| `0006` | Profile 建档字段(工作经历 / 教育 / 证书 / 可选人口属性) |
| `0007` | 联系方式 + 已保存的问答 |
| `0008` | **未执行** — 志愿经历 / 奖项。不跑的话「用我已有的简历」会报 `42703` |

---

## 部署前必须处理

1. **线上跑的是旧代码,数据库已是新结构。** 两者组合不稳,部署时需一并理顺。
2. **`shared_portfolios` 有 81/83 行缺 `user_id`**,无法回填(数据本身不含归属信息)。
   分享链接靠 slug + RPC 工作,不受影响;但直接 select 的旧代码会读不到。
3. **品牌**:`fastresume.ai` / `.io` / `.org` 均已被他人使用,
   扩张前需完成商标 / 域名 / 应用商店检索。

---

## 路线图

- [x] Phase 1 — Career Profile / Jobs / Match / Tailored Resume / Tracker
- [ ] Phase 2 — Chrome Extension 浮窗(读取 JD + 定制简历)
- [ ] Phase 3 — Autofill(用户确认后由用户提交,**不做自动 Submit**)
- [ ] Phase 4 — Outcome Learning

MVP 明确**不做**:大规模职位抓取、无人值守海投、
一次性接入澳中所有招聘平台。
