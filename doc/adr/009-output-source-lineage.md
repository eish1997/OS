# ADR-009：成果保留固定输入与实际读取来源

状态：已实现，本地工程及真实模型验证通过；2026-10-06。

报告只记Run、草稿只引用报告，会遗漏原始资料。宿主在write_asset/create_draft中合并Task固定assetIds、固定已确认摘要sourceIds、本次完成read_asset回执assetId，草稿另外保留本Run成果。ID去重，范围与ready状态验证沿用现有约束。

read_asset返回资产ID、SHA256和版本，供Operation稳定记录。资产版本不可变；来源指向具体版本，导出列出名称/ID/哈希。工具和界面仍使用同一Service，不给模型增加跨项目权限。

固定输入是任务依赖，不证明模型逐份读取或论点正确；实际读取以完成回执为证。不追溯修改旧成果，不把历史接续中的所有文件当成本次来源。修正/删除记忆改变后续输入，不改写历史报告。

固定来源＋执行中额外读取、删除保护及干净恢复回归通过；三轮真实任务的成果及导出包含原资料ID/哈希。见[迭代017](../dev/iterations/017-real-content.md)和[真实报告](../../output/dev-evidence/pi-real-content.json)。
