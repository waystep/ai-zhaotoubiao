export function docTypeLabel(docType: string): string {
  switch (docType) {
    case "tender_doc":
      return "招标文件";
    case "legal_doc":
      return "法律文件";
    case "bid_doc":
      return "投标文件";
    case "review_report":
      return "审查报告";
    default:
      return docType;
  }
}

export function reviewStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "in_progress":
      return "审查中";
    case "pending":
      return "待审查";
    default:
      return status;
  }
}

export function parseStatusLabel(status: string, progressPercent?: number): string {
  switch (status) {
    case "processing":
      return `解析中 ${progressPercent ?? 0}%`;
    case "completed":
      return "已解析";
    case "failed":
      return "解析失败";
    case "pending":
      return "待解析";
    default:
      return status;
  }
}

export function severityLabel(sev: string): string {
  switch (sev) {
    case "critical":
      return "严重";
    case "major":
      return "重要";
    case "minor":
      return "轻微";
    case "suggestion":
      return "建议";
    default:
      return sev;
  }
}

