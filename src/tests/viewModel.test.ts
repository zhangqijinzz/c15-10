import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('keeps ids unique when devices are added in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vm.addDevice();
    vm.addDevice();
    const devices = vm.activeScenario?.devices ?? [];
    const ids = devices.map((device) => device.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 改其中一台，另一台不受影响
    const added = devices.slice(-2);
    vm.updateDevice(added[0].id, { watts: 800 });
    const after = vm.activeScenario?.devices ?? [];
    expect(after.find((device) => device.id === added[0].id)?.watts).toBe(800);
    expect(after.find((device) => device.id === added[1].id)?.watts).toBe(100);
    vi.restoreAllMocks();
  });

  it('keeps scenarios independent when duplicated in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vm.duplicateActive();
    vm.duplicateActive();
    const scenarios = vm.getState().document?.scenarios ?? [];
    expect(scenarios).toHaveLength(3);
    const scenarioIds = scenarios.map((scenario) => scenario.id);
    expect(new Set(scenarioIds).size).toBe(3);
    const deviceIds = scenarios.flatMap((scenario) => scenario.devices.map((device) => device.id));
    expect(new Set(deviceIds).size).toBe(deviceIds.length);
    // 两个副本之间可以来回切换
    vm.selectScenario(scenarioIds[1]);
    expect(vm.getState().document?.activeScenarioId).toBe(scenarioIds[1]);
    vm.selectScenario(scenarioIds[2]);
    expect(vm.getState().document?.activeScenarioId).toBe(scenarioIds[2]);
    // 改副本乙的设备，副本甲的设备明细不跟着变
    const copyB = scenarios[2];
    vm.updateDevice(copyB.devices[0].id, { watts: 55 });
    const after = vm.getState().document?.scenarios ?? [];
    expect(after[2].devices[0].watts).toBe(55);
    expect(after[1].devices[0].watts).toBe(1200);
    vi.restoreAllMocks();
  });

  it('repairs duplicated ids from legacy local data on initialize and tells the user', () => {
    const legacy: EnergyDocument = {
      version: 1,
      activeScenarioId: 'scenario-dup',
      scenarios: [
        { ...structuredClone(exampleScenario), id: 'scenario-dup', name: '方案甲' },
        { ...structuredClone(exampleScenario), id: 'scenario-dup', name: '方案乙' },
      ],
    };
    const legacyRepository: EnergyRepository & { saved: EnergyDocument | null } = {
      saved: null,
      load: () => legacy,
      save(document) { this.saved = document; },
    };
    const recovered = new EnergyLensViewModel(legacyRepository);
    recovered.initialize();
    const document = recovered.getState().document;
    expect(document?.scenarios.map((scenario) => scenario.id)).toHaveLength(2);
    expect(new Set(document?.scenarios.map((scenario) => scenario.id)).size).toBe(2);
    const deviceIds = document?.scenarios.flatMap((scenario) => scenario.devices.map((device) => device.id)) ?? [];
    expect(new Set(deviceIds).size).toBe(deviceIds.length);
    // 理顺结果已落库，并明确告知用户
    expect(legacyRepository.saved).not.toBeNull();
    expect(recovered.getState().notice?.kind).toBe('info');
    expect(recovered.getState().notice?.text).toContain('重复编号');
    // 修复后两个方案互不影响
    recovered.selectScenario(document!.scenarios[1].id);
    recovered.updateDevice(document!.scenarios[1].devices[0].id, { watts: 1 });
    const after = recovered.getState().document;
    expect(after?.scenarios[0].devices[0].watts).toBe(1200);
    expect(after?.scenarios[1].devices[0].watts).toBe(1);
  });
});
