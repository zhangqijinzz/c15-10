// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to a valid example when saved JSON is damaged', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('straightens out duplicated ids from storage on open and writes them back', () => {
    const duplicatedDevices = [...structuredClone(exampleScenario.devices), structuredClone(exampleScenario.devices)[0]];
    const corrupted: EnergyDocument = {
      version: 1,
      scenarios: [
        { ...structuredClone(exampleScenario), id: 'same-scenario', devices: duplicatedDevices },
        { ...structuredClone(exampleScenario), id: 'same-scenario', name: '另一个方案' },
      ],
      activeScenarioId: 'same-scenario',
    };
    localStorage.setItem('energy-lens.document.v1', JSON.stringify(corrupted));
    const vm = new EnergyLensViewModel(new LocalEnergyRepository());
    vm.initialize();
    expect(vm.getState().notice?.kind).toBe('info');
    const stored = JSON.parse(localStorage.getItem('energy-lens.document.v1') ?? '{}') as EnergyDocument;
    expect(new Set(stored.scenarios.map((scenario) => scenario.id)).size).toBe(2);
    for (const scenario of stored.scenarios) {
      const ids = scenario.devices.map((device) => device.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // 修复后两台同名设备可以各自独立修改
    const [first, second] = vm.activeScenario?.devices.filter((device) => device.name === '客厅空调') ?? [];
    vm.updateDevice(first.id, { watts: 900 });
    expect(vm.activeScenario?.devices.find((device) => device.id === second.id)?.watts).toBe(1200);
  });
});
