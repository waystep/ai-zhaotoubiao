import { checkProcessingDocuments } from "./document-status-checker";

/**
 * 定时任务管理器
 *
 * 使用setInterval管理后台定时任务，定期检查processing状态的文档
 */

// 默认检查间隔：30秒
const DEFAULT_INTERVAL_SECONDS = 30;

export class CronManager {
  private task: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalSeconds: number;

  constructor(intervalSeconds?: number) {
    // 从环境变量或参数获取间隔时间
    this.intervalSeconds = intervalSeconds ||
      parseInt(process.env.CRON_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS), 10);

    console.log(`[CronManager] 配置检查间隔: ${this.intervalSeconds}秒`);
  }

  /**
   * 启动定时任务
   *
   * 使用setInterval按配置的间隔执行检查（默认30秒）
   */
  start(): void {
    if (this.task) {
      console.log("[CronManager] 定时任务已在运行");
      return;
    }

    // 启动定时任务（使用setInterval支持任意秒数间隔）
    this.task = setInterval(async () => {
      if (this.isRunning) {
        console.log("[CronManager] 上一次检查仍在进行，跳过本次");
        return;
      }

      this.isRunning = true;

      try {
        console.log("[Cron] ========== 开始检查processing文档 ==========");
        const stats = await checkProcessingDocuments();
        console.log(
          `[Cron] 检查完成: ${stats.checked}个检查, ${stats.completed}个完成, ${stats.failed}个失败, ${stats.skipped}个跳过`
        );
        console.log("[Cron] ========== 检查结束 ==========");
      } catch (error) {
        console.error("[Cron] 检查过程出错:", error);
      } finally {
        this.isRunning = false;
      }
    }, this.intervalSeconds * 1000);

    console.log(`[CronManager] 定时任务已启动，每${this.intervalSeconds}秒检查一次processing文档`);
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.task) {
      clearInterval(this.task);
      this.task = null;
      console.log("[CronManager] 定时任务已停止");
    }
  }

  /**
   * 手动触发检查（用于测试或管理员操作）
   */
  async triggerManually(): Promise<{
    checked: number;
    completed: number;
    failed: number;
    skipped: number;
  }> {
    console.log("[CronManager] 手动触发检查");

    if (this.isRunning) {
      console.log("[CronManager] 检查正在进行，请稍后再试");
      return {
        checked: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      };
    }

    this.isRunning = true;

    try {
      const stats = await checkProcessingDocuments();
      console.log(
        `[CronManager] 手动检查完成: ${stats.checked}个检查, ${stats.completed}个完成, ${stats.failed}个失败, ${stats.skipped}个跳过`
      );
      return stats;
    } catch (error) {
      console.error("[CronManager] 手动检查出错:", error);
      return {
        checked: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 获取任务状态
   */
  getStatus(): {
    isScheduled: boolean;
    isRunning: boolean;
    intervalSeconds: number;
  } {
    return {
      isScheduled: this.task !== null,
      isRunning: this.isRunning,
      intervalSeconds: this.intervalSeconds,
    };
  }
}

// 导出单例实例
export const cronManager = new CronManager();