import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpDiagnostics} from '../server/mcp-diagnostics.js';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {PluginRunDetails} from '../src/workbench/plugin-run-details.js';
import type {Run} from '../shared/contracts.js';

test('native MCP notices persist only known categories, never server error text',()=>{
  const result=mcpDiagnostics('MCP servers need attention:\n  missing: failed: ENOENT secret-token\n  auth: needs sign-in https://example.test/?token=secret\n  denied: failed: HTTP 403 secret\nRun /mcp to fix.',['missing','auth','denied']);
  assert.deepEqual(result,[{server:'missing',code:'program_missing'},{server:'auth',code:'needs_auth'},{server:'denied',code:'permission_denied'}]);
  assert(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(mcpDiagnostics('unrecognized secret',[]),[]);
  assert.deepEqual(mcpDiagnostics('MCP servers are still connecting; later',[]),[{code:'startup_pending'}]);
  const html=renderToStaticMarkup(React.createElement(PluginRunDetails,{run:{mcpDiagnostics:result} as Run}));
  assert(html.includes('MCP 连接提醒'));assert(html.includes('不代表服务当前连接状态'));assert(html.includes('找不到服务程序'));assert(!html.includes('secret'));
});
