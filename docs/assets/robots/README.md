# 机器人出图参考

这个文件夹是给**出图工具**用的输入：参考图 + prompt + 规格。
生成好的图放进 `web/public/robots/v<N>/`，我接上去。

## 文件

| 文件 | 用途 |
| :--- | :--- |
| `family.jpg` | **主参考图**。banner 里五个机器人并排，3402×700。风格、材质、比例都在这张里 —— 出图时把它作为 style reference 喂进去。 |
| `source/three-robots.png` | 已采用的那张生成原图（三个角色，透明底），Inspector / Planner 就是从它裁的。 |
| `source/tester.png` | 单独出的 Tester（万用表 + 电路板）。 |
| `../../assets/banner.png` | 最初的宣传图。需要某个角色的**带背景**大图做 img2img 时，从这里裁。 |

（2026-09-30 清掉了一批过期文件：banner 的逐角色裁剪 `src-*`、旧抠图 `ref-*`，以及一份没被任何文档引用的 provider 标记 `docs/assets/agents/`。）

---

## 共享风格（每张都要带）

```
3D rendered cartoon robot mascot, Pixar-style, glossy white plastic shell,
soft studio lighting with a subtle rim light, large rounded head, friendly
toy-like proportions. Dark rounded visor face panel across the head with two
large glowing cyan eyes and a small cyan smile line. Blue technical overalls
with shoulder straps and buckles, a white rectangular name plate on the chest.
Dark navy gloves and boots. Round white ear pods on the sides of the head.
Clean, minimal, high-key industrial background, slightly out of focus.
Soft contact shadow under the feet. Centered, facing the viewer, three-quarter body.
```

## 三张要出的图

**1. 找 bug 的（对应页面 `hunting a bug`）**

```
[共享风格] + 
Wearing a blue baseball cap with a white badge on the front.
Holding a large magnifying glass up in one hand, leaning slightly forward,
curious expression. Blue jeans-style overalls. No text on the name plate.
```

**2. 核对构建的（对应页面 `checking the build`）**

```
[共享风格] +
Wearing a white hard hat with a blue stripe across it and a small badge.
Holding a tablet up in one hand, looking at it, the other hand raised.
Blue overalls. No text on the name plate.
```

**3. 画界面的（对应页面 `drawing a screen`）**

```
[共享风格] +
Wearing a blue hard hat with a white badge and a chin strap.
Holding a clipboard in both hands, writing on it.
Blue overalls. No text on the name plate.
```

## 反向提示词

```
text, letters, logo, watermark, extra limbs, extra fingers, human, deformed hands,
flat vector, 2D, cel shading, low poly, cluttered background, harsh shadows,
green or red accents, purple, magenta
```

（`green / red / purple / magenta` 是因为设计系统里没有这些色 —— 见 `DESIGN.md` 的配色规则。）

## 出图规格

| 项 | 要求 |
| :--- | :--- |
| **背景** | **透明**优先；不支持就纯色中灰 `#808080`（不要渐变、不要场景）。这一条最重要 —— 有 alpha 或纯色底，我就不需要抠图。 |
| 尺寸 | 高 **1024px** 以上，正方形或 3:4 |
| 构图 | 半身到四分之三身，三个角色**比例一致**（头和身体占画面的比例要一样） |
| 一致性 | 三张用**同一个 seed**、同一张 `family.jpg` 作 style reference，只改角色/帽子/道具 |
| 格式 | PNG |
| 不要 | 投影、地面、道具以外的背景元素、画面里的文字 |

## 生成完之后

把图放进 `web/public/robots/`，然后告诉我。已经走过一轮了（2026-09-30），下面是**这次实际有效的做法**：

| 做法 | 结果 |
| :--- | :--- |
| **直接出透明底 PNG** | ✅ **这一步就够了。** 最后用的就是它：1024×1024、三个角色、真的 alpha 通道。`scripts/alpha-key.mjs` 只用来裁切，一行抠图逻辑都没跑 |
| 出棋盘格背景（表示"透明"） | ❌ 棋盘格的浅色方块是**纯白 255**，机器人的外壳也是纯白——两个颜色相同，任何阈值都分不开；JPEG 的噪声又把图案周期检测毁掉。试了六轮参数，要么留棋盘，要么把机器人吃掉 |
| 出纯色背景 | ✅ 退而求其次：**纯洋红 `#ff00ff`**（机器人身上绝不会出现的颜色）。`SOLID="#ff00ff"` 一行就抠干净 |

**一句话：要透明底 PNG。** 出不了透明底，就要一个机器人身上没有的纯色背景（洋红）。**别要棋盘格。**

### 现在的三个

`web/public/robots/v1/` 里是：

| 文件 | 角色 | 道具 | 对应首屏文字 |
| :--- | :--- | :--- | :--- |
| `inspector.png` | 蓝色鸭舌帽（前蓝后白） | 放大镜 | `hunting a bug` |
| `tester.png` | 蓝色鸭舌帽（前蓝后白）+ 天线 | 电路板 + 万用表 | `checking the build` |
| `planner.png` | 纯蓝安全帽 + 天线 | 写字板 | `drawing a screen` |

两件事值得记着：

**一、显示尺寸是按"头"算的，不是按裁剪框算的。** 三个角色在原图里是同一比例画的（头的宽度分别是 336 / 332 / 339 源像素，基本一致），但裁剪框不一样宽——Planner 的框最宽（477 vs 435），所以**同样显示宽度下它的头会小 10%**，看起来像被故意缩小了。`squad.tsx` 里现在存的是"目标头宽 ÷ 该文件的头占比"，三个头渲染出来一样大。

**二、路径里的 `v1` 是必要的。** Next 的图片优化 URL 只包含源文件的**路径**，响应头是 `max-age=14400`。也就是说**改了文件内容但不改路径，浏览器和 CDN 会继续发旧图四小时**——本地表现为"明明换了图，尺寸/内容还是旧的"。换图就换路径（`v1/` → `v2/`）。

想加角色：多出几张放进同一个目录（记得换路径版本），说一声，我接上位置和悬浮手势。


