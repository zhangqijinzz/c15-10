import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../domain';
import { describeRepair, repairDocument } from '../repair';
import type { EnergyDocument } from '../types';

function docWithDuplicates(): EnergyDocument {
  const shared = structuredClone(exampleScenario);
  return {
    version: 1,
    activeScenarioId: 'scenario-dup',
    scenarios: [
      { ...structuredClone(exampleScenario), id: 'scenario-dup', name: '方案甲' },
      { ...structuredClone(exampleScenario), id: 'scenario-dup', name: '方案乙' },
      { ...shared, id: 'scenario-other', name: '方案丙', devices: shared.devices.map((device) => ({ ...device })) },
    ],
  };
}

describe('repairDocument', () => {
  it('leaves a healthy document untouched', () => {
    const healthy: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
    const { document, report } = repairDocument(healthy);
    expect(report.repaired).toBe(false);
    expect(document).toBe(healthy);
    expect(describeRepair(report)).toBeNull();
  });

  it('renames duplicate scenario ids while keeping the first occurrence stable', () => {
    const { document, report } = repairDocument(docWithDuplicates());
    const ids = document.scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('scenario-dup');
    expect(ids[1]).not.toBe('scenario-dup');
    expect(document.activeScenarioId).toBe('scenario-dup');
    expect(report.scenarioCount).toBe(1);
  });

  it('gives every device a document-wide unique id', () => {
    const { document, report } = repairDocument(docWithDuplicates());
    const deviceIds = document.scenarios.flatMap((scenario) => scenario.devices.map((device) => device.id));
    expect(new Set(deviceIds).size).toBe(deviceIds.length);
    // 三个方案的设备原本 id 完全相同，除第一处保留外其余都应被重新编号
    expect(report.deviceCount).toBe(6);
    expect(document.scenarios[0].devices.map((device) => device.id)).toEqual(['device-aircon', 'device-fridge', 'device-lamp']);
  });

  it('keeps device contents intact while renumbering', () => {
    const { document } = repairDocument(docWithDuplicates());
    for (const scenario of document.scenarios) {
      expect(scenario.devices.map((device) => device.name)).toEqual(['客厅空调', '冰箱', '书桌台灯']);
    }
  });

  it('describes the repair for the user notice', () => {
    const { report } = repairDocument(docWithDuplicates());
    const text = describeRepair(report);
    expect(text).toContain('1 个方案');
    expect(text).toContain('6 台设备');
  });
});
