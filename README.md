# DuoLike Web — iPhone Duo 折叠动画 · 跨平台 WebGL 移植版

Cross-platform WebGL2 port of [DuoLikeAnimation](https://github.com/elijah-semyonov/DuoLikeAnimation) —
the frosted-glass "fold" effect that mimics the iPhone Duo's folding animation, rebuilt so it runs
on **Android phones, Windows / macOS / Linux desktops and iPhones** from one zero-build static page.

> 原理与原版完全一致:界面被视作空间中固定的平面,屏幕则变成一块倾斜的磨砂玻璃 ——
> 倾斜手机时,界面留在原地,屏幕渲染的是"透过一扇倾斜的毛玻璃窗"看到的内容:
> 按透视重新投影、按间隙模糊与压暗,视线完全错过界面处为黑色。

<p align="center">
  <img src="docs/demo.png" alt="45° tilt: the interface stays sharp at the hinge edge and turns into frosted glass toward the lifted edge" width="420">
</p>

## 平台与输入方式 / Platforms & input

| 平台 | 驱动方式 |
| --- | --- |
| **Android 手机** | 真实体感:`deviceorientation` 姿态解算 + 陀螺仪预测(iOS Safari 也支持,含权限申请) |
| **iPhone / iPad** | 同上,首次点击"启用体感"授权 |
| **Windows / macOS / Linux** | 没有加速度计 —— 用**鼠标甩动**触发晃动动画、按住拖动保持倾斜、`←` `→` 方向键,或手动滑杆 |

所有平台通用:手动倾斜滑杆(还原原版 Simulator 手动模式)、"校准"归零、自定义壁纸替换界面内容。

## 运行 / Run

零构建、零依赖的纯静态页面:

```bash
# any static server works, e.g.
python -m http.server 8000
# then open http://localhost:8000  (HTTPS or localhost is required for motion sensors)
```

或直接部署到 GitHub Pages。手机上体感必须通过 **HTTPS 或 localhost** 访问(浏览器安全要求)。

开发调试可用 `python devserver.py`(带 no-cache 响应头)。

## 实现 / How it works

| File | Role |
| --- | --- |
| `js/fold.js` | `DuoFold.metal` 的 1:1 GLSL ES 3.0 移植:铰链重投影、Vogel 盘模糊、压暗、噪点颗粒 |
| `js/motion.js` | `FoldMotionModel.swift` 的移植:姿态矩阵相对校准零位解算屏幕 Y 轴倾角 + 陀螺仪预测 + 0.7/样本平滑;桌面端为弹簧物理(甩动冲量/拖拽/键盘) |
| `js/ui.js` | Canvas2D 重绘原版 `DemoContentView`(统计卡片、hero 卡、Recent 列表)+ 自定义壁纸 |
| `js/main.js` | 尺寸/DPR、纹理上传、控制面板、渲染循环 |

物理参数与原版相同:视距 320 mm × 6 pt/mm = 1920 pt、`blurSpread` 0.12、`darkening` 0.015
(见 `FoldEffect.swift` 与 `DEFAULT_PARAMETERS`)。

页面暴露了截图用调试钩子:`__setTiltDeg(n)` / `__clearTilt()` / `__controller`。

## 与原版的差异 / Differences from the original

- 原版仅 iOS(SwiftUI + Metal + Core Motion);本版用 WebGL2,着色器数学逐行对应移植。
- 桌面端没有倾斜传感器(Windows 台式机/多数笔记本无加速度计),交互改为鼠标甩动/拖拽/键盘 ——
  原版在不带传感器的 Simulator 上也是手动滑杆,思路一致。
- 横屏轴向映射按原版 `screenAxesInDeviceSpace()` 表格移植,若个别机型横屏方向相反,竖屏使用不受影响。

## 致谢 / Credits

Algorithm & original iOS implementation: **[DuoLikeAnimation](https://github.com/elijah-semyonov/DuoLikeAnimation)**
by [Elijah Semyonov](https://github.com/elijah-semyonov), MIT License.
This project is a WebGL port of that work, distributed under MIT as well — see [LICENSE](LICENSE).

## License

MIT — see [LICENSE](LICENSE). Contains portions from DuoLikeAnimation © 2026 Elijah Semyonov.
