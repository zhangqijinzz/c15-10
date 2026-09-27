let sequence = 0;

/**
 * 生成编号：时间戳负责跨会话区分，会话内单调递增的计数器负责
 * 同一毫秒内连续调用也不重复，随机后缀避免与历史数据撞号。
 */
export function nextId(prefix: string): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}-${random}`;
}

/** 在已存在编号集合之外生成一个编号，直到不冲突为止。 */
export function uniqueId(prefix: string, taken: ReadonlySet<string>): string {
  let id = nextId(prefix);
  while (taken.has(id)) id = nextId(prefix);
  return id;
}
