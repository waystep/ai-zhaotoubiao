/**
 * 后台Worker - 独立进程运行定时任务
 *
 * 用法: npm run worker
 *
 * 配置环境变量:
 * - CRON_INTERVAL_SECONDS: 检查间隔秒数（默认30）
 */

// 加载环境变量（必须在其他模块导入之前）
import 'dotenv/config';

import { cronManager } from './src/lib/tasks/cron-manager';

const intervalSeconds = parseInt(process.env.CRON_INTERVAL_SECONDS || '30', 10);

console.log('\n[Worker] ========== 启动后台Worker ==========\n');
console.log(`[Worker] 配置检查间隔: ${intervalSeconds}秒`);
console.log('[Worker] 正在初始化定时任务...');

// 启动定时任务
cronManager.start();

const status = cronManager.getStatus();

console.log(`[Worker] ✓ 定时任务已启动，每${status.intervalSeconds}秒检查一次processing文档`);
console.log('[Worker] Worker进程将持续运行，按 Ctrl+C 停止\n');

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n[Worker] 收到停止信号，正在关闭...');
  cronManager.stop();
  console.log('[Worker] Worker已停止');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Worker] 收到终止信号，正在关闭...');
  cronManager.stop();
  console.log('[Worker] Worker已停止');
  process.exit(0);
});

// 防止进程意外退出
process.stdin.resume();