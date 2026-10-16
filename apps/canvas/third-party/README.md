# 固定依赖的声明补充

supplements.json 按包名和精确版本映射补充文本。collect-notices.mjs 在收集前验证 SHA256；supplements.json 或 *.source.json 保存原始 URL、Git blob、发布提交或标签来源。文本保留原文，不以通用模板代替作者声明。

- Yoga fork：npm 发布 gitHead 对应 open-pencil/yoga，元数据仍指向 facebook/yoga；补充文本来自该发布提交。
- LobeHub 与 jsondiffpatch：从 npm 对应发布 gitHead 取回。jsondiffpatch 上游文件名为 MIT-LICENSE.txt，但当前 npm 包未携带此文件；仅放宽文件名匹配不足以补齐，因此保留外部原始文本。
- provider-utils：从对应版本标签取根声明，同时保留内嵌 zod3-to-json-schema 的 ISC 声明。根文件是 Apache 许可引用声明；完整标准文本及其他内嵌依赖仍由整体清单核对。
- Lucide：包内 info.json 明确指定图标作者与 LICENSE URL。补充文件固定该 URL 所指仓库的 Git blob，包含 Lucide 和 Feather 声明；记录没有声称该仓库提交就是 iconify-json 发布对应的图标源码版本。
- stream-markdown/code 和 core：包内 LICENSE.md 已有完整 MIT 文本；仅补充元数据缺失的标识，并以已读文本 SHA256 验证，不改已安装包。

- Cargo 原始声明缺项已按包内 .cargo_vcs_info.json 固定提交补齐；selectors 使用 Mozilla 提供的完整 MPL 2.0 标准文本，并保留原包的许可声明与源码提交来源。
- WebView2 原生加载器：从绑定包固定提交的 update-bindings 源码定位 SDK 1.0.3800.47，下载官方 NuGet 包，将 x64 静态库和 DLL 与已安装 crate 逐字节核对一致，补充原包 LICENSE.txt 与 NOTICE.txt。WebView2-SDK.source.json 记录来源和摘要；不以 Rust 绑定自身的 MIT 声明替代 Microsoft 组件声明。
- CanvasKit 0.41.1：通过发布 package.json 历史找到官方提交 3c68f3ffd7c9bc781494cdb85e718ff1e6f49d84（Release Canvaskit v0.41.1）；该提交 CHANGELOG 与 npm 包逐字节一致。canvaskit/sources.json 保留 DEPS 固定版本对应的原始声明来源和摘要。npm gitHead 与此不同，未声称复现 npm WASM 的全部编译过程。已补入 Emscripten 4.0.7 运行时、字体与附加归属说明，共 24 份补充文件；可选 NotoMono 仅保守随附，不声称已证明嵌入发布 WASM。
- package-source-notices.py 为 MPL-only Cargo 包保留原始 .crate 源码包，对照 Cargo.lock 摘要，并逐文件核对实际使用的源码未修改；stage-desktop.mjs 校验清单仍对应当前依赖后复制到 licenses/sources。
- package-notices.py 将实际映射的 npm 包与 Windows Cargo 依赖声明合并为安装可携带的文本；校验每份原文摘要，缺声明、映射过期或文件被改动时失败。输出 manifest 状态为 delivery-notices-assembled，记录 602 个包及 CanvasKit 补充来源和范围；不等同于精确的二进制依赖普查或 WASM 可复现构建。

复现顺序：collect-notices.mjs → map-build-notices.py → package-source-notices.py 与 package-notices.py → stage-desktop.mjs。前端或服务依赖变化后，先更新实际构建输入记录再执行此流程。

正式安装随附文件已与 staging 摘要核对，证据见 output/dev-evidence/canvas-c05/desktop/delivery-installation.json。此处是来源与打包资料，整体功能交付状态仍以开发现场为准。
