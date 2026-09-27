import { uniqueId } from './ids';
import type { EnergyDevice, EnergyDocument, EnergyScenario } from './types';

export interface RepairReport {
  repaired: boolean;
  scenarioCount: number;
  deviceCount: number;
  issues: string[];
}

/**
 * 理顺历史数据里的重复编号：
 * - 方案编号重复：保留第一条，后续重复方案重新编号，激活指向同步更新；
 * - 同一方案内设备编号重复：保留第一条，后续重复设备重新编号。
 * 全部方案、全部设备统一参与去重，确保设备编号在整个文档内唯一，
 * 这样“只认编号”的更新路径不会再串到别的对象。
 */
export function repairDocument(document: EnergyDocument): { document: EnergyDocument; report: RepairReport } {
  const report: RepairReport = { repaired: false, scenarioCount: 0, deviceCount: 0, issues: [] };
  const scenarioIds = new Set<string>();
  const deviceIds = new Set<string>();
  let activeScenarioId = document.activeScenarioId;

  const scenarios = document.scenarios.map((scenario) => {
    let nextScenario = scenario;
    if (scenarioIds.has(scenario.id)) {
      // 激活指向重复编号时，原逻辑 find() 命中的是第一条，故保留第一条的编号，只给后续重复者换号
      const newId = uniqueId('scenario', scenarioIds);
      scenarioIds.add(newId);
      report.scenarioCount += 1;
      report.issues.push(`方案“${scenario.name}”与已有方案编号重复，已重新编号为 …${newId.slice(-6)}`);
      nextScenario = { ...scenario, id: newId };
    } else {
      scenarioIds.add(scenario.id);
    }

    const seenInScenario = new Set<string>();
    let devicesChanged = false;
    const devices = nextScenario.devices.map((device): EnergyDevice => {
      if (!seenInScenario.has(device.id) && !deviceIds.has(device.id)) {
        seenInScenario.add(device.id);
        deviceIds.add(device.id);
        return device;
      }
      const newId = uniqueId('device', deviceIds);
      seenInScenario.add(newId);
      deviceIds.add(newId);
      devicesChanged = true;
      report.deviceCount += 1;
      report.issues.push(`方案“${nextScenario.name}”中的设备“${device.name}”编号重复，已重新编号`);
      return { ...device, id: newId };
    });

    return devicesChanged ? { ...nextScenario, devices } : nextScenario;
  });

  if (!scenarioIds.has(activeScenarioId)) activeScenarioId = scenarios[0].id;

  report.repaired = report.scenarioCount > 0 || report.deviceCount > 0;
  const repaired: EnergyDocument = report.repaired || activeScenarioId !== document.activeScenarioId
    ? { ...document, scenarios, activeScenarioId }
    : document;
  return { document: repaired, report };
}

export function describeRepair(report: RepairReport): string | null {
  if (!report.repaired) return null;
  const parts: string[] = [];
  if (report.scenarioCount > 0) parts.push(`${report.scenarioCount} 个方案`);
  if (report.deviceCount > 0) parts.push(`${report.deviceCount} 台设备`);
  return `检测到本地数据存在重复编号（${parts.join('、')}），已自动理顺，后续编辑不会再互相影响`;
}

export function collectDeviceIds(scenarios: readonly EnergyScenario[]): Set<string> {
  const ids = new Set<string>();
  for (const scenario of scenarios) for (const device of scenario.devices) ids.add(device.id);
  return ids;
}

export function collectScenarioIds(scenarios: readonly EnergyScenario[]): Set<string> {
  return new Set(scenarios.map((scenario) => scenario.id));
}
