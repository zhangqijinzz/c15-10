import type { EnergyDevice, EnergyDocument, EnergyEstimate, EnergyScenario, ScenarioSummary } from './types';

export const MAX_DAILY_HOURS = 24;

// 会话内单调递增的序号：即使 Date.now() 与随机部分都相同，连续生成的编号也不会重复
let idSequence = 0;

export function createUniqueId(prefix: string, taken: ReadonlySet<string> = new Set()): string {
  let id = '';
  do {
    idSequence += 1;
    id = `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (taken.has(id));
  return id;
}

export const exampleScenario: EnergyScenario = {
  id: 'scenario-home',
  name: '夏日居家方案',
  pricePerKwh: 0.62,
  daysPerMonth: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  devices: [
    { id: 'device-aircon', name: '客厅空调', watts: 1200, dailyHours: 6 },
    { id: 'device-fridge', name: '冰箱', watts: 150, dailyHours: 10 },
    { id: 'device-lamp', name: '书桌台灯', watts: 12, dailyHours: 5 },
  ],
};

export function estimateDevice(device: EnergyDevice, daysPerMonth: number, pricePerKwh: number): EnergyEstimate {
  const dailyKwh = (device.watts * device.dailyHours) / 1000;
  const monthlyKwh = dailyKwh * daysPerMonth;
  return { dailyKwh, monthlyKwh, monthlyCost: monthlyKwh * pricePerKwh };
}

export function summarizeScenario(scenario: EnergyScenario): ScenarioSummary {
  const devices = scenario.devices.map((device) => ({
    ...device,
    ...estimateDevice(device, scenario.daysPerMonth, scenario.pricePerKwh),
    share: 0,
  }));
  const total = devices.reduce(
    (sum, device) => ({
      dailyKwh: sum.dailyKwh + device.dailyKwh,
      monthlyKwh: sum.monthlyKwh + device.monthlyKwh,
      monthlyCost: sum.monthlyCost + device.monthlyCost,
    }),
    { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 },
  );
  return {
    total,
    devices: devices.map((device) => ({ ...device, share: total.monthlyKwh ? device.monthlyKwh / total.monthlyKwh : 0 })),
  };
}

export function validateDevice(device: Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>): string | null {
  if (!device.name.trim()) return '请填写设备名称';
  if (!Number.isFinite(device.watts) || device.watts < 0) return '功率不能为负数';
  if (!Number.isFinite(device.dailyHours) || device.dailyHours < 0) return '使用时间不能为负数';
  if (device.dailyHours > MAX_DAILY_HOURS) return '每日使用时间不能超过 24 小时';
  return null;
}

export function validateScenarioSettings(pricePerKwh: number, daysPerMonth: number): string | null {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh < 0) return '电价不能为负数';
  if (!Number.isFinite(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) return '计费天数需在 1–31 天之间';
  return null;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function cloneScenario(source: EnergyScenario, id: string, name: string): EnergyScenario {
  // 副本里的每台设备都重新分配编号，避免与源方案或既有数据撞号
  const taken = new Set<string>();
  const devices = source.devices.map((device) => {
    const deviceId = createUniqueId('device', taken);
    taken.add(deviceId);
    return { ...device, id: deviceId };
  });
  return { ...source, id, name, createdAt: new Date().toISOString(), devices };
}

export interface DocumentRepair {
  document: EnergyDocument;
  repaired: boolean;
}

// 理顺本地旧数据：方案编号在文档内唯一，设备编号在其所属方案内唯一；
// 重复出现时保留第一条，其余的重新分配编号
export function repairDocumentIds(document: EnergyDocument): DocumentRepair {
  let repaired = false;
  const scenarioIds = new Set<string>();
  const scenarios = document.scenarios.map((scenario) => {
    let scenarioId = scenario.id;
    if (scenarioIds.has(scenarioId)) {
      scenarioId = createUniqueId('scenario', scenarioIds);
      repaired = true;
    }
    scenarioIds.add(scenarioId);
    const deviceIds = new Set<string>();
    const devices = scenario.devices.map((device) => {
      if (deviceIds.has(device.id)) {
        const deviceId = createUniqueId('device', deviceIds);
        deviceIds.add(deviceId);
        repaired = true;
        return { ...device, id: deviceId };
      }
      deviceIds.add(device.id);
      return device;
    });
    const unchanged = scenarioId === scenario.id && devices.every((device, index) => device === scenario.devices[index]);
    return unchanged ? scenario : { ...scenario, id: scenarioId, devices };
  });
  return repaired ? { document: { ...document, scenarios }, repaired: true } : { document, repaired: false };
}
