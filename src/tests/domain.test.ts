import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneScenario, createUniqueId, estimateDevice, exampleScenario, repairDocumentIds, summarizeScenario, validateDevice } from '../domain';
import type { EnergyDocument, EnergyScenario } from '../types';

afterEach(() => vi.restoreAllMocks());

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
});

describe('createUniqueId', () => {
  it('generates distinct ids even within the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const ids = new Set(Array.from({ length: 200 }, () => createUniqueId('device')));
    expect(ids.size).toBe(200);
  });

  it('never hands out an id that is already taken', () => {
    const taken = new Set<string>();
    const first = createUniqueId('scenario', taken);
    taken.add(first);
    expect(createUniqueId('scenario', taken)).not.toBe(first);
  });
});

describe('cloneScenario', () => {
  it('re-assigns unique device ids instead of deriving them from the scenario id', () => {
    const source: EnergyScenario = {
      id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '',
      devices: [
        { id: 'dup', name: 'a', watts: 100, dailyHours: 1 },
        { id: 'dup', name: 'b', watts: 200, dailyHours: 1 },
      ],
    };
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const first = cloneScenario(source, 'copy-1', '副本一');
    const second = cloneScenario(source, 'copy-2', '副本二');
    const firstIds = first.devices.map((device) => device.id);
    expect(new Set(firstIds).size).toBe(2);
    expect(firstIds).not.toContain('dup');
    expect(second.devices.every((device) => !firstIds.includes(device.id))).toBe(true);
    expect(first.devices.map((device) => device.name)).toEqual(['a', 'b']);
  });
});

describe('repairDocumentIds', () => {
  it('leaves a clean document untouched', () => {
    const document: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
    const result = repairDocumentIds(document);
    expect(result.repaired).toBe(false);
    expect(result.document).toBe(document);
  });

  it('reassigns duplicate scenario ids and duplicate device ids, keeping the first occurrence', () => {
    const makeScenario = (id: string, deviceIds: string[]): EnergyScenario => ({
      id, name: `方案-${id}`, pricePerKwh: 1, daysPerMonth: 30, createdAt: '',
      devices: deviceIds.map((deviceId, index) => ({ id: deviceId, name: `设备${index}`, watts: 100, dailyHours: 1 })),
    });
    const document: EnergyDocument = {
      version: 1,
      scenarios: [makeScenario('s1', ['a', 'a', 'b']), makeScenario('s1', ['a'])],
      activeScenarioId: 's1',
    };
    const { document: repaired, repaired: changed } = repairDocumentIds(document);
    expect(changed).toBe(true);
    const scenarioIds = repaired.scenarios.map((scenario) => scenario.id);
    expect(new Set(scenarioIds).size).toBe(2);
    expect(scenarioIds[0]).toBe('s1');
    for (const scenario of repaired.scenarios) {
      const ids = scenario.devices.map((device) => device.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(repaired.scenarios[0].devices[0].id).toBe('a');
    expect(repaired.activeScenarioId).toBe('s1');
  });

  it('allows the same device id in different scenarios', () => {
    const document: EnergyDocument = {
      version: 1,
      scenarios: [structuredClone(exampleScenario), { ...structuredClone(exampleScenario), id: 'scenario-other' }],
      activeScenarioId: exampleScenario.id,
    };
    expect(repairDocumentIds(document).repaired).toBe(false);
  });
});
