import { describe, expect, it } from 'vitest';
import { cloneScenario, estimateDevice, exampleScenario, summarizeScenario, validateDevice } from '../domain';
import type { EnergyScenario } from '../types';

describe('energy domain', () => {
  it('calculates kWh and cost from watts, hours, days and price', () => {
    const result = estimateDevice({ id: 'a', name: '空调', watts: 1000, dailyHours: 2 }, 30, 0.5);
    expect(result).toEqual({ dailyKwh: 2, monthlyKwh: 60, monthlyCost: 30 });
  });

  it('keeps device shares explainable and sums to 100%', () => {
    const scenario: EnergyScenario = { id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: 'a', watts: 100, dailyHours: 1 }, { id: 'b', name: 'b', watts: 300, dailyHours: 1 },
    ] };
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe(12);
    expect(summary.devices.map((device) => device.share)).toEqual([0.25, 0.75]);
  });

  it('rejects negative power and more than 24 hours', () => {
    expect(validateDevice({ name: 'x', watts: -1, dailyHours: 1 })).toBe('功率不能为负数');
    expect(validateDevice({ name: 'x', watts: 1, dailyHours: 24.1 })).toBe('每日使用时间不能超过 24 小时');
  });

  it('reassigns fresh unique device ids when cloning, even against a taken set', () => {
    const first = cloneScenario(exampleScenario, 'scenario-copy-1', '副本一', new Set(exampleScenario.devices.map((device) => device.id)));
    const taken = new Set([...exampleScenario.devices.map((device) => device.id), ...first.devices.map((device) => device.id)]);
    const second = cloneScenario(exampleScenario, 'scenario-copy-2', '副本二', taken);
    const allIds = [...first.devices.map((device) => device.id), ...second.devices.map((device) => device.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.some((id) => exampleScenario.devices.some((device) => device.id === id))).toBe(false);
    // 设备参数原样保留
    expect(second.devices.map((device) => [device.name, device.watts, device.dailyHours]))
      .toEqual(exampleScenario.devices.map((device) => [device.name, device.watts, device.dailyHours]));
  });
});
