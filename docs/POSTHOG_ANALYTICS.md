# micro-pet · PostHog 事件字典

> 遵循 [POSTHOG_USAGE_GUIDE](../../../context/prompt/POSTHOG_USAGE_GUIDE.md)（共享 key 多项目规范）。
> **范围声明：仅本 GitHub Pages 落地页（docs/index.html）埋点；桌面 app 本体零遥测（SPEC 硬约束/反目标），如需扩展到 app 属 SPEC 变更决策。**

| 项 | 值 |
|----|----|
| `project` | `micro-pet`（已在指南注册表登记） |
| uid key | `localStorage['micro-pet-uid']` |
| page | `index`（落地页） |
| 端点 | `https://eu.i.posthog.com/capture/`（EU，sendBeacon） |
| 本地开发 | localhost / 127.0.0.1 自动跳过 |

## 事件

| 事件 | 触发 | 属性 |
|------|------|------|
| `page_view` | 落地页加载 | `page:'index'` |
| `command_copy` | 点复制按钮 | `step`（`brew_install` / `pya_copy`）、`text`（前 120 字符） |
| `link_out` | 点外链（GitHub/Releases/科普） | `target`（URL 前 120 字符） |

## 查询

```sql
-- 7 日访问与转化（复制率）
SELECT event, count() AS cnt, count(DISTINCT distinct_id) AS users
FROM events
WHERE properties.project = 'micro-pet'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY event ORDER BY cnt DESC
```

## 上线验证 checklist

- [ ] 访问 https://liyuankui.github.io/workoutpet/ 触发 page_view
- [ ] PostHog Live Events（Project 97154）过滤 `properties.project = 'micro-pet'` 应出现事件
