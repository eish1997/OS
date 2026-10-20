export interface NativeBranchPoint {entryId:string;parentId:string|null;role:'user'|'assistant'|'toolResult';preview:string;imageCount:number;at?:string;truncated?:boolean;toolResult?:{name:string;callId:string;isError:boolean;withheld:boolean};toolCalls?:{id:string;name:string;preview:string;truncated:boolean;withheld:boolean}[];toolCallCount?:number;toolCallsOffset?:number;summary?:{kind:'compaction'|'branch_summary';currentCheckpoint?:boolean;tokensBefore?:number;firstKeptEntryId?:string;fromId?:string}}
export interface NativeContextEdit {targetId:string;removed:boolean;targetRole:string}
export interface NativeBranchPoint {contextEdit?:NativeContextEdit;tree?:{parentId:string|null;depth:number;hasChildren:boolean}}
export interface NativeHistoryText {entryId:string;text:string;nextOffset?:number}
export interface NativeBranchPage {sourceHash:string;points:NativeBranchPoint[];nextOffset?:number;detail?:NativeHistoryText}
