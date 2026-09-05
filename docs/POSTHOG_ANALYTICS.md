# micro-pet · PostHog 事件字典

> 遵循 [POSTHOG_USAGE_GUIDE](../../../context/prompt/POSTHOG_USAGE_GUIDE.md)（共享 key 多项目规范）。
> 两个埋点面：**网页落地页**（surface 隐含，`page:'index'`）与 **桌面 app**（`surface:'app'`，opt-out）。

| 项 | 值 |
|----|----|
| `project` | `micro-pet`（已在指南注册表登记） |
| uid | 网页 `localStorage['micro-pet-uid']`；app `~/.micro-pet/uid` |
| 端点 | `https://eu.i.posthog.com/capture/`（EU；网页 sendBeacon / app fetch） |
| 本地开发 | 网页 localhost 自动跳过 |
| **app 关闭开关** | config `"telemetry": false` 或 托盘 →「匿名遥测（可关）」取消勾选（**关后零网络请求**） |

## 事件

| 事件 | 触发 | 属性 |
|------|------|------|
| `page_view` | 落地页加载 | `page:'index'` |
| `command_copy` | 网页复制按钮 | `step`（`brew_install` / `pya_copy`）、`text` |
| `link_out` | 网页外链点击 | `target` |
| `app_open` | app 启动（app） | `surface:'app'`、`version`、`exercises`、`scheduleWindows` |
| `remind_fired` | 提醒触发（app） | `surface:'app'`、`exercise` |
| `check_in` | 摸头打卡（app） | `surface:'app'`、`exercise` |

## 查询

```sql
-- 7 日总览（网页 vs app 分面）
SELECT properties.surface, event, count() AS cnt, count(DISTINCT distinct_id) AS users
FROM events
WHERE properties.project = 'micro-pet'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY properties.surface, event ORDER BY cnt DESC

-- H1/H2 假设验证原料：提醒→打卡转化（app）
SELECT countIf(event='remind_fired') AS reminds, countIf(event='check_in') AS checkins,
       round(checkins / greatest(reminds,1) * 100, 1) AS conv_pct
FROM events
WHERE properties.project = 'micro-pet' AND properties.surface = 'app'
  AND timestamp >= now() - INTERVAL 14 DAY
```

## 上线验证 checklist

- [x] 访问 https://liyuankui.github.io/workoutpet/ 触发 page_view（capture 200 已验）
- [ ] app v0.5.0 启动后 Live Events 过滤 `properties.project='micro-pet' AND properties.surface='app'` 应见 `app_open`
- [ ] 托盘关闭遥测 → 重启 → Live Events 不再有新 app 事件
